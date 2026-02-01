// Build script for bundling CLI tools with esbuild
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { build } from 'esbuild';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, chmod } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '..', 'src');
const distDir = join(__dirname, '..', 'dist');

const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  // External native modules that can't be bundled
  external: ['better-sqlite3', 'node-llama-cpp'],
  logLevel: 'warning',
  // Add shebang for CLI executables
  banner: {
    js: '#!/usr/bin/env node',
  },
};

async function buildCLI() {
  const cliDir = join(distDir, 'cli');
  await mkdir(cliDir, { recursive: true });

  const cliScripts = ['index', 'capture', 'inject'];

  for (const script of cliScripts) {
    try {
      const outfile = join(cliDir, `${script}.cjs`);
      await build({
        ...commonOptions,
        entryPoints: [join(srcDir, 'cli', `${script}.ts`)],
        outfile,
      });

      // Make executable
      await chmod(outfile, 0o755);

      console.log(`Built cli/${script}.cjs`);
    } catch (e) {
      console.error(`Failed to build ${script}:`, e.message);
      process.exit(1);
    }
  }
}

async function main() {
  console.log('Building memextend Cursor CLI tools...\n');
  await buildCLI();
  console.log('\nCLI build complete!');
}

main().catch(console.error);
