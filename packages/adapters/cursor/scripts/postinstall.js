#!/usr/bin/env node
// Post-install script for @memextend/cursor
// Copyright (c) 2026 ZodTTD LLC. MIT License.

/**
 * This script runs after npm install and provides helpful setup instructions.
 * It does NOT automatically modify Cursor configuration to respect user choice.
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');

// Check Cursor config paths
const CURSOR_CONFIG_PATHS = [
  join(homedir(), '.cursor', 'mcp.json'),
  join(homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'mcp.json'),
  join(homedir(), '.config', 'Cursor', 'User', 'mcp.json'),
  join(homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'mcp.json'),
];

function findCursorConfig() {
  for (const configPath of CURSOR_CONFIG_PATHS) {
    if (existsSync(dirname(configPath))) {
      return configPath;
    }
  }
  return null;
}

function main() {
  console.log('\n=== @memextend/cursor installed ===\n');

  // Check memextend initialization
  if (!existsSync(DB_PATH)) {
    console.log('Note: memextend is not initialized.');
    console.log('Run `memextend init` to set up the memory database.\n');
  }

  // Check Cursor config
  const configPath = findCursorConfig();
  if (configPath) {
    console.log('To configure Cursor, run:');
    console.log('  npx memextend-cursor setup\n');
  } else {
    console.log('Cursor configuration directory not found.');
    console.log('Please install and run Cursor at least once first.\n');
  }

  console.log('For manual setup and documentation, see:');
  console.log('  node_modules/@memextend/cursor/README.md\n');
}

main();
