// Build script for bundling hooks and MCP server with esbuild
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
  external: ['better-sqlite3', 'node-llama-cpp', '@lancedb/lancedb'],
  logLevel: 'warning',
};

async function buildHooks() {
  const hooksDir = join(distDir, 'hooks');
  await mkdir(hooksDir, { recursive: true });

  const hooks = ['session-start', 'stop', 'pre-compact'];

  for (const hook of hooks) {
    try {
      await build({
        ...commonOptions,
        entryPoints: [join(srcDir, 'hooks', `${hook}.ts`)],
        outfile: join(hooksDir, `${hook}.cjs`),
      });
      console.log(`✓ Built hooks/${hook}.cjs`);
    } catch (e) {
      console.log(`✗ Skipping ${hook} (error: ${e.message})`);
    }
  }
}

async function buildMCP() {
  const mcpDir = join(distDir, 'mcp');
  await mkdir(mcpDir, { recursive: true });

  try {
    await build({
      ...commonOptions,
      entryPoints: [join(srcDir, 'mcp', 'server.ts')],
      outfile: join(mcpDir, 'server.cjs'),
    });
    console.log(`✓ Built mcp/server.cjs`);
  } catch (e) {
    console.log(`✗ Skipping MCP server (error: ${e.message})`);
  }
}

async function main() {
  console.log('Building memextend Claude Code adapter...\n');
  await buildHooks();
  await buildMCP();
  console.log('\nBuild complete!');
}

main().catch(console.error);
