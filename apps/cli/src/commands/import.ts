// apps/cli/src/commands/import.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import chalk from 'chalk';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');
const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');
const MODELS_PATH = join(MEMEXTEND_DIR, 'models');

interface ImportOptions {
  merge?: boolean;
  validateOnly?: boolean;
}

interface ExportData {
  version: number;
  exportedAt: string;
  exportType: string;
  projectId: string | null;
  stats: {
    memoryCount: number;
    globalProfileCount: number;
  };
  memories: Array<{
    id: string;
    projectId: string | null;
    content: string;
    type: string;
    sourceTool: string | null;
    createdAt: string;
    sessionId: string | null;
    metadata: Record<string, unknown> | null;
  }>;
  globalProfiles: Array<{
    id: string;
    key: string;
    content: string;
    createdAt: string;
  }>;
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export async function importCommand(filePath: string, options: ImportOptions): Promise<void> {
  if (!existsSync(DB_PATH)) {
    console.log(chalk.yellow('\n  ⚠ memextend not initialized. Run `memextend init` first.\n'));
    return;
  }

  if (!existsSync(filePath)) {
    console.log(chalk.red(`\n  ✗ File not found: ${filePath}\n`));
    return;
  }

  try {
    // Read and parse export file
    console.log(chalk.bold('\n  Reading export file...\n'));
    const content = readFileSync(filePath, 'utf-8');
    let exportData: ExportData;

    try {
      exportData = JSON.parse(content);
    } catch {
      console.log(chalk.red('  ✗ Invalid JSON file\n'));
      return;
    }

    // Validate export format
    if (!exportData.version || !exportData.memories) {
      console.log(chalk.red('  ✗ Invalid export file format\n'));
      return;
    }

    console.log(chalk.dim(`  Export version: ${exportData.version}`));
    console.log(chalk.dim(`  Exported at: ${exportData.exportedAt}`));
    console.log(chalk.dim(`  Export type: ${exportData.exportType}`));
    console.log(chalk.dim(`  Memories: ${exportData.memories.length}`));
    console.log(chalk.dim(`  Global profiles: ${exportData.globalProfiles?.length || 0}`));
    console.log('');

    // Validate only mode
    if (options.validateOnly) {
      console.log(chalk.green('  ✓ Export file is valid\n'));
      return;
    }

    // Confirm import
    if (!options.merge) {
      console.log(chalk.yellow('  ⚠ Import will add new memories. Existing memories will NOT be deleted.'));
      console.log(chalk.dim('    Use --merge to skip duplicates based on ID.\n'));
    }

    const confirmed = await confirm(chalk.cyan('  Proceed with import?'));
    if (!confirmed) {
      console.log(chalk.dim('\n  Import cancelled.\n'));
      return;
    }

    // Import data
    const { SQLiteStorage, SqliteVecStorage, createEmbedFunction } = await import('@memextend/core');
    const sqlite = new SQLiteStorage(DB_PATH);
    const vectorStore = await SqliteVecStorage.create(VECTORS_PATH);
    const embedder = await createEmbedFunction(MODELS_PATH);

    let importedMemories = 0;
    let importedProfiles = 0;
    let skipped = 0;

    console.log(chalk.bold('\n  Importing...\n'));

    // Import memories
    for (const memory of exportData.memories) {
      // Check if memory already exists (merge mode)
      if (options.merge) {
        const existing = sqlite.getMemory(memory.id);
        if (existing) {
          skipped++;
          continue;
        }
      }

      // Insert memory
      sqlite.insertMemory({
        id: memory.id,
        projectId: memory.projectId,
        content: memory.content,
        type: memory.type as 'tool_capture' | 'summary' | 'manual',
        sourceTool: memory.sourceTool as any,
        createdAt: memory.createdAt,
        sessionId: memory.sessionId,
        metadata: memory.metadata,
      });

      // Generate and store embedding
      const vector = await embedder.embed(memory.content);
      await vectorStore.insertVector(memory.id, vector);

      importedMemories++;
    }

    // Import global profiles
    for (const profile of exportData.globalProfiles || []) {
      if (options.merge) {
        // Simple duplicate check by content
        const existing = sqlite.getGlobalProfiles(1000);
        if (existing.some(p => p.content === profile.content && p.key === profile.key)) {
          continue;
        }
      }

      sqlite.insertGlobalProfile({
        id: profile.id,
        key: profile.key as 'preference' | 'pattern' | 'fact',
        content: profile.content,
        createdAt: profile.createdAt,
      });

      importedProfiles++;
    }

    console.log(chalk.green(`  ✓ Imported ${importedMemories} memories`));
    console.log(chalk.green(`  ✓ Imported ${importedProfiles} global profiles`));
    if (skipped > 0) {
      console.log(chalk.dim(`  ↷ Skipped ${skipped} duplicates`));
    }
    console.log('');

    sqlite.close();
    await vectorStore.close();
    await embedder.close();

  } catch (error) {
    console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : error}\n`));
    process.exit(1);
  }
}
