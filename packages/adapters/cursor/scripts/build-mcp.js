// Build script for bundling MCP server with esbuild
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { build } from 'esbuild';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir } from 'fs/promises';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '..', 'src');
const distDir = join(__dirname, '..', 'dist');

// Read version from root package.json
const rootPkg = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', 'package.json'), 'utf-8'));
const version = rootPkg.version;

const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  // External native modules that can't be bundled
  external: ['better-sqlite3', 'node-llama-cpp', 'sqlite-vec'],
  logLevel: 'warning',
  define: {
    'MEMEXTEND_VERSION': JSON.stringify(version),
  },
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
