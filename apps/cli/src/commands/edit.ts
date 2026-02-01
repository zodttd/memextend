// apps/cli/src/commands/edit.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { createInterface } from 'readline';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');

export async function editCommand(memoryId: string): Promise<void> {
  if (!existsSync(DB_PATH)) {
    console.log(chalk.yellow('\n  ⚠ memextend not initialized. Run `memextend init` first.\n'));
    return;
  }

  try {
    const { SQLiteStorage } = await import('@memextend/core');

    const sqlite = new SQLiteStorage(DB_PATH);

    // Check if memory exists
    const memory = sqlite.getMemory(memoryId);
    if (!memory) {
      console.log(chalk.yellow(`\n  ⚠ Memory not found: ${memoryId}\n`));
      sqlite.close();
      return;
    }

    // Show current content
    console.log(chalk.cyan('\n  Current content:\n'));
    console.log(chalk.dim('  ─'.repeat(30)));
    memory.content.split('\n').forEach(line => {
      console.log(chalk.white(`  ${line}`));
    });
    console.log(chalk.dim('  ─'.repeat(30)));

    // Prompt for new content
    console.log(chalk.cyan('\n  Enter new content (press Enter twice to finish, or Ctrl+C to cancel):\n'));

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const lines: string[] = [];
    let emptyLineCount = 0;

    const promptLine = (): Promise<string[]> => {
      return new Promise((resolve) => {
        const askLine = () => {
          rl.question('  > ', (line) => {
            if (line === '') {
              emptyLineCount++;
              if (emptyLineCount >= 2) {
                rl.close();
                resolve(lines);
                return;
              }
            } else {
              emptyLineCount = 0;
            }
            lines.push(line);
            askLine();
          });
        };
        askLine();
      });
    };

    const newLines = await promptLine();
    const newContent = newLines.join('\n').trim();

    if (!newContent) {
      console.log(chalk.yellow('\n  ⚠ No content provided. Memory unchanged.\n'));
      sqlite.close();
      return;
    }

    // Update memory
    const updated = sqlite.updateMemory(memoryId, newContent);
    sqlite.close();

    if (updated) {
      console.log(chalk.green(`\n  ✓ Memory ${memoryId} updated.\n`));
    } else {
      console.log(chalk.red(`\n  ✗ Failed to update memory.\n`));
    }

  } catch (error) {
    console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : error}\n`));
    process.exit(1);
  }
}
