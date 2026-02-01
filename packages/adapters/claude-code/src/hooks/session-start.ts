// packages/adapters/claude-code/src/hooks/session-start.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

import { SQLiteStorage, LanceDBStorage, MemoryRetriever, formatContextForInjection, createEmbedFunction } from '@memextend/core';
import { log, logError } from './logger.js';

interface HookInput {
  cwd: string;
  session_id: string;
  transcript_path?: string;
  source?: 'startup' | 'resume' | 'clear' | 'compact';
  model?: string;
}

interface HookOutput {
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext: string;
  };
}

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const CONFIG_PATH = join(MEMEXTEND_DIR, 'config.json');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');
const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');
const MODELS_PATH = join(MEMEXTEND_DIR, 'models');

async function main(): Promise<void> {
  // Read input from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input: HookInput = JSON.parse(Buffer.concat(chunks).toString());

  log('SessionStart', 'Hook fired', {
    source: input.source,
    session_id: input.session_id,
    cwd: input.cwd
  });

  try {
    // Check if memextend is initialized
    if (!existsSync(DB_PATH)) {
      log('SessionStart', 'DB not found, skipping');
      outputResult({});
      return;
    }

    // Load config
    const config = await loadConfig();
    if (!config.retrieval?.autoInject) {
      log('SessionStart', 'Auto-inject disabled in config');
      outputResult({});
      return;
    }

    // Get project ID
    const projectId = getProjectId(input.cwd);

    // Initialize storage
    const sqlite = new SQLiteStorage(DB_PATH);
    const lancedb = await LanceDBStorage.create(VECTORS_PATH);

    // Create embedding function (uses real model if available, fallback otherwise)
    const embedder = await createEmbedFunction(MODELS_PATH);

    const retriever = new MemoryRetriever(sqlite, lancedb, embedder.embedQuery, {
      defaultLimit: config.retrieval?.maxMemories ?? 10,
      defaultRecentDays: config.retrieval?.recentDays ?? 7,
    });

    // Ensure project is registered
    const project = sqlite.getProject(projectId);
    if (!project) {
      sqlite.insertProject({
        id: projectId,
        name: basename(input.cwd),
        path: input.cwd,
        createdAt: new Date().toISOString()
      });
    }

    // Determine if this is a post-compaction injection
    const isPostCompact = input.source === 'compact';

    if (isPostCompact) {
      log('SessionStart', 'POST-COMPACT INJECTION - restoring context after compaction');
    }

    // Get context for session
    // After compaction, we may want to inject more context since the previous context was lost
    const maxMemories = isPostCompact
      ? Math.min((config.retrieval?.maxMemories ?? 10) * 2, 20) // Double after compact, max 20
      : config.retrieval?.maxMemories ?? 10;

    log('SessionStart', 'Retrieving memories', { maxMemories, isPostCompact });

    const context = await retriever.getContextForSession(projectId, {
      includeGlobal: config.retrieval?.includeGlobal ?? true,
      limit: maxMemories
    });

    // Close storage and embedder
    sqlite.close();
    await lancedb.close();
    await embedder.close();

    // Check if there's anything to inject
    if (context.recentMemories.length === 0 &&
        context.globalProfile.length === 0 &&
        context.relevantMemories.length === 0) {
      log('SessionStart', 'No memories to inject');
      outputResult({});
      return;
    }

    log('SessionStart', 'Injecting memories', {
      recentCount: context.recentMemories.length,
      globalCount: context.globalProfile.length,
      relevantCount: context.relevantMemories.length
    });

    // Format and inject context
    let formattedContext = formatContextForInjection(context);

    // Add a note if this is post-compaction so Claude knows context was just restored
    if (isPostCompact) {
      formattedContext = `[Context restored after compaction - the following memories were preserved from your session]\n\n${formattedContext}`;
    }

    outputResult({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: formattedContext
      }
    });

  } catch (error) {
    // Log error but don't fail the hook
    logError('SessionStart', error);
    console.error('[memextend] Session start error:', error);
    outputResult({});
  }
}

function getProjectId(cwd: string): string {
  // Try to get git root
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return createHash('sha256').update(gitRoot).digest('hex').slice(0, 16);
  } catch {
    // Not a git repo, use cwd
    return createHash('sha256').update(cwd).digest('hex').slice(0, 16);
  }
}

async function loadConfig(): Promise<any> {
  try {
    if (existsSync(CONFIG_PATH)) {
      const content = await readFile(CONFIG_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // Ignore config errors
  }
  return {};
}

function outputResult(result: HookOutput): void {
  console.log(JSON.stringify(result));
}

main().catch(error => {
  console.error('[memextend] Fatal error:', error);
  process.exit(0); // Exit cleanly to not block Claude Code
});
