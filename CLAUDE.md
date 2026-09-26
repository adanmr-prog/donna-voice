# Donna OS (donna-voice)

Persoonlijke "extern brein"-PWA: gesprek met Donna, spraakopname, taken, doelen, habits, timer, checklists. UI, code en commentaar zijn Nederlands.

## Structuur
- `index.html`: de volledige app (CSS + HTML + inline script in één bestand). Geen build-stap, geen bundler, geen npm-dependencies.
- `sw.js`: service worker met app-shell cache. De cache-naam `CACHE` moet bij elke release omhoog.
- `manifest.webmanifest` en de icon-PNG's: PWA-metadata.
- Backend: Google Apps Script web-app, niet in deze repo. Het contract staat in de skill `donna-backend-api`.

## Conventies
- Vanilla JS in ES5-stijl: `var`, `function`, geen arrow functions, `let/const`, template strings, classes of modules. Doel: iOS Safari als standalone PWA.
- Nederlandse namen voor functies, variabelen en commentaar (`laadTaken`, `wisselView`, `bezig`).
- Markeer inhoudelijke wijzigingen met een versiecommentaar: `// v4.3: korte reden`.
- Alle backend-calls via `run(fn, ...args)`. Nooit direct `fetch` naar `API`, nooit headers toevoegen (CORS-preflight faalt op Apps Script).
- `run()` toont zelf al een toast bij fouten. In `.catch` alleen de UI herstellen, niet opnieuw toasten.
- Alles wat van de backend of uit localStorage komt gaat door `esc()` of `md()` voordat het in `innerHTML` belandt.
- `localStorage` altijd in try/catch (privémodus gooit).

## Releasen
- Gebruik `/release`. Kern: `CACHE` in `sw.js` bumpen, versiecommentaar, commit-titel `vX.Y: omschrijving`.
- De hook `.claude/hooks/check-index.sh` draait na elke edit van `index.html`: syntaxcheck van het inline script en controle of `sw.js` mee gewijzigd is. Een melding van die hook is geen ruis; los hem op.

## Testen
- Geen testsuite. Verifieer gedrag in de browser via de chrome-devtools MCP-server (`.mcp.json`) en de skill `agent-skills:browser-testing-with-devtools`.
- Laat wijzigingen aan opname, layout of caching reviewen door de subagent `ios-pwa-reviewer`.

## Git
- Werk op een feature-branch, push met `git push -u origin <branch>`. Geen force-push op gedeelde branches.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
