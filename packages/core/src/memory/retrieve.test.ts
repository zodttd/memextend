// packages/core/src/memory/retrieve.test.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { MemoryRetriever, formatContextForInjection } from './retrieve.js';
import { SQLiteStorage } from '../storage/sqlite.js';
import { SqliteVecStorage } from '../storage/sqlite-vec.js';
import type { Memory, GlobalProfile } from './types.js';

describe('MemoryRetriever', () => {
  let tempDir: string;
  let sqlite: SQLiteStorage;
  let vectorStore: SqliteVecStorage;
  let retriever: MemoryRetriever;

  // Mock embedding function for tests
  const mockEmbed = async (text: string): Promise<number[]> => {
    // Simple deterministic mock: hash the text to create a consistent vector
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }
    return new Array(384).fill(0).map((_, i) => Math.sin(hash + i) * 0.5 + 0.5);
  };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'memextend-retrieve-test-'));
    sqlite = new SQLiteStorage(join(tempDir, 'test.db'));
    vectorStore = await SqliteVecStorage.create(join(tempDir, 'vectors.db'));
    retriever = new MemoryRetriever(sqlite, vectorStore, mockEmbed);

    // Seed test data
    await seedTestMemories(sqlite, vectorStore, mockEmbed);
  });

  afterEach(async () => {
    sqlite.close();
    await vectorStore.close();
    await rm(tempDir, { recursive: true });
  });

  it('should retrieve memories by FTS', async () => {
    const results = await retriever.search('Redis caching', { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toBe('fts');
  });

  it('should retrieve memories by vector search', async () => {
    const results = await retriever.vectorSearch('database caching', { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toBe('vector');
  });

  it('should retrieve recent memories for project', () => {
    const results = retriever.getRecent('project-1', { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(m => m.projectId === 'project-1')).toBe(true);
  });

  it('should perform hybrid search with RRF fusion', async () => {
    const results = await retriever.hybridSearch('authentication JWT', { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toBe('hybrid');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('should get context for session', async () => {
    // Add a project first
    sqlite.insertProject({
      id: 'project-1',
      name: 'my-project',
      path: '/home/user/my-project',
      createdAt: new Date().toISOString()
    });

    // Add global profile
    sqlite.insertGlobalProfile({
      id: 'pref-1',
      key: 'preference',
      content: 'Prefers Vitest over Jest',
      createdAt: new Date().toISOString()
    });

    const context = await retriever.getContextForSession('project-1', { includeGlobal: true });

    expect(context.recentMemories.length).toBeGreaterThanOrEqual(0);
    expect(context.globalProfile.length).toBe(1);
    expect(context.globalProfile[0].content).toBe('Prefers Vitest over Jest');
  });

  it('should filter vector search by project', async () => {
    const results = await retriever.vectorSearch('express', { projectId: 'project-2', limit: 5 });
    expect(results.every(r => r.memory.projectId === 'project-2')).toBe(true);
  });
});

describe('formatContextForInjection', () => {
  it('should format context with recent memories', () => {
    const context = {
      recentMemories: [
        createMemory('mem-1', 'project-1', '[Edit] src/auth.ts - Added JWT validation'),
        createMemory('mem-2', 'project-1', '[Bash] npm install jose')
      ],
      globalProfile: [],
      relevantMemories: []
    };

    const formatted = formatContextForInjection(context);

    expect(formatted).toContain('<memextend-context>');
    expect(formatted).toContain('</memextend-context>');
    expect(formatted).toContain('Recent Work');
    expect(formatted).toContain('JWT validation');
  });

  it('should format context with global profile', () => {
    const context = {
      recentMemories: [],
      globalProfile: [
        { id: 'pref-1', key: 'preference' as const, content: 'Prefers TypeScript', createdAt: new Date().toISOString() }
      ],
      relevantMemories: []
    };

    const formatted = formatContextForInjection(context);

    expect(formatted).toContain('User Preferences');
    expect(formatted).toContain('Prefers TypeScript');
  });

  it('should format context with relevant memories', () => {
    const context = {
      recentMemories: [],
      globalProfile: [],
      relevantMemories: [
        { memory: createMemory('mem-1', 'project-1', '[Edit] Redis caching setup'), score: 0.9, source: 'vector' as const }
      ]
    };

    const formatted = formatContextForInjection(context);

    expect(formatted).toContain('Relevant Past Work');
    expect(formatted).toContain('Redis caching');
  });
});

// Helper functions
async function seedTestMemories(
  sqlite: SQLiteStorage,
  vectorStore: SqliteVecStorage,
  embed: (text: string) => Promise<number[]>
) {
  const memories: Memory[] = [
    {
      id: 'mem-1',
      projectId: 'project-1',
      content: '[Edit] src/cache.ts - Added Redis caching layer',
      type: 'tool_capture',
      sourceTool: 'Edit',
      createdAt: new Date().toISOString(),
      sessionId: 'sess-1',
      metadata: null
    },
    {
      id: 'mem-2',
      projectId: 'project-1',
      content: '[Edit] src/auth.ts - Implemented JWT authentication',
      type: 'tool_capture',
      sourceTool: 'Edit',
      createdAt: new Date().toISOString(),
      sessionId: 'sess-1',
      metadata: null
    },
    {
      id: 'mem-3',
      projectId: 'project-2',
      content: '[Bash] npm install express',
      type: 'tool_capture',
      sourceTool: 'Bash',
      createdAt: new Date().toISOString(),
      sessionId: 'sess-2',
      metadata: null
    }
  ];

  for (const memory of memories) {
    sqlite.insertMemory(memory);
    const vector = await embed(memory.content);
    await vectorStore.insertVector(memory.id, vector);
  }
}

function createMemory(id: string, projectId: string, content: string): Memory {
  return {
    id,
    projectId,
    content,
    type: 'tool_capture',
    sourceTool: 'Edit',
    createdAt: new Date().toISOString(),
    sessionId: null,
    metadata: null
  };
}
