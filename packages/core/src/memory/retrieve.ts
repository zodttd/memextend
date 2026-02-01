// packages/core/src/memory/retrieve.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import type { SQLiteStorage } from '../storage/sqlite.js';
import type { LanceDBStorage } from '../storage/lancedb.js';
import type { Memory, SearchResult, RetrievalOptions, GlobalProfile } from './types.js';

export type EmbedFunction = (text: string) => Promise<number[]>;

export interface MemoryRetrieverOptions {
  defaultLimit?: number;
  defaultRecentDays?: number;
  rrfK?: number; // RRF constant
}

export class MemoryRetriever {
  private sqlite: SQLiteStorage;
  private lancedb: LanceDBStorage;
  private embed: EmbedFunction;
  private options: Required<MemoryRetrieverOptions>;

  constructor(
    sqlite: SQLiteStorage,
    lancedb: LanceDBStorage,
    embed: EmbedFunction,
    options: MemoryRetrieverOptions = {}
  ) {
    this.sqlite = sqlite;
    this.lancedb = lancedb;
    this.embed = embed;
    this.options = {
      defaultLimit: options.defaultLimit ?? 10,
      defaultRecentDays: options.defaultRecentDays ?? 7,
      rrfK: options.rrfK ?? 60,
    };
  }

  /**
   * Full-text search using FTS5
   */
  async search(query: string, options: RetrievalOptions = {}): Promise<SearchResult[]> {
    const limit = options.limit ?? this.options.defaultLimit;
    return this.sqlite.searchFTS(query, limit);
  }

  /**
   * Vector similarity search using LanceDB
   */
  async vectorSearch(query: string, options: RetrievalOptions = {}): Promise<SearchResult[]> {
    const limit = options.limit ?? this.options.defaultLimit;
    const queryVector = await this.embed(query);
    const vectorResults = await this.lancedb.search(queryVector, limit * 2);

    const results: SearchResult[] = [];
    for (const vr of vectorResults) {
      const memory = this.sqlite.getMemory(vr.id);
      if (memory) {
        // Filter by project if specified
        if (options.projectId && memory.projectId !== options.projectId) {
          continue;
        }
        results.push({
          memory,
          score: vr.score,
          source: 'vector'
        });
      }
    }
    return results.slice(0, limit);
  }

  /**
   * Hybrid search combining FTS and vector search with RRF fusion
   */
  async hybridSearch(query: string, options: RetrievalOptions = {}): Promise<SearchResult[]> {
    const limit = options.limit ?? this.options.defaultLimit;
    const k = this.options.rrfK;

    // Get results from both sources in parallel
    const [ftsResults, vectorResults] = await Promise.all([
      this.search(query, { ...options, limit: limit * 2 }),
      this.vectorSearch(query, { ...options, limit: limit * 2 })
    ]);

    // Apply Reciprocal Rank Fusion (RRF)
    const scores = new Map<string, number>();
    const memories = new Map<string, Memory>();

    // Score FTS results
    ftsResults.forEach((result, rank) => {
      const rrfScore = 1 / (k + rank + 1);
      scores.set(result.memory.id, (scores.get(result.memory.id) ?? 0) + rrfScore);
      memories.set(result.memory.id, result.memory);
    });

    // Score vector results
    vectorResults.forEach((result, rank) => {
      const rrfScore = 1 / (k + rank + 1);
      scores.set(result.memory.id, (scores.get(result.memory.id) ?? 0) + rrfScore);
      memories.set(result.memory.id, result.memory);
    });

    // Sort by combined score and return top results
    const combined = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => ({
        memory: memories.get(id)!,
        score,
        source: 'hybrid' as const
      }));

    return combined;
  }

  /**
   * Get recent memories for a project
   */
  getRecent(projectId: string | null, options: RetrievalOptions = {}): Memory[] {
    const limit = options.limit ?? this.options.defaultLimit;
    const days = options.recentDays ?? this.options.defaultRecentDays;
    return this.sqlite.getRecentMemories(projectId, limit, days);
  }

  /**
   * Get context for a new session - combines recent memories and global profile
   */
  async getContextForSession(projectId: string, options: RetrievalOptions = {}): Promise<{
    recentMemories: Memory[];
    globalProfile: GlobalProfile[];
    relevantMemories: SearchResult[];
  }> {
    const limit = options.limit ?? this.options.defaultLimit;
    const includeGlobal = options.includeGlobal ?? true;

    // Get recent project memories
    const recentMemories = this.getRecent(projectId, {
      limit: Math.floor(limit / 2),
      recentDays: options.recentDays
    });

    // Get global profile if requested
    const globalProfile = includeGlobal
      ? this.sqlite.getGlobalProfiles(5)
      : [];

    // Get project info for semantic search
    const project = this.sqlite.getProject(projectId);
    const projectName = project?.name ?? 'project';

    // Semantic search for relevant memories
    const relevantMemories = await this.vectorSearch(projectName, {
      projectId,
      limit: Math.floor(limit / 2)
    });

    return {
      recentMemories,
      globalProfile,
      relevantMemories
    };
  }
}

/**
 * Format context for injection into a session
 */
export function formatContextForInjection(context: {
  recentMemories: Memory[];
  globalProfile: GlobalProfile[];
  relevantMemories?: SearchResult[];
}): string {
  const lines: string[] = ['<memextend-context>', '## Your Memory for This Project', ''];

  // Recent work section
  if (context.recentMemories.length > 0) {
    lines.push('### Recent Work');
    for (const memory of context.recentMemories) {
      const date = formatRelativeDate(memory.createdAt);
      const preview = memory.content.split('\n')[0].slice(0, 100);
      lines.push(`- [${date}] ${preview}`);
    }
    lines.push('');
  }

  // Global preferences section
  if (context.globalProfile.length > 0) {
    lines.push('### User Preferences (Global)');
    for (const profile of context.globalProfile) {
      lines.push(`- ${profile.content}`);
    }
    lines.push('');
  }

  // Relevant memories section (if provided)
  if (context.relevantMemories && context.relevantMemories.length > 0) {
    lines.push('### Relevant Past Work');
    for (const result of context.relevantMemories) {
      const preview = result.memory.content.split('\n')[0].slice(0, 80);
      lines.push(`- ${preview}`);
    }
    lines.push('');
  }

  lines.push('Use these memories naturally. Ask if something seems outdated.');
  lines.push('</memextend-context>');

  return lines.join('\n');
}

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}
