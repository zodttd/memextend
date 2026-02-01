// packages/core/src/embedding/local.test.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LocalEmbedding, cosineSimilarity } from './local.js';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';

// Use a shared model directory to avoid re-downloading
const SHARED_MODEL_DIR = join(tmpdir(), 'memextend-models-test');

describe('LocalEmbedding', () => {
  let embedding: LocalEmbedding;

  beforeAll(async () => {
    // This may take a while on first run due to model download
    embedding = await LocalEmbedding.create(SHARED_MODEL_DIR);
  }, 300000); // 5 min timeout for model download

  afterAll(async () => {
    await embedding.close();
    // Don't delete the model dir - keep for subsequent test runs
  });

  it('should generate embeddings with correct dimensions', async () => {
    const vector = await embedding.embed('Hello world');
    expect(vector.length).toBe(384);
  });

  it('should generate normalized vectors', async () => {
    const vector = await embedding.embed('Test normalization');
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1.0, 5);
  });

  it('should generate similar embeddings for similar text', async () => {
    const vec1 = await embedding.embed('The cat sat on the mat');
    const vec2 = await embedding.embed('A cat was sitting on a mat');
    const vec3 = await embedding.embed('JavaScript programming language');

    const sim12 = cosineSimilarity(vec1, vec2);
    const sim13 = cosineSimilarity(vec1, vec3);

    expect(sim12).toBeGreaterThan(sim13);
  });

  it('should batch embed multiple texts', async () => {
    const texts = ['First text', 'Second text', 'Third text'];
    const vectors = await embedding.embedBatch(texts);

    expect(vectors.length).toBe(3);
    vectors.forEach(vec => expect(vec.length).toBe(384));
  });

  it('should differentiate between query and document embeddings', async () => {
    const doc = await embedding.embed('Documentation about Redis caching');
    const query = await embedding.embedQuery('How to use Redis?');

    // Both should be valid vectors
    expect(doc.length).toBe(384);
    expect(query.length).toBe(384);

    // Query should be somewhat similar to doc
    const sim = cosineSimilarity(doc, query);
    expect(sim).toBeGreaterThan(0);
  });

  it('should report correct dimensions', () => {
    expect(embedding.getDimensions()).toBe(384);
  });
});

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const vec = [0.5, 0.5, 0.5, 0.5];
    const normalized = vec.map(v => v / Math.sqrt(vec.length * 0.25));
    expect(cosineSimilarity(normalized, normalized)).toBeCloseTo(1.0, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0, 0, 0];
    const b = [0, 1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('should throw for mismatched dimensions', () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    expect(() => cosineSimilarity(a, b)).toThrow('Vector dimensions must match');
  });
});
