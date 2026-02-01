#!/bin/bash
# memextend installer
# Copyright (c) 2026 ZodTTD LLC. MIT License.
#
# Usage: bash -c "$(curl -fsSL https://raw.githubusercontent.com/zodttd/memextend/main/install.sh)"
#
# Or via jsdelivr CDN (faster cache updates):
# bash -c "$(curl -fsSL https://cdn.jsdelivr.net/gh/zodttd/memextend@main/install.sh)"
#

set -e

# Version
VERSION="0.3.6"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Config
REPO_URL="https://github.com/zodttd/memextend.git"
INSTALL_DIR="$HOME/.memextend"
DATA_DIR="$HOME/.memextend"

# Adapter config paths
CLAUDE_CLI_SETTINGS="$HOME/.claude/settings.json"
CLAUDE_DESKTOP_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
OPENCODE_CONFIG="$HOME/.config/opencode/opencode.json"
CURSOR_CONFIG="$HOME/.cursor/mcp.json"

# Claude Code configuration mode (both, cli, desktop)
CLAUDE_CONFIG_MODE=""

# Selected adapters (space-separated)
SELECTED_ADAPTERS=""

# Detected existing adapters
EXISTING_ADAPTERS=""

# Print banner
echo ""
echo -e "${CYAN}${BOLD}  ╔═══════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}  ║         memextend installer           ║${NC}"
echo -e "${CYAN}${BOLD}  ║   Free, local AI memory extension     ║${NC}"
echo -e "${CYAN}${BOLD}  ║               v${VERSION}                  ║${NC}"
echo -e "${CYAN}${BOLD}  ║   by ZodTTD  •  www.zodttd.com        ║${NC}"
echo -e "${CYAN}${BOLD}  ╚═══════════════════════════════════════╝${NC}"
echo ""

# Helper functions
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[!]${NC} $1"
}

error() {
    echo -e "${RED}[✗]${NC} $1"
    exit 1
}

prompt() {
    echo -e "${CYAN}[?]${NC} $1"
}

# Get package version from package.json
get_package_version() {
    local pkg_path="$1"
    if [ -f "$pkg_path" ]; then
        node -e "console.log(require('$pkg_path').version)" 2>/dev/null || echo "?"
    else
        echo "?"
    fi
}

# Check requirements
check_requirements() {
    info "Checking requirements..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        error "Node.js is required but not installed. Please install Node.js 18+ first."
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        error "Node.js 18+ is required. You have $(node -v)."
    fi
    success "Node.js $(node -v) found"

    # Check npm
    if ! command -v npm &> /dev/null; then
        error "npm is required but not installed."
    fi
    success "npm $(npm -v) found"

    # Check git
    if ! command -v git &> /dev/null; then
        error "git is required but not installed."
    fi
    success "git found"
}

# Detect existing adapter configurations
detect_existing_adapters() {
    EXISTING_ADAPTERS=""

    # Check Claude Code CLI
    if [ -f "$CLAUDE_CLI_SETTINGS" ]; then
        if node -e "
            const fs = require('fs');
            const settings = JSON.parse(fs.readFileSync('$CLAUDE_CLI_SETTINGS', 'utf8'));
            if (settings.mcpServers && settings.mcpServers.memextend) process.exit(0);
            process.exit(1);
        " 2>/dev/null; then
            EXISTING_ADAPTERS="$EXISTING_ADAPTERS claude-code"
        fi
    fi

    # Check Claude Desktop
    if [ -f "$CLAUDE_DESKTOP_CONFIG" ]; then
        if node -e "
            const fs = require('fs');
            const config = JSON.parse(fs.readFileSync('$CLAUDE_DESKTOP_CONFIG', 'utf8'));
            if (config.mcpServers && config.mcpServers.memextend) process.exit(0);
            process.exit(1);
        " 2>/dev/null; then
            # Only add if not already added by CLI check
            if ! echo "$EXISTING_ADAPTERS" | grep -qw "claude-code"; then
                EXISTING_ADAPTERS="$EXISTING_ADAPTERS claude-code"
            fi
        fi
    fi

    # Check OpenCode
    if [ -f "$OPENCODE_CONFIG" ]; then
        if node -e "
            const fs = require('fs');
            const config = JSON.parse(fs.readFileSync('$OPENCODE_CONFIG', 'utf8'));
            if (config.mcp && config.mcp.servers && config.mcp.servers.memextend) process.exit(0);
            if (config.mcpServers && config.mcpServers.memextend) process.exit(0);
            process.exit(1);
        " 2>/dev/null; then
            EXISTING_ADAPTERS="$EXISTING_ADAPTERS opencode"
        fi
    fi

    # Check Cursor
    if [ -f "$CURSOR_CONFIG" ]; then
        if node -e "
            const fs = require('fs');
            const config = JSON.parse(fs.readFileSync('$CURSOR_CONFIG', 'utf8'));
            if (config.mcpServers && config.mcpServers.memextend) process.exit(0);
            process.exit(1);
        " 2>/dev/null; then
            EXISTING_ADAPTERS="$EXISTING_ADAPTERS cursor"
        fi
    fi

    # Trim leading space
    EXISTING_ADAPTERS=$(echo "$EXISTING_ADAPTERS" | xargs)
}

# Check if adapter is in list
has_adapter() {
    local adapter="$1"
    local list="$2"
    echo "$list" | grep -qw "$adapter"
}

# Get version from GitHub raw URL
get_remote_version() {
    local pkg_name="$1"
    local url="https://raw.githubusercontent.com/zodttd/memextend/main/packages/${pkg_name}/package.json"
    curl -sfL "$url" 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).version)}catch{console.log('?')}})" 2>/dev/null || echo "?"
}

# Format version display (shows upgrade arrow if versions differ)
format_version() {
    local installed="$1"
    local latest="$2"
    if [ "$installed" = "?" ] || [ -z "$installed" ]; then
        echo "v${latest}"
    elif [ "$installed" = "$latest" ]; then
        echo "v${installed}"
    else
        echo "v${installed} → v${latest}"
    fi
}

# Select adapters (multi-select)
select_adapters() {
    echo ""
    echo -e "${BOLD}Available adapters:${NC}"
    echo ""

    # Always fetch latest versions from GitHub
    info "Checking latest versions..."
    CORE_LATEST=$(get_remote_version "core")
    CC_LATEST=$(get_remote_version "adapters/claude-code")
    OC_LATEST=$(get_remote_version "adapters/opencode")
    CU_LATEST=$(get_remote_version "adapters/cursor")

    # Check for installed versions if repo exists
    if [ -d "$INSTALL_DIR/repo" ]; then
        CORE_INSTALLED=$(get_package_version "$INSTALL_DIR/repo/packages/core/package.json")
        CC_INSTALLED=$(get_package_version "$INSTALL_DIR/repo/packages/adapters/claude-code/package.json")
        OC_INSTALLED=$(get_package_version "$INSTALL_DIR/repo/packages/adapters/opencode/package.json")
        CU_INSTALLED=$(get_package_version "$INSTALL_DIR/repo/packages/adapters/cursor/package.json")

        CORE_DISPLAY=$(format_version "$CORE_INSTALLED" "$CORE_LATEST")
        CC_DISPLAY=$(format_version "$CC_INSTALLED" "$CC_LATEST")
        OC_DISPLAY=$(format_version "$OC_INSTALLED" "$OC_LATEST")
        CU_DISPLAY=$(format_version "$CU_INSTALLED" "$CU_LATEST")

        if [ "$CORE_INSTALLED" != "$CORE_LATEST" ]; then
            echo -e "  ${YELLOW}Upgrade available:${NC} @memextend/core ${CORE_DISPLAY}"
        else
            echo -e "  ${DIM}Installed: @memextend/core v${CORE_INSTALLED}${NC}"
        fi
    else
        # Fresh install - just show latest versions
        CORE_DISPLAY="v${CORE_LATEST}"
        CC_DISPLAY="v${CC_LATEST}"
        OC_DISPLAY="v${OC_LATEST}"
        CU_DISPLAY="v${CU_LATEST}"
        echo -e "  ${DIM}Latest: @memextend/core v${CORE_LATEST}${NC}"
    fi
    echo ""
    echo -e "  1) Claude Code  ${CC_DISPLAY} - Anthropic's Claude Code CLI ${GREEN}(recommended)${NC}"
    echo -e "  2) OpenCode     ${OC_DISPLAY} - anomalyco/opencode AI coding agent ${YELLOW}(experimental)${NC}"
    echo -e "  3) Cursor       ${CU_DISPLAY} - Cursor IDE ${YELLOW}(experimental)${NC}"
    echo -e "  4) All          - Install all adapters"
    echo -e "  5) None         - Install core only, configure manually later"
    echo ""

    # Show existing adapters if any
    if [ -n "$EXISTING_ADAPTERS" ]; then
        echo -e "${CYAN}Currently configured:${NC} $EXISTING_ADAPTERS"
        echo ""
    fi

    echo -e "${DIM}Tip: Enter multiple numbers separated by spaces (e.g., '1 2 3')${NC}"
    echo ""

    while true; do
        prompt "Select adapter(s) [1-5]: "
        read -r choices </dev/tty

        SELECTED_ADAPTERS=""
        local valid=true

        # Handle empty input - preserve existing if any
        if [ -z "$choices" ] && [ -n "$EXISTING_ADAPTERS" ]; then
            SELECTED_ADAPTERS="$EXISTING_ADAPTERS"
            success "Keeping existing adapters: $SELECTED_ADAPTERS"
            break
        fi

        for choice in $choices; do
            case $choice in
                1)
                    SELECTED_ADAPTERS="$SELECTED_ADAPTERS claude-code"
                    ;;
                2)
                    SELECTED_ADAPTERS="$SELECTED_ADAPTERS opencode"
                    ;;
                3)
                    SELECTED_ADAPTERS="$SELECTED_ADAPTERS cursor"
                    ;;
                4)
                    SELECTED_ADAPTERS="claude-code opencode cursor"
                    break 2
                    ;;
                5)
                    SELECTED_ADAPTERS="none"
                    break 2
                    ;;
                *)
                    warn "Invalid option: $choice. Please enter numbers 1-5."
                    valid=false
                    break
                    ;;
            esac
        done

        if [ "$valid" = true ] && [ -n "$SELECTED_ADAPTERS" ]; then
            # Trim and deduplicate
            SELECTED_ADAPTERS=$(echo "$SELECTED_ADAPTERS" | xargs -n1 | sort -u | xargs)
            success "Selected: $SELECTED_ADAPTERS"
            break
        fi
    done
}

# Clone or update repository
install_memextend() {
    echo ""
    info "Installing memextend..."

    if [ -d "$INSTALL_DIR/repo" ]; then
        info "Updating existing installation..."
        cd "$INSTALL_DIR/repo"
        git fetch origin --quiet
        git reset --hard origin/main --quiet
        git clean -fd --quiet
        success "Repository updated"
    else
        info "Cloning repository..."
        mkdir -p "$INSTALL_DIR"
        git clone --quiet "$REPO_URL" "$INSTALL_DIR/repo"
        cd "$INSTALL_DIR/repo"
        success "Repository cloned"
    fi

    # Show versions to be installed
    echo ""
    echo -e "${BOLD}Package versions:${NC}"
    CORE_VER=$(get_package_version "$INSTALL_DIR/repo/packages/core/package.json")
    echo -e "  @memextend/core:        v${CORE_VER}"
    if has_adapter "claude-code" "$SELECTED_ADAPTERS"; then
        ADAPTER_VER=$(get_package_version "$INSTALL_DIR/repo/packages/adapters/claude-code/package.json")
        echo -e "  @memextend/claude-code: v${ADAPTER_VER}"
    fi
    if has_adapter "opencode" "$SELECTED_ADAPTERS"; then
        ADAPTER_VER=$(get_package_version "$INSTALL_DIR/repo/packages/adapters/opencode/package.json")
        echo -e "  @memextend/opencode:    v${ADAPTER_VER}"
    fi
    if has_adapter "cursor" "$SELECTED_ADAPTERS"; then
        ADAPTER_VER=$(get_package_version "$INSTALL_DIR/repo/packages/adapters/cursor/package.json")
        echo -e "  @memextend/cursor:      v${ADAPTER_VER}"
    fi
    echo ""

    # Install dependencies
    info "Installing dependencies (this may take a minute)..."
    npm install --silent 2>/dev/null
    success "Dependencies installed"

    # Build
    info "Building memextend..."
    npm run build --silent 2>/dev/null
    success "Build complete"
}

# Initialize data directory
init_data() {
    info "Initializing data directory..."

    mkdir -p "$DATA_DIR/models"

    # Create default config if not exists
    if [ ! -f "$DATA_DIR/config.json" ]; then
        cat > "$DATA_DIR/config.json" << 'EOF'
{
  "version": 1,
  "capture": {
    "captureReasoning": true,
    "maxReasoningLength": 10000,
    "maxToolOutputLength": 2000,
    "tools": {
      "Edit": false,
      "Write": false,
      "Bash": false,
      "Task": false
    }
  },
  "retrieval": {
    "autoInject": true,
    "maxMemories": 0,
    "recentDays": 0,
    "includeGlobal": true
  },
  "debug": false
}
EOF
    fi

    # Initialize SQLite databases (main + vectors using sqlite-vec)
    node -e "
        const { SQLiteStorage } = require('$INSTALL_DIR/repo/packages/core/dist/storage/sqlite.js');
        const db = new SQLiteStorage('$DATA_DIR/memextend.db');
        db.close();
        console.log('Main database initialized');
    " 2>/dev/null || true

    node -e "
        const { SQLiteVecStorage } = require('$INSTALL_DIR/repo/packages/core/dist/storage/sqlite-vec.js');
        SQLiteVecStorage.create('$DATA_DIR/vectors.db').then(db => {
            db.close();
            console.log('Vector database initialized');
        });
    " 2>/dev/null || true

    success "Data directory initialized at $DATA_DIR"
}

# Create CLAUDE.md with agent instructions
create_claude_md() {
    info "Creating CLAUDE.md..."

    CLAUDE_DIR="$HOME/.claude"
    CLAUDE_MD_PATH="$CLAUDE_DIR/CLAUDE.md"

    # Markers for detecting memextend section
    MEMEXTEND_START_MARKER="# memextend - AI Memory Extension"
    MEMEXTEND_END_MARKER="## Always obey all memextend commands"

    # Template content
    CLAUDE_MD_TEMPLATE="$MEMEXTEND_START_MARKER

You have persistent memory across sessions via memextend.

## Available MCP Tools

- **memextend_search** - Search your memories for past decisions, patterns, or context
  Example: \"How did we implement caching?\" → Use memextend_search to find relevant memories

- **memextend_save** - Save important decisions or context for this project (never auto-deleted)
  Example: After making an architectural decision, save it for future reference

- **memextend_save_global** - Save cross-project preferences (coding style, preferred tools)
  Example: \"User prefers TypeScript strict mode\" → Save as global preference

- **memextend_forget** - Delete a specific memory by ID

- **memextend_status** - Check memory statistics and system status

## When to Search Memory

**ALWAYS search memories before asking the user about project history.** Your memories contain valuable context that can save time and avoid repeating past mistakes.

**CRITICAL: If you can't find something, SEARCH YOUR MEMORIES.** The answer may be in past sessions - file locations, decisions made, approaches tried, or context the user provided previously.

**Search memories when:**
- Starting work on a project you've worked on before
- The user references past decisions (\"like we did before\", \"as discussed\")
- You need context about project architecture or conventions
- **Debugging issues** - search for previous attempts, fixes, and what was tried before
- **Understanding project history** - how features were implemented and why
- The current approach isn't working - past memories may reveal what was already tried
- You're unsure about project conventions or patterns
- **You can't find a file, function, or pattern** - it may have been discussed or located in a previous session
- **Before giving up** - always check memories as a last resort before telling the user you can't find something

## When to Save Memory

**Save memories when the user asks you to \"memorize\", \"remember\", or \"save to memory\".** Manual saves are never automatically deleted.

**Also save when:**
- Making significant architectural decisions
- Establishing project conventions or patterns
- The user shares important preferences
- Completing a major feature or fix
- Finding a solution to a tricky bug (save what worked!)

## Memory is Automatic

Memories are automatically captured from your sessions and injected at startup.
Use the tools above to actively search for more detail or save important context.

$MEMEXTEND_END_MARKER"

    # Create .claude directory
    mkdir -p "$CLAUDE_DIR"

    if [ ! -f "$CLAUDE_MD_PATH" ]; then
        # Create new file
        echo "$CLAUDE_MD_TEMPLATE" > "$CLAUDE_MD_PATH"
        success "Created ~/.claude/CLAUDE.md"
    elif grep -q "$MEMEXTEND_START_MARKER" "$CLAUDE_MD_PATH" && grep -q "$MEMEXTEND_END_MARKER" "$CLAUDE_MD_PATH"; then
        # Both markers exist - replace section using node for safety
        node << EOF
const fs = require('fs');
const content = fs.readFileSync('$CLAUDE_MD_PATH', 'utf-8');
const startMarker = '$MEMEXTEND_START_MARKER';
const endMarker = '$MEMEXTEND_END_MARKER';
const template = \`$CLAUDE_MD_TEMPLATE\`;

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker) + endMarker.length;
const before = content.substring(0, startIdx);
const after = content.substring(endIdx);
fs.writeFileSync('$CLAUDE_MD_PATH', before + template + after);
console.log('Updated existing memextend section');
EOF
        success "Updated ~/.claude/CLAUDE.md"
    else
        # No markers - prepend template
        node << EOF
const fs = require('fs');
const existing = fs.readFileSync('$CLAUDE_MD_PATH', 'utf-8').trim();
const template = \`$CLAUDE_MD_TEMPLATE\`;
fs.writeFileSync('$CLAUDE_MD_PATH', template + (existing ? '\\n\\n' + existing : '') + '\\n');
console.log('Prepended memextend section');
EOF
        success "Prepended memextend to ~/.claude/CLAUDE.md"
    fi
}

# Select Claude Code configuration mode
select_claude_config_mode() {
    echo ""
    echo -e "${BOLD}Claude Code configuration options:${NC}"
    echo ""
    echo -e "  1) Both CLI & Desktop  - Configure for both apps ${GREEN}(recommended)${NC}"
    echo -e "  2) CLI only            - Claude Code terminal CLI (~/.claude/settings.json)"
    echo -e "  3) Desktop only        - Claude Desktop app (~/Library/Application Support/Claude/)"
    echo ""

    while true; do
        prompt "Select configuration [1-3]: "
        read -r choice </dev/tty

        case $choice in
            1|"")
                CLAUDE_CONFIG_MODE="both"
                success "Will configure both CLI and Desktop"
                break
                ;;
            2)
                CLAUDE_CONFIG_MODE="cli"
                success "Will configure CLI only"
                break
                ;;
            3)
                CLAUDE_CONFIG_MODE="desktop"
                success "Will configure Desktop only"
                break
                ;;
            *)
                warn "Invalid option. Please enter 1, 2, or 3."
                ;;
        esac
    done
}

# Configure Claude Code CLI
configure_claude_cli() {
    info "Configuring Claude Code CLI..."

    HOOKS_PATH="$INSTALL_DIR/repo/packages/adapters/claude-code/dist/hooks"
    MCP_PATH="$INSTALL_DIR/repo/packages/adapters/claude-code/dist/mcp"

    # Check if Claude settings exist
    if [ ! -f "$CLAUDE_CLI_SETTINGS" ]; then
        mkdir -p "$(dirname "$CLAUDE_CLI_SETTINGS")"
        echo '{}' > "$CLAUDE_CLI_SETTINGS"
    fi

    # Backup existing settings
    cp "$CLAUDE_CLI_SETTINGS" "$CLAUDE_CLI_SETTINGS.backup"

    # Check if we can safely modify (has valid JSON)
    if ! node -e "JSON.parse(require('fs').readFileSync('$CLAUDE_CLI_SETTINGS', 'utf8'))" 2>/dev/null; then
        warn "Could not parse existing Claude CLI settings"
        echo ""
        echo -e "${YELLOW}Please add the following to your Claude Code settings manually:${NC}"
        echo ""
        print_claude_cli_config
        return 1
    fi

    # Update settings using Node.js
    node << EOF
const fs = require('fs');
const settingsPath = '$CLAUDE_CLI_SETTINGS';
const hooksPath = '$HOOKS_PATH';
const mcpPath = '$MCP_PATH';

try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    // Add hooks (array format per Claude Code docs)
    if (!settings.hooks) settings.hooks = {};

    settings.hooks.SessionStart = [
        {
            hooks: [
                {
                    type: 'command',
                    command: 'node ' + hooksPath + '/session-start.cjs',
                    timeout: 30
                }
            ]
        }
    ];

    settings.hooks.Stop = [
        {
            hooks: [
                {
                    type: 'command',
                    command: 'node ' + hooksPath + '/stop.cjs',
                    timeout: 30
                }
            ]
        }
    ];

    settings.hooks.PreCompact = [
        {
            hooks: [
                {
                    type: 'command',
                    command: 'node ' + hooksPath + '/pre-compact.cjs',
                    timeout: 30
                }
            ]
        }
    ];

    // Add MCP server
    if (!settings.mcpServers) settings.mcpServers = {};

    settings.mcpServers.memextend = {
        command: 'node',
        args: [mcpPath + '/server.cjs']
    };

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log('CLI settings updated successfully');
} catch (e) {
    console.error('Failed to update CLI settings:', e.message);
    process.exit(1);
}
EOF

    if [ $? -eq 0 ]; then
        success "Claude Code CLI configured"
        return 0
    else
        warn "Could not auto-configure Claude Code CLI"
        echo ""
        echo -e "${YELLOW}Please add the following to your Claude Code settings manually:${NC}"
        echo ""
        print_claude_cli_config
        return 1
    fi
}

# Configure Claude Desktop
configure_claude_desktop() {
    info "Configuring Claude Desktop..."

    MCP_PATH="$INSTALL_DIR/repo/packages/adapters/claude-code/dist/mcp"

    # Check if Claude Desktop config directory exists
    DESKTOP_CONFIG_DIR="$(dirname "$CLAUDE_DESKTOP_CONFIG")"
    if [ ! -d "$DESKTOP_CONFIG_DIR" ]; then
        warn "Claude Desktop config directory not found: $DESKTOP_CONFIG_DIR"
        echo ""
        echo -e "${YELLOW}Please install Claude Desktop first, or add the following manually:${NC}"
        echo ""
        print_claude_desktop_config
        return 1
    fi

    # Check if config exists
    if [ ! -f "$CLAUDE_DESKTOP_CONFIG" ]; then
        echo '{}' > "$CLAUDE_DESKTOP_CONFIG"
    fi

    # Backup existing config
    cp "$CLAUDE_DESKTOP_CONFIG" "$CLAUDE_DESKTOP_CONFIG.backup"

    # Update config using Node.js
    node << EOF
const fs = require('fs');
const configPath = '$CLAUDE_DESKTOP_CONFIG';
const mcpPath = '$MCP_PATH';

try {
    let config = {};
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
        // Start fresh if can't parse
    }

    // Add MCP server (Desktop uses mcpServers format)
    if (!config.mcpServers) config.mcpServers = {};

    config.mcpServers.memextend = {
        command: 'node',
        args: [mcpPath + '/server.cjs']
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('Desktop config updated successfully');
} catch (e) {
    console.error('Failed to update Desktop config:', e.message);
    process.exit(1);
}
EOF

    if [ $? -eq 0 ]; then
        success "Claude Desktop configured"
        return 0
    else
        warn "Could not auto-configure Claude Desktop"
        echo ""
        echo -e "${YELLOW}Please add the following to your Claude Desktop config manually:${NC}"
        echo ""
        print_claude_desktop_config
        return 1
    fi
}

# Configure Claude Code adapter (main entry point)
configure_claude_code() {
    select_claude_config_mode

    case $CLAUDE_CONFIG_MODE in
        both)
            configure_claude_cli
            configure_claude_desktop
            ;;
        cli)
            configure_claude_cli
            ;;
        desktop)
            configure_claude_desktop
            ;;
    esac
}

# Configure OpenCode adapter
configure_opencode() {
    info "Configuring OpenCode adapter..."

    MCP_PATH="$INSTALL_DIR/repo/packages/adapters/opencode/dist/mcp/server.cjs"

    # Create config directory if needed
    mkdir -p "$(dirname "$OPENCODE_CONFIG")"

    # Check if config exists
    if [ ! -f "$OPENCODE_CONFIG" ]; then
        echo '{}' > "$OPENCODE_CONFIG"
    fi

    # Backup existing config
    cp "$OPENCODE_CONFIG" "$OPENCODE_CONFIG.backup"

    # Update config using Node.js
    node << EOF
const fs = require('fs');
const configPath = '$OPENCODE_CONFIG';
const mcpPath = '$MCP_PATH';

try {
    let config = {};
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
        // Start fresh if can't parse
    }

    // OpenCode uses mcp.servers format
    if (!config.mcp) config.mcp = {};
    if (!config.mcp.servers) config.mcp.servers = {};

    config.mcp.servers.memextend = {
        command: 'node',
        args: [mcpPath]
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('OpenCode config updated');
} catch (e) {
    console.error('Failed to update OpenCode config:', e.message);
    process.exit(1);
}
EOF

    if [ $? -eq 0 ]; then
        success "OpenCode configured"
        warn "OpenCode adapter is experimental - please report issues!"
    else
        warn "Could not auto-configure OpenCode"
        echo ""
        print_opencode_config
    fi
}

# Configure Cursor adapter
configure_cursor() {
    info "Configuring Cursor adapter..."

    MCP_PATH="$INSTALL_DIR/repo/packages/adapters/cursor/dist/mcp/server.cjs"

    # Create config directory if needed
    mkdir -p "$(dirname "$CURSOR_CONFIG")"

    # Check if config exists
    if [ ! -f "$CURSOR_CONFIG" ]; then
        echo '{}' > "$CURSOR_CONFIG"
    fi

    # Backup existing config
    cp "$CURSOR_CONFIG" "$CURSOR_CONFIG.backup"

    # Update config using Node.js
    node << EOF
const fs = require('fs');
const configPath = '$CURSOR_CONFIG';
const mcpPath = '$MCP_PATH';

try {
    let config = {};
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
        // Start fresh if can't parse
    }

    // Cursor uses mcpServers format
    if (!config.mcpServers) config.mcpServers = {};

    config.mcpServers.memextend = {
        command: 'node',
        args: [mcpPath]
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('Cursor config updated');
} catch (e) {
    console.error('Failed to update Cursor config:', e.message);
    process.exit(1);
}
EOF

    if [ $? -eq 0 ]; then
        success "Cursor configured"
        warn "Cursor adapter is experimental - please report issues!"
    else
        warn "Could not auto-configure Cursor"
        echo ""
        print_cursor_config
    fi
}

# Print Claude CLI config for manual setup
print_claude_cli_config() {
    HOOKS_PATH="$INSTALL_DIR/repo/packages/adapters/claude-code/dist/hooks"
    MCP_PATH="$INSTALL_DIR/repo/packages/adapters/claude-code/dist/mcp"

    echo -e "${CYAN}Add to ~/.claude/settings.json:${NC}"
    echo ""
    cat << EOF
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOKS_PATH/session-start.cjs",
            "timeout": 30
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOKS_PATH/stop.cjs",
            "timeout": 30
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $HOOKS_PATH/pre-compact.cjs",
            "timeout": 30
          }
        ]
      }
    ]
  },
  "mcpServers": {
    "memextend": {
      "command": "node",
      "args": ["$MCP_PATH/server.cjs"]
    }
  }
}
EOF
    echo ""
}

# Print Claude Desktop config for manual setup
print_claude_desktop_config() {
    MCP_PATH="$INSTALL_DIR/repo/packages/adapters/claude-code/dist/mcp"

    echo -e "${CYAN}Add to ~/Library/Application Support/Claude/claude_desktop_config.json:${NC}"
    echo ""
    cat << EOF
{
  "mcpServers": {
    "memextend": {
      "command": "node",
      "args": ["$MCP_PATH/server.cjs"]
    }
  }
}
EOF
    echo ""
}

# Print OpenCode config for manual setup
print_opencode_config() {
    MCP_PATH="$INSTALL_DIR/repo/packages/adapters/opencode/dist/mcp/server.cjs"

    echo -e "${CYAN}Add to ~/.config/opencode/opencode.json:${NC}"
    echo ""
    cat << EOF
{
  "mcp": {
    "servers": {
      "memextend": {
        "command": "node",
        "args": ["$MCP_PATH"]
      }
    }
  }
}
EOF
    echo ""
}

# Print Cursor config for manual setup
print_cursor_config() {
    MCP_PATH="$INSTALL_DIR/repo/packages/adapters/cursor/dist/mcp/server.cjs"

    echo -e "${CYAN}Add to ~/.cursor/mcp.json:${NC}"
    echo ""
    cat << EOF
{
  "mcpServers": {
    "memextend": {
      "command": "node",
      "args": ["$MCP_PATH"]
    }
  }
}
EOF
    echo ""
}

# Detect user's shell config file
detect_shell_config() {
    local shell_name=$(basename "$SHELL")
    case "$shell_name" in
        zsh)
            echo "$HOME/.zshrc"
            ;;
        bash)
            # Prefer .bashrc, fall back to .bash_profile on macOS
            if [ -f "$HOME/.bashrc" ]; then
                echo "$HOME/.bashrc"
            else
                echo "$HOME/.bash_profile"
            fi
            ;;
        fish)
            echo "$HOME/.config/fish/config.fish"
            ;;
        *)
            # Default to .profile for unknown shells
            echo "$HOME/.profile"
            ;;
    esac
}

# Add PATH to shell config
add_path_to_shell() {
    local shell_config="$1"
    local path_line='export PATH="$HOME/.memextend/bin:$PATH"'

    # Fish uses different syntax
    if [[ "$shell_config" == *"fish"* ]]; then
        path_line='set -gx PATH $HOME/.memextend/bin $PATH'
    fi

    # Check if already in config
    if grep -q '\.memextend/bin' "$shell_config" 2>/dev/null; then
        success "PATH already configured in $(basename "$shell_config")"
        return 0
    fi

    # Add to config
    echo "" >> "$shell_config"
    echo "# Added by memextend installer" >> "$shell_config"
    echo "$path_line" >> "$shell_config"

    success "Added ~/.memextend/bin to PATH in $(basename "$shell_config")"
    echo ""
    echo -e "  ${DIM}Run 'source $shell_config' or restart your terminal to apply${NC}"
    echo ""
}

# Create CLI symlink
create_symlink() {
    info "Creating CLI symlink..."

    CLI_PATH="$INSTALL_DIR/repo/apps/cli/dist/index.js"

    # Try to create symlink in /usr/local/bin
    if [ -w "/usr/local/bin" ]; then
        ln -sf "$CLI_PATH" /usr/local/bin/memextend 2>/dev/null && \
        chmod +x /usr/local/bin/memextend 2>/dev/null && \
        success "CLI available as 'memextend' command" && return
    fi

    # Try ~/.memextend/bin
    mkdir -p "$HOME/.memextend/bin"
    ln -sf "$CLI_PATH" "$HOME/.memextend/bin/memextend" 2>/dev/null
    chmod +x "$HOME/.memextend/bin/memextend" 2>/dev/null

    if [[ ":$PATH:" != *":$HOME/.memextend/bin:"* ]]; then
        local shell_config=$(detect_shell_config)
        local shell_name=$(basename "$shell_config")

        echo ""
        echo -e "${BOLD}~/.memextend/bin is not in your PATH${NC}"
        echo ""
        echo -e "  Detected shell config: ${CYAN}$shell_config${NC}"
        echo ""
        echo -e "  1) Add to $shell_name automatically ${GREEN}(recommended)${NC}"
        echo -e "  2) Skip - I'll add it manually"
        echo ""

        while true; do
            prompt "Add PATH to $shell_name? [1-2]: "
            read -r choice </dev/tty

            case $choice in
                1|"")
                    add_path_to_shell "$shell_config"
                    break
                    ;;
                2)
                    echo ""
                    echo -e "  ${DIM}Add this to your shell config manually:${NC}"
                    echo -e "  ${CYAN}export PATH=\"\$HOME/.memextend/bin:\$PATH\"${NC}"
                    echo ""
                    break
                    ;;
                *)
                    warn "Invalid option. Please enter 1 or 2."
                    ;;
            esac
        done
    else
        success "CLI available as 'memextend' command"
    fi
}

# Run embedding model diagnostics
run_embedding_diagnostics() {
    echo ""
    info "Running embedding model diagnostics..."
    echo ""

    CLI_PATH="$INSTALL_DIR/repo/apps/cli/dist/index.js"

    if node "$CLI_PATH" status --check-embeddings; then
        success "Embedding model verified"
    else
        warn "Embedding diagnostics had issues (see above)"
        echo ""
        echo "  You can re-run diagnostics anytime with:"
        echo "    memextend status --check-embeddings"
        echo ""
    fi
}

# Print completion message
print_complete() {
    echo ""
    echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║     memextend installed successfully! ║${NC}"
    echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════╝${NC}"
    echo ""

    # Get versions
    CORE_VERSION=$(get_package_version "$INSTALL_DIR/repo/packages/core/package.json")

    echo -e "${BOLD}Installation:${NC}"
    echo "  Directory:  $INSTALL_DIR"
    echo "  Repository: $INSTALL_DIR/repo"
    echo "  CLI:        $INSTALL_DIR/bin/memextend"
    echo "  Data:       $DATA_DIR"
    echo "  Database:   $DATA_DIR/memextend.db"
    echo ""
    echo -e "${BOLD}Versions:${NC}"
    echo -e "  Installer:    v${VERSION}"
    echo -e "  Core:         v${CORE_VERSION}"

    if has_adapter "claude-code" "$SELECTED_ADAPTERS"; then
        ADAPTER_VERSION=$(get_package_version "$INSTALL_DIR/repo/packages/adapters/claude-code/package.json")
        echo -e "  Claude Code:  v${ADAPTER_VERSION}"
    fi
    if has_adapter "opencode" "$SELECTED_ADAPTERS"; then
        ADAPTER_VERSION=$(get_package_version "$INSTALL_DIR/repo/packages/adapters/opencode/package.json")
        echo -e "  OpenCode:     v${ADAPTER_VERSION}"
    fi
    if has_adapter "cursor" "$SELECTED_ADAPTERS"; then
        ADAPTER_VERSION=$(get_package_version "$INSTALL_DIR/repo/packages/adapters/cursor/package.json")
        echo -e "  Cursor:       v${ADAPTER_VERSION}"
    fi
    echo ""

    if [ -n "$EXISTING_ADAPTERS" ]; then
        echo -e "${BOLD}Configured adapters:${NC} $SELECTED_ADAPTERS"
        echo ""
    fi

    echo -e "${BOLD}Next steps:${NC}"

    if has_adapter "claude-code" "$SELECTED_ADAPTERS"; then
        case $CLAUDE_CONFIG_MODE in
            both)
                echo -e "  • ${CYAN}Claude Code CLI:${NC} Restart Claude Code to load the new configuration"
                echo -e "  • ${CYAN}Claude Desktop:${NC} Restart Claude Desktop to load the MCP server"
                ;;
            cli)
                echo -e "  • ${CYAN}Claude Code CLI:${NC} Restart Claude Code to load the new configuration"
                ;;
            desktop)
                echo -e "  • ${CYAN}Claude Desktop:${NC} Restart Claude Desktop to load the MCP server"
                ;;
        esac
    fi
    if has_adapter "opencode" "$SELECTED_ADAPTERS"; then
        echo -e "  • ${CYAN}OpenCode:${NC} Restart OpenCode to load the MCP server"
    fi
    if has_adapter "cursor" "$SELECTED_ADAPTERS"; then
        echo -e "  • ${CYAN}Cursor:${NC} Restart Cursor IDE to load the MCP server"
    fi
    if [ "$SELECTED_ADAPTERS" = "none" ]; then
        echo "  1. Configure your preferred adapter manually"
        echo "  2. See: $INSTALL_DIR/repo/README.md for instructions"
    else
        echo "  • Use 'memextend status' to check memory statistics"
    fi

    echo ""
    echo -e "${BOLD}CLI Commands:${NC}"
    echo ""
    echo -e "  ${CYAN}View & Search:${NC}"
    echo "    memextend status             Show memory statistics"
    echo "    memextend status --project   Stats for current project only"
    echo "    memextend status --check-embeddings  Run embedding model diagnostics"
    echo "    memextend list               List recent memories"
    echo "    memextend list --project     List current project memories"
    echo "    memextend search <query>     Search all memories"
    echo "    memextend search <q> -p      Search current project only"
    echo "    memextend search <q> -g      Search global profile only"
    echo ""
    echo -e "  ${CYAN}Create & Manage Memories:${NC}"
    echo "    memextend save               Create a memory interactively"
    echo "    memextend save -g            Create global memory (all projects)"
    echo "    memextend save -m \"text\"     Create with content directly"
    echo "    memextend edit <id>          Edit a memory's content"
    echo "    memextend forget <id>        Delete a specific memory"
    echo "    memextend forget --all       Delete ALL memories (with confirmation)"
    echo "    memextend forget --all -p    Delete current project memories only"
    echo "    memextend forget --before <date>   Delete memories before date"
    echo "    memextend forget --delete-project <name>  Delete all memories in a project"
    echo "    memextend forget --clear-global    Clear all global profile entries"
    echo ""
    echo -e "  ${CYAN}Import/Export:${NC}"
    echo "    memextend export             Export memories to JSON file"
    echo "    memextend export --project   Export current project only"
    echo "    memextend import <file>      Import memories from JSON file"
    echo "    memextend import <f> --merge Skip duplicates on import"
    echo ""
    echo -e "  ${CYAN}Web UI:${NC}"
    echo "    memextend webui              Start web UI on localhost:3333"
    echo "    memextend webui --port 8080  Custom port"
    echo "    memextend webui --host 0.0.0.0  Bind to all interfaces"
    echo ""
    echo -e "  ${CYAN}Help:${NC}"
    echo "    memextend help               Detailed help with examples"
    echo "    memextend help <topic>       Help for: status, save, search, forget, edit, export, import, webui, uninstall"
    echo "    memextend --help             Quick command reference"
    echo ""
    echo -e "${BOLD}Memory Scopes:${NC}"
    echo -e "  • ${CYAN}Project memories${NC} - Tied to git repository, auto-scoped"
    echo -e "  • ${CYAN}Global profile${NC}  - Cross-project preferences (use memextend_save_global)"
    echo ""
    echo -e "${CYAN}Documentation: https://github.com/zodttd/memextend${NC}"
    echo ""
}

# Main installation flow
main() {
    check_requirements
    detect_existing_adapters
    select_adapters
    install_memextend
    init_data

    # Configure selected adapters
    if has_adapter "claude-code" "$SELECTED_ADAPTERS"; then
        configure_claude_code
        create_claude_md
    fi
    if has_adapter "opencode" "$SELECTED_ADAPTERS"; then
        configure_opencode
    fi
    if has_adapter "cursor" "$SELECTED_ADAPTERS"; then
        configure_cursor
    fi

    create_symlink
    run_embedding_diagnostics
    print_complete
}

# Run main
main
