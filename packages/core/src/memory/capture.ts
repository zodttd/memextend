// packages/core/src/memory/capture.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import type { SourceTool } from './types.js';

export interface ToolCapture {
  tool: SourceTool;
  input: Record<string, unknown>;
  output: string;
}

export interface TextCapture {
  type: 'reasoning';
  content: string;
}

export type Capture = ToolCapture | TextCapture;

// Claude Code transcript entry format
export interface TranscriptEntry {
  type: string;
  message?: {
    role?: string;
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      id?: string;
      input?: Record<string, unknown>;
      tool_use_id?: string;
      content?: string | Array<{ type: string; text?: string }>;
    }> | string;
  };
}

// Minimum length for text to be considered worth capturing
const MIN_TEXT_LENGTH = 100;

// Default max lengths
const DEFAULT_MAX_REASONING_LENGTH = 10000;
const DEFAULT_MAX_TOOL_OUTPUT_LENGTH = 2000;

// All available tools that can be configured
export const CONFIGURABLE_TOOLS = ['Edit', 'Write', 'Bash', 'Task'] as const;
export type ConfigurableTool = typeof CONFIGURABLE_TOOLS[number];

// Tool capture config - each tool can be individually enabled/disabled
export interface ToolCaptureConfig {
  Edit?: boolean;
  Write?: boolean;
  Bash?: boolean;
  Task?: boolean;
}

// Default: all tools disabled
const DEFAULT_TOOL_CONFIG: ToolCaptureConfig = {
  Edit: false,
  Write: false,
  Bash: false,
  Task: false
};

export interface TranscriptParserOptions {
  /** @deprecated Use toolConfig instead */
  captureTools?: Set<string>;
  /** @deprecated Use toolConfig instead */
  skipTools?: Set<string>;
  /** Individual tool enable/disable config */
  toolConfig?: ToolCaptureConfig;
  /** @deprecated Use maxReasoningLength and maxToolOutputLength instead */
  maxContentLength?: number;
  /** Max length for reasoning text captures (default: 10000) */
  maxReasoningLength?: number;
  /** Max length for tool output captures (default: 2000) */
  maxToolOutputLength?: number;
  captureReasoning?: boolean;
}

export class TranscriptParser {
  private toolConfig: ToolCaptureConfig;
  private maxReasoningLength: number;
  private maxToolOutputLength: number;
  private captureReasoning: boolean;

  constructor(options: TranscriptParserOptions = {}) {
    // Support legacy captureTools/skipTools or new toolConfig
    if (options.toolConfig) {
      this.toolConfig = { ...DEFAULT_TOOL_CONFIG, ...options.toolConfig };
    } else if (options.captureTools) {
      // Legacy support: convert Set to toolConfig
      this.toolConfig = { ...DEFAULT_TOOL_CONFIG };
      for (const tool of CONFIGURABLE_TOOLS) {
        this.toolConfig[tool] = options.captureTools.has(tool);
      }
    } else {
      this.toolConfig = { ...DEFAULT_TOOL_CONFIG };
    }

    // Support legacy maxContentLength or new separate limits
    if (options.maxContentLength !== undefined) {
      // Legacy: use same limit for both
      this.maxReasoningLength = options.maxContentLength;
      this.maxToolOutputLength = options.maxContentLength;
    } else {
      this.maxReasoningLength = options.maxReasoningLength ?? DEFAULT_MAX_REASONING_LENGTH;
      this.maxToolOutputLength = options.maxToolOutputLength ?? DEFAULT_MAX_TOOL_OUTPUT_LENGTH;
    }

    this.captureReasoning = options.captureReasoning ?? true;
  }

  /**
   * Parse a Claude Code JSONL transcript and extract captures
   *
   * Captures two types of content:
   * 1. Claude's text responses (reasoning, explanations, decisions)
   * 2. Tool calls for code changes (Edit, Write)
   *
   * Claude Code transcript format:
   * - type: "assistant" with message.content containing text and tool_use objects
   * - type: "user" with message.content containing tool_result objects
   */
  parse(transcript: string): Capture[] {
    const lines = transcript.trim().split('\n');
    const captures: Capture[] = [];

    // Map of tool_use_id -> { tool, input }
    const pendingToolUses = new Map<string, { tool: string; input: Record<string, unknown> }>();

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line) as TranscriptEntry;

        // Skip non-message entries
        if (!entry.message?.content || typeof entry.message.content === 'string') {
          continue;
        }

        const contentArray = entry.message.content;

        // Process assistant messages for text and tool_use
        if (entry.type === 'assistant') {
          // Capture Claude's text reasoning
          if (this.captureReasoning) {
            for (const block of contentArray) {
              if (block.type === 'text' && block.text) {
                const text = block.text.trim();
                // Only capture substantial text (not just "Let me..." fragments)
                if (text.length >= MIN_TEXT_LENGTH && this.isSubstantialContent(text)) {
                  captures.push({
                    type: 'reasoning',
                    content: this.truncate(text, this.maxReasoningLength)
                  });
                }
              }
            }
          }

          // Capture tool_use for code changes
          for (const block of contentArray) {
            if (block.type === 'tool_use' && block.name && block.id && block.input) {
              if (this.shouldCapture(block.name)) {
                pendingToolUses.set(block.id, {
                  tool: block.name,
                  input: block.input
                });
              }
            }
          }
        }

        // Process user messages for tool_result
        if (entry.type === 'user') {
          for (const block of contentArray) {
            if (block.type === 'tool_result' && block.tool_use_id) {
              const pending = pendingToolUses.get(block.tool_use_id);
              if (pending) {
                // Extract output text from content
                let output = '';
                if (typeof block.content === 'string') {
                  output = block.content;
                } else if (Array.isArray(block.content)) {
                  output = block.content
                    .filter(c => c.type === 'text' && c.text)
                    .map(c => c.text)
                    .join('\n');
                }

                captures.push({
                  tool: pending.tool as SourceTool,
                  input: pending.input,
                  output: this.truncate(output, this.maxToolOutputLength)
                });

                pendingToolUses.delete(block.tool_use_id);
              }
            }
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    return captures;
  }

  /**
   * Check if text content is substantial (not just filler/transitional)
   */
  private isSubstantialContent(text: string): boolean {
    // Skip common transitional/filler phrases that aren't valuable to remember
    const skipPatterns = [
      /^(let me|i'll|i will|now i|looking at|checking|searching)/i,
      /^(here's|here is) (the|what|how)/i,
      /^(done|completed|finished|success)/i,
      /^(ok|okay|sure|yes|no|alright)/i,
    ];

    for (const pattern of skipPatterns) {
      if (pattern.test(text.slice(0, 50))) {
        // But if the text is long enough, it might still be valuable
        if (text.length < 200) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Legacy method for backward compatibility - returns only tool captures
   */
  parseToolCaptures(transcript: string): ToolCapture[] {
    return this.parse(transcript).filter(
      (c): c is ToolCapture => 'tool' in c
    );
  }

  private shouldCapture(tool: string): boolean {
    // Check if tool is in our configurable list and enabled
    if (CONFIGURABLE_TOOLS.includes(tool as ConfigurableTool)) {
      return this.toolConfig[tool as ConfigurableTool] === true;
    }
    return false;
  }

  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + '...';
  }
}

/**
 * Type guard to check if a capture is a TextCapture
 */
export function isTextCapture(capture: Capture): capture is TextCapture {
  return 'type' in capture && capture.type === 'reasoning';
}

/**
 * Type guard to check if a capture is a ToolCapture
 */
export function isToolCapture(capture: Capture): capture is ToolCapture {
  return 'tool' in capture;
}

/**
 * Format a capture into a human-readable memory content string
 */
export function formatCaptureContent(capture: Capture): string {
  if (isTextCapture(capture)) {
    return capture.content;
  }

  return formatToolMemoryContent(capture.tool, capture.input, capture.output);
}

/**
 * Format a tool capture into a human-readable memory content string
 */
export function formatToolMemoryContent(
  tool: SourceTool,
  input: Record<string, unknown>,
  output: string
): string {
  const maxOutputLen = 200;

  switch (tool) {
    case 'Edit': {
      const filePath = input.file_path as string || 'unknown file';
      const oldStr = input.old_string as string || '';
      const newStr = input.new_string as string || '';

      let description = '';
      if (!oldStr && newStr) {
        description = 'Added new content';
      } else if (oldStr && !newStr) {
        description = 'Removed content';
      } else {
        description = 'Modified content';
      }

      return `[Edit] ${filePath}\n${description}. ${truncate(output, maxOutputLen)}`;
    }

    case 'Write': {
      const filePath = input.file_path as string || 'unknown file';
      const content = input.content as string || '';
      const preview = content.slice(0, 100);
      return `[Write] ${filePath}\nCreated new file. Preview: ${truncate(preview, maxOutputLen)}`;
    }

    case 'Bash': {
      const command = input.command as string || 'unknown command';
      return `[Bash] ${truncate(command, 100)}\nOutput: ${truncate(output, maxOutputLen)}`;
    }

    case 'Task': {
      const description = input.description as string || 'Agent task';
      const prompt = input.prompt as string || '';
      return `[Task] ${description}\n${truncate(prompt, 100)}\nResult: ${truncate(output, 300)}`;
    }

    default:
      return `[${tool}] ${truncate(output, maxOutputLen)}`;
  }
}

/**
 * @deprecated Use formatCaptureContent instead
 */
export const formatMemoryContent = formatToolMemoryContent;

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
