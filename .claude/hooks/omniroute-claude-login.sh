#!/bin/bash
# Claude (OAuth, abonnement) koppelen aan OmniRoute zonder browser op deze machine.
#
#   omniroute-claude-login.sh start          -> print de autorisatie-URL (open die in je eigen browser)
#   omniroute-claude-login.sh finish <code>  -> wissel de "Authentication Code" (xxxx#yyyy) in
#
# Na 'finish' staat de koppeling in OmniRoute en print het script de waarde voor de
# environment-secret OMNIROUTE_CLAUDE_OAUTH, zodat session-start.sh hem in nieuwe sessies herstelt.
set -euo pipefail

BASIS="http://127.0.0.1:20128"
STAAT="${OMNIROUTE_HOME:-$HOME/.omniroute}/.claude-oauth-state.json"
KOEKJES="${OMNIROUTE_HOME:-$HOME/.omniroute}/.cli-cookies"
WACHTWOORDBESTAND="${OMNIROUTE_HOME:-$HOME/.omniroute}/.admin-pass"

# Beheerlogin op OmniRoute: wachtwoord uit secret, anders uit bestand, anders nieuw aanmaken
inloggen() {
  local ww
  if [ -n "${OMNIROUTE_ADMIN_PASSWORD:-}" ]; then
    ww="$OMNIROUTE_ADMIN_PASSWORD"
  elif [ -f "$WACHTWOORDBESTAND" ]; then
    ww="$(cut -d= -f2 "$WACHTWOORDBESTAND")"
  else
    ww="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24)"
    (umask 077; printf 'OMNIROUTE_ADMIN_PASSWORD=%s\n' "$ww" > "$WACHTWOORDBESTAND")
  fi
  omniroute setup --password "$ww" --non-interactive >/dev/null 2>&1 || true
  rm -f "$KOEKJES"
  curl -sf -c "$KOEKJES" -b "$KOEKJES" -H 'Content-Type: application/json' \
    --data "$(python3 -c 'import json,sys;print(json.dumps({"password":sys.argv[1]}))' "$ww")" \
    "$BASIS/api/auth/login" >/dev/null
}

case "${1:-}" in
  start)
    omniroute health >/dev/null 2>&1 || { echo "OmniRoute draait niet; start hem eerst (omniroute serve --daemon --no-open)." >&2; exit 1; }
    inloggen
    (umask 077; curl -sf -c "$KOEKJES" -b "$KOEKJES" "$BASIS/api/oauth/claude/authorize" > "$STAAT")
    echo "Open deze URL in je eigen browser, log in en klik op Authorize:"
    echo
    python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["authUrl"])' "$STAAT"
    echo
    echo "Plak daarna de Authentication Code (xxxx#yyyy) via:  $0 finish '<code>'"
    ;;
  finish)
    code="${2:-}"
    [ -n "$code" ] || { echo "Gebruik: $0 finish '<code#state>'" >&2; exit 1; }
    [ -f "$STAAT" ] || { echo "Geen lopende autorisatie; draai eerst '$0 start'." >&2; exit 1; }
    inloggen
    antwoord="$(python3 - "$STAAT" "$code" <<'EOF'
import json,sys
s=json.load(open(sys.argv[1])); raw=sys.argv[2].strip()
code,_,state=raw.partition('#')
print(json.dumps({"code":code,"state":state or s.get("state"),"redirectUri":s["redirectUri"],"codeVerifier":s["codeVerifier"]}))
EOF
)"
    resultaat="$(curl -sf -c "$KOEKJES" -b "$KOEKJES" -H 'Content-Type: application/json' --data "$antwoord" "$BASIS/api/oauth/claude/exchange")"
    echo "$resultaat" | python3 -c 'import json,sys;d=json.load(sys.stdin);assert d.get("success"),d;print("Gekoppeld:",d["connection"].get("email"))'
    rm -f "$STAAT"
    echo
    echo "Zet deze waarde als environment-secret OMNIROUTE_CLAUDE_OAUTH (niet in de chat plakken):"
    python3 - <<'EOF'
import json,sqlite3,os
db=sqlite3.connect(os.path.expanduser(os.environ.get("OMNIROUTE_HOME","~/.omniroute"))+"/storage.sqlite")
r=db.execute("select access_token,refresh_token,email from provider_connections where provider='claude' and is_active=1 order by updated_at desc limit 1").fetchone()
print(json.dumps({"accessToken":r[0],"refreshToken":r[1],"email":r[2]},separators=(",",":")))
EOF
    ;;
  *)
    echo "Gebruik: $0 start | finish '<code#state>'" >&2; exit 1 ;;
esac
