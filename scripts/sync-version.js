#!/usr/bin/env node
// scripts/sync-version.js
// Copyright (c) 2026 ZodTTD LLC. MIT License.
//
// Syncs all version references across the monorepo.
// Usage:
//   node scripts/sync-version.js           - Sync all to root package.json version
//   node scripts/sync-version.js 0.2.0     - Bump all to specified version

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

// Read root package.json version
function getRootVersion() {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  return rootPkg.version;
}

// All package.json files to update
const PACKAGE_JSON_FILES = [
  'package.json',
  'packages/core/package.json',
  'packages/adapters/claude-code/package.json',
  'packages/adapters/cursor/package.json',
  'packages/adapters/opencode/package.json',
  'apps/cli/package.json',
  'apps/webui/package.json',
];

// Files with hardcoded version strings
const VERSION_STRING_FILES = [
  { file: 'install.sh', pattern: /^VERSION="[\d.]+"$/m, replacement: (v) => `VERSION="${v}"` },
  { file: 'apps/cli/src/index.ts', pattern: /\.version\('[\d.]+'\)/, replacement: (v) => `.version('${v}')` },
  { file: 'apps/cli/src/commands/init.ts', pattern: /memextend v[\d.]+/, replacement: (v) => `memextend v${v}` },
  { file: 'packages/adapters/claude-code/src/mcp/server.ts', pattern: /version: '[\d.]+'/, replacement: (v) => `version: '${v}'` },
  { file: 'packages/adapters/cursor/src/mcp/server.ts', pattern: /version: '[\d.]+'/, replacement: (v) => `version: '${v}'` },
  { file: 'packages/adapters/opencode/src/mcp/server.ts', pattern: /version: '[\d.]+'/, replacement: (v) => `version: '${v}'` },
  { file: 'packages/adapters/cursor/src/index.ts', pattern: /ADAPTER_VERSION = '[\d.]+'/, replacement: (v) => `ADAPTER_VERSION = '${v}'` },
  { file: 'packages/adapters/opencode/src/index.ts', pattern: /ADAPTER_VERSION = '[\d.]+'/, replacement: (v) => `ADAPTER_VERSION = '${v}'` },
];

// Update a package.json file
function updatePackageJson(filePath, newVersion) {
  const fullPath = path.join(ROOT_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`  ⚠ ${filePath} not found, skipping`);
    return false;
  }

  const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  let changed = false;

  if (pkg.version !== newVersion) {
    pkg.version = newVersion;
    changed = true;
  }

  // Also update internal dependencies
  const internalPackages = ['@memextend/core', '@memextend/claude-code', '@memextend/cursor', '@memextend/opencode', '@memextend/webui'];

  if (pkg.dependencies) {
    for (const dep of internalPackages) {
      if (pkg.dependencies[dep] && pkg.dependencies[dep] !== `^${newVersion}`) {
        pkg.dependencies[dep] = `^${newVersion}`;
        changed = true;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`  ✓ ${filePath}: updated to ${newVersion}`);
    return true;
  } else {
    console.log(`  ✓ ${filePath} already at ${newVersion}`);
    return false;
  }
}

// Update a file with hardcoded version string
function updateVersionString(config, newVersion) {
  const fullPath = path.join(ROOT_DIR, config.file);
  if (!fs.existsSync(fullPath)) {
    console.log(`  ⚠ ${config.file} not found, skipping`);
    return false;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  const match = content.match(config.pattern);

  if (!match) {
    console.log(`  ⚠ ${config.file}: pattern not found`);
    return false;
  }

  const oldValue = match[0];
  const newValue = config.replacement(newVersion);

  if (oldValue === newValue) {
    console.log(`  ✓ ${config.file} already at ${newVersion}`);
    return false;
  }

  content = content.replace(config.pattern, newValue);
  fs.writeFileSync(fullPath, content);
  console.log(`  ✓ ${config.file}: updated to ${newVersion}`);
  return true;
}

// Main
function main() {
  const args = process.argv.slice(2);
  let targetVersion;
  let isBump = false;

  if (args[0]) {
    // Validate version format
    if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(args[0])) {
      console.error(`Invalid version format: ${args[0]}`);
      console.error('Expected format: X.Y.Z or X.Y.Z-tag');
      process.exit(1);
    }
    targetVersion = args[0];
    isBump = true;
  } else {
    targetVersion = getRootVersion();
  }

  if (isBump) {
    console.log(`\nBumping all versions to ${targetVersion}\n`);
  } else {
    console.log(`\nSyncing all versions to root package.json: ${targetVersion}\n`);
  }

  let updated = 0;

  console.log('Updating package.json files:');
  for (const file of PACKAGE_JSON_FILES) {
    if (updatePackageJson(file, targetVersion)) updated++;
  }

  console.log('\nUpdating hardcoded version strings:');
  for (const config of VERSION_STRING_FILES) {
    if (updateVersionString(config, targetVersion)) updated++;
  }

  console.log(`\n${updated > 0 ? `✓ Updated ${updated} files` : 'All files already at target version'}\n`);

  if (updated > 0 && isBump) {
    console.log('Next steps:');
    console.log('  1. Run: npm run build');
    console.log('  2. Run: npm test');
    console.log('  3. Commit: git add -A && git commit -m "Bump version to ' + targetVersion + '"');
    console.log('  4. Push: git push origin main');
    console.log('');
  }
}

main();
