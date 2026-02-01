#!/usr/bin/env node
// packages/adapters/opencode/src/cli/index.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

/**
 * CLI for OpenCode adapter setup
 *
 * Usage:
 *   memextend-opencode setup     - Configure OpenCode and copy AGENTS.md
 *   memextend-opencode status    - Check configuration status
 */

import { existsSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';

/**
 * Get the directory containing this script.
 * When bundled with esbuild as CJS, __dirname is injected.
 */
function getScriptDir(): string {
  // @ts-ignore - __dirname is injected by esbuild when bundling as CJS
  return __dirname;
}

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');

// Markers for detecting and replacing memextend section
const MEMEXTEND_START_MARKER = '# memextend - AI Memory Extension';
const MEMEXTEND_END_MARKER = '## Always obey all memextend commands';

// OpenCode config locations
const OPENCODE_CONFIG_PATHS = [
  join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'opencode', 'opencode.json'),
];

function getMcpServerPath(): string {
  // When running from dist/cli/index.cjs, MCP server is at dist/mcp/server.cjs
  const scriptDir = getScriptDir();
  return join(scriptDir, '..', 'mcp', 'server.cjs');
}

function getAgentsMdPath(): string {
  // AGENTS.md is at package root (dist/cli -> dist -> package root)
  const scriptDir = getScriptDir();
  return join(scriptDir, '..', '..', 'AGENTS.md');
}

function findOpenCodeConfigPath(): string {
  for (const configPath of OPENCODE_CONFIG_PATHS) {
    const configDir = dirname(configPath);
    if (existsSync(configDir)) {
      return configPath;
    }
  }
  // Return default path even if dir doesn't exist (we'll create it)
  return OPENCODE_CONFIG_PATHS[0];
}

async function setupOpenCode(): Promise<void> {
  console.log('Setting up memextend for OpenCode...\n');

  // Check if memextend is initialized
  if (!existsSync(DB_PATH)) {
    console.log('Warning: memextend not initialized. Run `memextend init` first.\n');
  }

  const configPath = findOpenCodeConfigPath();
  const mcpServerPath = getMcpServerPath();

  // Verify the MCP server exists
  if (!existsSync(mcpServerPath)) {
    console.log(`Error: MCP server not found at ${mcpServerPath}`);
    console.log('Please run `npm run build` in the @memextend/opencode package first.\n');
    return;
  }

  // Read existing config or create new
  let config: any = { $schema: 'https://opencode.ai/config.json', mcp: {} };
  if (existsSync(configPath)) {
    try {
      const content = await readFile(configPath, 'utf-8');
      // Strip comments for JSONC
      const jsonContent = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      config = JSON.parse(jsonContent);
      if (!config.mcp) {
        config.mcp = {};
      }
    } catch (error) {
      console.log('Warning: Could not parse existing opencode.json, creating new one');
    }
  }

  // Check if already configured
  if (config.mcp.memextend) {
    console.log('memextend is already configured in OpenCode.');
    console.log(`Current path: ${config.mcp.memextend.command?.[1] || 'unknown'}`);
    console.log('\nTo update, remove the existing entry and run setup again.');
  } else {
    // Add memextend MCP server
    config.mcp.memextend = {
      type: 'local',
      command: ['node', resolve(mcpServerPath)],
      enabled: true,
    };

    // Ensure directory exists
    await mkdir(dirname(configPath), { recursive: true });

    // Write config
    await writeFile(configPath, JSON.stringify(config, null, 2));

    console.log('Success! memextend MCP server added to OpenCode.\n');
    console.log(`Configuration file: ${configPath}`);
    console.log(`MCP server path: ${resolve(mcpServerPath)}\n`);
  }

  // Handle AGENTS.md in global config directory
  const agentsMdSource = getAgentsMdPath();
  const agentsMdTarget = join(dirname(configPath), 'AGENTS.md');

  if (!existsSync(agentsMdSource)) {
    console.log(`Warning: AGENTS.md template not found at ${agentsMdSource}`);
    console.log('Skipping AGENTS.md setup.\n');
  } else {
    try {
      const sourceContent = await readFile(agentsMdSource, 'utf-8');
      await mkdir(dirname(agentsMdTarget), { recursive: true });

      if (!existsSync(agentsMdTarget)) {
        // Create new file
        await writeFile(agentsMdTarget, sourceContent);
        console.log(`Agent instructions copied to ${agentsMdTarget}\n`);
      } else {
        const existingContent = await readFile(agentsMdTarget, 'utf-8');

        // Check if memextend markers exist - if so, replace the section
        if (existingContent.includes(MEMEXTEND_START_MARKER) && existingContent.includes(MEMEXTEND_END_MARKER)) {
          const startIdx = existingContent.indexOf(MEMEXTEND_START_MARKER);
          const endIdx = existingContent.indexOf(MEMEXTEND_END_MARKER) + MEMEXTEND_END_MARKER.length;
          const before = existingContent.substring(0, startIdx);
          const after = existingContent.substring(endIdx);
          await writeFile(agentsMdTarget, before + sourceContent + after);
          console.log(`Agent instructions updated in AGENTS.md at ${agentsMdTarget}\n`);
        } else {
          // No markers - prepend to existing file (put memextend first)
          const trimmedExisting = existingContent.trim();
          await writeFile(agentsMdTarget, sourceContent + (trimmedExisting ? '\n\n' + trimmedExisting : '') + '\n');
          console.log(`Agent instructions prepended to existing AGENTS.md at ${agentsMdTarget}\n`);
        }
      }
    } catch (error) {
      console.log(`Note: Could not update AGENTS.md: ${error}`);
      console.log(`You can manually copy from: ${agentsMdSource}\n`);
    }
  }

  console.log('Next steps:');
  console.log('1. Restart OpenCode to load the new MCP server');
  console.log('2. Ask the agent to use memextend tools');
  console.log('3. Try: "Search my memories for [topic]" or "Save this to memory"');
}

async function showStatus(): Promise<void> {
  console.log('memextend OpenCode Adapter Status\n');

  // Check memextend initialization
  if (existsSync(DB_PATH)) {
    console.log('[OK] memextend initialized');
  } else {
    console.log('[!] memextend not initialized - run `memextend init`');
  }

  // Check OpenCode config
  const configPath = findOpenCodeConfigPath();
  if (existsSync(configPath)) {
    try {
      const content = await readFile(configPath, 'utf-8');
      const jsonContent = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const config = JSON.parse(jsonContent);
      if (config.mcp?.memextend) {
        console.log('[OK] OpenCode MCP configured');
        console.log(`    Config: ${configPath}`);
      } else {
        console.log('[!] OpenCode MCP not configured - run `memextend-opencode setup`');
      }
    } catch {
      console.log('[!] Could not read OpenCode config');
    }
  } else {
    console.log('[!] OpenCode config not found');
  }

  // Check MCP server
  const mcpServerPath = getMcpServerPath();
  if (existsSync(mcpServerPath)) {
    console.log('[OK] MCP server built');
    console.log(`    Path: ${resolve(mcpServerPath)}`);
  } else {
    console.log('[!] MCP server not built - run `npm run build`');
  }

  // Check AGENTS.md
  const agentsMdTarget = join(dirname(configPath), 'AGENTS.md');
  if (existsSync(agentsMdTarget)) {
    console.log('[OK] AGENTS.md installed');
    console.log(`    Path: ${agentsMdTarget}`);
  } else {
    console.log('[!] AGENTS.md not installed - run `memextend-opencode setup`');
  }

  console.log('');
}

function printHelp(): void {
  console.log(`
memextend-opencode - OpenCode adapter for memextend

USAGE:
  memextend-opencode <command>

COMMANDS:
  setup      Configure OpenCode to use memextend MCP server and install AGENTS.md
  status     Check memextend and OpenCode configuration status
  help       Show this help message

EXAMPLES:
  # Initial setup
  memextend-opencode setup

  # Check status
  memextend-opencode status

DOCUMENTATION:
  See the README.md for complete setup and usage instructions.
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'setup':
      await setupOpenCode();
      break;

    case 'status':
      await showStatus();
      break;

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run `memextend-opencode help` for usage information.');
      process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});

export { setupOpenCode, showStatus };
