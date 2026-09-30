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

# Claude (OAuth via abonnement) herstellen uit de secret OMNIROUTE_CLAUDE_OAUTH. Server daarna herstarten zodat hij de koppeling inlaadt.
# De CLI kent geen import voor OAuth-koppelingen; OmniRoute leest onversleutelde tokens gewoon in
# (decrypt() geeft waarden zonder enc:v1-prefix ongewijzigd terug). Opnieuw koppelen: omniroute-claude-login.sh
if [ -n "${OMNIROUTE_CLAUDE_OAUTH:-}" ]; then
  if python3 - <<'EOF'
import json, os, sqlite3, uuid, datetime
geheim = json.loads(os.environ["OMNIROUTE_CLAUDE_OAUTH"])
db = sqlite3.connect(os.path.expanduser("~/.omniroute/storage.sqlite"))
if not db.execute("select 1 from provider_connections where provider='claude' and is_active=1").fetchone():
    nu = datetime.datetime.utcnow().isoformat() + "Z"
    naam = geheim.get("email") or "claude"
    db.execute(
        "insert into provider_connections (id, provider, auth_type, name, email, display_name, priority, is_active,"
        " access_token, refresh_token, scope, token_type, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (str(uuid.uuid4()), "claude", "oauth", naam, naam, naam, 1, 1, geheim["accessToken"], geheim["refreshToken"],
         "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers", "Bearer", nu, nu))
    db.commit()
    raise SystemExit(0)
raise SystemExit(1)
EOF
  then
    omniroute restart --no-open >/dev/null 2>&1 || true
    for _ in $(seq 1 20); do omniroute health >/dev/null 2>&1 && break; sleep 1; done
  fi
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

echo "$(graphify --version 2>/dev/null | tail -1), omniroute $(omniroute -v 2>/dev/null | tail -1), providers: $(omniroute providers list 2>/dev/null | grep -cE '^[0-9a-f]{8} ' || echo 0)"
