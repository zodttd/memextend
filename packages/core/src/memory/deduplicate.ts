// packages/core/src/memory/deduplicate.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import type { Memory } from './types.js';
import { cosineSimilarity } from '../embedding/index.js';

export interface DeduplicationOptions {
  /**
   * Similarity threshold (0-1). Memories with similarity above this
   * are considered duplicates. Default: 0.85
   */
  similarityThreshold?: number;
}

const DEFAULT_THRESHOLD = 0.85;

/**
 * Deduplicate memories using cosine similarity.
 *
 * Algorithm:
 * 1. Sort memories by date (newest first)
 * 2. For each memory, check similarity against already-selected memories
 * 3. If similarity > threshold, skip it (newer version already selected)
 * 4. Result: diverse set with newest version of each "topic"
 *
 * @param memories - Array of memories to deduplicate
 * @param vectors - Map of memory ID to embedding vector
 * @param options - Deduplication options
 * @returns Deduplicated array of memories (newest of each similar group)
 */
export function deduplicateMemories(
  memories: Memory[],
  vectors: Map<string, number[]>,
  options?: DeduplicationOptions
): Memory[] {
  if (memories.length === 0) return [];

  const threshold = options?.similarityThreshold ?? DEFAULT_THRESHOLD;

  // Sort by date (newest first)
  const sorted = [...memories].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const selected: Memory[] = [];
  const selectedVectors: number[][] = [];

  for (const memory of sorted) {
    const vector = vectors.get(memory.id);

    // If no vector, include the memory (can't compare)
    if (!vector) {
      selected.push(memory);
      continue;
    }

    // Check similarity against all already-selected memories
    let isDuplicate = false;
    for (const selectedVector of selectedVectors) {
      const similarity = cosineSimilarity(vector, selectedVector);
      if (similarity > threshold) {
        // This memory is too similar to an already-selected one
        // Since we sorted by newest first, the selected one is newer
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      selected.push(memory);
      selectedVectors.push(vector);
    }
  }

  return selected;
}

/**
 * Get statistics about deduplication
 */
export function getDeduplicationStats(
  originalCount: number,
  deduplicatedCount: number
): { removed: number; percentage: number } {
  const removed = originalCount - deduplicatedCount;
  const percentage = originalCount > 0
    ? Math.round((removed / originalCount) * 100)
    : 0;
  return { removed, percentage };
}
