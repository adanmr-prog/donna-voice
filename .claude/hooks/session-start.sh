#!/bin/bash
# SessionStart-hook: installeert graphify en OmniRoute in Claude Code on the web.
# De container is tijdelijk, dus zonder deze hook zijn beide tools in elke nieuwe sessie weg.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Graphify: codegraaf van de repo (pip-pakket heet graphifyy, commando heet graphify)
if ! command -v graphify >/dev/null 2>&1; then
  pip install -q graphifyy
fi
# Skill naar ~/.claude/skills/graphify en de graaf opbouwen (AST-only, geen API-sleutel nodig)
graphify install --platform claude >/dev/null 2>&1 || true
if [ ! -f "$CLAUDE_PROJECT_DIR/graphify-out/graph.json" ]; then
  (cd "$CLAUDE_PROJECT_DIR" && graphify update . >/dev/null 2>&1) || true
fi

# OmniRoute: lokale AI-router met OpenAI-compatibele API
if ! command -v omniroute >/dev/null 2>&1; then
  npm install -g --silent omniroute
fi

echo "$(graphify --version 2>/dev/null | tail -1), omniroute $(omniroute -v 2>/dev/null | tail -1)"
