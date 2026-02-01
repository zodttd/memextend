#!/usr/bin/env node
// memextend CLI
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { statusCommand } from './commands/status.js';
import { searchCommand } from './commands/search.js';
import { forgetCommand } from './commands/forget.js';
import { editCommand } from './commands/edit.js';
import { helpCommand } from './commands/help.js';
import { exportCommand } from './commands/export.js';
import { importCommand } from './commands/import.js';
import { webuiCommand } from './commands/webui.js';
import { uninstallCommand } from './commands/uninstall.js';
import { saveCommand } from './commands/save.js';

const program = new Command();

program
  .name('memextend')
  .description('Extend your AI coding assistant\'s memory. Free, local, private.')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize memextend for your system')
  .option('--manual', 'Print manual configuration instructions')
  .action(initCommand);

program
  .command('status')
  .description('Show memextend status and statistics')
  .option('-p, --project', 'Show stats for current project only')
  .option('--check-embeddings', 'Run embedding model diagnostics')
  .action(statusCommand);

program
  .command('search <query>')
  .description('Search memories')
  .option('-p, --project', 'Search current project only')
  .option('-g, --global', 'Search global profile only')
  .option('-l, --limit <number>', 'Maximum results', '10')
  .action(searchCommand);

program
  .command('save')
  .description('Save a new memory')
  .option('-g, --global', 'Save as global memory (available in all projects)')
  .option('-p, --project <id>', 'Save to specific project')
  .option('-m, --message <content>', 'Memory content (or enter interactively)')
  .action(saveCommand);

program
  .command('forget [memoryId]')
  .description('Delete a memory by ID, or use --all/--before to bulk delete')
  .option('-a, --all', 'Delete ALL memories (use with caution)')
  .option('-p, --project', 'Only affect current project')
  .option('--before <date>', 'Delete memories before date (YYYY-MM-DD)')
  .action(forgetCommand);

program
  .command('edit <memoryId>')
  .description('Edit a memory\'s content')
  .action(editCommand);

program
  .command('list')
  .description('List recent memories')
  .option('-p, --project', 'List current project only')
  .option('-l, --limit <number>', 'Maximum results', '20')
  .action(async (options) => {
    const { listCommand } = await import('./commands/list.js');
    await listCommand(options);
  });

program
  .command('export')
  .description('Export memories to a JSON file')
  .option('-o, --output <path>', 'Output directory (default: current directory)')
  .option('-p, --project', 'Export current project only')
  .action(exportCommand);

program
  .command('import <file>')
  .description('Import memories from a JSON file')
  .option('-m, --merge', 'Skip duplicates instead of overwriting')
  .option('--validate-only', 'Validate file without importing')
  .action(importCommand);

program
  .command('webui')
  .description('Start the web UI for browsing and editing memories')
  .option('-p, --port <number>', 'Port number (default: 3333)', '3333')
  .option('-H, --host <host>', 'Host to bind to (default: localhost)', 'localhost')
  .action(webuiCommand);

program
  .command('uninstall')
  .description('Uninstall memextend and remove all integrations')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('-k, --keep-data', 'Keep memories and data, only remove integrations')
  .action(uninstallCommand);

program
  .command('help [topic]')
  .description('Show detailed help (topics: status, search, forget, edit, export, import, webui, uninstall)')
  .action(helpCommand);

program.parse();
