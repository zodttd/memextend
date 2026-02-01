// apps/cli/src/commands/save.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { createInterface } from 'readline';
import { randomUUID } from 'crypto';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');
const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');

interface SaveOptions {
  global?: boolean;
  project?: string;
  message?: string;
}

export async function saveCommand(options: SaveOptions): Promise<void> {
  if (!existsSync(DB_PATH)) {
    console.log(chalk.yellow('\n  memextend not initialized. Run `memextend init` first.\n'));
    return;
  }

  try {
    const { SQLiteStorage, LanceDBStorage, LocalEmbedding, getCurrentProjectId } = await import('@memextend/core');

    let content = options.message;

    // If no message provided, prompt for content interactively
    if (!content) {
      console.log(chalk.cyan('\n  Enter memory content (press Enter twice to finish, or Ctrl+C to cancel):\n'));

      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const lines: string[] = [];
      let emptyLineCount = 0;

      content = await new Promise<string>((resolve) => {
        const askLine = () => {
          rl.question('  > ', (line) => {
            if (line === '') {
              emptyLineCount++;
              if (emptyLineCount >= 2) {
                rl.close();
                resolve(lines.join('\n').trim());
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
    }

    if (!content) {
      console.log(chalk.yellow('\n  No content provided. Memory not saved.\n'));
      return;
    }

    // Determine project ID
    let projectId: string | null = null;
    if (!options.global) {
      projectId = options.project || getCurrentProjectId();
      if (!projectId) {
        console.log(chalk.yellow('\n  Could not determine project. Use --global for global memory or --project <id>.\n'));
        return;
      }
    }

    // Initialize storage
    const sqlite = new SQLiteStorage(DB_PATH);
    const vectorStore = await LanceDBStorage.create(VECTORS_PATH);
    const embedder = await LocalEmbedding.create(MEMEXTEND_DIR);

    // Create memory
    const memoryId = randomUUID();
    const memory = {
      id: memoryId,
      projectId,
      content,
      type: 'manual' as const,
      sourceTool: null,
      createdAt: new Date().toISOString(),
      sessionId: null,
      metadata: null
    };

    // Save to SQLite
    sqlite.insertMemory(memory);

    // Generate and save embedding
    const embedding = await embedder.embed(content);
    await vectorStore.insertVector(memoryId, embedding);

    sqlite.close();
    await vectorStore.close();

    const scope = projectId ? `project: ${projectId.slice(0, 8)}...` : 'global';
    console.log(chalk.green(`\n  Memory saved (${scope})`));
    console.log(chalk.dim(`  ID: ${memoryId}\n`));

  } catch (error) {
    console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : error}\n`));
    process.exit(1);
  }
}
