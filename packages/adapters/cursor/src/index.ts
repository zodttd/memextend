// @memextend/cursor
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Cursor Adapter for memextend
 *
 * This adapter provides memextend integration for Cursor IDE through:
 * 1. MCP server - for mid-session memory operations (search, save)
 * 2. CLI tools - for session capture and context injection
 *
 * Unlike Claude Code which has native hooks, Cursor requires a different approach:
 * - MCP server provides tools that Claude/AI can use during sessions
 * - CLI tools allow manual or scripted session capture/injection
 *
 * See README.md for setup instructions.
 */

// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

export const ADAPTER_NAME = 'cursor';
export const ADAPTER_VERSION = pkg.version;
export const ADAPTER_STATUS = 'beta';

export * from './mcp/index.js';
export * from './cli/index.js';
export * from './utils/index.js';
