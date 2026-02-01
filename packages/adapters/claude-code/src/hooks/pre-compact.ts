// packages/adapters/claude-code/src/hooks/pre-compact.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.
//
// PreCompact hook - Captures memories BEFORE context compaction occurs.
// This is critical for preserving important information that would otherwise
// be lost when Claude summarizes the conversation context.

import { createHash, randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

import {
  SQLiteStorage,
  LanceDBStorage,
  TranscriptParser,
  formatCaptureContent,
  isTextCapture,
  isToolCapture,
  createEmbedFunction,
  cosineSimilarity,
  type Memory,
  type Capture
} from '@memextend/core';
import { log, logError } from './logger.js';

interface HookInput {
  cwd: string;
  session_id: string;
  transcript_path?: string;
  trigger: 'manual' | 'auto';
  custom_instructions?: string;
}

interface HookOutput {
  continue?: boolean;
  suppressOutput?: boolean;
}

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const CONFIG_PATH = join(MEMEXTEND_DIR, 'config.json');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');
const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');
const MODELS_PATH = join(MEMEXTEND_DIR, 'models');

// Track what we've already captured to avoid duplicates
const CAPTURE_STATE_PATH = join(MEMEXTEND_DIR, 'capture-state.json');

interface CaptureState {
  [sessionId: string]: {
    lastCapturedLine: number;
    capturedIds: string[];
  };
}

async function loadCaptureState(): Promise<CaptureState> {
  try {
    if (existsSync(CAPTURE_STATE_PATH)) {
      const content = await readFile(CAPTURE_STATE_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // Ignore errors
  }
  return {};
}

async function saveCaptureState(state: CaptureState): Promise<void> {
  const { writeFile } = await import('fs/promises');
  await writeFile(CAPTURE_STATE_PATH, JSON.stringify(state, null, 2));
}

async function main(): Promise<void> {
  // Read input from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input: HookInput = JSON.parse(Buffer.concat(chunks).toString());

  log('PreCompact', `Hook fired - ${input.trigger.toUpperCase()} compaction`, {
    trigger: input.trigger,
    session_id: input.session_id,
    cwd: input.cwd,
    has_transcript: !!input.transcript_path
  });

  try {
    // Check if memextend is initialized
    if (!existsSync(DB_PATH)) {
      log('PreCompact', 'DB not found, skipping');
      outputResult({ continue: true, suppressOutput: true });
      return;
    }

    // Check if transcript exists
    if (!input.transcript_path || !existsSync(input.transcript_path)) {
      log('PreCompact', 'No transcript path, skipping');
      outputResult({ continue: true, suppressOutput: true });
      return;
    }

    // Load config
    const config = await loadConfig();

    // Load capture state to track what we've already captured
    const captureState = await loadCaptureState();
    const sessionState = captureState[input.session_id] || {
      lastCapturedLine: 0,
      capturedIds: []
    };

    // Read and parse transcript
    const transcriptContent = await readFile(input.transcript_path, 'utf-8');
    const lines = transcriptContent.split('\n').filter(l => l.trim());

    // Only process lines we haven't seen yet
    const newLines = lines.slice(sessionState.lastCapturedLine);
    if (newLines.length === 0) {
      log('PreCompact', 'No new lines to process');
      outputResult({ continue: true, suppressOutput: true });
      return;
    }

    log('PreCompact', 'Processing transcript', {
      totalLines: lines.length,
      newLines: newLines.length,
      lastCapturedLine: sessionState.lastCapturedLine
    });

    const newTranscript = newLines.join('\n');

    // By default: capture reasoning only, all tool capture disabled
    // Users can enable individual tools via config.capture.tools: { Edit: true, Write: true, ... }
    const parser = new TranscriptParser({
      toolConfig: config.capture?.tools ?? {},
      maxReasoningLength: config.capture?.maxReasoningLength ?? 10000,
      maxToolOutputLength: config.capture?.maxToolOutputLength ?? 2000,
      captureReasoning: config.capture?.captureReasoning ?? true
    });

    const captures = parser.parse(newTranscript);

    if (captures.length === 0) {
      log('PreCompact', 'No captures found in new lines');
      // Update state even if no captures
      sessionState.lastCapturedLine = lines.length;
      captureState[input.session_id] = sessionState;
      await saveCaptureState(captureState);

      outputResult({ continue: true, suppressOutput: true });
      return;
    }

    const reasoningCount = captures.filter(isTextCapture).length;
    const toolCount = captures.filter(isToolCapture).length;
    log('PreCompact', `Found ${captures.length} captures to save`, { reasoning: reasoningCount, tools: toolCount });

    // Get project ID
    const projectId = getProjectId(input.cwd);

    // Initialize storage
    const sqlite = new SQLiteStorage(DB_PATH);
    const lancedb = await LanceDBStorage.create(VECTORS_PATH);

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

    // Create embedding function (uses real model if available, fallback otherwise)
    const embedder = await createEmbedFunction(MODELS_PATH);

    // Save each capture as a memory
    let capturedCount = 0;
    for (const capture of captures) {
      const content = formatCaptureContent(capture);

      // Create a hash to detect duplicates
      const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
      if (sessionState.capturedIds.includes(contentHash)) {
        continue; // Skip duplicate
      }

      const memoryId = randomUUID();

      let memory: Memory;

      if (isTextCapture(capture)) {
        memory = {
          id: memoryId,
          projectId,
          content,
          type: 'reasoning',
          sourceTool: null,
          createdAt: new Date().toISOString(),
          sessionId: input.session_id,
          metadata: {
            capturedAt: input.trigger === 'auto' ? 'auto-compact' : 'manual-compact'
          }
        };
      } else {
        memory = {
          id: memoryId,
          projectId,
          content,
          type: 'tool_capture',
          sourceTool: capture.tool,
          createdAt: new Date().toISOString(),
          sessionId: input.session_id,
          metadata: {
            input: capture.input,
            outputPreview: capture.output.slice(0, 200),
            capturedAt: input.trigger === 'auto' ? 'auto-compact' : 'manual-compact'
          }
        };
      }

      // Store in SQLite
      sqlite.insertMemory(memory);

      // Generate and store embedding
      const vector = await embedder.embed(content);
      await lancedb.insertVector(memoryId, vector);

      sessionState.capturedIds.push(contentHash);
      capturedCount++;
    }

    // Deduplicate highly similar memories to save space
    const dedupeOnPrune = config.storage?.deduplicateOnPrune ?? true;
    const dedupeThreshold = config.retrieval?.deduplicationThreshold ?? 0.85;

    if (dedupeOnPrune) {
      const dedupedIds = await deduplicateStoredMemories(
        sqlite, lancedb, projectId, dedupeThreshold
      );
      if (dedupedIds.length > 0) {
        log('PreCompact', `Deduplicated ${dedupedIds.length} similar memories`);
      }
    }

    // Prune old memories if storage limits are configured
    // Note: Manual memories are never pruned - only auto-captured ones count toward limits
    const maxPerProject = config.storage?.maxMemoriesPerProject ?? 10000;
    const maxTotal = config.storage?.maxTotalMemories ?? 0; // 0 = unlimited

    if (maxPerProject > 0 || maxTotal > 0) {
      const pruneResult = sqlite.pruneMemories({
        maxPerProject,
        maxTotal,
        projectId
      });

      if (pruneResult.deleted > 0) {
        log('PreCompact', `Pruned ${pruneResult.deleted} old memories to stay within limits`);

        // Also delete from vector store
        for (const id of pruneResult.deletedIds) {
          await lancedb.deleteVector(id);
        }
      }
    }

    // Update capture state
    sessionState.lastCapturedLine = lines.length;
    captureState[input.session_id] = sessionState;
    await saveCaptureState(captureState);

    // Close storage and embedder
    sqlite.close();
    await lancedb.close();
    await embedder.close();

    // Log for debugging
    if (capturedCount > 0) {
      log('PreCompact', `SUCCESS: Captured ${capturedCount} memories before ${input.trigger} compaction`, {
        capturedCount,
        trigger: input.trigger
      });
      console.error(`[memextend] PreCompact: Captured ${capturedCount} memories before ${input.trigger} compaction`);
    }

    outputResult({ continue: true, suppressOutput: true });

  } catch (error) {
    logError('PreCompact', error);
    console.error('[memextend] PreCompact hook error:', error);
    outputResult({ continue: true, suppressOutput: true });
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

/**
 * Deduplicate stored memories by removing older ones that are highly similar to newer ones.
 * Uses cosine similarity on embeddings. Keeps the newest memory when duplicates found.
 */
async function deduplicateStoredMemories(
  sqlite: SQLiteStorage,
  lancedb: LanceDBStorage,
  projectId: string,
  threshold: number
): Promise<string[]> {
  const deletedIds: string[] = [];

  // Get all memories for this project, sorted by date (newest first)
  const memories = sqlite.getRecentMemories(projectId, 0, 0); // 0 = unlimited

  if (memories.length < 2) return deletedIds;

  // Get vectors for all memories
  const memoryIds = memories.map(m => m.id);
  const vectors = await lancedb.getVectorsByIds(memoryIds);

  if (vectors.size < 2) return deletedIds;

  // Track which memories to keep (newest first wins)
  const keepIds = new Set<string>();
  const keptVectors: Array<{ id: string; vector: number[] }> = [];

  for (const memory of memories) {
    const vector = vectors.get(memory.id);
    if (!vector) {
      keepIds.add(memory.id); // Keep if no vector
      continue;
    }

    // Check if this memory is too similar to any kept memory
    let isDuplicate = false;
    for (const kept of keptVectors) {
      const similarity = cosineSimilarity(vector, kept.vector);
      if (similarity > threshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      keepIds.add(memory.id);
      keptVectors.push({ id: memory.id, vector });
    } else {
      // Delete this duplicate
      sqlite.deleteMemory(memory.id);
      await lancedb.deleteVector(memory.id);
      deletedIds.push(memory.id);
    }
  }

  return deletedIds;
}

main().catch(error => {
  console.error('[memextend] Fatal error:', error);
  process.exit(0);
});
