# Athena Assistent — backend (Google Apps Script)

De app in `athena/` praat met één Apps Script-web-app. Die bewaart alles in een Google Sheet, leest documenten uit een Drive-map,
kijkt in Gmail en Agenda van het account waaronder hij draait, en gebruikt de Claude API voor vragen en teksten.
Draai hem onder het werkaccount (`menno.adan@athenastudies.nl`), dan ziet hij de juiste mail, agenda en Drive.

## Installatie (eenmalig, ±15 minuten)

1. Ga naar https://script.google.com, maak een nieuw project, noem het `Athena Assistent`.
2. Vervang de inhoud van `Code.gs` door het bestand `Code.gs` uit deze map. Sla op.
3. **Scripteigenschappen** (Projectinstellingen → Scripteigenschappen → Eigenschap toevoegen):

   | Eigenschap | Waarde | Verplicht |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | API-sleutel van console.anthropic.com | voor vragen, teksten en de geschreven ochtendsamenvatting |
   | `RAPPORT_EMAIL` | adres waar de nachtelijke review naartoe moet | nee (zonder: alleen in de app) |
   | `NAAM` | voornaam in de begroeting (standaard `Menno`) | nee |
   | `CLAUDE_MODEL` | standaard `claude-opus-5` | nee |
   | `CLAUDE_EFFORT` | `low`, `medium` (standaard), `high` | nee — `low` als antwoorden te lang duren |

4. Kies bovenin de functie `setup` en klik **Uitvoeren**. Geef de gevraagde rechten (Sheets, Drive, Gmail, Agenda, externe verbindingen).
   De log toont drie dingen: de URL van de Sheet, de URL van de documentenmap en de **koppelcode**. Bewaar die koppelcode.
   `setup()` maakt ook twee dagelijkse triggers aan: documenten inlezen (04:00) en de nachtelijke review (05:00).
5. Optioneel: **Services → + → Drive API** toevoegen. Dan leest de index ook de tekst uit PDF's en Word-bestanden (met OCR).
   Zonder deze service worden die bestanden alleen op titel geïndexeerd.
6. **Implementeren → Nieuwe implementatie → Web-app**: uitvoeren als *Ik*, toegang *Iedereen*. Kopieer de `/exec`-URL.
7. Open de app (`athena/index.html` op de gehoste site), vul de `/exec`-URL en de koppelcode in. Klaar.
8. Optioneel: draai `vulVoorbeelddata` één keer om de app gevuld te zien met fictieve scholen. Verwijder de rijen daarna in de Sheet.

Bij elke wijziging in `Code.gs`: Implementeren → Implementaties beheren → potlood → Versie: *Nieuwe versie* → Implementeren. De URL blijft gelijk.

## Wat er waar staat

- **Sheet `Athena Assistent — data`**, tabbladen: `Scholen`, `Trajecten`, `Kansen`, `Acties`, `Documenten`, `Reviews`, `Huisstijl`, `Content`, `Notities`.
  Je mag rijen direct in de Sheet bewerken; de eerste rij is de kolomkop en moet blijven staan. Kolom `id` is de sleutel.
- **Drive-map `Athena Assistent — documenten`** met submappen `Contracten`, `Werkwijzen`, `Schooldossiers`, `Voorstellen`, `Prijslijst`.
  Alles wat hierin staat (ook in diepere submappen) wordt geïndexeerd; de submapnaam bepaalt het type. Google Docs, Sheets, tekst en (met Drive API) PDF/Word.
  Zet in een schooldossier de schoolnaam in de titel of de eerste alinea; dan koppelt Athena het document aan het traject.
- **Scripteigenschappen** bevatten de sleutels en ids; nooit in de Sheet.

## Contract met de app

`POST <exec-url>?app=1`, body `JSON.stringify({ fn, args: [...], secret })`, geen headers (Apps Script beantwoordt geen CORS-preflight).
Antwoord `{ ok: true, result }` of `{ ok: false, fout }`; `fout === 'secret'` betekent: koppelcode klopt niet.

| fn | args | result |
|---|---|---|
| `apiOverzicht` | — | `{ datum, groet, kpi:{trajecten,kansen,scholen,omzet,schooljaar,pijplijn}, focus:[actie], aandacht:[actie], mails:[{onderwerp,van,dagen,link}], agenda:[{tijd,titel,duurMin}], kansen:[kans] }` |
| `apiActieKlaar` | id | null |
| `apiActieToevoegen` | tekst, prio, deadline | actie |
| `apiKennisbank` | — | `{ tellingen, documenten:[{id,titel,type,school,url,gewijzigd,woorden}], laatsteIndex, mapUrl }` |
| `apiIndexeer` | — | `{ aantal, nieuw, bijgewerkt, verwijderd }` |
| `apiVraag` | vraag | `{ antwoord, bronnen:[{titel,url,type}] }` |
| `apiReview` | — | `{ laatste: review, eerdere:[{id,datum,gemaaktOp,samenvatting,tellingen}] }` |
| `apiReviewNu` | — | review (`{id,datum,gemaaktOp,samenvatting,gedaan,blijvenLiggen,vandaag,tellingen}`) |
| `apiHuisstijl` | — | `{ velden, kleuren, toon, zinnen, types, recent }` |
| `apiZetHuisstijl` | sleutel, waarde | null |
| `apiMaakContent` | type, onderwerp, extra | `{ id, datum, type, typeNaam, onderwerp, tekst }` |
| `apiTrajecten` | — | `{ trajecten:[traject], filters:{schooljaren,trajecten,statussen} }` |
| `apiTraject` | id | `{ traject, documenten, notities, kansen, school }` |
| `apiTrajectOpslaan` | object (met of zonder id) | traject |
| `apiNotitieToevoegen` | trajectId, tekst | `{ id, datum, tekst }` |
| `apiImporteer` | tabel, rijen | `{ ingevoegd, bijgewerkt, ongewijzigd }` |
| `apiStatus` | — | status van de installatie |

Een `actie` is `{ id, tekst, bron, prio, deadline, link, over }` (`over` = dagen over de deadline, negatief = nog te gaan).
Een `kans` is `{ id, school, traject, fase, waarde, volgendeActie, deadline, dagenStil }`.

## Koppeling met de Cowork-map `athena-assistent`

De dagelijkse data-run in het Cowork-project kan zijn resultaat (Capsule-export, contracten, portaal) naar de backend sturen,
zodat het dashboard en de geschiedenis dezelfde data tonen. Eén POST per tabel, rijen met de kolomnamen van het tabblad:

```bash
curl -s -L -X POST "<exec-url>?app=1" -d '{
  "fn": "apiImporteer", "secret": "<koppelcode>",
  "args": ["trajecten", [
    { "school": "Voorbeeldcollege Zuid", "plaats": "Rotterdam", "traject": "Onderwijsondersteuning", "schooljaar": "2026-2027",
      "start": "2026-09-01", "eind": "2027-05-31", "status": "actief", "ondersteuners": 2, "urenPerWeek": 30, "tarief": 48.5,
      "omzet": 40740, "contactpersoon": "A. de Vries", "am": "Menno", "samenvatting": "Lesopvang en huiswerklokaal." }
  ]]
}'
```

Rijen zonder `id` krijgen een stabiel id uit school + traject + schooljaar (scholen: naam; kansen: school + traject), zodat een
herhaalde import bijwerkt in plaats van dupliceert. Tabellen: `scholen`, `trajecten`, `kansen`, `acties`.
Alleen school- en contactpersoonniveau; nooit leerlingnamen.

## Claude API

`claude()` in `Code.gs` doet een raw HTTP-call naar `POST https://api.anthropic.com/v1/messages` (Apps Script heeft geen SDK):
model `claude-opus-5`, `fallbacks: "default"` met de beta-header `server-side-fallback-2026-07-01` (een door de veiligheidsfilters
geweigerd verzoek wordt server-side op een ander model herhaald), `output_config.effort` uit `CLAUDE_EFFORT`, en een controle op
`stop_reason === "refusal"`. Kosten: een vraag met zes documenten is grofweg 15-30k invoertokens.

## Bekende grenzen

- Apps Script kapt een verzoek na ongeveer 60 seconden af. Duurt een antwoord te lang: zet `CLAUDE_EFFORT` op `low`.
- Cellen in Sheets bevatten maximaal 50.000 tekens; van elk document worden de eerste 45.000 tekens geïndexeerd.
- De review kijkt naar de afgelopen 24 uur en naar wat in de Sheet, Gmail en Agenda staat. Wat nergens geregistreerd is, ziet hij niet.
