// apps/cli/src/commands/optimize.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { existsSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import ora from 'ora';
import { LanceDBStorage } from '@memextend/core';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getDirectorySize(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;

  let totalSize = 0;
  const files = readdirSync(dirPath, { withFileTypes: true });

  for (const file of files) {
    const filePath = join(dirPath, file.name);
    if (file.isDirectory()) {
      totalSize += getDirectorySize(filePath);
    } else {
      totalSize += statSync(filePath).size;
    }
  }

  return totalSize;
}

export async function optimizeCommand(): Promise<void> {
  console.log(chalk.bold('\nmemextend Storage Optimization\n'));

  // Check if memextend is initialized
  if (!existsSync(VECTORS_PATH)) {
    console.log(chalk.red('Error: memextend not initialized. Run `memextend init` first.\n'));
    process.exit(1);
  }

  // Get size before
  const sizeBefore = getDirectorySize(VECTORS_PATH);
  console.log(`Vector storage before: ${chalk.yellow(formatBytes(sizeBefore))}`);

  const spinner = ora('Optimizing LanceDB storage...').start();

  try {
    const lancedb = await LanceDBStorage.create(VECTORS_PATH);
    const stats = await lancedb.optimize();

    spinner.stop();

    if (stats) {
      console.log(chalk.green('\nOptimization complete!'));
      console.log(`  Files compacted: ${stats.compacted}`);
      console.log(`  Old versions pruned: ${stats.pruned}`);
    } else {
      console.log(chalk.yellow('\nNo optimization needed or table is empty.'));
    }

    // Get size after
    const sizeAfter = getDirectorySize(VECTORS_PATH);
    const saved = sizeBefore - sizeAfter;

    console.log(`\nVector storage after: ${chalk.green(formatBytes(sizeAfter))}`);

    if (saved > 0) {
      console.log(`Space saved: ${chalk.green(formatBytes(saved))} (${((saved / sizeBefore) * 100).toFixed(1)}%)`);
    } else if (saved < 0) {
      console.log(`Note: Size increased by ${formatBytes(-saved)} (this can happen during compaction)`);
    }

    console.log('');
  } catch (error) {
    spinner.fail('Optimization failed');
    console.error(chalk.red(`\nError: ${(error as Error).message}\n`));
    process.exit(1);
  }
}
