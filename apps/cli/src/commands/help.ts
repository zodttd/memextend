// apps/cli/src/commands/help.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import chalk from 'chalk';

const HELP_TEXT = `
${chalk.cyan.bold('╔═══════════════════════════════════════════════════════════════════╗')}
${chalk.cyan.bold('║                        memextend                                  ║')}
${chalk.cyan.bold('║          Free, local AI memory extension for coding assistants   ║')}
${chalk.cyan.bold('╚═══════════════════════════════════════════════════════════════════╝')}

${chalk.yellow.bold('OVERVIEW')}

  memextend gives your AI coding assistant persistent memory across sessions.
  It captures what you work on (edits, commands, patterns) and injects relevant
  context at the start of each new session.

  ${chalk.dim('• 100% local - your data never leaves your machine')}
  ${chalk.dim('• Automatic - captures and retrieves memories without manual effort')}
  ${chalk.dim('• Project-aware - memories are scoped to each git repository')}

${chalk.yellow.bold('HOW IT WORKS')}

  ${chalk.green('Session Start:')} Relevant memories are automatically injected into context
  ${chalk.green('During Session:')} Work normally; Claude can search/save memories via MCP
  ${chalk.green('Session End:')} Tool invocations (edits, commands) are saved as memories

${chalk.yellow.bold('MEMORY SCOPES')}

  ${chalk.cyan('Project Memories')} - Automatically tied to your git repository
    • Captured when you edit files, run commands, create files
    • Retrieved when you return to the same project
    • Use --project flag to filter CLI commands

  ${chalk.cyan('Global Profile')} - Cross-project preferences and patterns
    • Save via MCP tool: memextend_save_global
    • Included in all session contexts
    • Use --global flag to filter CLI commands

${chalk.yellow.bold('COMMANDS')}

  ${chalk.cyan('memextend status')}
    Show memory statistics and system health.

    ${chalk.dim('Options:')}
      ${chalk.dim('-p, --project')}           Show stats for current project only
      ${chalk.dim('--check-embeddings')}      Run embedding model diagnostics

    ${chalk.dim('Example:')}
      ${chalk.dim('$ memextend status')}
      ${chalk.dim('$ memextend status --project')}
      ${chalk.dim('$ memextend status --check-embeddings')}

  ${chalk.cyan('memextend list')}
    List recent memories with their IDs, timestamps, and content preview.

    ${chalk.dim('Options:')}
      ${chalk.dim('-p, --project')}    List current project only
      ${chalk.dim('-l, --limit <n>')}  Maximum results (default: 20)

    ${chalk.dim('Example:')}
      ${chalk.dim('$ memextend list')}
      ${chalk.dim('$ memextend list --project --limit 50')}

  ${chalk.cyan('memextend save')}
    Create a new memory manually.

    ${chalk.dim('Options:')}
      ${chalk.dim('-g, --global')}         Save as global memory (all projects)
      ${chalk.dim('-p, --project <id>')}   Save to specific project
      ${chalk.dim('-m, --message <text>')} Memory content (or enter interactively)

    ${chalk.dim('Examples:')}
      ${chalk.dim('$ memextend save --global -m "Prefer TypeScript over JavaScript"')}
      ${chalk.dim('$ memextend save                 # Interactive mode')}
      ${chalk.dim('$ memextend save -g              # Interactive global memory')}

  ${chalk.cyan('memextend search <query>')}
    Search memories using hybrid search (keyword + semantic).

    ${chalk.dim('Options:')}
      ${chalk.dim('-p, --project')}    Search current project only
      ${chalk.dim('-g, --global')}     Search global profile only
      ${chalk.dim('-l, --limit <n>')}  Maximum results (default: 10)

    ${chalk.dim('Example:')}
      ${chalk.dim('$ memextend search "authentication"')}
      ${chalk.dim('$ memextend search "API endpoints" --project')}

  ${chalk.cyan('memextend edit <memory-id>')}
    Interactively edit a memory's content.

    ${chalk.dim('Usage:')}
      1. Run the command with the memory ID
      2. View current content
      3. Type new content (press Enter twice to save)
      4. Press Ctrl+C to cancel

    ${chalk.dim('Example:')}
      ${chalk.dim('$ memextend edit abc123def456')}

  ${chalk.cyan('memextend forget <memory-id>')}
    Delete a specific memory by ID.

    ${chalk.dim('Example:')}
      ${chalk.dim('$ memextend forget abc123def456')}

  ${chalk.cyan('memextend forget --all')}
    Delete ALL memories (requires confirmation).

    ${chalk.dim('Options:')}
      ${chalk.dim('-a, --all')}                   Delete all memories
      ${chalk.dim('-p, --project')}               Only delete from current project
      ${chalk.dim('--before <date>')}             Delete memories before date (YYYY-MM-DD)
      ${chalk.dim('--delete-project <name>')}     Delete a project and all its memories
      ${chalk.dim('--clear-global')}              Clear all global profile entries

    ${chalk.dim('Examples:')}
      ${chalk.dim('$ memextend forget --all                      # Delete everything')}
      ${chalk.dim('$ memextend forget --all --project            # Delete current project only')}
      ${chalk.dim('$ memextend forget --before 2025-01-01        # Delete old memories')}
      ${chalk.dim('$ memextend forget --delete-project myproject # Delete entire project')}
      ${chalk.dim('$ memextend forget --clear-global             # Clear global profile')}

  ${chalk.cyan('memextend init')}
    Initialize memextend (run by installer, rarely needed manually).

    ${chalk.dim('Options:')}
      ${chalk.dim('--manual')}         Print manual configuration instructions

  ${chalk.cyan('memextend export')}
    Export memories to a JSON file for backup or transfer.

    ${chalk.dim('Options:')}
      ${chalk.dim('-o, --output <path>')}  Output directory (default: current)
      ${chalk.dim('-p, --project')}        Export current project only

    ${chalk.dim('Examples:')}
      ${chalk.dim('$ memextend export')}
      ${chalk.dim('$ memextend export --output ~/backup')}
      ${chalk.dim('$ memextend export --project')}

  ${chalk.cyan('memextend import <file>')}
    Import memories from a JSON export file.

    ${chalk.dim('Options:')}
      ${chalk.dim('-m, --merge')}          Skip duplicates (don\'t overwrite)
      ${chalk.dim('--validate-only')}      Validate file without importing

    ${chalk.dim('Examples:')}
      ${chalk.dim('$ memextend import ./memextend-export-2026-01-31.json')}
      ${chalk.dim('$ memextend import ./backup.json --merge')}
      ${chalk.dim('$ memextend import ./backup.json --validate-only')}

  ${chalk.cyan('memextend webui')}
    Start the web UI for browsing and managing memories.

    ${chalk.dim('Options:')}
      ${chalk.dim('-p, --port <number>')}  Port number (default: 3333)
      ${chalk.dim('-H, --host <host>')}    Host to bind to (default: localhost)

    ${chalk.dim('Features:')}
      ${chalk.dim('• Dashboard with memory statistics')}
      ${chalk.dim('• View and filter all memories')}
      ${chalk.dim('• Create, edit, and delete memories')}
      ${chalk.dim('• Search with hybrid search')}
      ${chalk.dim('• View and manage global profiles')}
      ${chalk.dim('• Configure capture and retrieval settings')}

    ${chalk.dim('Examples:')}
      ${chalk.dim('$ memextend webui')}
      ${chalk.dim('$ memextend webui --port 8080')}
      ${chalk.dim('$ memextend webui --host 0.0.0.0 --port 3333')}

  ${chalk.cyan('memextend uninstall')}
    Remove memextend and all integrations from your system.

    ${chalk.dim('Options:')}
      ${chalk.dim('-f, --force')}       Skip confirmation prompt
      ${chalk.dim('-k, --keep-data')}   Keep memories, only remove integrations

    ${chalk.dim('Removes:')}
      ${chalk.dim('• Claude Code hooks (SessionStart, Stop, PreCompact)')}
      ${chalk.dim('• Claude Code MCP server registration')}
      ${chalk.dim('• memextend section from ~/.claude/CLAUDE.md')}
      ${chalk.dim('• All data in ~/.memextend/ (unless --keep-data)')}

    ${chalk.dim('Examples:')}
      ${chalk.dim('$ memextend uninstall')}
      ${chalk.dim('$ memextend uninstall --force')}
      ${chalk.dim('$ memextend uninstall --keep-data')}

${chalk.yellow.bold('MCP TOOLS (used by Claude during sessions)')}

  ${chalk.dim('memextend_search')}   - Search memories mid-session
  ${chalk.dim('memextend_save')}     - Explicitly save something important
  ${chalk.dim('memextend_save_global')} - Save to global profile (cross-project)
  ${chalk.dim('memextend_forget')}   - Delete a memory
  ${chalk.dim('memextend_status')}   - Check memory statistics

${chalk.yellow.bold('FILES & DIRECTORIES')}

  ${chalk.dim('~/.memextend/')}              Data directory
  ${chalk.dim('~/.memextend/memextend.db')}  SQLite database (memories, FTS index)
  ${chalk.dim('~/.memextend/vectors/')}      LanceDB vector storage
  ${chalk.dim('~/.memextend/models/')}       Embedding models (downloaded on first use)
  ${chalk.dim('~/.memextend/config.json')}   Configuration file

${chalk.yellow.bold('MORE INFORMATION')}

  Documentation: ${chalk.blue('https://github.com/zodttd/memextend')}
  Issues:        ${chalk.blue('https://github.com/zodttd/memextend/issues')}

  ${chalk.dim('by ZodTTD • www.zodttd.com')}
`;

export async function helpCommand(topic?: string): Promise<void> {
  if (!topic) {
    console.log(HELP_TEXT);
    return;
  }

  // Topic-specific help
  const topics: Record<string, string> = {
    'status': `
${chalk.cyan.bold('memextend status')}

Show memory statistics and system health.

${chalk.yellow('Options:')}
  -p, --project           Show stats for current project only
  --check-embeddings      Run embedding model diagnostics

${chalk.yellow('Output includes:')}
  • Total memory count
  • Database size
  • Project count
  • Recent activity summary

${chalk.yellow('Embedding Diagnostics:')}
  Use --check-embeddings to verify the embedding model is working:
  • Downloads model if not present (~274MB one-time)
  • Loads and tests the model
  • Generates test embeddings
  • Verifies semantic similarity is working

${chalk.yellow('Examples:')}
  $ memextend status
  $ memextend status --project
  $ memextend status --check-embeddings
`,
    'save': `
${chalk.cyan.bold('memextend save')}

Create a new memory manually.

${chalk.yellow('Options:')}
  -g, --global         Save as global memory (available in all projects)
  -p, --project <id>   Save to specific project
  -m, --message <text> Memory content (or enter interactively)

${chalk.yellow('Examples:')}
  $ memextend save --global -m "Always use TypeScript"
  $ memextend save                    # Interactive mode
  $ memextend save -g                 # Interactive global memory

${chalk.yellow('Interactive Mode:')}
  When no message is provided, you can type content line by line.
  Press Enter twice (empty line) to save, or Ctrl+C to cancel.

${chalk.yellow('Project vs Global:')}
  • Project memories are tied to a git repository
  • Global memories are included in ALL sessions
  • Without --global, saves to current project (detected from cwd)
`,
    'search': `
${chalk.cyan.bold('memextend search <query>')}

Search memories using hybrid search combining:
  • Full-text search (SQLite FTS5) for keyword matching
  • Vector search (LanceDB) for semantic similarity
  • Reciprocal Rank Fusion to combine results

${chalk.yellow('Options:')}
  -p, --project    Search current project only
  -g, --global     Search global profile only
  -l, --limit <n>  Maximum results (default: 10)

${chalk.yellow('Examples:')}
  $ memextend search "authentication"
  $ memextend search "how to handle errors" --project
  $ memextend search "database migrations" --limit 20
`,
    'forget': `
${chalk.cyan.bold('memextend forget')}

Delete memories. Can delete single memories, bulk delete, or delete entire projects.

${chalk.yellow('Single delete:')}
  $ memextend forget <memory-id>

${chalk.yellow('Bulk delete options:')}
  -a, --all                   Delete all memories (with confirmation)
  -p, --project               Only affect current project
  --before <date>             Delete memories before date (YYYY-MM-DD)
  --delete-project <name>     Delete a project and all its memories
  --clear-global              Clear all global profile entries

${chalk.yellow('Examples:')}
  $ memextend forget abc123                     # Single memory
  $ memextend forget --all                      # Everything (careful!)
  $ memextend forget --all --project            # Current project only
  $ memextend forget --before 2025-01-01        # Old memories
  $ memextend forget --delete-project myproject # Delete entire project
  $ memextend forget --clear-global             # Clear global profile

${chalk.red('Warning:')} All deletes are permanent and cannot be undone.
`,
    'edit': `
${chalk.cyan.bold('memextend edit <memory-id>')}

Interactively edit a memory's content.

${chalk.yellow('Usage:')}
  1. Run: memextend edit <memory-id>
  2. Current content is displayed
  3. Type new content line by line
  4. Press Enter twice (empty line) to save
  5. Press Ctrl+C to cancel without saving

${chalk.yellow('Example:')}
  $ memextend edit abc123def456

${chalk.yellow('Tips:')}
  • Use 'memextend list' to find memory IDs
  • The memory ID is shown in search/list output
`,
    'export': `
${chalk.cyan.bold('memextend export')}

Export memories to a JSON file for backup or transfer.

${chalk.yellow('Options:')}
  -o, --output <path>  Output directory (default: current directory)
  -p, --project        Export current project only

${chalk.yellow('Examples:')}
  $ memextend export                    # Export all to current directory
  $ memextend export --output ~/backup  # Export to specific directory
  $ memextend export --project          # Export current project only
`,
    'import': `
${chalk.cyan.bold('memextend import <file>')}

Import memories from a JSON export file.

${chalk.yellow('Options:')}
  -m, --merge          Skip duplicate IDs (don't overwrite existing)
  --validate-only      Check file is valid without importing

${chalk.yellow('Examples:')}
  $ memextend import ./memextend-export-2026-01-31.json
  $ memextend import ./backup.json --merge
  $ memextend import ./backup.json --validate-only
`,
    'webui': `
${chalk.cyan.bold('memextend webui')}

Start a local web server for browsing and managing memories.

${chalk.yellow('Options:')}
  -p, --port <number>  Port number (default: 3333)
  -H, --host <host>    Host to bind to (default: localhost)

${chalk.yellow('Features:')}
  • ${chalk.green('Dashboard')} - Memory statistics, activity chart, breakdowns
  • ${chalk.green('Memory List')} - View all memories with filtering
  • ${chalk.green('Create')} - Add new memories (project or global)
  • ${chalk.green('Search')} - Hybrid search (FTS + vector)
  • ${chalk.green('Edit/Delete')} - Modify or remove memories
  • ${chalk.green('Global Profiles')} - Manage cross-project preferences
  • ${chalk.green('Settings')} - Configure capture and retrieval options

${chalk.yellow('Retrieval Settings (in WebUI):')}
  • ${chalk.dim('Auto-Inject')} - Enable/disable memory injection at session start
  • ${chalk.dim('Max Memories')} - Limit memories retrieved (0 = unlimited)
  • ${chalk.dim('Recent Days')} - Only retrieve memories from last N days (0 = unlimited)
  • ${chalk.dim('Include Global')} - Include global profile in injections
  • ${chalk.dim('Deduplication Threshold')} - Similarity threshold for removing duplicates (0.85 default)
  • ${chalk.dim('Session Max Chars')} - Max characters at session start (10000 ≈ 2500 tokens)
  • ${chalk.dim('Compact Max Chars')} - Max characters after compaction (2000 ≈ 500 tokens)

${chalk.yellow('Examples:')}
  $ memextend webui                            # Start on localhost:3333
  $ memextend webui --port 8080                # Custom port
  $ memextend webui --host 0.0.0.0             # Bind to all interfaces

${chalk.yellow('Access:')}
  Open http://localhost:3333 in your browser after starting.

${chalk.dim('Note:')} Use the "+ New Memory" or "+ New Global Memory" buttons
to create memories directly in the UI.
`,
    'uninstall': `
${chalk.cyan.bold('memextend uninstall')}

Remove memextend and all integrations from your system.

${chalk.yellow('Options:')}
  -f, --force       Skip confirmation prompt
  -k, --keep-data   Keep memories and data, only remove integrations

${chalk.yellow('What gets removed:')}
  • Claude Code hooks (SessionStart, Stop, PreCompact)
  • Claude Code MCP server registration
  • memextend section from ~/.claude/CLAUDE.md
  • All data in ~/.memextend/ (unless --keep-data)

${chalk.yellow('Examples:')}
  $ memextend uninstall              # Interactive uninstall
  $ memextend uninstall --force      # Skip confirmation
  $ memextend uninstall --keep-data  # Keep memories for later

${chalk.yellow('Re-installing:')}
  After using --keep-data, you can reinstall with:
  $ memextend init

  Your memories will be reconnected automatically.
`
  };

  const topicHelp = topics[topic.toLowerCase()];
  if (topicHelp) {
    console.log(topicHelp);
  } else {
    console.log(chalk.yellow(`\n  Unknown topic: ${topic}`));
    console.log(chalk.dim(`  Available topics: ${Object.keys(topics).join(', ')}\n`));
    console.log(chalk.dim(`  Run 'memextend help' for general help.\n`));
  }
}
