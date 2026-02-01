#!/bin/bash
# memextend npm publish script
# Copyright (c) 2026 ZodTTD LLC. MIT License.
#
# Usage: ./scripts/publish.sh [--dry-run]
#
# Prerequisites:
# 1. npm login (run: npm login)
# 2. Create @memextend organization on npmjs.com
# 3. All tests passing (npm test)
# 4. Clean git working directory

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

DRY_RUN=""
if [ "$1" = "--dry-run" ]; then
    DRY_RUN="--dry-run"
    echo -e "${YELLOW}DRY RUN MODE - No packages will be published${NC}"
    echo ""
fi

echo -e "${CYAN}╔═══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     memextend npm publish script      ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════╝${NC}"
echo ""

# Check if logged into npm
echo -e "${CYAN}Checking npm authentication...${NC}"
NPM_USER=$(npm whoami 2>/dev/null || echo "")
if [ -z "$NPM_USER" ]; then
    echo -e "${RED}Error: Not logged into npm. Run 'npm login' first.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Logged in as: $NPM_USER${NC}"
echo ""

# Check for clean git state
echo -e "${CYAN}Checking git state...${NC}"
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}Warning: Git working directory is not clean.${NC}"
    echo "  Uncommitted changes may not be included in published packages."
    read -p "  Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Aborted.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ Git working directory is clean${NC}"
fi
echo ""

# Run tests
echo -e "${CYAN}Running tests...${NC}"
npm test || {
    echo -e "${RED}Tests failed. Fix tests before publishing.${NC}"
    exit 1
}
echo -e "${GREEN}✓ All tests passed${NC}"
echo ""

# Build all packages
echo -e "${CYAN}Building all packages...${NC}"
npm run build
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

# Publish order matters due to dependencies
# 1. @memextend/core (no deps on other memextend packages)
# 2. @memextend/claude-code, @memextend/opencode, @memextend/cursor (depend on core)
# 3. @memextend/webui (depends on core)
# 4. memextend CLI (depends on core, claude-code, webui)

echo -e "${CYAN}Publishing packages in dependency order...${NC}"
echo ""

# 1. Core
echo -e "${YELLOW}Publishing @memextend/core...${NC}"
cd packages/core
npm publish $DRY_RUN
cd ../..
echo -e "${GREEN}✓ @memextend/core published${NC}"
echo ""

# 2. Adapters (can be parallel, but doing sequential for clarity)
echo -e "${YELLOW}Publishing @memextend/claude-code...${NC}"
cd packages/adapters/claude-code
npm publish $DRY_RUN
cd ../../..
echo -e "${GREEN}✓ @memextend/claude-code published${NC}"
echo ""

echo -e "${YELLOW}Publishing @memextend/opencode...${NC}"
cd packages/adapters/opencode
npm publish $DRY_RUN
cd ../../..
echo -e "${GREEN}✓ @memextend/opencode published${NC}"
echo ""

echo -e "${YELLOW}Publishing @memextend/cursor...${NC}"
cd packages/adapters/cursor
npm publish $DRY_RUN
cd ../../..
echo -e "${GREEN}✓ @memextend/cursor published${NC}"
echo ""

# 3. WebUI
echo -e "${YELLOW}Publishing @memextend/webui...${NC}"
cd apps/webui
npm publish $DRY_RUN
cd ../..
echo -e "${GREEN}✓ @memextend/webui published${NC}"
echo ""

# 4. CLI (main package)
echo -e "${YELLOW}Publishing memextend CLI...${NC}"
cd apps/cli
npm publish $DRY_RUN
cd ../..
echo -e "${GREEN}✓ memextend published${NC}"
echo ""

echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     All packages published!           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""
echo "Users can now install with:"
echo -e "  ${CYAN}npm install -g memextend${NC}"
echo ""
echo "Or use npx:"
echo -e "  ${CYAN}npx memextend init${NC}"
echo ""
