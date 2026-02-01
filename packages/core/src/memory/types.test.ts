// packages/core/src/memory/types.test.ts
import { describe, it, expect } from 'vitest';
import type { Memory, MemoryType, SourceTool } from './types.js';

describe('Memory types', () => {
  it('should allow valid Memory object', () => {
    const memory: Memory = {
      id: '123',
      projectId: 'proj-1',
      content: 'Test memory',
      type: 'tool_capture',
      sourceTool: 'Edit',
      createdAt: new Date().toISOString(),
      sessionId: 'sess-1',
      metadata: { file: 'test.ts' }
    };
    expect(memory.id).toBe('123');
  });

  it('should allow null projectId for global memories', () => {
    const memory: Memory = {
      id: '456',
      projectId: null,
      content: 'Global preference',
      type: 'manual',
      sourceTool: null,
      createdAt: new Date().toISOString(),
      sessionId: null,
      metadata: null
    };
    expect(memory.projectId).toBeNull();
  });
});
