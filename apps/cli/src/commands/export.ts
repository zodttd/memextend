// apps/cli/src/commands/export.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import chalk from 'chalk';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');

interface ExportOptions {
  output?: string;
  project?: boolean;
  format?: string;
}

export async function exportCommand(options: ExportOptions): Promise<void> {
  if (!existsSync(DB_PATH)) {
    console.log(chalk.yellow('\n  ⚠ memextend not initialized. Run `memextend init` first.\n'));
    return;
  }

  try {
    const { SQLiteStorage } = await import('@memextend/core');
    const sqlite = new SQLiteStorage(DB_PATH);

    // Determine output path
    const timestamp = new Date().toISOString().split('T')[0];
    const outputDir = options.output || `.`;
    const outputFile = join(outputDir, `memextend-export-${timestamp}.json`);

    // Get project ID if filtering by project
    let projectId: string | undefined;
    if (options.project) {
      projectId = getProjectId(process.cwd());
      console.log(chalk.dim(`\n  Exporting memories for project: ${projectId}`));
    }

    console.log(chalk.bold('\n  Exporting memextend data...\n'));

    // Get all memories
    const memories = sqlite.getRecentMemories(projectId ?? null, 10000, 36500); // All memories up to 100 years
    const globalProfiles = sqlite.getGlobalProfiles(10000);

    // Build export object
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      exportType: projectId ? 'project' : 'full',
      projectId: projectId || null,
      stats: {
        memoryCount: memories.length,
        globalProfileCount: globalProfiles.length,
      },
      memories: memories.map(m => ({
        id: m.id,
        projectId: m.projectId,
        content: m.content,
        type: m.type,
        sourceTool: m.sourceTool,
        createdAt: m.createdAt,
        sessionId: m.sessionId,
        metadata: m.metadata,
      })),
      globalProfiles: globalProfiles.map(p => ({
        id: p.id,
        key: p.key,
        content: p.content,
        createdAt: p.createdAt,
      })),
    };

    // Write export file
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    writeFileSync(outputFile, JSON.stringify(exportData, null, 2));

    console.log(chalk.green(`  ✓ Exported ${memories.length} memories`));
    console.log(chalk.green(`  ✓ Exported ${globalProfiles.length} global profile entries`));
    console.log(chalk.bold(`\n  Saved to: ${outputFile}\n`));

    sqlite.close();

  } catch (error) {
    console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : error}\n`));
    process.exit(1);
  }
}

function getProjectId(cwd: string): string {
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return createHash('sha256').update(gitRoot).digest('hex').slice(0, 16);
  } catch {
    return createHash('sha256').update(cwd).digest('hex').slice(0, 16);
  }
}
