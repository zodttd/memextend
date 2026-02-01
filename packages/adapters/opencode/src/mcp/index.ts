// packages/adapters/opencode/src/mcp/index.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

// MCP server is a standalone script, not a library export
// It is executed directly by OpenCode via stdio transport

export const MCP_SERVER = 'server.cjs';

/**
 * Get the path to the MCP server script for use in OpenCode configuration.
 * This should be used when programmatically generating opencode.json config.
 */
export function getMCPServerPath(): string {
  // When installed as a package, the server will be in the dist/mcp directory
  const path = require('path');
  return path.join(__dirname, 'server.cjs');
}
