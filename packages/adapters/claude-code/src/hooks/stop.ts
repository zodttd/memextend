// packages/adapters/claude-code/src/hooks/stop.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

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

async function main(): Promise<void> {
  // Read input from stdin
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
    for (const capture of captures) {
      const content = formatCaptureContent(capture);
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
      await lancedb.insertVector(memoryId, vector);
    }

    // Prune old memories if storage limits are configured
    const maxPerProject = config.storage?.maxMemoriesPerProject ?? 500;
    const maxTotal = config.storage?.maxTotalMemories ?? 5000;

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
          await lancedb.deleteVector(id);
        }
      }
    }

    // Close storage and embedder
    sqlite.close();
    await lancedb.close();
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

main().catch(error => {
  console.error('[memextend] Fatal error:', error);
  process.exit(0);
});
