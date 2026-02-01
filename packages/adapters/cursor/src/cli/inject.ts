// packages/adapters/cursor/src/cli/inject.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

/**
 * Context Injection CLI for Cursor
 *
 * Retrieves and outputs context for a new session.
 * Can be used to populate Cursor's context or copy to clipboard.
 *
 * Usage:
 *   memextend-cursor-inject [options]
 *   memextend-cursor-inject --workspace <dir>  # Specify workspace
 *   memextend-cursor-inject --days 14          # Look back 14 days
 *   memextend-cursor-inject --no-global        # Exclude global preferences
 *   memextend-cursor-inject --format json      # Output as JSON
 *   memextend-cursor-inject --clipboard        # Copy to clipboard (macOS)
 *
 * This can be run at the start of a Cursor session.
 */

import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { join, basename, resolve } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

import {
  SQLiteStorage,
  SqliteVecStorage,
  MemoryRetriever,
  createEmbedFunction,
  formatContextForInjection
} from '@memextend/core';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');
const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');
const MODELS_PATH = join(MEMEXTEND_DIR, 'models');

interface InjectOptions {
  workspace?: string;
  days?: number;
  limit?: number;
  includeGlobal?: boolean;
  format?: 'text' | 'json' | 'markdown';
  clipboard?: boolean;
  quiet?: boolean;
}

function parseArgs(): InjectOptions {
  const args = process.argv.slice(2);
  const options: InjectOptions = {
    includeGlobal: true,
    format: 'text',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--workspace':
      case '-w':
        options.workspace = next;
        i++;
        break;
      case '--days':
      case '-d':
        options.days = parseInt(next, 10);
        i++;
        break;
      case '--limit':
      case '-l':
        options.limit = parseInt(next, 10);
        i++;
        break;
      case '--no-global':
        options.includeGlobal = false;
        break;
      case '--format':
      case '-f':
        options.format = next as 'text' | 'json' | 'markdown';
        i++;
        break;
      case '--clipboard':
      case '-c':
        options.clipboard = true;
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
memextend-cursor-inject - Retrieve context for session start

USAGE:
  memextend-cursor-inject [OPTIONS]

OPTIONS:
  -w, --workspace <dir>   Workspace directory (default: cwd)
  -d, --days <n>          Look back N days (default: 7)
  -l, --limit <n>         Maximum memories to retrieve (default: 10)
      --no-global         Exclude global preferences
  -f, --format <type>     Output format: text, json, markdown (default: text)
  -c, --clipboard         Copy to clipboard (macOS only)
  -q, --quiet             Only output the context (no status messages)
  -h, --help              Show this help

EXAMPLES:
  # Get context for current workspace
  memextend-cursor-inject

  # Get context for specific project
  memextend-cursor-inject -w /path/to/project

  # Get extended history
  memextend-cursor-inject --days 30 --limit 20

  # Copy to clipboard for pasting into Cursor
  memextend-cursor-inject --clipboard

  # Get JSON for programmatic use
  memextend-cursor-inject --format json

INTEGRATION:
  Run at session start or add to your shell profile.
  Can be piped to Cursor's context via extensions or tasks.
`);
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

function copyToClipboard(text: string): boolean {
  try {
    // macOS
    if (process.platform === 'darwin') {
      execSync('pbcopy', { input: text });
      return true;
    }
    // Linux with xclip
    if (process.platform === 'linux') {
      execSync('xclip -selection clipboard', { input: text });
      return true;
    }
    // Windows
    if (process.platform === 'win32') {
      execSync('clip', { input: text });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const options = parseArgs();

  // Check if memextend is initialized
  if (!existsSync(DB_PATH)) {
    if (!options.quiet) {
      console.error('memextend not initialized. Run `memextend init` first.');
    }
    // Output empty context on error
    console.log('<memextend-context>\nNo memories available.\n</memextend-context>');
    process.exit(0); // Don't fail - just return empty context
  }

  // Determine workspace
  const workspace = options.workspace ? resolve(options.workspace) : process.cwd();
  const projectId = getProjectId(workspace);

  // Initialize storage
  const sqlite = new SQLiteStorage(DB_PATH);
  const vectorStore = await SqliteVecStorage.create(VECTORS_PATH);
  const embedder = await createEmbedFunction(MODELS_PATH);

  try {
    const retriever = new MemoryRetriever(sqlite, vectorStore, embedder.embedQuery, {
      defaultLimit: options.limit ?? 0,
      defaultRecentDays: options.days ?? 0,
    });

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

    // Get context for session
    const context = await retriever.getContextForSession(projectId, {
      includeGlobal: options.includeGlobal ?? true,
      recentDays: options.days,
    });

    // Check if there's any content
    const hasContent = context.recentMemories.length > 0 ||
                       context.globalProfile.length > 0 ||
                       (context.relevantMemories && context.relevantMemories.length > 0);

    let output: string;

    if (options.format === 'json') {
      output = JSON.stringify({
        projectId,
        projectName: basename(workspace),
        workspace,
        recentMemories: context.recentMemories,
        globalProfile: context.globalProfile,
        relevantMemories: context.relevantMemories,
        hasContent,
      }, null, 2);
    } else if (options.format === 'markdown') {
      if (!hasContent) {
        output = `# Memory Context for ${basename(workspace)}\n\nNo memories found. This might be a new project.\n`;
      } else {
        output = formatContextAsMarkdown(context, basename(workspace));
      }
    } else {
      if (!hasContent) {
        output = `<memextend-context>\n## Project: ${basename(workspace)}\n\nNo memories found. This might be a new project.\n</memextend-context>`;
      } else {
        output = formatContextForInjection(context);
      }
    }

    // Handle clipboard
    if (options.clipboard) {
      const copied = copyToClipboard(output);
      if (!options.quiet) {
        if (copied) {
          console.error('Context copied to clipboard!');
        } else {
          console.error('Warning: Could not copy to clipboard');
        }
      }
    }

    // Output
    console.log(output);

  } finally {
    // Cleanup
    sqlite.close();
    await vectorStore.close();
    await embedder.close();
  }
}

function formatContextAsMarkdown(context: {
  recentMemories: any[];
  globalProfile: any[];
  relevantMemories?: any[];
}, projectName: string): string {
  const lines: string[] = [`# Memory Context for ${projectName}`, ''];

  if (context.recentMemories.length > 0) {
    lines.push('## Recent Work');
    lines.push('');
    for (const memory of context.recentMemories) {
      const date = new Date(memory.createdAt).toLocaleDateString();
      lines.push(`### ${date}`);
      lines.push('');
      lines.push(memory.content);
      lines.push('');
    }
  }

  if (context.globalProfile.length > 0) {
    lines.push('## User Preferences (Global)');
    lines.push('');
    for (const profile of context.globalProfile) {
      lines.push(`- **${profile.key}**: ${profile.content}`);
    }
    lines.push('');
  }

  if (context.relevantMemories && context.relevantMemories.length > 0) {
    lines.push('## Relevant Past Work');
    lines.push('');
    for (const result of context.relevantMemories) {
      lines.push(`- ${result.memory.content.split('\n')[0].slice(0, 100)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
