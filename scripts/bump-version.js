#!/usr/bin/env node
// scripts/bump-version.js
// Copyright (c) 2026 ZodTTD LLC. MIT License.
//
// Bumps all version references to a new version.
// Usage: node scripts/bump-version.js <new-version>
//
// This is a convenience wrapper around sync-version.js

const { execSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);

if (!args[0]) {
  console.error('Usage: node scripts/bump-version.js <new-version>');
  console.error('Example: node scripts/bump-version.js 0.2.0');
  console.error('\nTo sync all packages to current root version, use: npm run version:sync');
  process.exit(1);
}

// Pass through to sync-version.js with the version argument
const syncScript = path.join(__dirname, 'sync-version.js');
execSync(`node "${syncScript}" ${args[0]}`, { stdio: 'inherit' });
