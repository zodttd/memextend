# @memextend/opencode

> OpenCode adapter for memextend - Memory extension for AI coding agents

**Status:** ⚠️ **Experimental/Untested** - This adapter was developed based on OpenCode's MCP documentation but has not been tested in a production OpenCode environment. Community feedback and contributions are welcome!

This adapter provides memextend integration for [OpenCode](https://github.com/anomalyco/opencode) by Anomaly, an open-source AI coding agent.

## Features

- MCP (Model Context Protocol) server for mid-session memory operations
- Search through past work and decisions
- Save important context and patterns
- Store global preferences across projects
- Semantic search using vector embeddings

## Requirements

- Node.js 18+
- OpenCode installed (`npm i -g opencode-ai`)
- memextend CLI initialized (`memextend init`)

## Installation

```bash
# Install the adapter
npm install @memextend/opencode

# Or if using the memextend monorepo
pnpm install
pnpm build
```

## Configuration

### Option 1: Global Configuration

Add memextend to your global OpenCode configuration at `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "memextend": {
      "type": "local",
      "command": ["node", "/path/to/node_modules/@memextend/opencode/dist/mcp/server.cjs"],
      "enabled": true
    }
  }
}
```

### Option 2: Project-Local Configuration

Add to your project's `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "memextend": {
      "type": "local",
      "command": ["node", "./node_modules/@memextend/opencode/dist/mcp/server.cjs"],
      "enabled": true
    }
  }
}
```

### Option 3: Using npx

If you have the package installed globally, you can reference it directly:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "memextend": {
      "type": "local",
      "command": ["npx", "@memextend/opencode", "mcp"],
      "enabled": true
    }
  }
}
```

### Finding the Server Path

To find the correct path for your installation:

```bash
# If installed globally
npm root -g
# Then append: /@memextend/opencode/dist/mcp/server.cjs

# If installed locally in a project
npm root
# Then append: /@memextend/opencode/dist/mcp/server.cjs
```

## Available MCP Tools

Once configured, the following tools are available in your OpenCode sessions:

### memextend_search

Search through your memories using semantic and full-text search.

```
Use: Search for "authentication flow" or "Redis caching decisions"
```

### memextend_save

Save a memory for the current project.

```
Use: Save important decisions, patterns, or context for future reference
```

### memextend_save_global

Save a global preference or fact that applies across all projects.

```
Use: Save coding style preferences, common patterns, or personal facts
Types: preference, pattern, fact
```

### memextend_forget

Delete a specific memory by ID.

```
Use: Remove outdated or incorrect memories
```

### memextend_status

Get memextend status and memory statistics.

```
Use: Check how many memories are stored, database location, etc.
```

### memextend_context

Get relevant context for the current session.

```
Use: Retrieve recent memories, global preferences, and semantically related past work
```

## Usage Examples

After configuring memextend in your `opencode.json`, start OpenCode in your project:

```bash
opencode
```

Then interact with memextend through natural language:

```
> Search my memories for authentication patterns

> Save this as a memory: We decided to use JWT tokens with 24-hour expiry for API authentication

> Remember globally that I prefer TypeScript with strict mode enabled

> What context do you have about this project?

> Show me the memextend status
```

### When to Search Memory

**ALWAYS search memories before asking the user about project history.** Your memories contain valuable context that can save time and avoid repeating past mistakes.

**CRITICAL: If you can't find something, SEARCH YOUR MEMORIES.** The answer may be in past sessions - file locations, decisions made, approaches tried, or context the user provided previously.

**Search memories when:**
- Starting work on a project you've worked on before
- The user references past decisions ("like we did before", "as discussed")
- You need context about project architecture or conventions
- **Debugging issues** - search for previous attempts, fixes, and what was tried before
- **Understanding project history** - how features were implemented and why
- The current approach isn't working - past memories may reveal what was already tried
- You're unsure about project conventions or patterns
- **You can't find a file, function, or pattern** - it may have been discussed or located in a previous session
- **Before giving up** - always check memories as a last resort before telling the user you can't find something

## How It Works

1. **MCP Integration**: OpenCode connects to the memextend MCP server via stdio
2. **Tool Discovery**: OpenCode discovers the memextend tools at startup
3. **Semantic Search**: Memories are embedded using the Nomic embed model for semantic search
4. **Hybrid Search**: Combines vector similarity with full-text search for best results
5. **Persistent Storage**: Memories are stored in SQLite with LanceDB for vectors

## Configuration Reference

### OpenCode MCP Config

```typescript
interface MCPConfig {
  type: 'local' | 'remote';  // 'local' for stdio servers
  command?: string[];         // Command and arguments to run
  environment?: Record<string, string>;  // Environment variables
  enabled?: boolean;          // Enable/disable the server
  timeout?: number;           // Request timeout in ms
}
```

### memextend Config (~/.memextend/config.json)

```json
{
  "retrieval": {
    "autoInject": true,
    "maxMemories": 10,
    "recentDays": 7,
    "includeGlobal": true
  },
  "capture": {
    "tools": ["Edit", "Write", "Bash", "Task"],
    "skipTools": ["Read", "Glob", "Grep"],
    "maxContentLength": 2000
  }
}
```

## Differences from Claude Code Adapter

| Feature | Claude Code | OpenCode |
|---------|-------------|----------|
| Hook System | Native hooks (SessionStart, Stop) | No native hooks |
| Auto Context Injection | Yes (via SessionStart hook) | Manual via memextend_context |
| Auto Memory Capture | Yes (via Stop hook) | Manual via memextend_save |
| MCP Support | Yes | Yes |
| Mid-Session Tools | Yes | Yes |

Since OpenCode does not have a native hook system like Claude Code, automatic context injection and memory capture are not available. Instead, users should:

1. Use `memextend_context` at the start of a session to get relevant memories
2. Explicitly save important information using `memextend_save` or `memextend_save_global`

## Troubleshooting

### MCP Server Not Found

If OpenCode cannot find the memextend MCP server:

1. Verify the path in your config is correct
2. Ensure the package is built: `npm run build`
3. Check Node.js is in your PATH

### No Memories Found

If searches return no results:

1. Run `memextend init` to initialize the database
2. Verify memextend is working: `memextend status`
3. Save some test memories first

### Permission Errors

If you see permission errors:

1. Ensure memextend directories exist: `~/.memextend/`
2. Check write permissions on the database files

## Development

```bash
# Build the adapter
npm run build

# Run tests
npm test

# Build only the MCP server bundle
npm run build:bundle
```

## Related

- [memextend](https://github.com/zodttd/memextend) - Main memextend project
- [OpenCode](https://github.com/anomalyco/opencode) - OpenCode by Anomaly
- [MCP Specification](https://modelcontextprotocol.io/) - Model Context Protocol

## License

MIT - Copyright (c) 2026 ZodTTD LLC
