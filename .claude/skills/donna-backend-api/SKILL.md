---
name: donna-backend-api
description: Contract van de Google Apps Script-backend van Donna OS - de run()-RPC, request- en responsevorm, secret-afhandeling, CORS-beperkingen en de lijst van api*-functies met hun argumenten. Gebruik bij elke wijziging aan index.html die data ophaalt of wegschrijft, en bij het toevoegen van een nieuwe backend-functie.
user-invocable: false
---

# Donna OS backend-contract

## Transport
- Endpoint: de constante `API` bovenin het inline script van `index.html` (Apps Script `/exec`-URL). Nooit wijzigen zonder expliciete opdracht.
- Eén helper: `run(fn, arg1, arg2, ...)` geeft een `Promise` die resolvet met `result`.
- Request: `POST API + '?app=1'`, body `JSON.stringify({ fn, args: [...], secret })`.
- Geen request-headers toevoegen. Een `Content-Type: application/json` header triggert een CORS-preflight en Apps Script beantwoordt geen OPTIONS. De body gaat als tekst en de backend parseert hem zelf.
- `secret` komt uit `localStorage.dv_secret` (gezet op het koppel-scherm). Nooit in de URL zetten (sinds v4.2).

## Response
- Succes: `{ "ok": true, "result": <any> }`. `run()` resolvet met `result`.
- Fout: `{ "ok": false, "fout": "<tekst>" }`. `run()` rejectt met `Error(fout)` en toont zelf een toast.
- `fout === "secret"`: `run()` wist `dv_secret`, toont het koppel-scherm en rejectt zonder toast.
- Gevolg voor callers: in `.catch` alleen de UI herstellen (bijvoorbeeld `.catch(laad)`), niet opnieuw toasten.

## Functies zoals aangeroepen vanuit index.html
| fn | args | result |
|---|---|---|
| apiDashboard | geen | data voor `render()` (Vandaag-scherm) |
| apiAlleTaken | geen | takenlijst, wordt `S.alle` |
| apiStappenplan | taakId | stappenplan voor één taak |
| apiCompleteTask | taakId | geen (daarna herladen) |
| apiToggleHabit | naam | geen |
| apiZetPrio | taakId, prio | geen |
| apiPlanOp | taakId, wanneer, duur | planningsresultaat |
| apiPlannerRun | geen | plannerresultaat |
| apiFocusMode | aan (boolean) | geen |
| apiChat | tekst, 'donna' | antwoordtekst (markdown-light, via `md()`) |
| apiVoice | base64Audio, mimeType | verwerkt resultaat van de opname |
| apiDoelenReview | geen | doelenoverzicht |
| apiVoegDoel | doelId, tekst, 'discipline', '' | geen |
| apiZetProfielWaarde | sleutel ('visie' of 'geboortedatum'), waarde | geen |
| apiZoek | zoekterm | tekst (via `md()`) |
| apiActies | geen | lijst acties |
| apiBeslis | actieId, ja (boolean) | bevestigingstekst |
| apiPlannerStats | geen | statistieken |
| apiLockIn | geen | lock-in data |
| apiChecklists | geen | lijsten, wordt `S.checklists` |
| apiToggleChecklist | lijstId, itemId | geen |

## Nieuwe functie toevoegen
1. Implementeer `apiNaam(...)` in het Apps Script-project (buiten deze repo). De dispatcher daar geeft `{ok:true, result}` of `{ok:false, fout}` terug.
2. Roep in `index.html` aan met `run('apiNaam', ...)`. Render de output via `esc()` of `md()`.
3. Voeg de rij toe aan de tabel hierboven.
4. Deploy de backend als nieuwe Apps Script-versie. De `/exec`-URL blijft gelijk.
