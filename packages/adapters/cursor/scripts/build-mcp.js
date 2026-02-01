// Build script for bundling MCP server with esbuild
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { build } from 'esbuild';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '..', 'src');
const distDir = join(__dirname, '..', 'dist');

const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  // External native modules that can't be bundled
  external: ['better-sqlite3', 'node-llama-cpp', '@lancedb/lancedb'],
  logLevel: 'warning',
};

async function buildMCP() {
  const mcpDir = join(distDir, 'mcp');
  await mkdir(mcpDir, { recursive: true });

  try {
    await build({
      ...commonOptions,
      entryPoints: [join(srcDir, 'mcp', 'server.ts')],
      outfile: join(mcpDir, 'server.cjs'),
    });
    console.log('Built mcp/server.cjs');
  } catch (e) {
    console.error('Failed to build MCP server:', e.message);
    process.exit(1);
  }
}

async function main() {
  console.log('Building memextend Cursor MCP server...\n');
  await buildMCP();
  console.log('\nMCP server build complete!');
}

main().catch(console.error);
