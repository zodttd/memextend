// apps/cli/src/commands/forget.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { createInterface } from 'readline';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');
const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');

interface ForgetOptions {
  all?: boolean;
  project?: boolean;
  before?: string;
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

export async function forgetCommand(memoryId: string | undefined, options: ForgetOptions): Promise<void> {
  if (!existsSync(DB_PATH)) {
    console.log(chalk.yellow('\n  ⚠ memextend not initialized. Run `memextend init` first.\n'));
    return;
  }

  try {
    const { SQLiteStorage, LanceDBStorage, getCurrentProjectId } = await import('@memextend/core');
    const sqlite = new SQLiteStorage(DB_PATH);
    const lancedb = await LanceDBStorage.create(VECTORS_PATH);

    // Bulk delete: --all
    if (options.all) {
      const projectId = options.project ? getCurrentProjectId() : undefined;
      const scope = projectId ? 'current project' : 'ALL projects';

      console.log(chalk.red(`\n  ⚠ This will delete ALL memories from ${scope}!`));
      const confirmed = await confirm(chalk.yellow('  Are you sure?'));

      if (!confirmed) {
        console.log(chalk.dim('\n  Cancelled.\n'));
        sqlite.close();
        await lancedb.close();
        return;
      }

      // Note: Bulk delete doesn't delete vectors individually - would need to iterate
      // For now, just delete from SQLite (vectors become orphaned but harmless)
      const deleted = sqlite.deleteAllMemories(projectId ?? undefined);
      sqlite.close();
      await lancedb.close();
      console.log(chalk.green(`\n  ✓ Deleted ${deleted} memories.\n`));
      console.log(chalk.dim('  Note: Run `memextend init` to rebuild vector index if needed.\n'));
      return;
    }

    // Bulk delete: --before <date>
    if (options.before) {
      const date = new Date(options.before);
      if (isNaN(date.getTime())) {
        console.log(chalk.red(`\n  ✗ Invalid date: ${options.before}. Use YYYY-MM-DD format.\n`));
        sqlite.close();
        await lancedb.close();
        return;
      }

      const projectId = options.project ? getCurrentProjectId() : undefined;
      const scope = projectId ? 'current project' : 'all projects';

      console.log(chalk.yellow(`\n  This will delete memories before ${options.before} from ${scope}.`));
      const confirmed = await confirm(chalk.yellow('  Are you sure?'));

      if (!confirmed) {
        console.log(chalk.dim('\n  Cancelled.\n'));
        sqlite.close();
        await lancedb.close();
        return;
      }

      // Note: Bulk delete doesn't delete vectors individually - would need to iterate
      const deleted = sqlite.deleteMemoriesBefore(date, projectId ?? undefined);
      sqlite.close();
      await lancedb.close();
      console.log(chalk.green(`\n  ✓ Deleted ${deleted} memories.\n`));
      console.log(chalk.dim('  Note: Run `memextend init` to rebuild vector index if needed.\n'));
      return;
    }

    // Single delete by ID
    if (!memoryId) {
      console.log(chalk.yellow('\n  ⚠ Please provide a memory ID, or use --all/--before for bulk delete.\n'));
      console.log(chalk.dim('  Usage:'));
      console.log(chalk.dim('    memextend forget <memory-id>'));
      console.log(chalk.dim('    memextend forget --all'));
      console.log(chalk.dim('    memextend forget --all --project'));
      console.log(chalk.dim('    memextend forget --before 2025-01-01'));
      console.log(chalk.dim('    memextend forget --before 2025-01-01 --project\n'));
      sqlite.close();
      await lancedb.close();
      return;
    }

    // Check if memory exists
    const memory = sqlite.getMemory(memoryId);
    if (!memory) {
      console.log(chalk.yellow(`\n  ⚠ Memory not found: ${memoryId}\n`));
      sqlite.close();
      await lancedb.close();
      return;
    }

    // Show memory preview
    const preview = memory.content.split('\n')[0].slice(0, 60);
    console.log(chalk.dim(`\n  Deleting: ${preview}...`));

    // Delete memory and its vector
    const deleted = sqlite.deleteMemory(memoryId);
    if (deleted) {
      await lancedb.deleteVector(memoryId);
    }
    sqlite.close();
    await lancedb.close();

    if (deleted) {
      console.log(chalk.green(`  ✓ Memory ${memoryId} deleted.\n`));
    } else {
      console.log(chalk.red(`  ✗ Failed to delete memory.\n`));
    }

  } catch (error) {
    console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : error}\n`));
    process.exit(1);
  }
}
