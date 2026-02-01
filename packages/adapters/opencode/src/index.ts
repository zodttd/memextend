// packages/adapters/opencode/src/index.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

/**
 * OpenCode Adapter for memextend
 *
 * This adapter provides memextend integration for OpenCode (https://github.com/anomalyco/opencode)
 * via MCP (Model Context Protocol) server.
 *
 * OpenCode is an open-source AI coding agent by Anomaly that supports:
 * - Multiple AI providers (Anthropic, OpenAI, Google, local models)
 * - Built-in agents (build, plan, general)
 * - MCP server integration for custom tools
 * - LSP support for code intelligence
 * - TUI interface
 *
 * Integration approach:
 * - MCP server provides mid-session memory tools (search, save, forget, status, context)
 * - Users configure memextend in their opencode.json config
 * - No native hook system, so session capture requires manual saves or external triggers
 *
 * Configuration location:
 * - ~/.config/opencode/opencode.json (global)
 * - ./opencode.json (project-local)
 *
 * OpenCode documentation: https://opencode.ai/docs
 * GitHub: https://github.com/anomalyco/opencode
 */

export const ADAPTER_NAME = 'opencode';
export const ADAPTER_VERSION = '0.1.5';
export const ADAPTER_STATUS = 'implemented';

// Export MCP server utilities
export * from './mcp/index.js';

// Export configuration utilities
export * from './config/index.js';
