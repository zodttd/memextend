// apps/cli/src/commands/init.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { existsSync } from 'fs';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import ora from 'ora';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const CONFIG_PATH = join(MEMEXTEND_DIR, 'config.json');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');
const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');
const MODELS_PATH = join(MEMEXTEND_DIR, 'models');

const CLAUDE_DIR = join(homedir(), '.claude');
const CLAUDE_SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');
const CLAUDE_MD_PATH = join(CLAUDE_DIR, 'CLAUDE.md');

const CLAUDE_MD_TEMPLATE = `# memextend - AI Memory Extension

You have persistent memory across sessions via memextend.

## Available MCP Tools

- **memextend_search** - Search your memories for past decisions, patterns, or context
  Example: "How did we implement caching?" → Use memextend_search to find relevant memories

- **memextend_save** - Save important decisions or context for this project (never auto-deleted)
  Example: After making an architectural decision, save it for future reference

- **memextend_save_global** - Save cross-project preferences (coding style, preferred tools)
  Example: "User prefers TypeScript strict mode" → Save as global preference

- **memextend_forget** - Delete a specific memory by ID

- **memextend_status** - Check memory statistics and system status

## When to Search Memory

**ALWAYS search memories before asking the user about project history.** Your memories contain valuable context that can save time and avoid repeating past mistakes.

**Search memories when:**
- Starting work on a project you've worked on before
- The user references past decisions ("like we did before", "as discussed")
- You need context about project architecture or conventions
- **Debugging issues** - search for previous attempts, fixes, and what was tried before
- **Understanding project history** - how features were implemented and why
- The current approach isn't working - past memories may reveal what was already tried
- You're unsure about project conventions or patterns

## When to Save Memory

**Save memories when the user asks you to "memorize", "remember", or "save to memory".** Manual saves are never automatically deleted.

**Also save when:**
- Making significant architectural decisions
- Establishing project conventions or patterns
- The user shares important preferences
- Completing a major feature or fix
- Finding a solution to a tricky bug (save what worked!)

## Memory is Automatic

Memories are automatically captured from your sessions and injected at startup.
Use the tools above to actively search for more detail or save important context.
`;


const DEFAULT_CONFIG = {
  version: 1,
  storage: {
    path: MEMEXTEND_DIR,
    sqlite: 'memextend.db',
    vectors: 'vectors',
  },
  embedding: {
    model: 'nomic-embed-text-v1.5-GGUF',
    dimensions: 384,
  },
  capture: {
    tools: ['Edit', 'Write', 'Bash', 'Task'],
    skipTools: ['Read', 'Glob', 'Grep', 'TodoWrite', 'AskUserQuestion'],
    maxContentLength: 2000,
  },
  retrieval: {
    autoInject: true,
    maxMemories: 0,
    recentDays: 0,
    includeGlobal: true,
  },
  adapters: {
    'claude-code': {
      enabled: true,
      hooksRegistered: false,
      mcpRegistered: false,
    },
  },
};

interface InitOptions {
  manual?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  console.log(chalk.bold('\n  memextend v0.1.5\n'));

  if (options.manual) {
    printManualInstructions();
    return;
  }

  const spinner = ora();

  try {
    // Step 1: Create directories
    spinner.start('Creating memextend directory...');
    await mkdir(MEMEXTEND_DIR, { recursive: true });
    await mkdir(VECTORS_PATH, { recursive: true });
    await mkdir(MODELS_PATH, { recursive: true });
    spinner.succeed('Created ~/.memextend/');

    // Step 2: Initialize SQLite database
    spinner.start('Initializing SQLite database...');
    const { SQLiteStorage } = await import('@memextend/core');
    const sqlite = new SQLiteStorage(DB_PATH);
    sqlite.close();
    spinner.succeed('Initialized SQLite database');

    // Step 3: Initialize LanceDB
    spinner.start('Initializing LanceDB vectors...');
    const { LanceDBStorage } = await import('@memextend/core');
    const lancedb = await LanceDBStorage.create(VECTORS_PATH);
    await lancedb.close();
    spinner.succeed('Initialized LanceDB vectors');

    // Step 4: Write config
    spinner.start('Writing configuration...');
    await writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    spinner.succeed('Configuration saved');

    // Step 5: Register with Claude Code
    spinner.start('Registering with Claude Code...');
    const registered = await registerWithClaudeCode();
    if (registered) {
      spinner.succeed('Registered hooks and MCP server with Claude Code');
    } else {
      spinner.warn('Could not auto-register with Claude Code (see manual instructions)');
    }

    // Step 6: Create CLAUDE.md template
    spinner.start('Creating CLAUDE.md template...');
    const claudeMdCreated = await createClaudeMd();
    if (claudeMdCreated) {
      spinner.succeed('Created ~/.claude/CLAUDE.md with memory tool guidance');
    } else {
      spinner.warn('CLAUDE.md already exists (skipped)');
    }

    // Done!
    console.log(chalk.green('\n  ✅ memextend is ready!\n'));
    console.log('  Start a new Claude Code session to begin building memory.\n');

    if (!registered) {
      console.log(chalk.yellow('  Note: Run `memextend init --manual` for manual setup instructions.\n'));
    }

  } catch (error) {
    spinner.fail('Initialization failed');
    console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : error}\n`));
    process.exit(1);
  }
}

async function registerWithClaudeCode(): Promise<boolean> {
  try {
    // Check if Claude Code settings exist
    if (!existsSync(CLAUDE_SETTINGS_PATH)) {
      return false;
    }

    const settingsContent = await readFile(CLAUDE_SETTINGS_PATH, 'utf-8');
    const settings = JSON.parse(settingsContent);

    // Add hooks configuration
    if (!settings.hooks) {
      settings.hooks = {};
    }

    // Find the installed package location
    const packagePath = findPackagePath();
    if (!packagePath) {
      return false;
    }

    const hooksPath = join(packagePath, 'packages', 'adapters', 'claude-code', 'dist', 'hooks');
    const mcpPath = join(packagePath, 'packages', 'adapters', 'claude-code', 'dist', 'mcp');

    // Register SessionStart hook
    settings.hooks.SessionStart = {
      command: 'node',
      args: [join(hooksPath, 'session-start.cjs')],
      timeout: 30000,
    };

    // Register Stop hook
    settings.hooks.Stop = {
      command: 'node',
      args: [join(hooksPath, 'stop.cjs')],
      timeout: 30000,
    };

    // Register MCP server
    if (!settings.mcpServers) {
      settings.mcpServers = {};
    }

    settings.mcpServers.memextend = {
      command: 'node',
      args: [join(mcpPath, 'server.cjs')],
    };

    // Write updated settings
    await writeFile(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2));

    // Update our config to reflect registration
    const config = { ...DEFAULT_CONFIG };
    config.adapters['claude-code'].hooksRegistered = true;
    config.adapters['claude-code'].mcpRegistered = true;
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));

    return true;
  } catch {
    return false;
  }
}

function findPackagePath(): string | null {
  // Try to find the installed package
  // For now, return null and rely on manual setup
  // In production, this would resolve the npm package location
  return null;
}

async function createClaudeMd(): Promise<boolean> {
  try {
    // Create .claude directory if it doesn't exist
    await mkdir(CLAUDE_DIR, { recursive: true });

    // Check if CLAUDE.md already exists
    if (existsSync(CLAUDE_MD_PATH)) {
      // Check if it already contains memextend section
      const existing = await readFile(CLAUDE_MD_PATH, 'utf-8');
      if (existing.includes('memextend')) {
        return false; // Already has memextend content
      }
      // Append to existing file
      await writeFile(CLAUDE_MD_PATH, existing + '\n\n' + CLAUDE_MD_TEMPLATE);
    } else {
      // Create new file
      await writeFile(CLAUDE_MD_PATH, CLAUDE_MD_TEMPLATE);
    }
    return true;
  } catch {
    return false;
  }
}

function printManualInstructions(): void {
  console.log(chalk.bold('Manual Configuration Instructions\n'));

  console.log('1. Create the memextend directory:');
  console.log(chalk.cyan('   mkdir -p ~/.memextend\n'));

  console.log('2. Add the following to your Claude Code settings (~/.claude/settings.json):');
  console.log(chalk.cyan(`
   {
     "hooks": {
       "SessionStart": {
         "command": "node",
         "args": ["/path/to/memextend/dist/hooks/session-start.cjs"],
         "timeout": 30000
       },
       "Stop": {
         "command": "node",
         "args": ["/path/to/memextend/dist/hooks/stop.cjs"],
         "timeout": 30000
       }
     },
     "mcpServers": {
       "memextend": {
         "command": "node",
         "args": ["/path/to/memextend/dist/mcp/server.cjs"]
       }
     }
   }
`));

  console.log('3. Replace /path/to/memextend with the actual installation path.');
  console.log('   You can find it by running: npm root -g\n');

  console.log('4. Restart Claude Code to apply changes.\n');
}
