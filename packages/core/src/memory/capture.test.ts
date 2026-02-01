// packages/core/src/memory/capture.test.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { describe, it, expect } from 'vitest';
import { TranscriptParser, formatMemoryContent, isToolCapture, isTextCapture } from './capture.js';

// Claude Code JSONL transcript format
const sampleTranscript = `{"type":"assistant","message":{"content":[{"type":"text","text":"I'll help you add Redis caching. This is a substantial response with enough content to be captured as reasoning since we need at least 100 characters to make the cut."},{"type":"tool_use","id":"edit1","name":"Edit","input":{"file_path":"/src/cache.ts","old_string":"","new_string":"import Redis from 'ioredis';"}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"edit1","content":"File edited successfully"}]}}
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"read1","name":"Read","input":{"file_path":"/src/config.ts"}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"read1","content":"export const config = {}"}]}}
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"write1","name":"Write","input":{"file_path":"/src/redis.ts","content":"// Redis client\\nexport const redis = new Redis();"}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"write1","content":"File created successfully"}]}}`;

describe('TranscriptParser', () => {
  it('should capture only reasoning by default (no tool capture)', () => {
    const parser = new TranscriptParser();
    const captures = parser.parse(sampleTranscript);

    // Default: only reasoning, no tools
    const textCaptures = captures.filter(isTextCapture);
    const toolCaptures = captures.filter(isToolCapture);

    expect(textCaptures.length).toBeGreaterThan(0);
    expect(toolCaptures.length).toBe(0);
  });

  it('should capture tool calls when explicitly enabled', () => {
    const parser = new TranscriptParser({
      toolConfig: { Edit: true, Write: true },
      captureReasoning: false
    });
    const captures = parser.parseToolCaptures(sampleTranscript);

    // Should capture Edit and Write when enabled
    expect(captures.length).toBe(2);
    expect(captures[0].tool).toBe('Edit');
    expect(captures[1].tool).toBe('Write');
  });

  it('should allow enabling individual tools', () => {
    const parser = new TranscriptParser({
      toolConfig: { Edit: true, Write: false },
      captureReasoning: false
    });
    const captures = parser.parseToolCaptures(sampleTranscript);

    // Should only capture Edit, not Write
    expect(captures.length).toBe(1);
    expect(captures[0].tool).toBe('Edit');
  });

  it('should capture reasoning text from assistant messages', () => {
    const parser = new TranscriptParser({ captureReasoning: true });
    const captures = parser.parse(sampleTranscript);

    const textCaptures = captures.filter(isTextCapture);
    expect(textCaptures.length).toBeGreaterThan(0);
    expect(textCaptures[0].content).toContain('Redis caching');
  });

  it('should skip filtered tools', () => {
    const parser = new TranscriptParser({ captureReasoning: false });
    const captures = parser.parseToolCaptures(sampleTranscript);

    const readCapture = captures.find(c => (c.tool as string) === 'Read');
    expect(readCapture).toBeUndefined();
  });

  it('should preserve tool input and output', () => {
    const parser = new TranscriptParser({ captureReasoning: false });
    const captures = parser.parseToolCaptures(sampleTranscript);

    const editCapture = captures[0];
    expect(editCapture.input.file_path).toBe('/src/cache.ts');
    expect(editCapture.output).toBe('File edited successfully');
  });

  it('should support legacy captureTools option', () => {
    const parser = new TranscriptParser({
      captureTools: new Set(['Edit', 'Write']),
      captureReasoning: false
    });
    const captures = parser.parseToolCaptures(sampleTranscript);

    expect(captures.length).toBe(2);
    expect(captures[0].tool).toBe('Edit');
    expect(captures[1].tool).toBe('Write');
  });

  it('should handle malformed lines gracefully', () => {
    const transcript = `{"type":"user","message":"test"}
not valid json
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"e1","name":"Edit","input":{"file_path":"test.ts"}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"e1","content":"success"}]}}`;

    const parser = new TranscriptParser({ captureReasoning: false });
    const captures = parser.parseToolCaptures(transcript);

    expect(captures.length).toBe(1);
    expect(captures[0].tool).toBe('Edit');
  });

  it('should truncate long tool output', () => {
    const longOutput = 'x'.repeat(3000);
    const transcript = `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"b1","name":"Write","input":{"file_path":"test.txt","content":"test"}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"b1","content":"${longOutput}"}]}}`;

    const parser = new TranscriptParser({
      toolConfig: { Write: true },
      maxToolOutputLength: 100,
      captureReasoning: false
    });
    const captures = parser.parseToolCaptures(transcript);

    expect(captures[0].output.length).toBeLessThanOrEqual(100);
    expect(captures[0].output.endsWith('...')).toBe(true);
  });

  it('should have separate limits for reasoning vs tool output', () => {
    const longText = 'This is a substantial reasoning response. '.repeat(50); // ~2100 chars
    const transcript = `{"type":"assistant","message":{"content":[{"type":"text","text":"${longText}"}]}}`;

    // With default limits (10000 reasoning, 2000 tool)
    const parser = new TranscriptParser({ captureReasoning: true });
    const captures = parser.parse(transcript);

    const textCaptures = captures.filter(isTextCapture);
    expect(textCaptures.length).toBe(1);
    // Should not be truncated at 2000
    expect(textCaptures[0].content.length).toBeGreaterThan(2000);
  });
});

describe('formatMemoryContent', () => {
  it('should format Edit capture for new content', () => {
    const content = formatMemoryContent('Edit', {
      file_path: '/src/cache.ts',
      old_string: '',
      new_string: "import Redis from 'ioredis';"
    }, 'File edited successfully');

    expect(content).toContain('[Edit]');
    expect(content).toContain('/src/cache.ts');
    expect(content).toContain('Added new content');
  });

  it('should format Edit capture for removed content', () => {
    const content = formatMemoryContent('Edit', {
      file_path: '/src/cache.ts',
      old_string: 'old code',
      new_string: ''
    }, 'File edited successfully');

    expect(content).toContain('Removed content');
  });

  it('should format Edit capture for modified content', () => {
    const content = formatMemoryContent('Edit', {
      file_path: '/src/cache.ts',
      old_string: 'old code',
      new_string: 'new code'
    }, 'File edited successfully');

    expect(content).toContain('Modified content');
  });

  it('should format Bash capture', () => {
    const content = formatMemoryContent('Bash', {
      command: 'npm install ioredis'
    }, 'added 1 package');

    expect(content).toContain('[Bash]');
    expect(content).toContain('npm install ioredis');
    expect(content).toContain('added 1 package');
  });

  it('should format Write capture', () => {
    const content = formatMemoryContent('Write', {
      file_path: '/src/redis.ts',
      content: '// Redis client\nexport const redis = new Redis();'
    }, 'File created successfully');

    expect(content).toContain('[Write]');
    expect(content).toContain('/src/redis.ts');
    expect(content).toContain('Created new file');
  });

  it('should format Task capture', () => {
    const content = formatMemoryContent('Task', {
      description: 'Deploy to staging',
      prompt: 'Deploy the application to staging environment'
    }, 'Deployment completed successfully');

    expect(content).toContain('[Task]');
    expect(content).toContain('Deploy to staging');
    expect(content).toContain('completed successfully');
  });
});
