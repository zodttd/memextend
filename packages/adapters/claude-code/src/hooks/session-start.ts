// packages/adapters/claude-code/src/hooks/session-start.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

import {
  SQLiteStorage,
  SqliteVecStorage,
  MemoryRetriever,
  formatContextForInjection,
  createEmbedFunction,
  deduplicateMemories,
  getDeduplicationStats,
  type Memory
} from '@memextend/core';
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
    const vectorStore = await SqliteVecStorage.create(VECTORS_PATH);

    // Create embedding function (uses real model if available, fallback otherwise)
    const embedder = await createEmbedFunction(MODELS_PATH);

    const retriever = new MemoryRetriever(sqlite, vectorStore, embedder.embedQuery, {
      defaultLimit: config.retrieval?.maxMemories ?? 0,
      defaultRecentDays: config.retrieval?.recentDays ?? 0,
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
    // 0 = unlimited, so use a high number for "unlimited"
    const configLimit = config.retrieval?.maxMemories ?? 0;
    const effectiveLimit = configLimit === 0 ? 1000 : configLimit; // 0 means unlimited, use high limit
    const maxMemories = isPostCompact
      ? Math.min(effectiveLimit * 2, configLimit === 0 ? 1000 : 100) // Double after compact
      : effectiveLimit;

    log('SessionStart', 'Retrieving memories', { maxMemories, isPostCompact, configLimit });

    const context = await retriever.getContextForSession(projectId, {
      includeGlobal: config.retrieval?.includeGlobal ?? true,
      limit: maxMemories,
      recentDays: config.retrieval?.recentDays ?? 0
    });

    // Combine all memories for deduplication
    const allMemories: Memory[] = [
      ...context.recentMemories,
      ...context.relevantMemories.map(r => r.memory)
    ];

    // Deduplicate memories (newest wins for similar content)
    const deduplicationThreshold = config.retrieval?.deduplicationThreshold ?? 0.85;
    let deduplicatedMemories: Memory[] = allMemories;

    if (allMemories.length > 1) {
      // Fetch vectors for all memories
      const memoryIds = allMemories.map(m => m.id);
      const vectors = await vectorStore.getVectorsByIds(memoryIds);

      if (vectors.size > 0) {
        deduplicatedMemories = deduplicateMemories(allMemories, vectors, {
          similarityThreshold: deduplicationThreshold
        });

        const stats = getDeduplicationStats(allMemories.length, deduplicatedMemories.length);
        if (stats.removed > 0) {
          log('SessionStart', 'Deduplication removed similar memories', {
            original: allMemories.length,
            deduplicated: deduplicatedMemories.length,
            removed: stats.removed,
            percentage: stats.percentage
          });
        }
      }
    }

    // Close storage and embedder
    sqlite.close();
    await vectorStore.close();
    await embedder.close();

    // Check if there's anything to inject
    if (deduplicatedMemories.length === 0 && context.globalProfile.length === 0) {
      log('SessionStart', 'No memories to inject');
      outputResult({});
      return;
    }

    // Rebuild context with deduplicated memories
    // Split deduplicated memories back into recent and relevant based on original categorization
    const recentIds = new Set(context.recentMemories.map(m => m.id));
    const deduplicatedContext = {
      recentMemories: deduplicatedMemories.filter(m => recentIds.has(m.id)),
      globalProfile: context.globalProfile,
      relevantMemories: deduplicatedMemories
        .filter(m => !recentIds.has(m.id))
        .map(m => ({ memory: m, score: 0, source: 'hybrid' as const }))
    };

    log('SessionStart', 'Injecting memories', {
      recentCount: deduplicatedContext.recentMemories.length,
      globalCount: deduplicatedContext.globalProfile.length,
      relevantCount: deduplicatedContext.relevantMemories.length,
      totalOriginal: allMemories.length,
      totalDeduplicated: deduplicatedMemories.length
    });

    // Use different character limits for compact vs session start
    // Post-compact: minimal context since we just freed up space (~500 tokens at 2000 chars)
    // Session start: richer context since we have a fresh 100K budget (~2500 tokens at 10000 chars)
    const maxChars = isPostCompact
      ? (config.retrieval?.compactMaxChars ?? 2000)
      : (config.retrieval?.sessionMaxChars ?? 10000);

    const previewLength = isPostCompact ? 100 : 200;

    // Format and inject context with character limits
    let formattedContext = formatContextForInjection(deduplicatedContext, {
      maxChars,
      previewLength
    });

    log('SessionStart', 'Formatted context', {
      isPostCompact,
      maxChars,
      actualChars: formattedContext.length
    });

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
