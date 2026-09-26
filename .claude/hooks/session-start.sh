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

# Server starten (alleen loopback: sleutels van de gebruiker mogen niet vanaf het netwerk bereikbaar zijn)
if ! omniroute health >/dev/null 2>&1; then
  OMNIROUTE_SERVER_HOST=127.0.0.1 omniroute serve --daemon --no-open >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do
    omniroute health >/dev/null 2>&1 && break
    sleep 1
  done
fi

# Providers aanmaken uit de environment-secrets; sleutel gaat via stdin, nooit via argv of logs
bestaand="$(omniroute providers list 2>/dev/null || true)"
for provider in openai gemini openrouter groq; do
  var="$(printf '%s' "$provider" | tr '[:lower:]' '[:upper:]')_API_KEY"
  sleutel="${!var:-}"
  [ -z "$sleutel" ] && continue
  printf '%s' "$bestaand" | grep -q "[[:space:]]$provider[[:space:]]" && continue
  printf '%s' "$sleutel" | omniroute providers add "$provider" --credential-stdin >/dev/null 2>&1 || true
done

echo "$(graphify --version 2>/dev/null | tail -1), omniroute $(omniroute -v 2>/dev/null | tail -1), providers: $(omniroute providers list 2>/dev/null | grep -c active || echo 0)"
