// apps/cli/src/commands/uninstall.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { existsSync } from 'fs';
import { readFile, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import ora from 'ora';
import { createInterface } from 'readline';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const CLAUDE_DIR = join(homedir(), '.claude');
const CLAUDE_SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');
const CLAUDE_MD_PATH = join(CLAUDE_DIR, 'CLAUDE.md');

interface UninstallOptions {
  force?: boolean;
  keepData?: boolean;
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export async function uninstallCommand(options: UninstallOptions): Promise<void> {
  console.log(chalk.bold('\n  memextend Uninstall\n'));

  // Check if memextend is installed
  if (!existsSync(MEMEXTEND_DIR)) {
    console.log(chalk.yellow('  memextend is not installed (no ~/.memextend directory found).\n'));
    return;
  }

  // Show what will be removed
  console.log('  This will remove:');
  console.log(chalk.cyan('    - Claude Code hooks (SessionStart, Stop, PreCompact)'));
  console.log(chalk.cyan('    - Claude Code MCP server registration'));
  console.log(chalk.cyan('    - memextend section from ~/.claude/CLAUDE.md'));
  if (!options.keepData) {
    console.log(chalk.red('    - All memories and data in ~/.memextend/'));
  } else {
    console.log(chalk.yellow('    - (keeping data in ~/.memextend/ due to --keep-data flag)'));
  }
  console.log('');

  // Confirm unless --force
  if (!options.force) {
    const confirmed = await confirm('  Are you sure you want to uninstall? (y/N): ');
    if (!confirmed) {
      console.log(chalk.yellow('\n  Uninstall cancelled.\n'));
      return;
    }
  }

  const spinner = ora();

  try {
    // Step 1: Remove from Claude Code settings
    spinner.start('Removing Claude Code integration...');
    await removeFromClaudeSettings();
    spinner.succeed('Removed hooks and MCP server from Claude Code');

    // Step 2: Remove memextend section from CLAUDE.md
    spinner.start('Cleaning up CLAUDE.md...');
    await cleanupClaudeMd();
    spinner.succeed('Removed memextend section from CLAUDE.md');

    // Step 3: Remove data directory (unless --keep-data)
    if (!options.keepData) {
      spinner.start('Removing memextend data...');
      await rm(MEMEXTEND_DIR, { recursive: true, force: true });
      spinner.succeed('Removed ~/.memextend/ directory');
    } else {
      spinner.info('Keeping ~/.memextend/ data directory');
    }

    console.log(chalk.green('\n  ✅ memextend has been uninstalled.\n'));

    if (options.keepData) {
      console.log(chalk.yellow('  Your memories are preserved in ~/.memextend/'));
      console.log(chalk.yellow('  Run `memextend init` to reinstall and reconnect.\n'));
    }

  } catch (error) {
    spinner.fail('Uninstall failed');
    console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : error}\n`));
    process.exit(1);
  }
}

async function removeFromClaudeSettings(): Promise<void> {
  if (!existsSync(CLAUDE_SETTINGS_PATH)) {
    return;
  }

  try {
    const content = await readFile(CLAUDE_SETTINGS_PATH, 'utf-8');
    const settings = JSON.parse(content);

    // Remove hooks
    if (settings.hooks) {
      delete settings.hooks.SessionStart;
      delete settings.hooks.Stop;
      delete settings.hooks.PreCompact;

      // Remove empty hooks object
      if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
      }
    }

    // Remove MCP server
    if (settings.mcpServers) {
      delete settings.mcpServers.memextend;

      // Remove empty mcpServers object
      if (Object.keys(settings.mcpServers).length === 0) {
        delete settings.mcpServers;
      }
    }

    await writeFile(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch {
    // Ignore errors - settings file might be malformed
  }
}

async function cleanupClaudeMd(): Promise<void> {
  if (!existsSync(CLAUDE_MD_PATH)) {
    return;
  }

  try {
    const content = await readFile(CLAUDE_MD_PATH, 'utf-8');

    // Remove memextend section (from "# memextend" to the next top-level heading or end)
    const memextendSectionRegex = /# memextend - AI Memory Extension[\s\S]*?(?=\n# [^#]|$)/;
    let cleaned = content.replace(memextendSectionRegex, '');

    // Clean up extra whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

    if (cleaned.length === 0) {
      // File is now empty, remove it
      await rm(CLAUDE_MD_PATH);
    } else {
      await writeFile(CLAUDE_MD_PATH, cleaned + '\n');
    }
  } catch {
    // Ignore errors
  }
}
