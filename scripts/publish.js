#!/usr/bin/env node
// scripts/publish.js
// Publishes all memextend packages to npm in the correct order

const { execSync } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..');

// Packages in dependency order (core first, then adapters, then apps)
const PACKAGES = [
  'packages/core',
  'packages/adapters/claude-code',
  'packages/adapters/cursor',
  'packages/adapters/opencode',
  'apps/cli',
  'apps/webui',
];

function getPackageInfo(pkgPath) {
  const pkgJson = JSON.parse(readFileSync(join(ROOT, pkgPath, 'package.json'), 'utf-8'));
  return { name: pkgJson.name, version: pkgJson.version };
}

function publish(pkgPath, otp) {
  const { name, version } = getPackageInfo(pkgPath);
  const fullPath = join(ROOT, pkgPath);

  console.log(`\n📦 Publishing ${name}@${version}...`);

  try {
    const cmd = otp
      ? `npm publish --access public --otp=${otp}`
      : `npm publish --access public`;

    execSync(cmd, {
      cwd: fullPath,
      stdio: 'inherit'
    });

    console.log(`✅ Published ${name}@${version}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to publish ${name}`);
    return false;
  }
}

function main() {
  const otp = process.argv[2];

  console.log('╔═══════════════════════════════════════╗');
  console.log('║     memextend npm publish script      ║');
  console.log('╚═══════════════════════════════════════╝');

  if (!otp) {
    console.log('\nUsage: node scripts/publish.js <otp-code>');
    console.log('\nExample: node scripts/publish.js 123456');
    console.log('\nThe OTP is your 2FA code from your authenticator app.');
    process.exit(1);
  }

  // Show what will be published
  console.log('\nPackages to publish:');
  for (const pkg of PACKAGES) {
    const { name, version } = getPackageInfo(pkg);
    console.log(`  - ${name}@${version}`);
  }

  console.log('\nPublishing...');

  let failed = false;
  for (const pkg of PACKAGES) {
    if (!publish(pkg, otp)) {
      failed = true;
      break;
    }
  }

  if (failed) {
    console.log('\n❌ Publishing stopped due to error.');
    process.exit(1);
  } else {
    console.log('\n✅ All packages published successfully!');
    console.log('\nVerify with: npm view @memextend/core version');
  }
}

main();
