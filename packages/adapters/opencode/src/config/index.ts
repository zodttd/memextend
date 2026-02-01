// packages/adapters/opencode/src/config/index.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { existsSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';

/**
 * OpenCode configuration locations (in priority order):
 * 1. ./opencode.json or ./opencode.jsonc (local project)
 * 2. $XDG_CONFIG_HOME/opencode/opencode.json
 * 3. ~/.config/opencode/opencode.json
 *
 * OpenCode by anomalyco supports JSONC (JSON with comments).
 * Config reference: https://opencode.ai/docs
 */

export interface OpenCodeConfig {
  $schema?: string;
  theme?: string;
  model?: string;
  small_model?: string;
  provider?: Record<string, ProviderConfig>;
  mcp?: Record<string, MCPConfig | { enabled: boolean }>;
  agent?: Record<string, AgentConfig>;
  permission?: Record<string, string>;
  plugin?: string[];
  instructions?: string[];
  [key: string]: unknown;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  [key: string]: unknown;
}

export interface MCPConfig {
  type: 'local' | 'remote';
  command?: string[];
  url?: string;
  environment?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface AgentConfig {
  model?: string;
  temperature?: number;
  prompt?: string;
  description?: string;
  mode?: 'primary' | 'subagent' | 'all';
  [key: string]: unknown;
}

export interface OpenCodePaths {
  configHome: string;
  dataDir: string;
  configPath: string;
  localConfigPath: string;
}

/**
 * Get OpenCode's data and config paths
 */
export function getOpenCodePaths(): OpenCodePaths {
  const home = homedir();
  const xdgConfig = process.env.XDG_CONFIG_HOME || join(home, '.config');
  const xdgData = process.env.XDG_DATA_HOME || join(home, '.local', 'share');

  // OpenCode stores config in XDG_CONFIG_HOME/opencode or ~/.config/opencode
  const configHome = join(xdgConfig, 'opencode');

  // OpenCode stores data in XDG_DATA_HOME/opencode
  const dataDir = join(xdgData, 'opencode');

  return {
    configHome,
    dataDir,
    configPath: join(configHome, 'opencode.json'),
    localConfigPath: join(process.cwd(), 'opencode.json'),
  };
}

/**
 * Load OpenCode configuration from disk
 * Checks local config first, then global config
 */
export async function loadOpenCodeConfig(configPath?: string): Promise<OpenCodeConfig> {
  const paths = getOpenCodePaths();

  // Priority order for config loading
  const configPaths = configPath
    ? [configPath]
    : [
        join(process.cwd(), 'opencode.jsonc'),
        join(process.cwd(), 'opencode.json'),
        join(paths.configHome, 'opencode.jsonc'),
        join(paths.configHome, 'opencode.json'),
      ];

  for (const file of configPaths) {
    try {
      if (existsSync(file)) {
        const content = await readFile(file, 'utf-8');
        // Strip comments for JSONC files (simple approach)
        const jsonContent = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        return JSON.parse(jsonContent);
      }
    } catch (error) {
      console.error(`[memextend] Failed to load OpenCode config from ${file}:`, error);
    }
  }

  return {};
}

/**
 * Check if memextend MCP server is configured in OpenCode
 */
export function isMemextendConfigured(config: OpenCodeConfig): boolean {
  if (!config.mcp) return false;
  return Object.keys(config.mcp).some(
    name => name === 'memextend' || name.includes('memextend')
  );
}

/**
 * Generate MCP server configuration for memextend (local/stdio type)
 *
 * For anomalyco/opencode, the MCP config uses:
 * - type: "local" for stdio-based servers
 * - command: array of command and arguments
 */
export function getMemextendMCPConfig(mcpServerPath: string): MCPConfig {
  return {
    type: 'local',
    command: ['node', mcpServerPath],
    environment: {},
    enabled: true,
  };
}

/**
 * Add memextend MCP server to OpenCode configuration
 */
export function addMemextendToConfig(
  config: OpenCodeConfig,
  mcpServerPath: string
): OpenCodeConfig {
  const updated = { ...config };
  updated.mcp = updated.mcp || {};
  updated.mcp.memextend = getMemextendMCPConfig(mcpServerPath);

  // Add schema if not present
  if (!updated.$schema) {
    updated.$schema = 'https://opencode.ai/config.json';
  }

  return updated;
}

/**
 * Remove memextend MCP server from OpenCode configuration
 */
export function removeMemextendFromConfig(config: OpenCodeConfig): OpenCodeConfig {
  const updated = { ...config };
  if (updated.mcp) {
    delete updated.mcp.memextend;
  }
  return updated;
}

/**
 * Save OpenCode configuration to disk
 */
export async function saveOpenCodeConfig(
  config: OpenCodeConfig,
  configPath?: string
): Promise<void> {
  const paths = getOpenCodePaths();
  const targetPath = configPath || paths.configPath;

  // Ensure directory exists
  const dir = dirname(targetPath);
  await mkdir(dir, { recursive: true });

  await writeFile(targetPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Get memextend configuration paths
 */
export function getMemextendPaths() {
  const memextendDir = join(homedir(), '.memextend');
  return {
    dir: memextendDir,
    configPath: join(memextendDir, 'config.json'),
    dbPath: join(memextendDir, 'memextend.db'),
    vectorsPath: join(memextendDir, 'vectors'),
    modelsPath: join(memextendDir, 'models'),
  };
}

export interface MemextendConfig {
  capture?: {
    tools?: string[];
    skipTools?: string[];
    maxContentLength?: number;
  };
  retrieval?: {
    autoInject?: boolean;
    maxMemories?: number;
    recentDays?: number;
    includeGlobal?: boolean;
  };
}

/**
 * Load memextend configuration
 */
export async function loadMemextendConfig(): Promise<MemextendConfig> {
  const paths = getMemextendPaths();

  try {
    if (existsSync(paths.configPath)) {
      const content = await readFile(paths.configPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`[memextend] Failed to load config: ${error}`);
  }

  return {};
}

/**
 * Generate the configuration snippet to add memextend to OpenCode
 * Returns the JSON that users can manually add to their opencode.json
 */
export function generateConfigSnippet(mcpServerPath: string): string {
  const config = {
    mcp: {
      memextend: getMemextendMCPConfig(mcpServerPath),
    },
  };
  return JSON.stringify(config, null, 2);
}
