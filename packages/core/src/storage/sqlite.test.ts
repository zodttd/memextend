// packages/core/src/storage/sqlite.test.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { SQLiteStorage } from './sqlite.js';
import type { Memory } from '../memory/types.js';

describe('SQLiteStorage', () => {
  let tempDir: string;
  let storage: SQLiteStorage;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'memextend-test-'));
    storage = new SQLiteStorage(join(tempDir, 'test.db'));
  });

  afterEach(async () => {
    storage.close();
    await rm(tempDir, { recursive: true });
  });

  it('should initialize database with tables', () => {
    const tables = storage.getTables();
    expect(tables).toContain('memories');
    expect(tables).toContain('memories_fts');
    expect(tables).toContain('projects');
    expect(tables).toContain('global_profile');
  });

  it('should insert and retrieve a memory', () => {
    const memory: Memory = {
      id: 'test-1',
      projectId: 'proj-1',
      content: 'Test memory content',
      type: 'tool_capture',
      sourceTool: 'Edit',
      createdAt: new Date().toISOString(),
      sessionId: 'sess-1',
      metadata: { file: 'test.ts' }
    };

    storage.insertMemory(memory);
    const retrieved = storage.getMemory('test-1');

    expect(retrieved).not.toBeNull();
    expect(retrieved?.content).toBe('Test memory content');
    expect(retrieved?.sourceTool).toBe('Edit');
    expect(retrieved?.metadata).toEqual({ file: 'test.ts' });
  });

  it('should search memories with FTS', () => {
    storage.insertMemory({
      id: 'test-1',
      projectId: 'proj-1',
      content: 'Redis caching implementation',
      type: 'tool_capture',
      sourceTool: 'Edit',
      createdAt: new Date().toISOString(),
      sessionId: null,
      metadata: null
    });

    storage.insertMemory({
      id: 'test-2',
      projectId: 'proj-1',
      content: 'Authentication with JWT',
      type: 'tool_capture',
      sourceTool: 'Edit',
      createdAt: new Date().toISOString(),
      sessionId: null,
      metadata: null
    });

    const results = storage.searchFTS('Redis');
    expect(results.length).toBe(1);
    expect(results[0].memory.id).toBe('test-1');
    expect(results[0].source).toBe('fts');
  });

  it('should get recent memories', () => {
    const now = new Date();
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);

    storage.insertMemory({
      id: 'recent',
      projectId: 'proj-1',
      content: 'Recent memory',
      type: 'tool_capture',
      sourceTool: 'Edit',
      createdAt: now.toISOString(),
      sessionId: null,
      metadata: null
    });

    storage.insertMemory({
      id: 'old',
      projectId: 'proj-1',
      content: 'Old memory',
      type: 'tool_capture',
      sourceTool: 'Edit',
      createdAt: oldDate.toISOString(),
      sessionId: null,
      metadata: null
    });

    const results = storage.getRecentMemories('proj-1', 10, 7);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('recent');
  });

  it('should delete a memory', () => {
    storage.insertMemory({
      id: 'to-delete',
      projectId: 'proj-1',
      content: 'Will be deleted',
      type: 'manual',
      sourceTool: null,
      createdAt: new Date().toISOString(),
      sessionId: null,
      metadata: null
    });

    expect(storage.getMemory('to-delete')).not.toBeNull();

    const deleted = storage.deleteMemory('to-delete');
    expect(deleted).toBe(true);
    expect(storage.getMemory('to-delete')).toBeNull();
  });

  it('should handle projects', () => {
    storage.insertProject({
      id: 'proj-1',
      name: 'my-project',
      path: '/home/user/my-project',
      createdAt: new Date().toISOString()
    });

    const project = storage.getProject('proj-1');
    expect(project).not.toBeNull();
    expect(project?.name).toBe('my-project');
  });

  it('should handle global profiles', () => {
    storage.insertGlobalProfile({
      id: 'pref-1',
      key: 'preference',
      content: 'Prefers Vitest over Jest',
      createdAt: new Date().toISOString()
    });

    const profiles = storage.getGlobalProfiles(10);
    expect(profiles.length).toBe(1);
    expect(profiles[0].key).toBe('preference');
  });
});
