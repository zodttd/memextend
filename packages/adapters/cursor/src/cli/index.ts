// packages/adapters/cursor/src/cli/index.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

/**
 * Main CLI entry point for Cursor adapter
 *
 * Provides a unified interface for memextend-cursor operations.
 *
 * Usage:
 *   memextend-cursor <command> [options]
 *
 * Commands:
 *   capture    - Capture session content to memory
 *   inject     - Retrieve context for session start
 *   setup      - Configure Cursor for memextend
 *   status     - Check memextend status
 */

import { existsSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');

// Cursor MCP config locations
const CURSOR_CONFIG_PATHS = [
  join(homedir(), '.cursor', 'mcp.json'),
  join(homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'mcp.json'), // macOS
  join(homedir(), '.config', 'Cursor', 'User', 'mcp.json'), // Linux
  join(homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'mcp.json'), // Windows
];

/**
 * Get the directory containing this script.
 * When bundled with esbuild as CJS, __dirname is injected.
 */
function getScriptDir(): string {
  // @ts-ignore - __dirname is injected by esbuild when bundling as CJS
  return __dirname;
}

function getMcpServerPath(): string {
  // Get the path to the built MCP server
  const scriptDir = getScriptDir();
  return join(scriptDir, '..', 'mcp', 'server.cjs');
}

function findCursorConfigPath(): string | null {
  for (const configPath of CURSOR_CONFIG_PATHS) {
    const configDir = dirname(configPath);
    if (existsSync(configDir)) {
      return configPath;
    }
  }
  return null;
}

async function setupCursor(): Promise<void> {
  console.log('Setting up memextend for Cursor...\n');

  // Check if memextend is initialized
  if (!existsSync(DB_PATH)) {
    console.log('Warning: memextend not initialized. Run `memextend init` first.\n');
  }

  const configPath = findCursorConfigPath();
  if (!configPath) {
    console.log('Could not find Cursor configuration directory.');
    console.log('Please ensure Cursor is installed and has been run at least once.\n');
    console.log('Manual setup instructions:');
    printManualSetupInstructions();
    return;
  }

  const mcpServerPath = getMcpServerPath();

  // Verify the MCP server exists
  if (!existsSync(mcpServerPath)) {
    console.log(`Error: MCP server not found at ${mcpServerPath}`);
    console.log('Please run `npm run build` in the @memextend/cursor package first.\n');
    return;
  }

  // Read existing config or create new
  let config: any = { mcpServers: {} };
  if (existsSync(configPath)) {
    try {
      const content = await readFile(configPath, 'utf-8');
      config = JSON.parse(content);
      if (!config.mcpServers) {
        config.mcpServers = {};
      }
    } catch (error) {
      console.log('Warning: Could not parse existing mcp.json, creating new one');
    }
  }

  // Check if already configured
  if (config.mcpServers.memextend) {
    console.log('memextend is already configured in Cursor.');
    console.log(`Current path: ${config.mcpServers.memextend.args?.[0] || 'unknown'}`);
    console.log('\nTo update, remove the existing entry and run setup again.');
    return;
  }

  // Add memextend MCP server
  config.mcpServers.memextend = {
    command: 'node',
    args: [resolve(mcpServerPath)],
  };

  // Ensure directory exists
  await mkdir(dirname(configPath), { recursive: true });

  // Write config
  await writeFile(configPath, JSON.stringify(config, null, 2));

  console.log('Success! memextend MCP server added to Cursor.\n');
  console.log(`Configuration file: ${configPath}`);
  console.log(`MCP server path: ${resolve(mcpServerPath)}\n`);
  console.log('Next steps:');
  console.log('1. Restart Cursor to load the new MCP server');
  console.log('2. In Cursor, ask Claude to use memextend tools');
  console.log('3. Try: "Search my memories for [topic]" or "Save this to memory"');
}

function printManualSetupInstructions(): void {
  const mcpServerPath = getMcpServerPath();

  console.log(`
Create or edit ~/.cursor/mcp.json with the following content:

{
  "mcpServers": {
    "memextend": {
      "command": "node",
      "args": ["${resolve(mcpServerPath)}"]
    }
  }
}

Then restart Cursor to load the MCP server.
`);
}

async function showStatus(): Promise<void> {
  console.log('memextend Cursor Adapter Status\n');

  // Check memextend initialization
  if (existsSync(DB_PATH)) {
    console.log('[OK] memextend initialized');
  } else {
    console.log('[!] memextend not initialized - run `memextend init`');
  }

  // Check Cursor config
  const configPath = findCursorConfigPath();
  if (configPath && existsSync(configPath)) {
    try {
      const content = await readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      if (config.mcpServers?.memextend) {
        console.log('[OK] Cursor MCP configured');
        console.log(`    Config: ${configPath}`);
      } else {
        console.log('[!] Cursor MCP not configured - run `memextend-cursor setup`');
      }
    } catch {
      console.log('[!] Could not read Cursor config');
    }
  } else {
    console.log('[!] Cursor config not found');
  }

  // Check MCP server
  const mcpServerPath = getMcpServerPath();
  if (existsSync(mcpServerPath)) {
    console.log('[OK] MCP server built');
    console.log(`    Path: ${resolve(mcpServerPath)}`);
  } else {
    console.log('[!] MCP server not built - run `npm run build`');
  }

  console.log('');
}

function printHelp(): void {
  console.log(`
memextend-cursor - Cursor IDE adapter for memextend

USAGE:
  memextend-cursor <command> [options]

COMMANDS:
  setup      Configure Cursor to use memextend MCP server
  status     Check memextend and Cursor configuration status
  capture    Capture content to memory (alias for memextend-cursor-capture)
  inject     Get context for session (alias for memextend-cursor-inject)
  help       Show this help message

EXAMPLES:
  # Initial setup
  memextend-cursor setup

  # Check status
  memextend-cursor status

  # Capture a memory
  memextend-cursor capture -c "Implemented user auth with JWT"

  # Get session context
  memextend-cursor inject

For more details on capture and inject commands:
  memextend-cursor capture --help
  memextend-cursor inject --help

DOCUMENTATION:
  See the README.md for complete setup and usage instructions.
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'setup':
      await setupCursor();
      break;

    case 'status':
      await showStatus();
      break;

    case 'capture': {
      // Forward to capture script
      const scriptDir = getScriptDir();
      const captureScript = join(scriptDir, 'capture.cjs');
      const child = spawn('node', [captureScript, ...args.slice(1)], {
        stdio: 'inherit',
      });
      child.on('close', (code) => process.exit(code ?? 0));
      break;
    }

    case 'inject': {
      // Forward to inject script
      const scriptDir = getScriptDir();
      const injectScript = join(scriptDir, 'inject.cjs');
      const child = spawn('node', [injectScript, ...args.slice(1)], {
        stdio: 'inherit',
      });
      child.on('close', (code) => process.exit(code ?? 0));
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run `memextend-cursor help` for usage information.');
      process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});

export { setupCursor, showStatus };
