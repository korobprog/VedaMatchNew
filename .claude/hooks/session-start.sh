#!/bin/bash
# Собирает MCP-сервер «Работы» в облачной сессии: dist не в git, а .mcp.json
# запускает apps/mcp/dist/index.js.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
if [ ! -f apps/mcp/dist/index.js ]; then
  pnpm install --frozen-lockfile
  pnpm --filter @vedamatch/mcp build
fi
