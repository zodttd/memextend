// packages/core/src/memory/types.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

export interface Memory {
  id: string;
  projectId: string | null;
  content: string;
  type: MemoryType;
  sourceTool: SourceTool | null;
  createdAt: string;
  sessionId: string | null;
  metadata: Record<string, unknown> | null;
}

export type MemoryType = 'tool_capture' | 'reasoning' | 'summary' | 'manual';

export type SourceTool = 'Edit' | 'Write' | 'Bash' | 'Task';

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

export interface GlobalProfile {
  id: string;
  key: 'preference' | 'pattern' | 'fact';
  content: string;
  createdAt: string;
}

export interface SearchResult {
  memory: Memory;
  score: number;
  source: 'fts' | 'vector' | 'hybrid';
}

export interface RetrievalOptions {
  projectId?: string;
  limit?: number;
  recentDays?: number;
  includeGlobal?: boolean;
}
