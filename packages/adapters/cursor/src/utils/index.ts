// packages/adapters/cursor/src/utils/index.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

/**
 * memextend directory paths
 */
export const MEMEXTEND_DIR = join(homedir(), '.memextend');
export const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');
export const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');
export const MODELS_PATH = join(MEMEXTEND_DIR, 'models');
export const CONFIG_PATH = join(MEMEXTEND_DIR, 'config.json');

/**
 * Cursor configuration file paths (platform-specific)
 */
export const CURSOR_CONFIG_PATHS = {
  mcp: [
    join(homedir(), '.cursor', 'mcp.json'),
    join(homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'mcp.json'), // macOS
    join(homedir(), '.config', 'Cursor', 'User', 'mcp.json'), // Linux
    join(homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'mcp.json'), // Windows
  ],
  settings: [
    join(homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'settings.json'), // macOS
    join(homedir(), '.config', 'Cursor', 'User', 'settings.json'), // Linux
    join(homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'settings.json'), // Windows
  ],
};

/**
 * Get a stable project ID from workspace path
 */
export function getProjectId(workspacePath: string): string {
  try {
    // Try to get git root for consistent project ID across different paths
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd: workspacePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return createHash('sha256').update(gitRoot).digest('hex').slice(0, 16);
  } catch {
    // Not a git repo, use the workspace path
    return createHash('sha256').update(workspacePath).digest('hex').slice(0, 16);
  }
}

/**
 * Check if memextend is initialized
 */
export function isMemextendInitialized(): boolean {
  return existsSync(DB_PATH);
}

/**
 * Find the first existing Cursor MCP config path
 */
export function findCursorMcpConfigPath(): string | null {
  for (const configPath of CURSOR_CONFIG_PATHS.mcp) {
    const configDir = dirname(configPath);
    if (existsSync(configDir)) {
      return configPath;
    }
  }
  return null;
}

/**
 * Load memextend configuration
 */
export async function loadConfig(): Promise<Record<string, any>> {
  try {
    if (existsSync(CONFIG_PATH)) {
      const content = await readFile(CONFIG_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // Ignore config errors
  }
  return {};
}

/**
 * Format a relative date string
 */
export function formatRelativeDate(isoDate: string): string {
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

/**
 * Truncate a string with ellipsis
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Generate MCP configuration for Cursor
 */
export function generateMcpConfig(serverPath: string): object {
  return {
    mcpServers: {
      memextend: {
        command: 'node',
        args: [serverPath],
      },
    },
  };
}
