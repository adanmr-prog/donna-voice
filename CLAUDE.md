# Donna OS (donna-voice)

Persoonlijke "extern brein"-PWA: gesprek met Donna, spraakopname, taken, doelen, habits, timer, checklists. UI, code en commentaar zijn Nederlands.

## Structuur
- `index.html`: de volledige app (CSS + HTML + inline script in één bestand). Geen build-stap, geen bundler, geen npm-dependencies.
- `sw.js`: service worker met app-shell cache. De cache-naam `CACHE` moet bij elke release omhoog.
- `manifest.webmanifest` en de icon-PNG's: PWA-metadata.
- Backend: Google Apps Script web-app, niet in deze repo. Het contract staat in de skill `donna-backend-api`.
- `athena/`: Athena Assistent, een tweede PWA voor AthenaSchool (operations-dashboard, bedrijfsbrein met vraag-en-antwoord, nachtelijke review, huisstijl-kit, geschiedenis van schoolopdrachten). Zelfde opzet: `athena/index.html` (één bestand), eigen `athena/sw.js` (cache-naam `athena-assistent-vX.Y`), `athena/manifest.webmanifest`, iconen. De backend staat wél in de repo: `athena/backend/Code.gs` (Apps Script, te plakken in een eigen project) met installatie in `athena/backend/README.md`; het contract staat in de skill `athena-backend-api`. Huisstijl: Nunito, paars `#66306E`, oranje `#FAA11B`.

## Conventies
- Vanilla JS in ES5-stijl: `var`, `function`, geen arrow functions, `let/const`, template strings, classes of modules. Doel: iOS Safari als standalone PWA.
- Nederlandse namen voor functies, variabelen en commentaar (`laadTaken`, `wisselView`, `bezig`).
- Markeer inhoudelijke wijzigingen met een versiecommentaar: `// v4.3: korte reden`.
- Alle backend-calls via `run(fn, ...args)`. Nooit direct `fetch` naar `API`, nooit headers toevoegen (CORS-preflight faalt op Apps Script).
- `run()` toont zelf al een toast bij fouten. In `.catch` alleen de UI herstellen, niet opnieuw toasten.
- Alles wat van de backend of uit localStorage komt gaat door `esc()` of `md()` voordat het in `innerHTML` belandt.
- `localStorage` altijd in try/catch (privémodus gooit).

## Releasen
- Gebruik `/release`. Kern: `CACHE` in `sw.js` bumpen, versiecommentaar, commit-titel `vX.Y: omschrijving`. Voor de Athena-app geldt hetzelfde met `athena/sw.js`; de twee apps hebben een eigen versiereeks (Donna `v4.x`, Athena `athena v1.x`).
- De hook `.claude/hooks/check-index.sh` draait na elke edit van een `index.html` (root of `athena/`): syntaxcheck van het inline script en controle of de `sw.js` in dezelfde map mee gewijzigd is. Een melding van die hook is geen ruis; los hem op.

## Testen
- Geen testsuite. Verifieer gedrag in de browser via de chrome-devtools MCP-server (`.mcp.json`) en de skill `agent-skills:browser-testing-with-devtools`.
- Laat wijzigingen aan opname, layout of caching reviewen door de subagent `ios-pwa-reviewer`.

## Git
- Werk op een feature-branch, push met `git push -u origin <branch>`. Geen force-push op gedeelde branches.
