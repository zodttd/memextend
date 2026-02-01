// packages/core/src/storage/lancedb.test.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { LanceDBStorage } from './lancedb.js';

describe('LanceDBStorage', () => {
  let tempDir: string;
  let storage: LanceDBStorage;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'memextend-lance-test-'));
    storage = await LanceDBStorage.create(tempDir);
  });

  afterEach(async () => {
    await storage.close();
    await rm(tempDir, { recursive: true });
  });

  it('should insert and search vectors', async () => {
    const vector = new Array(384).fill(0).map(() => Math.random());

    await storage.insertVector('mem-1', vector);

    const results = await storage.search(vector, 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('mem-1');
  });

  it('should return similar vectors first', async () => {
    const baseVector = new Array(384).fill(0.5);
    const similarVector = new Array(384).fill(0.5).map(v => v + (Math.random() - 0.5) * 0.1);
    const differentVector = new Array(384).fill(0).map(() => Math.random());

    await storage.insertVector('similar', similarVector);
    await storage.insertVector('different', differentVector);

    const results = await storage.search(baseVector, 2);
    expect(results[0].id).toBe('similar');
  });

  it('should validate vector dimensions', async () => {
    const wrongDimensions = new Array(100).fill(0.5);

    await expect(storage.insertVector('wrong', wrongDimensions))
      .rejects.toThrow('Vector must have 384 dimensions');
  });

  it('should batch insert vectors', async () => {
    const items = [
      { id: 'batch-1', vector: new Array(384).fill(0.1) },
      { id: 'batch-2', vector: new Array(384).fill(0.2) },
      { id: 'batch-3', vector: new Array(384).fill(0.3) },
    ];

    await storage.insertVectors(items);

    const count = await storage.getVectorCount();
    expect(count).toBe(3);
  });

  it('should delete vectors', async () => {
    const vector = new Array(384).fill(0.5);
    await storage.insertVector('to-delete', vector);

    await storage.deleteVector('to-delete');

    const results = await storage.search(vector, 5);
    const found = results.find(r => r.id === 'to-delete');
    expect(found).toBeUndefined();
  });

  it('should return empty results when no table exists', async () => {
    const freshDir = await mkdtemp(join(tmpdir(), 'memextend-lance-empty-'));
    const freshStorage = await LanceDBStorage.create(freshDir);

    const results = await freshStorage.search(new Array(384).fill(0.5), 5);
    expect(results).toEqual([]);

    await freshStorage.close();
    await rm(freshDir, { recursive: true });
  });
});
