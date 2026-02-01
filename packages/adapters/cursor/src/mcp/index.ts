// packages/adapters/cursor/src/mcp/index.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

/**
 * MCP server for Cursor integration
 *
 * The MCP server is a standalone script executed by Cursor.
 * It provides memory tools (search, save, recall) that Claude can use during sessions.
 *
 * Configuration: Add to ~/.cursor/mcp.json
 *
 * See README.md for setup instructions.
 */

export const MCP_SERVER_SCRIPT = 'server.cjs';
export const MCP_SERVER_NAME = 'memextend';
