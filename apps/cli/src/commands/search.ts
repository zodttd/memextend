// apps/cli/src/commands/search.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');
const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');
const MODELS_PATH = join(MEMEXTEND_DIR, 'models');

interface SearchOptions {
  project?: boolean;
  global?: boolean;
  limit?: string;
}

export async function searchCommand(query: string, options: SearchOptions): Promise<void> {
  if (!existsSync(DB_PATH)) {
    console.log(chalk.yellow('\n  ⚠ memextend not initialized. Run `memextend init` first.\n'));
    return;
  }

  try {
    const { SQLiteStorage, SqliteVecStorage, MemoryRetriever, createEmbedFunction, getProjectId } = await import('@memextend/core');

    const sqlite = new SQLiteStorage(DB_PATH);
    const vectorStore = await SqliteVecStorage.create(VECTORS_PATH);

    // Create embedding function (uses real model if available)
    const embedder = await createEmbedFunction(MODELS_PATH);
    const retriever = new MemoryRetriever(sqlite, vectorStore, embedder.embedQuery);

    const limit = parseInt(options.limit ?? '10', 10);
    let projectId: string | undefined;

    if (options.project) {
      projectId = getProjectId(process.cwd());
    }

    // Perform search
    console.log(chalk.bold(`\n  Searching for: "${query}"`));
    if (!embedder.isReal) {
      console.log(chalk.dim('  (Using fallback embeddings - run `memextend init` to download model)\n'));
    } else {
      console.log('');
    }

    let results;
    if (options.global) {
      // Search global profile only
      const profiles = sqlite.getGlobalProfiles(limit);
      console.log(chalk.dim(`  Found ${profiles.length} global profile entries:\n`));

      profiles.forEach((profile, i) => {
        console.log(`  ${i + 1}. [${profile.key}] ${profile.content}`);
        console.log(chalk.dim(`     Created: ${formatDate(profile.createdAt)}\n`));
      });

      sqlite.close();
      await vectorStore.close();
      await embedder.close();
      return;
    }

    results = await retriever.hybridSearch(query, { limit, projectId });

    if (results.length === 0) {
      console.log(chalk.yellow('  No memories found matching your query.\n'));
    } else {
      console.log(chalk.dim(`  Found ${results.length} memories:\n`));

      results.forEach((result, i) => {
        const { memory, score, source } = result;
        const preview = memory.content.split('\n')[0].slice(0, 80);
        const date = formatDate(memory.createdAt);

        console.log(`  ${chalk.cyan(`${i + 1}.`)} ${preview}`);
        console.log(chalk.dim(`     Score: ${score.toFixed(3)} | Source: ${source} | Date: ${date}`));
        console.log(chalk.dim(`     ID: ${memory.id}\n`));
      });
    }

    sqlite.close();
    await vectorStore.close();
    await embedder.close();

  } catch (error) {
    console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : error}\n`));
    process.exit(1);
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
