#!/usr/bin/env bash
# PostToolUse-hook (Edit|Write). Doet alleen iets als index.html is aangeraakt.
# 1. Syntaxcheck van het inline script (er is geen build-stap, dit is het enige vangnet).
# 2. Waarschuwt als index.html gewijzigd is maar sw.js niet: dan krijgen geïnstalleerde PWAs de update niet.
set -u
input=$(cat)
file=$(printf '%s' "$input" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).tool_input.file_path||"")}catch(e){}})')
case "$file" in *index.html) ;; *) exit 0;; esac
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -f index.html ] || exit 0

tmp="${TMPDIR:-/tmp}/donna-check-$$.js"
sed -n '/<script>/,/<\/script>/p' index.html | sed '1d;$d' > "$tmp"
if ! node --check "$tmp" 2>"$tmp.err"; then
  echo "Syntaxfout in het inline script van index.html (regelnummers tellen vanaf de <script>-tag):" >&2
  cat "$tmp.err" >&2
  rm -f "$tmp" "$tmp.err"
  exit 2
fi
rm -f "$tmp" "$tmp.err"

if [ -f sw.js ] && ! git diff --quiet HEAD -- index.html 2>/dev/null && git diff --quiet HEAD -- sw.js 2>/dev/null; then
  echo "index.html is gewijzigd maar CACHE in sw.js is niet gebumpt. Geïnstalleerde PWAs krijgen de nieuwe index.html anders niet. Verhoog het versienummer in 'var CACHE' in sw.js." >&2
  exit 2
fi
exit 0
