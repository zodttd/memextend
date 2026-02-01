// packages/core/src/memory/deduplicate.test.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { describe, it, expect } from 'vitest';
import { deduplicateMemories, getDeduplicationStats } from './deduplicate.js';
import type { Memory } from './types.js';

describe('deduplicateMemories', () => {
  const createMemory = (id: string, content: string, daysAgo: number): Memory => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return {
      id,
      projectId: 'test-project',
      content,
      type: 'manual',
      sourceTool: null,
      createdAt: date.toISOString(),
      sessionId: null,
      metadata: null
    };
  };

  // Create normalized vectors (unit length)
  const normalize = (v: number[]): number[] => {
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return v.map(x => x / norm);
  };

  it('should return empty array for empty input', () => {
    const result = deduplicateMemories([], new Map());
    expect(result).toEqual([]);
  });

  it('should keep all memories when no vectors available', () => {
    const memories = [
      createMemory('1', 'First memory', 0),
      createMemory('2', 'Second memory', 1)
    ];
    const result = deduplicateMemories(memories, new Map());
    expect(result.length).toBe(2);
  });

  it('should keep all memories when they are dissimilar', () => {
    const memories = [
      createMemory('1', 'Topic A', 0),
      createMemory('2', 'Topic B', 1)
    ];
    // Orthogonal vectors = 0 similarity
    const vectors = new Map<string, number[]>([
      ['1', normalize([1, 0, 0])],
      ['2', normalize([0, 1, 0])]
    ]);
    const result = deduplicateMemories(memories, vectors);
    expect(result.length).toBe(2);
  });

  it('should keep newest when memories are similar', () => {
    const memories = [
      createMemory('1', 'JWT auth v1', 2),  // oldest
      createMemory('2', 'JWT auth v2', 1),  // middle
      createMemory('3', 'JWT auth v3', 0)   // newest
    ];
    // All very similar (same direction)
    const vectors = new Map<string, number[]>([
      ['1', normalize([1, 0.1, 0])],
      ['2', normalize([1, 0.1, 0])],
      ['3', normalize([1, 0.1, 0])]
    ]);
    const result = deduplicateMemories(memories, vectors, { similarityThreshold: 0.9 });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('3'); // Newest wins
  });

  it('should keep diverse memories even when some are similar', () => {
    const memories = [
      createMemory('1', 'Auth v1', 3),
      createMemory('2', 'Auth v2', 2),  // Similar to 1
      createMemory('3', 'Database setup', 1),  // Different topic
      createMemory('4', 'Auth v3', 0)   // Similar to 1 and 2
    ];
    const vectors = new Map<string, number[]>([
      ['1', normalize([1, 0, 0])],
      ['2', normalize([1, 0.05, 0])],  // Very similar to 1
      ['3', normalize([0, 1, 0])],     // Orthogonal (different topic)
      ['4', normalize([1, 0.02, 0])]   // Very similar to 1 and 2
    ]);
    const result = deduplicateMemories(memories, vectors, { similarityThreshold: 0.9 });
    // Should keep: 4 (newest auth), 3 (database is different)
    expect(result.length).toBe(2);
    expect(result.map(m => m.id).sort()).toEqual(['3', '4']);
  });

  it('should use default threshold when not specified', () => {
    const memories = [
      createMemory('1', 'Old', 1),
      createMemory('2', 'New', 0)
    ];
    // Similarity of ~0.95 (above default 0.85)
    const vectors = new Map<string, number[]>([
      ['1', normalize([1, 0.1, 0])],
      ['2', normalize([1, 0.15, 0])]
    ]);
    const result = deduplicateMemories(memories, vectors);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('2');
  });
});

describe('getDeduplicationStats', () => {
  it('should calculate removal stats correctly', () => {
    const stats = getDeduplicationStats(10, 7);
    expect(stats.removed).toBe(3);
    expect(stats.percentage).toBe(30);
  });

  it('should handle zero original count', () => {
    const stats = getDeduplicationStats(0, 0);
    expect(stats.removed).toBe(0);
    expect(stats.percentage).toBe(0);
  });

  it('should handle no removals', () => {
    const stats = getDeduplicationStats(5, 5);
    expect(stats.removed).toBe(0);
    expect(stats.percentage).toBe(0);
  });
});
