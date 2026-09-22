---
name: athena-backend-api
description: Contract van de Google Apps Script-backend van de Athena Assistent (athena/) - dezelfde run()-RPC als Donna OS, de lijst van api*-functies met argumenten en resultaatvorm, de Sheet-tabbladen en de Drive-map. Gebruik bij elke wijziging aan athena/index.html die data ophaalt of wegschrijft, en bij het toevoegen van een functie aan athena/backend/Code.gs.
user-invocable: false
---

# Athena Assistent backend-contract

## Transport
- De backend-URL staat niet in de code: de gebruiker vult hem in op het koppelscherm; `athena/index.html` bewaart hem in `localStorage.aa_api` en de koppelcode in `localStorage.aa_secret`.
- Eén helper: `run(fn, arg1, ...)` → `Promise` met `result`. Request: `POST <url>?app=1`, body `JSON.stringify({ fn, args, secret })`, geen headers.
- Response: `{ ok: true, result }` of `{ ok: false, fout }`. Bij `fout === 'secret'` wist `run()` de koppelcode en toont het koppelscherm. `run()` toast zelf bij fouten; in `.catch` alleen de UI herstellen.
- Functienamen beginnen met `api` + hoofdletter; de dispatcher in `Code.gs` accepteert niets anders.

## Functies
De volledige tabel met argumenten en resultaatvorm staat in `athena/backend/README.md` (sectie "Contract met de app"). Kern:
`apiOverzicht`, `apiActieKlaar`, `apiActieToevoegen`, `apiKennisbank`, `apiIndexeer`, `apiVraag`, `apiReview`, `apiReviewNu`,
`apiHuisstijl`, `apiZetHuisstijl`, `apiMaakContent`, `apiTrajecten`, `apiTraject`, `apiTrajectOpslaan`, `apiNotitieToevoegen`, `apiImporteer`, `apiStatus`.

## Data
- Google Sheet met tabbladen `Scholen`, `Trajecten`, `Kansen`, `Acties`, `Documenten`, `Reviews`, `Huisstijl`, `Content`, `Notities`; kolommen staan in `TABELLEN` bovenin `Code.gs`. `lees(naam)` en `schrijf(naam, obj)` (upsert op `id`) zijn de enige toegang.
- Drive-map met submappen `Contracten`, `Werkwijzen`, `Schooldossiers`, `Voorstellen`, `Prijslijst`; `indexeerDocumenten()` vult het tabblad `Documenten`.
- Sleutels in scripteigenschappen: `SECRET`, `SHEET_ID`, `DRIVE_MAP_ID`, `ANTHROPIC_API_KEY`, `RAPPORT_EMAIL`, `NAAM`, `CLAUDE_MODEL`, `CLAUDE_EFFORT`.

## Nieuwe functie toevoegen
1. `apiNaam(...)` in `athena/backend/Code.gs`; alleen via `lees()`/`schrijf()` bij de Sheet, schrijfacties binnen `metLock()`.
2. Aanroepen in `athena/index.html` met `run('apiNaam', ...)`; output door `esc()` of `md()`.
3. Rij toevoegen aan de tabel in `athena/backend/README.md`.
4. Backend als nieuwe Apps Script-versie implementeren; de `/exec`-URL blijft gelijk.
