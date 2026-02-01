# @memextend/cursor

> Cursor IDE adapter for memextend - persistent AI memory across sessions

## Overview

This adapter provides memextend integration for [Cursor](https://cursor.sh/), giving Claude persistent memory capabilities within the IDE. Your AI assistant will remember past decisions, code patterns, and context across sessions.

**Status:** ⚠️ **Experimental/Untested** - This adapter was developed based on Cursor's MCP documentation but has not been tested in a production Cursor environment. Community feedback and contributions are welcome!

## Features

- **MCP Integration**: Native Model Context Protocol server for Cursor
- **Memory Search**: Semantic and full-text search across past sessions
- **Memory Save**: Persist important decisions and patterns
- **Context Injection**: Retrieve relevant context for new sessions
- **Global Preferences**: Store cross-project preferences and patterns
- **CLI Tools**: Manual capture and injection for workflow automation

## Quick Start

### Prerequisites

1. [Cursor IDE](https://cursor.sh/) installed and run at least once
2. [memextend](https://github.com/your-repo/memextend) initialized:
   ```bash
   npm install -g memextend
   memextend init
   ```

### Installation

```bash
npm install @memextend/cursor
```

### Setup

Run the automatic setup:

```bash
npx memextend-cursor setup
```

This will configure Cursor's MCP settings to use the memextend server.

**Then restart Cursor** to load the new MCP server.

### Usage

Once set up, Claude in Cursor has access to memory tools:

```
"Search my memories for authentication patterns"
"Save this decision: Using JWT for API auth with 24h expiry"
"What did I work on in this project recently?"
```

## Detailed Setup

### Automatic Setup

The `memextend-cursor setup` command will:

1. Locate your Cursor configuration directory
2. Add the memextend MCP server to `~/.cursor/mcp.json`
3. Provide instructions for restarting Cursor

### Manual Setup

If automatic setup fails, manually edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "memextend": {
      "command": "node",
      "args": ["/path/to/node_modules/@memextend/cursor/dist/mcp/server.cjs"]
    }
  }
}
```

Find the exact path with:
```bash
npm root -g   # For global install
npm root      # For local install
```

### Configuration File Locations

Cursor stores MCP configuration in platform-specific locations:

| Platform | Path |
|----------|------|
| macOS    | `~/.cursor/mcp.json` or `~/Library/Application Support/Cursor/User/mcp.json` |
| Linux    | `~/.cursor/mcp.json` or `~/.config/Cursor/User/mcp.json` |
| Windows  | `%USERPROFILE%\.cursor\mcp.json` or `%APPDATA%\Cursor\User\mcp.json` |

## Available MCP Tools

When the MCP server is running, Claude has access to these tools:

### `memextend_search`
Search through your memories using semantic and full-text search.

**Parameters:**
- `query` (required): Search query - natural language works best
- `limit` (optional): Max results (default: 5, max: 20)
- `project_only` (optional): Only search current project

**Example prompts:**
- "Search my memories for Redis caching"
- "Find past work on authentication"

### `memextend_save`
Save a memory for the current project.

**Parameters:**
- `content` (required): Memory content to save
- `tags` (optional): Array of tags for categorization

**Example prompts:**
- "Save this: We use PostgreSQL with Prisma ORM"
- "Remember that the API rate limit is 100 req/min"

### `memextend_save_global`
Save a preference that applies across all projects.

**Parameters:**
- `content` (required): The preference or fact
- `type` (required): One of `preference`, `pattern`, or `fact`

**Example prompts:**
- "Save global preference: I prefer functional React components"
- "Remember globally: Always use TypeScript strict mode"

### `memextend_recall`
Get recent context for the current project.

**Parameters:**
- `days` (optional): Days to look back (default: 7)
- `include_global` (optional): Include global preferences (default: true)

**Example prompts:**
- "What have I worked on recently in this project?"
- "Recall my context for this codebase"

### `memextend_status`
Get memextend status and statistics.

### `memextend_forget`
Delete a specific memory by ID.

## CLI Tools

For workflow automation or manual operations, CLI tools are available:

### memextend-cursor

Main CLI with subcommands:

```bash
# Configure Cursor
memextend-cursor setup

# Check status
memextend-cursor status

# Capture memory
memextend-cursor capture -c "Implemented user authentication"

# Get context
memextend-cursor inject
```

### memextend-cursor-capture

Capture content to memory:

```bash
# Direct content
memextend-cursor-capture -c "Implemented Redis caching for sessions"

# From file
memextend-cursor-capture -f session-notes.txt

# From stdin (pipe from other tools)
echo "Fixed authentication bug" | memextend-cursor-capture --stdin

# With workspace context
memextend-cursor-capture -c "Added API endpoints" -w /path/to/project
```

### memextend-cursor-inject

Retrieve context for sessions:

```bash
# Get context for current directory
memextend-cursor-inject

# Extended history
memextend-cursor-inject --days 30 --limit 20

# Copy to clipboard
memextend-cursor-inject --clipboard

# JSON output for scripting
memextend-cursor-inject --format json
```

## Cursor Integration Tips

### Starting a Session

At the start of a Cursor session, ask Claude:

> "Recall my context for this project"

This will retrieve recent memories and preferences.

### During Development

Save important decisions as you make them:

> "Save this decision: Using event sourcing for order processing"

Search when you need to remember:

> "Search memories for how we handle error logging"

**CRITICAL: If you can't find something in the codebase, search your memories.** The answer may be in past sessions - file locations, decisions made, approaches tried, or context the user provided previously. Always check memories as a last resort before telling the user you can't find something.

### Ending a Session

Before closing, save a summary:

> "Save summary: Today I implemented the payment processing module with Stripe integration"

### Keyboard Shortcuts (Optional)

You can create Cursor tasks to run CLI commands. Add to `.cursor/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "memextend: Get Context",
      "type": "shell",
      "command": "memextend-cursor-inject --clipboard",
      "problemMatcher": []
    },
    {
      "label": "memextend: Quick Save",
      "type": "shell",
      "command": "memextend-cursor-capture -c \"${input:memory}\"",
      "problemMatcher": []
    }
  ],
  "inputs": [
    {
      "id": "memory",
      "type": "promptString",
      "description": "Memory content to save"
    }
  ]
}
```

## Limitations

### vs Claude Code

Unlike the Claude Code adapter which has native session hooks, Cursor integration has some limitations:

1. **No automatic session capture**: Cursor doesn't expose session lifecycle events. You must explicitly save memories or use CLI tools.

2. **No automatic context injection**: Context isn't automatically injected at session start. Use the `memextend_recall` tool or CLI.

3. **Workspace detection**: The MCP server uses environment variables and cwd to detect the workspace. This usually works but may be inconsistent in some setups.

### Workarounds

- **Session capture**: Use `memextend-cursor-capture` in your development workflow
- **Context injection**: Start sessions with "Recall my context" or run `memextend-cursor-inject`
- **Automation**: Create shell scripts or Cursor tasks for common operations

## Troubleshooting

### "memextend not initialized"

Run:
```bash
memextend init
```

### MCP server not working

1. Check if configured:
   ```bash
   memextend-cursor status
   ```

2. Verify the server path exists:
   ```bash
   ls $(npm root)/@memextend/cursor/dist/mcp/server.cjs
   ```

3. Check Cursor's MCP config:
   ```bash
   cat ~/.cursor/mcp.json
   ```

4. Restart Cursor completely (not just reload window)

### Tools not appearing in Cursor

1. Ensure MCP is enabled in Cursor settings
2. Restart Cursor after configuration changes
3. Check Cursor's developer console for MCP errors

### Workspace detection issues

Set the workspace explicitly in the MCP config:

```json
{
  "mcpServers": {
    "memextend": {
      "command": "node",
      "args": ["/path/to/server.cjs"],
      "env": {
        "CURSOR_WORKSPACE_PATH": "/path/to/your/project"
      }
    }
  }
}
```

## Architecture

```
@memextend/cursor/
├── src/
│   ├── mcp/           # MCP server for Cursor integration
│   │   ├── server.ts  # Main MCP server with memory tools
│   │   └── index.ts   # MCP exports
│   ├── cli/           # CLI tools for manual operations
│   │   ├── index.ts   # Main CLI entry point
│   │   ├── capture.ts # Memory capture tool
│   │   └── inject.ts  # Context injection tool
│   ├── utils/         # Shared utilities
│   │   └── index.ts   # Common functions and constants
│   └── index.ts       # Package entry point
├── scripts/           # Build scripts
│   ├── build-mcp.js   # Bundle MCP server
│   ├── build-cli.js   # Bundle CLI tools
│   └── postinstall.js # Post-install helper
├── dist/              # Built outputs
│   ├── mcp/           # MCP server (server.cjs)
│   └── cli/           # CLI tools (*.cjs)
└── README.md          # This file
```

## Development

### Building

```bash
npm run build
```

This runs:
1. TypeScript compilation
2. MCP server bundling (esbuild)
3. CLI tools bundling (esbuild)

### Testing

```bash
npm test
```

### Local Development

```bash
# Link for local testing
npm link

# In another terminal
memextend-cursor status
```

## Contributing

Contributions welcome! Areas that could use help:

- VS Code extension for better session detection
- Automatic context injection via Cursor's API (if/when available)
- Better workspace detection heuristics
- Windows testing and improvements

## License

MIT - Copyright (c) 2026 ZodTTD LLC

## See Also

- [memextend](https://github.com/your-repo/memextend) - Main project
- [@memextend/core](../core) - Core memory storage
- [@memextend/claude-code](../claude-code) - Claude Code adapter (reference implementation)
