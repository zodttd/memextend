// packages/adapters/claude-code/src/hooks/stop.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { createHash, randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

import {
  SQLiteStorage,
  SQLiteVecStorage,
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
    // Ignore errors, start fresh
  }
  return {};
}

async function saveCaptureState(state: CaptureState): Promise<void> {
  await writeFile(CAPTURE_STATE_PATH, JSON.stringify(state, null, 2));
}

async function main(): Promise<void> {
  // Read input from stdin
  // Log immediately on start
  log('Stop', 'Hook started at ' + new Date().toISOString());

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input: HookInput = JSON.parse(Buffer.concat(chunks).toString());

  log('Stop', 'Hook fired', {
    session_id: input.session_id,
    cwd: input.cwd,
    has_transcript: !!input.transcript_path
  });

  try {
    // Check if memextend is initialized
    if (!existsSync(DB_PATH)) {
      log('Stop', 'DB not found, skipping');
      outputResult({ continue: true, suppressOutput: true });
      return;
    }

    // Check if transcript exists
    if (!input.transcript_path || !existsSync(input.transcript_path)) {
      log('Stop', 'No transcript path, skipping');
      outputResult({ continue: true, suppressOutput: true });
      return;
    }

    // Load config
    const config = await loadConfig();

    // Read and parse transcript
    const transcriptContent = await readFile(input.transcript_path, 'utf-8');
    // By default: capture reasoning only, all tool capture disabled
    // Users can enable individual tools via config.capture.tools: { Edit: true, Write: true, ... }
    const parser = new TranscriptParser({
      toolConfig: config.capture?.tools ?? {},
      maxReasoningLength: config.capture?.maxReasoningLength ?? 10000,
      maxToolOutputLength: config.capture?.maxToolOutputLength ?? 2000,
      captureReasoning: config.capture?.captureReasoning ?? true
    });

    const captures = parser.parse(transcriptContent);

    if (captures.length === 0) {
      log('Stop', 'No captures found');
      outputResult({ continue: true, suppressOutput: true });
      return;
    }

    const reasoningCount = captures.filter(isTextCapture).length;
    const toolCount = captures.filter(isToolCapture).length;
    log('Stop', `Found ${captures.length} captures to save`, { reasoning: reasoningCount, tools: toolCount });

    // Get project ID
    const projectId = getProjectId(input.cwd);

    // Initialize storage
    const sqlite = new SQLiteStorage(DB_PATH);
    const vectorStore = await SQLiteVecStorage.create(VECTORS_PATH);

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

    // Load capture state to avoid re-capturing what pre-compact already saved
    const captureState = await loadCaptureState();
    const sessionState = captureState[input.session_id] || {
      lastCapturedLine: 0,
      capturedIds: []
    };

    // Save each capture as a memory
    let savedCount = 0;
    for (const capture of captures) {
      const content = formatCaptureContent(capture);

      // Create hash to check if already captured
      const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
      if (sessionState.capturedIds.includes(contentHash)) {
        continue; // Skip - already captured by pre-compact
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
          metadata: null
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
            outputPreview: capture.output.slice(0, 200)
          }
        };
      }

      // Store in SQLite
      sqlite.insertMemory(memory);

      // Generate and store embedding
      const vector = await embedder.embed(content);
      await vectorStore.insertVector(memoryId, vector);

      // Track as captured
      sessionState.capturedIds.push(contentHash);
      savedCount++;
    }

    log('Stop', `Saved ${savedCount} new memories (${captures.length - savedCount} already captured)`);

    // Save capture state
    captureState[input.session_id] = sessionState;
    await saveCaptureState(captureState);

    // Deduplicate highly similar memories to save space
    const dedupeOnPrune = config.storage?.deduplicateOnPrune ?? true;
    const dedupeThreshold = config.retrieval?.deduplicationThreshold ?? 0.95;

    if (dedupeOnPrune) {
      const dedupedIds = await deduplicateStoredMemories(
        sqlite, vectorStore, projectId, dedupeThreshold
      );
      if (dedupedIds.length > 0) {
        log('Stop', `Deduplicated ${dedupedIds.length} similar memories`);
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
        log('Stop', `Pruned ${pruneResult.deleted} old memories to stay within limits`);

        // Also delete from vector store
        for (const id of pruneResult.deletedIds) {
          await vectorStore.deleteVector(id);
        }
      }
    }

    // Close storage and embedder
    sqlite.close();
    await vectorStore.close();
    await embedder.close();

    log('Stop', `SUCCESS: Saved ${captures.length} memories`);
    outputResult({ continue: true, suppressOutput: true });

  } catch (error) {
    logError('Stop', error);
    console.error('[memextend] Stop hook error:', error);
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
  vectorStore: SQLiteVecStorage,
  projectId: string,
  threshold: number
): Promise<string[]> {
  const deletedIds: string[] = [];

  // Get all memories for this project, sorted by date (newest first)
  const memories = sqlite.getRecentMemories(projectId, 0, 0); // 0 = unlimited

  if (memories.length < 2) return deletedIds;

  // Get vectors for all memories
  const memoryIds = memories.map(m => m.id);
  const vectors = await vectorStore.getVectorsByIds(memoryIds);

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
      await vectorStore.deleteVector(memory.id);
      deletedIds.push(memory.id);
    }
  }

  return deletedIds;
}

main().catch(error => {
  console.error('[memextend] Fatal error:', error);
  process.exit(0);
});
