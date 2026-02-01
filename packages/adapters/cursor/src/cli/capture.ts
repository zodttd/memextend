// packages/adapters/cursor/src/cli/capture.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

/**
 * Session Capture CLI for Cursor
 *
 * Since Cursor doesn't have hooks like Claude Code, this CLI tool provides
 * a way to capture session content manually or via automation.
 *
 * Usage:
 *   memextend-cursor-capture [options]
 *   memextend-cursor-capture --file <path>     # Capture from file
 *   memextend-cursor-capture --stdin           # Capture from stdin
 *   memextend-cursor-capture --content "..."   # Capture direct content
 *   memextend-cursor-capture --workspace <dir> # Specify workspace
 *
 * This can be integrated with Cursor's tasks or keyboard shortcuts.
 */

import { randomUUID, createHash } from 'crypto';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, basename, resolve } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

import {
  SQLiteStorage,
  SqliteVecStorage,
  createEmbedFunction,
  type Memory
} from '@memextend/core';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');
const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');
const MODELS_PATH = join(MEMEXTEND_DIR, 'models');

interface CaptureOptions {
  content?: string;
  file?: string;
  stdin?: boolean;
  workspace?: string;
  type?: 'summary' | 'tool_capture' | 'manual';
  sourceTool?: string;
  sessionId?: string;
  quiet?: boolean;
}

function parseArgs(): CaptureOptions {
  const args = process.argv.slice(2);
  const options: CaptureOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--content':
      case '-c':
        options.content = next;
        i++;
        break;
      case '--file':
      case '-f':
        options.file = next;
        i++;
        break;
      case '--stdin':
      case '-i':
        options.stdin = true;
        break;
      case '--workspace':
      case '-w':
        options.workspace = next;
        i++;
        break;
      case '--type':
      case '-t':
        options.type = next as 'summary' | 'tool_capture' | 'manual';
        i++;
        break;
      case '--source':
      case '-s':
        options.sourceTool = next;
        i++;
        break;
      case '--session':
        options.sessionId = next;
        i++;
        break;
      case '--quiet':
      case '-q':
        options.quiet = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
memextend-cursor-capture - Capture session content to memory

USAGE:
  memextend-cursor-capture [OPTIONS]

OPTIONS:
  -c, --content <text>    Content to capture directly
  -f, --file <path>       Read content from file
  -i, --stdin             Read content from stdin
  -w, --workspace <dir>   Workspace directory (default: cwd)
  -t, --type <type>       Memory type: summary, tool_capture, manual (default: manual)
  -s, --source <tool>     Source tool name (for tool_capture type)
      --session <id>      Session ID for grouping captures
  -q, --quiet             Suppress output
  -h, --help              Show this help

EXAMPLES:
  # Capture direct content
  memextend-cursor-capture -c "Implemented Redis caching for user sessions"

  # Capture from file
  memextend-cursor-capture -f session-notes.txt

  # Capture from pipe (e.g., from AI output)
  echo "Fixed authentication bug" | memextend-cursor-capture --stdin

  # Capture with workspace context
  memextend-cursor-capture -c "Added API endpoints" -w /path/to/project

INTEGRATION:
  Add as a Cursor task in tasks.json or bind to a keyboard shortcut.
`);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
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

async function main(): Promise<void> {
  const options = parseArgs();

  // Check if memextend is initialized
  if (!existsSync(DB_PATH)) {
    console.error('Error: memextend not initialized. Run `memextend init` first.');
    process.exit(1);
  }

  // Get content from specified source
  let content: string;

  if (options.content) {
    content = options.content;
  } else if (options.file) {
    if (!existsSync(options.file)) {
      console.error(`Error: File not found: ${options.file}`);
      process.exit(1);
    }
    content = await readFile(options.file, 'utf-8');
  } else if (options.stdin) {
    content = await readStdin();
  } else {
    console.error('Error: No content source specified. Use --content, --file, or --stdin');
    console.error('Run with --help for usage information.');
    process.exit(1);
  }

  content = content.trim();

  if (!content || content.length < 5) {
    console.error('Error: Content is empty or too short (minimum 5 characters)');
    process.exit(1);
  }

  // Determine workspace
  const workspace = options.workspace ? resolve(options.workspace) : process.cwd();
  const projectId = getProjectId(workspace);

  // Initialize storage
  const sqlite = new SQLiteStorage(DB_PATH);
  const vectorStore = await SqliteVecStorage.create(VECTORS_PATH);
  const embedder = await createEmbedFunction(MODELS_PATH);

  try {
    // Ensure project is registered
    const project = sqlite.getProject(projectId);
    if (!project) {
      sqlite.insertProject({
        id: projectId,
        name: basename(workspace),
        path: workspace,
        createdAt: new Date().toISOString()
      });
    }

    // Create memory
    const memoryId = randomUUID();
    const memory: Memory = {
      id: memoryId,
      projectId,
      content,
      type: options.type ?? 'manual',
      sourceTool: options.sourceTool as any ?? null,
      createdAt: new Date().toISOString(),
      sessionId: options.sessionId ?? null,
      metadata: null,
    };

    // Store in SQLite
    sqlite.insertMemory(memory);

    // Generate and store embedding
    const vector = await embedder.embed(content);
    await vectorStore.insertVector(memoryId, vector);

    if (!options.quiet) {
      console.log(`Memory captured successfully!`);
      console.log(`  ID: ${memoryId}`);
      console.log(`  Project: ${basename(workspace)}`);
      console.log(`  Type: ${memory.type}`);
      console.log(`  Content: ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`);
    }

  } finally {
    // Cleanup
    sqlite.close();
    await vectorStore.close();
    await embedder.close();
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
