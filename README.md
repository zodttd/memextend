# memextend

> Extend your AI coding assistant's memory. Free, local, private.

memextend gives Claude Code (and other AI coding tools) persistent memory across sessions. It captures your significant actions, stores them locally, and automatically provides relevant context when you start new sessions.

## Features

- **Persistent Memory** - Remember what you worked on across sessions
- **Fully Local** - No cloud, no API costs, complete privacy
- **Hybrid Search** - Keyword (FTS5) + semantic (vector) search with RRF fusion
- **Auto-Inject** - Relevant memories loaded on session start
- **On-Demand Search** - MCP tools for mid-session memory queries
- **Per-Project + Global** - Project-specific and cross-project memories
- **Extensible** - Adapter architecture for multiple AI tools

## Quick Start

### One-Line Install

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/zodttd/memextend/main/install.sh)"
```

### Manual Install

```bash
git clone https://github.com/zodttd/memextend.git
cd memextend
npm install
npm run build
node apps/cli/dist/index.js init
```

After installation:
1. Restart Claude Code to load the new configuration
2. Start a new session - memories will be captured automatically
3. Use `memextend status` to check memory statistics

## Memory Scopes

memextend supports two types of memories:

### Project Memories

Project memories are automatically scoped to your git repository. When you work in a project, memextend:
- Identifies the project via a hash of your git root path
- Captures tool invocations (edits, writes, commands) specific to that project
- Retrieves only relevant project memories when you return

**Use cases:**
- "Remember we decided to use JWT for auth in this project"
- "Recall the API endpoint patterns we established"
- "What files did we modify for the user dashboard?"

### Global Profile

Global memories persist across all projects. Use these for preferences and patterns that apply everywhere.

**Save global memories via MCP:**
```
Claude can use: memextend_save_global
```

**Use cases:**
- "I prefer tabs over spaces"
- "Always use TypeScript strict mode"
- "My preferred test framework is Vitest"

**CLI filtering:**
```bash
memextend search "preferences" --global   # Search global only
memextend search "auth" --project         # Search current project only
memextend search "patterns"               # Search both (default)
```

## How It Works

### Capture
When your session ends, memextend saves significant actions:
- **Edit** - File modifications with context
- **Write** - New files created
- **Bash** - Commands executed
- **Task** - Agent task results

### Recall
When a new session starts, memextend:
1. Identifies your project (via git root hash)
2. Retrieves relevant memories (recent work + semantic matches)
3. Includes your global preferences
4. Injects context automatically via `<memextend-context>` tag

### Search
Mid-session, Claude can use MCP tools:
- `memextend_search` - Find memories by query
- `memextend_save` - Save a new project memory
- `memextend_save_global` - Save a global preference
- `memextend_forget` - Delete a memory
- `memextend_status` - Show memory statistics

## CLI Commands

### View & Search

```bash
# Status
memextend status                    # Memory stats and database info
memextend status --project          # Stats for current project only
memextend status --check-embeddings # Run embedding model diagnostics

# List memories
memextend list                      # Recent memories (all)
memextend list --project            # Current project only
memextend list --limit 50           # Show more results

# Search
memextend search "authentication"   # Hybrid search all memories
memextend search "auth" --project   # Current project only
memextend search "prefs" --global   # Global profile only
memextend search "api" --limit 20   # More results
```

### Manage Memories

```bash
# Edit a memory
memextend edit <memory-id>          # Interactive editor
                                    # - Shows current content
                                    # - Type new content
                                    # - Press Enter twice to save
                                    # - Ctrl+C to cancel

# Delete memories
memextend forget <memory-id>        # Delete specific memory

# Bulk delete (with confirmation prompts)
memextend forget --all              # Delete ALL memories
memextend forget --all --project    # Delete current project only
memextend forget --before 2025-01-01           # Delete old memories
memextend forget --before 2025-06-01 --project # Old project memories
```

### Import/Export

```bash
# Export memories
memextend export                    # Export all to current directory
memextend export --output ~/backup  # Export to specific directory
memextend export --project          # Export current project only

# Import memories
memextend import ./memextend-export-2026-01-31.json  # Import from file
memextend import ./backup.json --merge               # Skip duplicates
memextend import ./backup.json --validate-only       # Validate without importing
```

### Web UI

```bash
memextend webui                     # Start web UI on localhost:3333
memextend webui --port 8080         # Custom port
memextend webui --host 0.0.0.0      # Bind to all interfaces
```

The web UI provides:
- **Dashboard** - Memory statistics, activity charts, type breakdowns
- **Memory Browser** - Filter and paginate through all memories
- **Search** - Hybrid search with semantic and keyword matching
- **Edit/Delete** - Modify or remove individual memories
- **Global Profiles** - View cross-project preferences

### Help

```bash
memextend help                      # Detailed help with examples
memextend help status               # Help for status command
memextend help search               # Help for search command
memextend help forget               # Help for forget command
memextend help edit                 # Help for edit command
memextend help webui                # Help for webui command
memextend --help                    # Quick command reference
```

## Architecture

```
memextend/
├── packages/
│   ├── core/                   # Storage, embedding, memory operations
│   │   ├── storage/           # SQLite (FTS5) + LanceDB
│   │   ├── embedding/         # Local nomic-embed-text model
│   │   └── memory/            # Capture, retrieve, types
│   └── adapters/
│       ├── claude-code/       # Claude Code hooks + MCP server
│       ├── opencode/          # OpenCode MCP server (anomalyco/opencode)
│       └── cursor/            # Cursor MCP server + CLI tools
└── apps/
    ├── cli/                   # CLI commands
    └── webui/                 # Web interface for memory management
```

## Technology Stack

- **Language**: TypeScript
- **Text Search**: SQLite with FTS5
- **Vector Search**: LanceDB
- **Embeddings**: node-llama-cpp with nomic-embed-text
- **MCP**: @modelcontextprotocol/sdk
- **Testing**: Vitest

## Configuration

Config file: `~/.memextend/config.json`

```json
{
  "version": 1,
  "capture": {
    "tools": ["Edit", "Write", "Bash", "Task"],
    "skipTools": ["Read", "Glob", "Grep", "TodoWrite"],
    "maxContentLength": 2000
  },
  "retrieval": {
    "autoInject": true,
    "maxMemories": 10,
    "recentDays": 7,
    "includeGlobal": true
  }
}
```

## Claude Code Integration

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": {
      "command": "node",
      "args": ["/path/to/memextend/packages/adapters/claude-code/dist/hooks/session-start.cjs"],
      "timeout": 30000
    },
    "Stop": {
      "command": "node",
      "args": ["/path/to/memextend/packages/adapters/claude-code/dist/hooks/stop.cjs"],
      "timeout": 30000
    }
  },
  "mcpServers": {
    "memextend": {
      "command": "node",
      "args": ["/path/to/memextend/packages/adapters/claude-code/dist/mcp/server.cjs"]
    }
  }
}
```

## Embedding Model

memextend uses a local embedding model (`nomic-embed-text-v1.5`) for semantic search. The model is downloaded automatically on first use (~274MB).

### Diagnostics

Run embedding diagnostics to verify everything is working:

```bash
memextend status --check-embeddings
```

This will:
1. Check if the model file exists and is valid
2. Download the model if missing
3. Load the model and verify it initializes correctly
4. Generate test embeddings (document and query)
5. Verify semantic similarity is working properly

### Fallback Mode

If the model can't be loaded, memextend falls back to hash-based embeddings. These work for basic matching but lack semantic understanding. Run diagnostics to ensure you're using real embeddings for best results.

## Privacy

Everything stays on your machine:
- SQLite database: `~/.memextend/memextend.db`
- Vector store: `~/.memextend/vectors/`
- Embedding model: `~/.memextend/models/` (downloaded on first use)

**No data is ever sent to external servers.**

## Requirements

- Node.js 18+ (Node 22 LTS recommended for best compatibility)
- Claude Code (for Claude Code adapter)

## Comparison with Supermemory

| Feature | Supermemory Pro | memextend |
|---------|----------------|-----------|
| Cost | $19/month | Free |
| Storage | Cloud | Local |
| Privacy | Data on servers | 100% local |
| Offline | No | Yes |
| Search | API-based | Hybrid local (FTS + vector) |
| Extensible | Claude Code only | Adapter architecture |

## Roadmap

- [x] Core storage (SQLite + LanceDB)
- [x] Local embeddings (nomic-embed-text)
- [x] Memory capture and retrieval
- [x] Claude Code adapter (hooks + MCP)
- [x] CLI commands
- [x] Real embedding model integration (uses model when available, fallback otherwise)
- [x] Import/export functionality
- [x] OpenCode adapter (MCP server for anomalyco/opencode) ⚠️ *experimental*
- [x] Cursor adapter (MCP server + CLI tools) ⚠️ *experimental*
- [x] Web UI for browsing memories
- [ ] VS Code extension for Cursor (better session detection)
- [ ] OpenCode hooks (when/if supported upstream)

> **Note:** The OpenCode and Cursor adapters are experimental and untested in production environments. They were developed based on each tool's MCP documentation. Community feedback and testing are welcome!

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm run test

# Run tests (excluding slow embedding tests)
npm run test -- --exclude="**/embedding/**"
```

## Contributing

Contributions welcome! The project uses an adapter pattern, making it easy to add support for new AI coding tools.

## License

MIT - Copyright (c) 2026 ZodTTD LLC

See [LICENSE](LICENSE) for details.

---

Inspired by [Vannevar Bush's Memex](https://en.wikipedia.org/wiki/Memex) concept and built on learnings from the open-source projects of [supermemory](https://github.com/supermemoryai/supermemory) and [QMD](https://github.com/tobi/qmd).
