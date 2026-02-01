// apps/cli/src/commands/list.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import chalk from 'chalk';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');

interface ListOptions {
  project?: boolean;
  limit?: string;
}

export async function listCommand(options: ListOptions): Promise<void> {
  if (!existsSync(DB_PATH)) {
    console.log(chalk.yellow('\n  ⚠ memextend not initialized. Run `memextend init` first.\n'));
    return;
  }

  try {
    const { SQLiteStorage } = await import('@memextend/core');

    const sqlite = new SQLiteStorage(DB_PATH);

    const limit = parseInt(options.limit ?? '20', 10);
    let projectId: string | undefined;

    if (options.project) {
      projectId = getProjectId(process.cwd());
    }

    const memories = sqlite.getAllMemories(projectId, limit);

    console.log(chalk.bold(`\n  Recent Memories${options.project ? ' (current project)' : ''}\n`));

    if (memories.length === 0) {
      console.log(chalk.yellow('  No memories found.\n'));
    } else {
      memories.forEach((memory, i) => {
        const preview = memory.content.split('\n')[0].slice(0, 70);
        const date = formatDate(memory.createdAt);
        const type = memory.sourceTool ? `[${memory.sourceTool}]` : '[manual]';

        console.log(`  ${chalk.cyan(`${i + 1}.`)} ${chalk.dim(type)} ${preview}`);
        console.log(chalk.dim(`     Date: ${date} | ID: ${memory.id}\n`));
      });

      console.log(chalk.dim(`  Showing ${memories.length} of ${sqlite.getMemoryCount()} total memories.\n`));
    }

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

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
