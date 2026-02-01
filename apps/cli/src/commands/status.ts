// apps/cli/src/commands/status.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import chalk from 'chalk';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const CONFIG_PATH = join(MEMEXTEND_DIR, 'config.json');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');
const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');
const MODELS_PATH = join(MEMEXTEND_DIR, 'models');
const MODEL_FILENAME = 'nomic-embed-text-v1.5.Q8_0.gguf';

interface StatusOptions {
  project?: boolean;
  checkEmbeddings?: boolean;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  // If --check-embeddings, run embedding diagnostics
  if (options.checkEmbeddings) {
    await runEmbeddingDiagnostics();
    return;
  }

  console.log(chalk.bold('\n  memextend Status\n'));

  // Check initialization
  if (!existsSync(DB_PATH)) {
    console.log(chalk.yellow('  ⚠ Not initialized. Run `memextend init` first.\n'));
    return;
  }

  try {
    const { SQLiteStorage, LanceDBStorage, getProjectId } = await import('@memextend/core');

    const sqlite = new SQLiteStorage(DB_PATH);
    const vectorStore = await LanceDBStorage.create(VECTORS_PATH);

    // Get counts
    const memoryCount = sqlite.getMemoryCount();
    const vectorCount = await vectorStore.getVectorCount();

    // Get project info if requested
    let projectInfo = '';
    if (options.project) {
      const cwd = process.cwd();
      const projectId = getProjectId(cwd);
      const project = sqlite.getProject(projectId);
      const projectMemories = sqlite.getAllMemories(projectId, 1000);

      projectInfo = `
  ${chalk.bold('Current Project')}
  ├─ Name: ${project?.name ?? 'Unknown'}
  ├─ ID: ${projectId}
  └─ Memories: ${projectMemories.length}
`;
    }

    // Get database sizes
    const dbSize = existsSync(DB_PATH) ? formatBytes(statSync(DB_PATH).size) : '0 B';
    const vectorsSize = existsSync(VECTORS_PATH) ? getDirSize(VECTORS_PATH) : '0 B';
    const modelExists = existsSync(join(MODELS_PATH, 'nomic-embed-text-v1.5.Q8_0.gguf'));

    // Close connections
    sqlite.close();
    await vectorStore.close();

    // Print status
    console.log(`  ${chalk.bold('Storage')}`);
    console.log(`  ├─ Directory: ${MEMEXTEND_DIR}`);
    console.log(`  ├─ Database: ${dbSize}`);
    console.log(`  └─ Vectors: ${vectorsSize}`);
    console.log();
    console.log(`  ${chalk.bold('Memories')}`);
    console.log(`  ├─ Total memories: ${memoryCount}`);
    console.log(`  └─ Vector embeddings: ${vectorCount}`);
    console.log();
    console.log(`  ${chalk.bold('Embedding Model')}`);
    console.log(`  └─ nomic-embed-text: ${modelExists ? chalk.green('Downloaded') : chalk.yellow('Not downloaded (will download on first use)')}`);

    if (projectInfo) {
      console.log();
      console.log(projectInfo);
    }

    console.log();

  } catch (error) {
    console.error(chalk.red(`  Error: ${error instanceof Error ? error.message : error}\n`));
    process.exit(1);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getDirSize(dir: string): string {
  try {
    const result = execSync(`du -sh "${dir}" 2>/dev/null | cut -f1`, {
      encoding: 'utf-8'
    }).trim();
    return result || '0 B';
  } catch {
    return '0 B';
  }
}

async function runEmbeddingDiagnostics(): Promise<void> {
  console.log(chalk.bold('\n  Embedding Model Diagnostics\n'));

  const modelPath = join(MODELS_PATH, MODEL_FILENAME);
  let allPassed = true;

  // Check 1: Model file exists
  console.log(chalk.bold('  [1/5] Checking model file...'));
  if (existsSync(modelPath)) {
    const size = statSync(modelPath).size;
    const sizeStr = formatBytes(size);
    if (size < 100 * 1024 * 1024) {
      console.log(chalk.red(`        ✗ Model file too small (${sizeStr}), may be corrupted`));
      console.log(chalk.yellow(`        → Delete and re-download: rm "${modelPath}"`));
      allPassed = false;
    } else {
      console.log(chalk.green(`        ✓ Model file exists (${sizeStr})`));
    }
  } else {
    console.log(chalk.yellow('        ⚠ Model not downloaded'));
    console.log(chalk.dim(`        → Will download on first use (~274MB)`));
    console.log(chalk.dim(`        → Or manually: npx memextend status --check-embeddings`));

    // Offer to download now
    console.log();
    console.log(chalk.bold('  Downloading model now...'));
    try {
      const { LocalEmbedding } = await import('@memextend/core');
      await LocalEmbedding.create(MODELS_PATH);
      console.log(chalk.green('        ✓ Model downloaded successfully'));
    } catch (error) {
      console.log(chalk.red(`        ✗ Download failed: ${error instanceof Error ? error.message : error}`));
      allPassed = false;
    }
  }

  // Check 2: Can load model
  console.log();
  console.log(chalk.bold('  [2/5] Loading model...'));
  let embedding: any = null;
  try {
    const { LocalEmbedding } = await import('@memextend/core');
    const startLoad = Date.now();
    embedding = await LocalEmbedding.create(MODELS_PATH);
    const loadTime = Date.now() - startLoad;
    console.log(chalk.green(`        ✓ Model loaded successfully (${loadTime}ms)`));
  } catch (error) {
    console.log(chalk.red(`        ✗ Failed to load model: ${error instanceof Error ? error.message : error}`));
    allPassed = false;
  }

  if (!embedding) {
    console.log(chalk.red('\n  Cannot continue diagnostics without model.\n'));
    process.exit(1);
  }

  // Check 3: Generate document embedding
  console.log();
  console.log(chalk.bold('  [3/5] Generating document embedding...'));
  try {
    const testDoc = 'This is a test document for embedding generation.';
    const startEmbed = Date.now();
    const docVector = await embedding.embed(testDoc);
    const embedTime = Date.now() - startEmbed;

    if (docVector.length === 384) {
      console.log(chalk.green(`        ✓ Document embedding generated (${embedTime}ms, ${docVector.length} dimensions)`));
    } else {
      console.log(chalk.red(`        ✗ Unexpected dimensions: ${docVector.length} (expected 384)`));
      allPassed = false;
    }
  } catch (error) {
    console.log(chalk.red(`        ✗ Failed: ${error instanceof Error ? error.message : error}`));
    allPassed = false;
  }

  // Check 4: Generate query embedding
  console.log();
  console.log(chalk.bold('  [4/5] Generating query embedding...'));
  try {
    const testQuery = 'test query';
    const startQuery = Date.now();
    const queryVector = await embedding.embedQuery(testQuery);
    const queryTime = Date.now() - startQuery;

    if (queryVector.length === 384) {
      console.log(chalk.green(`        ✓ Query embedding generated (${queryTime}ms, ${queryVector.length} dimensions)`));
    } else {
      console.log(chalk.red(`        ✗ Unexpected dimensions: ${queryVector.length} (expected 384)`));
      allPassed = false;
    }
  } catch (error) {
    console.log(chalk.red(`        ✗ Failed: ${error instanceof Error ? error.message : error}`));
    allPassed = false;
  }

  // Check 5: Semantic similarity test
  console.log();
  console.log(chalk.bold('  [5/5] Testing semantic similarity...'));
  try {
    const { cosineSimilarity } = await import('@memextend/core');

    const doc1 = await embedding.embed('The cat sat on the mat.');
    const doc2 = await embedding.embed('A feline rested on the rug.');
    const doc3 = await embedding.embed('Python is a programming language.');

    const query = await embedding.embedQuery('cat sitting');

    const sim1 = cosineSimilarity(query, doc1);
    const sim2 = cosineSimilarity(query, doc2);
    const sim3 = cosineSimilarity(query, doc3);

    console.log(chalk.dim(`        Query: "cat sitting"`));
    console.log(chalk.dim(`        Doc 1: "The cat sat on the mat." → similarity: ${sim1.toFixed(4)}`));
    console.log(chalk.dim(`        Doc 2: "A feline rested on the rug." → similarity: ${sim2.toFixed(4)}`));
    console.log(chalk.dim(`        Doc 3: "Python is a programming language." → similarity: ${sim3.toFixed(4)}`));

    // Semantic test: doc1 and doc2 should be more similar to query than doc3
    if (sim1 > sim3 && sim2 > sim3) {
      console.log(chalk.green('        ✓ Semantic similarity working correctly'));
    } else {
      console.log(chalk.yellow('        ⚠ Semantic similarity may not be working as expected'));
      allPassed = false;
    }
  } catch (error) {
    console.log(chalk.red(`        ✗ Failed: ${error instanceof Error ? error.message : error}`));
    allPassed = false;
  }

  // Clean up
  await embedding.close();

  // Summary
  console.log();
  if (allPassed) {
    console.log(chalk.green.bold('  ✓ All embedding diagnostics passed!\n'));
  } else {
    console.log(chalk.yellow.bold('  ⚠ Some diagnostics had issues. See above for details.\n'));
    process.exit(1);
  }
}
