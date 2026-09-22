/* Athena Assistent — Google Apps Script-backend (v1.0)
 * Het bedrijfsbrein van AthenaSchool: operations-dashboard, kennisbank met vraag-en-antwoord, nachtelijke review,
 * huisstijl-kit en doorzoekbare geschiedenis van elke schoolopdracht.
 * Data staat in één Google Sheet (tabbladen hieronder), documenten in één Drive-map. Zie README.md voor de installatie.
 * Contract met de app: POST {fn, args, secret} → {ok:true, result} of {ok:false, fout}. Fout 'secret' = koppelcode klopt niet.
 */

var VERSIE = '1.0';
var P = PropertiesService.getScriptProperties();

var TABELLEN = {
  Scholen:    ['id', 'naam', 'plaats', 'type', 'contactpersoon', 'email', 'telefoon', 'status', 'am', 'notities', 'bijgewerkt'],
  Trajecten:  ['id', 'school', 'plaats', 'traject', 'schooljaar', 'start', 'eind', 'status', 'ondersteuners', 'urenPerWeek', 'tarief', 'omzet', 'contactpersoon', 'am', 'samenvatting', 'bijgewerkt'],
  Kansen:     ['id', 'school', 'traject', 'fase', 'waarde', 'volgendeActie', 'deadline', 'laatsteContact', 'eigenaar', 'notities', 'bijgewerkt'],
  Acties:     ['id', 'tekst', 'bron', 'prio', 'deadline', 'status', 'link', 'aangemaakt', 'afgerond'],
  Documenten: ['id', 'titel', 'type', 'school', 'url', 'driveId', 'gewijzigd', 'woorden', 'tekst', 'bijgewerkt'],
  Reviews:    ['id', 'datum', 'gemaaktOp', 'samenvatting', 'gedaan', 'blijvenLiggen', 'vandaag'],
  Huisstijl:  ['sleutel', 'waarde'],
  Content:    ['id', 'datum', 'type', 'onderwerp', 'tekst'],
  Notities:   ['id', 'trajectId', 'datum', 'tekst']
};
var DATUMTIJD_KOLOMMEN = { bijgewerkt: 1, aangemaakt: 1, afgerond: 1, gemaaktOp: 1, gewijzigd: 1, datum: 1 };
var DOC_TYPES = ['contract', 'werkwijze', 'schooldossier', 'voorstel', 'prijslijst', 'overig'];
var KANS_FASES = ['lead', 'gesprek', 'voorstel', 'onderhandeling', 'gewonnen', 'verloren'];
var TRAJECT_STATUSSEN = ['offerte', 'actief', 'afgerond', 'gestopt'];
var PRIOS = ['hoog', 'midden', 'laag'];

/* ===================== Eenmalige inrichting (draai vanuit de editor) ===================== */

function setup() {
  var id = P.getProperty('SHEET_ID'), ss;
  if (id) { ss = SpreadsheetApp.openById(id); } else { ss = SpreadsheetApp.create('Athena Assistent — data'); P.setProperty('SHEET_ID', ss.getId()); }
  Object.keys(TABELLEN).forEach(function (naam) {
    var b = ss.getSheetByName(naam) || ss.insertSheet(naam);
    if (b.getLastRow() === 0) { b.appendRow(TABELLEN[naam]); b.setFrozenRows(1); }
  });
  var standaard = ss.getSheetByName('Blad1') || ss.getSheetByName('Sheet1');
  if (standaard && ss.getSheets().length > 1) ss.deleteSheet(standaard);
  if (!P.getProperty('SECRET')) P.setProperty('SECRET', Utilities.getUuid().replace(/-/g, '').slice(0, 12));
  if (!P.getProperty('DRIVE_MAP_ID')) {
    var map = DriveApp.createFolder('Athena Assistent — documenten');
    ['Contracten', 'Werkwijzen', 'Schooldossiers', 'Voorstellen', 'Prijslijst'].forEach(function (n) { map.createFolder(n); });
    P.setProperty('DRIVE_MAP_ID', map.getId());
  }
  installeerTriggers();
  var uit = { sheet: ss.getUrl(), map: mapUrl(), koppelcode: P.getProperty('SECRET') };
  Logger.log('Sheet: ' + uit.sheet + '\nDocumentenmap: ' + uit.map + '\nKoppelcode (voor de app): ' + uit.koppelcode);
  return uit;
}

function installeerTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['nachtelijkeReviewTrigger', 'indexeerTrigger'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('indexeerTrigger').timeBased().everyDays(1).atHour(4).create();          // documenten opnieuw inlezen
  ScriptApp.newTrigger('nachtelijkeReviewTrigger').timeBased().everyDays(1).atHour(5).create(); // review klaar vóór de ochtend
}

// Optioneel: fictieve voorbeelddata om de app meteen gevuld te zien. Verwijder de rijen daarna gewoon in de Sheet.
function vulVoorbeelddata() {
  var sj = huidigSchooljaar();
  [['Voorbeeldcollege Zuid', 'Rotterdam', 'VO', 'A. de Vries', 'klant'], ['Lyceum Demo', 'Den Haag', 'VO', 'B. Jansen', 'klant'],
   ['ISK Voorbeeld', 'Delft', 'VO', 'C. Bakker', 'lead'], ['Montessori Demo', 'Utrecht', 'PO', 'D. Visser', 'klant']].forEach(function (r) {
    schrijf('Scholen', { id: 'demo-' + slug(r[0]), naam: r[0], plaats: r[1], type: r[2], contactpersoon: r[3], status: r[4], am: 'Menno' });
  });
  [['Voorbeeldcollege Zuid', 'Onderwijsondersteuning', sj, '2026-09-01', '2027-05-31', 'actief', 2, 30, 48.5, 40740, 'A. de Vries'],
   ['Lyceum Demo', 'Huiswerkbegeleiding', sj, '2026-09-07', '2027-06-30', 'actief', 1, 8, 42, 12000, 'B. Jansen'],
   ['Montessori Demo', 'Studentdocent', sj, '2026-08-24', '2026-12-20', 'actief', 1, 16, 45, 11520, 'D. Visser'],
   ['ISK Voorbeeld', 'NT2-ondersteuning', sj, '2026-11-02', '2027-04-30', 'offerte', 1, 16, 47, 15040, 'C. Bakker'],
   ['Voorbeeldcollege Zuid', 'Examentraining', '2025-2026', '2026-03-01', '2026-05-15', 'afgerond', 3, 12, 46, 8280, 'A. de Vries']].forEach(function (r) {
    schrijf('Trajecten', { id: 'demo-' + slug(r[0] + '-' + r[1] + '-' + r[2]), school: r[0], traject: r[1], schooljaar: r[2], start: r[3], eind: r[4], status: r[5], ondersteuners: r[6], urenPerWeek: r[7], tarief: r[8], omzet: r[9], contactpersoon: r[10], am: 'Menno', samenvatting: 'Voorbeeldtraject — vervang door echte gegevens.' });
  });
  [['ISK Voorbeeld', 'NT2-ondersteuning', 'voorstel', 15040, 'Voorstel nabellen', datumStr(plusDagen(2)), datumStr(plusDagen(-9))],
   ['Lyceum Demo', 'Examentraining', 'gesprek', 9000, 'Afspraak inplannen met teamleider', datumStr(plusDagen(5)), datumStr(plusDagen(-2))]].forEach(function (r) {
    schrijf('Kansen', { id: 'demo-' + slug(r[0] + '-' + r[1]), school: r[0], traject: r[1], fase: r[2], waarde: r[3], volgendeActie: r[4], deadline: r[5], laatsteContact: r[6], eigenaar: 'Menno' });
  });
  [['Voorstel ISK Voorbeeld nabellen', 'kans', 'hoog', datumStr(plusDagen(1))], ['Rooster Voorbeeldcollege Zuid bevestigen', 'handmatig', 'midden', datumStr(plusDagen(3))],
   ['Contract Lyceum Demo laten tekenen', 'contract', 'hoog', datumStr(plusDagen(-1))]].forEach(function (r) {
    schrijf('Acties', { id: 'demo-' + slug(r[0]), tekst: r[0], bron: r[1], prio: r[2], deadline: r[3], status: 'open', aangemaakt: nu() });
  });
  return 'Voorbeelddata staat in de Sheet.';
}

/* ===================== Transport ===================== */

function doGet() {
  return json({ ok: true, app: 'Athena Assistent', versie: VERSIE, melding: 'Backend actief. Plak deze URL in de app.' });
}

function doPost(e) {
  var uit;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var fn = String(req.fn || '');
    if (!req.secret || req.secret !== P.getProperty('SECRET')) uit = { ok: false, fout: 'secret' };
    else if (!/^api[A-Z]\w*$/.test(fn) || typeof globalThis[fn] !== 'function') uit = { ok: false, fout: 'onbekende functie ' + fn };
    else { var r = globalThis[fn].apply(null, req.args || []); uit = { ok: true, result: (r === undefined) ? null : r }; }
  } catch (err) {
    uit = { ok: false, fout: String((err && err.message) || err) };
  }
  return json(uit);
}

function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/* ===================== Sheet als database ===================== */

function sheet() {
  var id = P.getProperty('SHEET_ID');
  if (!id) throw new Error('Backend niet ingericht — draai setup() in de Apps Script-editor.');
  return SpreadsheetApp.openById(id);
}
function blad(naam) {
  var ss = sheet(), b = ss.getSheetByName(naam);
  if (!b) { b = ss.insertSheet(naam); b.appendRow(TABELLEN[naam]); b.setFrozenRows(1); }
  return b;
}
function celWaarde(v, kolom) {
  if (v instanceof Date) return DATUMTIJD_KOLOMMEN[kolom] ? datumTijdStr(v) : datumStr(v);
  return v;
}
// Alle rijen van een tabblad als objecten; _rij = rijnummer in de Sheet (voor updates).
// licht = true laat de kolom 'tekst' en alles erna weg (Documenten kan megabytes tekst bevatten).
function lees(naam, licht) {
  var kop = TABELLEN[naam], b = blad(naam), aantal = kop.length;
  if (licht && kop.indexOf('tekst') > 0) aantal = kop.indexOf('tekst');
  var laatste = b.getLastRow(), waarden = laatste > 0 ? b.getRange(1, 1, laatste, aantal).getValues() : [], uit = [];
  for (var r = 1; r < waarden.length; r++) {
    var o = { _rij: r + 1 }, leeg = true;
    for (var c = 0; c < aantal; c++) {
      var v = celWaarde(waarden[r][c], kop[c]);
      if (v !== '' && v != null) leeg = false;
      o[kop[c]] = (v == null) ? '' : v;
    }
    if (!leeg) uit.push(o);
  }
  return uit;
}
// Celwaarde voor de Sheet: objecten als JSON, nooit iets dat als formule wordt gelezen.
function celUit(v) {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'string' && /^[=+]/.test(v)) return ' ' + v;
  return v;
}
function samenvoegen(naam, obj, hit) {
  var kop = TABELLEN[naam], samen = {};
  kop.forEach(function (k) { samen[k] = (obj[k] !== undefined && obj[k] !== null) ? obj[k] : (hit ? hit[k] : ''); });
  if (kop.indexOf('bijgewerkt') >= 0) samen.bijgewerkt = nu();
  return samen;
}
// Upsert op id. Geeft het samengevoegde object terug.
function schrijf(naam, obj) {
  var kop = TABELLEN[naam], b = blad(naam), hit = null;
  if (obj.id) lees(naam).some(function (r) { if (String(r.id) === String(obj.id)) { hit = r; return true; } return false; });
  if (!obj.id) obj.id = nieuwId();
  var samen = samenvoegen(naam, obj, hit), rij = kop.map(function (k) { return celUit(samen[k]); });
  if (hit) b.getRange(hit._rij, 1, 1, kop.length).setValues([rij]); else b.appendRow(rij);
  return samen;
}
// Veel rijen in één keer (import, index): één keer lezen, updates per rij, nieuwe rijen in één blok.
function schrijfVeel(naam, lijst) {
  var stats = { ingevoegd: 0, bijgewerkt: 0 };
  if (!lijst.length) return stats;
  var kop = TABELLEN[naam], b = blad(naam), bestaand = {}, nieuw = [];
  lees(naam).forEach(function (r) { bestaand[String(r.id)] = r; });
  lijst.forEach(function (obj) {
    if (!obj.id) obj.id = nieuwId();
    var hit = bestaand[String(obj.id)], samen = samenvoegen(naam, obj, hit), rij = kop.map(function (k) { return celUit(samen[k]); });
    if (hit) { b.getRange(hit._rij, 1, 1, kop.length).setValues([rij]); stats.bijgewerkt++; }
    else { nieuw.push(rij); bestaand[String(obj.id)] = samen; stats.ingevoegd++; }
  });
  if (nieuw.length) b.getRange(b.getLastRow() + 1, 1, nieuw.length, kop.length).setValues(nieuw);
  return stats;
}
function verwijderRijen(naam, filterFn) {
  var b = blad(naam), weg = lees(naam, true).filter(filterFn).map(function (r) { return r._rij; }).sort(function (a, c) { return c - a; });
  weg.forEach(function (r) { b.deleteRow(r); });
  return weg.length;
}
// Kort cachen (seconden) van trage bronnen zoals Gmail; bij een cachefout gewoon opnieuw ophalen.
function metCache(sleutel, seconden, fn) {
  var cache = CacheService.getScriptCache(), hit = null;
  try { hit = cache.get('athena-' + sleutel); } catch (e) {}
  if (hit) { try { return JSON.parse(hit); } catch (e2) {} }
  var waarde = fn();
  try { cache.put('athena-' + sleutel, JSON.stringify(waarde), seconden); } catch (e3) {}
  return waarde;
}
function metLock(fn) {
  var lock = LockService.getScriptLock();
  lock.tryLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ===================== 1. Operations-dashboard: wat vraagt vandaag je aandacht ===================== */

function apiOverzicht() {
  var trajecten = lees('Trajecten'), kansen = lees('Kansen'), scholen = lees('Scholen');
  var acties = lees('Acties').filter(function (a) { return a.status !== 'af'; }).sort(sorteerActies);
  var actief = trajecten.filter(function (t) { return t.status === 'actief'; });
  var sj = huidigSchooljaar();
  var omzet = trajecten.filter(function (t) { return t.schooljaar === sj && t.status !== 'gestopt' && t.status !== 'offerte'; })
    .reduce(function (s, t) { return s + (Number(t.omzet) || 0); }, 0);
  var open = kansen.filter(kansOpen).sort(function (a, b) { return String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')); });
  return {
    datum: datumLang(new Date()), groet: groet(),
    kpi: { trajecten: actief.length, kansen: open.length, scholen: uniek(actief.map(function (t) { return t.school; })).length, omzet: omzet, schooljaar: sj,
           pijplijn: open.reduce(function (s, k) { return s + (Number(k.waarde) || 0); }, 0) },
    focus: acties.slice(0, 6).map(actieUit), aandacht: acties.slice(6).map(actieUit),
    mails: mailsOnbeantwoord(5), agenda: agendaVoorDag(new Date()),
    kansen: open.slice(0, 8).map(kansUit),
    tellingScholen: scholen.length
  };
}
function apiActieKlaar(id) {
  var a = vind('Acties', id); if (!a) throw new Error('Actie niet gevonden.');
  metLock(function () { schrijf('Acties', { id: id, status: 'af', afgerond: nu() }); });
  return null;
}
function apiActieToevoegen(tekst, prio, deadline) {
  tekst = String(tekst || '').trim(); if (!tekst) throw new Error('Geen tekst.');
  var a = metLock(function () { return schrijf('Acties', { tekst: tekst, bron: 'handmatig', prio: PRIOS.indexOf(prio) >= 0 ? prio : 'midden', deadline: deadline || '', status: 'open', aangemaakt: nu() }); });
  return actieUit(a);
}
function actieUit(a) { var tot = a.deadline ? dagenTot(a.deadline) : null; return { id: a.id, tekst: a.tekst, bron: a.bron, prio: a.prio, deadline: a.deadline, link: a.link || '', over: tot === null ? null : -tot || 0 }; }
function kansUit(k) { return { id: k.id, school: k.school, traject: k.traject, fase: k.fase, waarde: Number(k.waarde) || 0, volgendeActie: k.volgendeActie, deadline: k.deadline, dagenStil: k.laatsteContact ? dagenSinds(k.laatsteContact) : null }; }
function kansOpen(k) { return ['gewonnen', 'verloren'].indexOf(k.fase) < 0; }
function sorteerActies(a, b) {
  var pa = PRIOS.indexOf(a.prio), pb = PRIOS.indexOf(b.prio);
  var da = a.deadline || '9999', db = b.deadline || '9999';
  if (da !== db) return da < db ? -1 : 1;
  return (pa < 0 ? 9 : pa) - (pb < 0 ? 9 : pb);
}

// Mails in de inbox waarvan het laatste bericht niet van jou is en ouder dan 2 dagen: die wachten op jouw antwoord.
function mailsOnbeantwoord(max, minDagen) {
  minDagen = minDagen || 2;
  return metCache('mails-' + max + '-' + minDagen, 300, function () { return zoekMailsOnbeantwoord(max, minDagen); });
}
function zoekMailsOnbeantwoord(max, minDagen) {
  try {
    var mij = Session.getEffectiveUser().getEmail().toLowerCase(), uit = [];
    var threads = GmailApp.search('in:inbox -in:chats -category:promotions -category:social newer_than:21d', 0, 40);
    threads.forEach(function (t) {
      if (uit.length >= max) return;
      var msgs = t.getMessages(), laatste = msgs[msgs.length - 1], van = String(laatste.getFrom() || '');
      if (van.toLowerCase().indexOf(mij) >= 0) return;
      var dagen = Math.floor((Date.now() - laatste.getDate().getTime()) / 86400000);
      if (dagen < minDagen) return;
      uit.push({ onderwerp: t.getFirstMessageSubject() || '(geen onderwerp)', van: naamUitAdres(van), dagen: dagen, link: 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(mij) + '#all/' + t.getId() });  // authuser: het juiste account, ook in de in-app browser
    });
    return uit;
  } catch (e) { return []; }
}
function agendaVoorDag(dag) {
  try {
    return CalendarApp.getDefaultCalendar().getEventsForDay(dag).map(function (ev) {
      var heleDag = ev.isAllDayEvent();
      return { tijd: heleDag ? 'dag' : Utilities.formatDate(ev.getStartTime(), tz(), 'HH:mm'), titel: ev.getTitle(), duurMin: heleDag ? 0 : Math.round((ev.getEndTime().getTime() - ev.getStartTime().getTime()) / 60000) };
    });
  } catch (e) { return []; }
}

/* ===================== 2. Bedrijfsbrein: elk contract, elke werkwijze en elk schooldossier op één plek ===================== */

function apiKennisbank() {
  var docs = lees('Documenten', true), tellingen = {};
  DOC_TYPES.forEach(function (t) { tellingen[t] = 0; });
  docs.forEach(function (d) { var t = DOC_TYPES.indexOf(d.type) >= 0 ? d.type : 'overig'; tellingen[t]++; });
  docs.sort(function (a, b) { return String(b.gewijzigd).localeCompare(String(a.gewijzigd)); });
  return {
    tellingen: tellingen,
    documenten: docs.map(function (d) { return { id: d.id, titel: d.titel, type: d.type, school: d.school, url: d.url, gewijzigd: d.gewijzigd, woorden: Number(d.woorden) || 0 }; }),
    laatsteIndex: P.getProperty('LAATSTE_INDEX') || '', mapUrl: mapUrl()
  };
}
function apiIndexeer() { return metLock(indexeerDocumenten); }
function indexeerTrigger() { try { indexeerDocumenten(); } catch (e) { Logger.log('Indexeren mislukt: ' + e); } }

function indexeerDocumenten() {
  var mapId = P.getProperty('DRIVE_MAP_ID'); if (!mapId) throw new Error('Geen documentenmap — draai setup().');
  var bestaand = {}, gezien = {}, scholen = lees('Scholen').map(function (s) { return s.naam; });
  lees('Documenten', true).forEach(function (d) { bestaand[d.driveId] = d; });
  var stats = { aantal: 0, nieuw: 0, bijgewerkt: 0, verwijderd: 0 }, teSchrijven = [];
  function loop(folder, typeHint, diepte) {
    if (diepte > 4) return;
    var it = folder.getFiles();
    while (it.hasNext()) {
      var f = it.next(), id = f.getId();
      gezien[id] = true; stats.aantal++;
      var gewijzigd = datumTijdStr(f.getLastUpdated()), oud = bestaand[id];
      if (oud && oud.gewijzigd === gewijzigd) continue;
      var tekst = tekstVanBestand(f) || '';
      teSchrijven.push({ id: oud ? oud.id : undefined, titel: f.getName(), type: typeHint || raadType(f.getName()) || 'overig', school: raadSchool(f.getName() + ' ' + tekst.slice(0, 3000), scholen),
        url: f.getUrl(), driveId: id, gewijzigd: gewijzigd, woorden: tekst ? tekst.split(/\s+/).length : 0, tekst: tekst.slice(0, 45000) });
      if (oud) stats.bijgewerkt++; else stats.nieuw++;
    }
    var sub = folder.getFolders();
    while (sub.hasNext()) { var s = sub.next(); loop(s, typeHint || raadType(s.getName()), diepte + 1); }
  }
  loop(DriveApp.getFolderById(mapId), '', 0);
  schrijfVeel('Documenten', teSchrijven);
  stats.verwijderd = verwijderRijen('Documenten', function (d) { return !gezien[d.driveId]; });
  P.setProperty('LAATSTE_INDEX', nu());
  return stats;
}
function raadType(naam) {
  var n = String(naam).toLowerCase();
  if (/contract|overeenkomst|addendum|getekend/.test(n)) return 'contract';
  if (/werkwijze|protocol|handleiding|sop|proces|instructie|checklist/.test(n)) return 'werkwijze';
  if (/dossier|schooldossier|overdracht|evaluatie/.test(n)) return 'schooldossier';
  if (/voorstel|offerte|prijsopgave/.test(n)) return 'voorstel';
  if (/prijs|tarie/.test(n)) return 'prijslijst';
  return '';
}
function raadSchool(tekst, scholen) {
  var t = String(tekst).toLowerCase(), hit = '';
  scholen.forEach(function (s) { if (s && !hit && t.indexOf(String(s).toLowerCase()) >= 0) hit = s; });
  return hit;
}
function tekstVanBestand(f) {
  var mime = f.getMimeType();
  try {
    if (mime === MimeType.GOOGLE_DOCS) return DocumentApp.openById(f.getId()).getBody().getText();
    if (mime === MimeType.GOOGLE_SHEETS) {
      return SpreadsheetApp.openById(f.getId()).getSheets().slice(0, 3).map(function (b) {
        return b.getName() + '\n' + b.getDataRange().getValues().slice(0, 150).map(function (r) { return r.join(' | '); }).join('\n');
      }).join('\n\n');
    }
    if (mime === MimeType.PLAIN_TEXT || mime === MimeType.CSV || mime === 'text/markdown') return f.getBlob().getDataAsString('UTF-8');
    if (mime === MimeType.PDF || mime === MimeType.MICROSOFT_WORD || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return tekstViaConversie(f);
  } catch (e) { Logger.log('Geen tekst uit ' + f.getName() + ': ' + e); }
  return '';
}
// PDF's en Word-bestanden: tijdelijk omzetten naar een Google Doc (met OCR) en de tekst lezen. Vereist Services → Drive API.
function tekstViaConversie(f) {
  if (typeof Drive === 'undefined') return '';
  var naam = 'tmp-athena-' + f.getName(), kopie;
  if (Drive.Files.create) kopie = Drive.Files.copy({ name: naam, mimeType: MimeType.GOOGLE_DOCS }, f.getId(), { ocrLanguage: 'nl' });       // Drive API v3
  else kopie = Drive.Files.copy({ title: naam, mimeType: MimeType.GOOGLE_DOCS }, f.getId(), { ocr: true, ocrLanguage: 'nl' });               // Drive API v2
  var tekst = '';
  try { tekst = DocumentApp.openById(kopie.id).getBody().getText(); }
  finally { try { DriveApp.getFileById(kopie.id).setTrashed(true); } catch (e) {} }
  return tekst;
}

function apiVraag(vraag) {
  vraag = String(vraag || '').trim(); if (!vraag) throw new Error('Geen vraag.');
  var top = relevanteDocumenten(vraag, lees('Documenten'), 6);
  var context = top.map(function (d, i) {
    return '<document nr="' + (i + 1) + '" titel="' + xmlAttr(d.titel) + '" type="' + xmlAttr(d.type) + '"' + (d.school ? ' school="' + xmlAttr(d.school) + '"' : '') + '>\n' + String(d.tekst || '').slice(0, 9000) + '\n</document>';
  }).join('\n\n');
  var systeem = 'Je bent Athena, het bedrijfsbrein van AthenaSchool (onderwijsondersteuning voor scholen). Je beantwoordt vragen van Menno, ' +
    'de eigenaar, over contracten, werkwijzen, schooldossiers, voorstellen, prijzen, lopende trajecten en kansen. Antwoord in het Nederlands, kort en concreet, ' +
    'zoals een goed ingewerkte collega dat zou doen. Gebruik alleen de meegegeven documenten en bedrijfsgegevens; verwijs naar een document met zijn nummer tussen ' +
    'blokhaken, bijvoorbeeld [2]. Staat het antwoord er niet in, zeg dat dan eerlijk en noem wat er wél bekend is. Noem nooit namen van leerlingen. ' +
    'Sluit af met een aparte laatste regel "BRONNEN: " gevolgd door de nummers van de gebruikte documenten, of "BRONNEN: geen".';
  var invoer = (context ? 'Documenten:\n' + context + '\n\n' : 'Er zijn nog geen documenten geïndexeerd.\n\n') + 'Bedrijfsgegevens (uit de Sheet):\n' + feitenSamenvatting() + '\n\nVraag van Menno: ' + vraag;
  var antwoord = claude(systeem, invoer, 16000), gebruikt = [];
  var m = antwoord.match(/\n?BRONNEN:\s*(.*)$/i);
  if (m) {
    antwoord = antwoord.replace(/\n?BRONNEN:\s*.*$/i, '').trim();
    (m[1].match(/\d+/g) || []).forEach(function (n) { var d = top[Number(n) - 1]; if (d && gebruikt.indexOf(d) < 0) gebruikt.push(d); });
  }
  return { antwoord: antwoord, bronnen: gebruikt.map(function (d) { return { titel: d.titel, url: d.url, type: d.type }; }) };
}
var STOPWOORDEN = 'de het een en of van voor met bij op in is zijn wat welke welk hoe wie waar wanneer waarom hoeveel over aan uit naar dat die dit deze er ook nog wel niet om als te ik je we wij ze hun onze mijn'.split(' ');
function termen(s) {
  return zonderAccenten(String(s).toLowerCase()).split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 3 && STOPWOORDEN.indexOf(w) < 0; });
}
function relevanteDocumenten(vraag, docs, max) {
  var ts = uniek(termen(vraag)); if (!ts.length) return docs.slice(0, max);
  var gescoord = docs.map(function (d) {
    var titel = zonderAccenten(String(d.titel + ' ' + d.school).toLowerCase()), tekst = zonderAccenten(String(d.tekst || '').toLowerCase()), score = 0;
    ts.forEach(function (t) {
      if (titel.indexOf(t) >= 0) score += 4;
      var n = 0, p = tekst.indexOf(t);
      while (p >= 0 && n < 6) { n++; p = tekst.indexOf(t, p + t.length); }
      score += n;
    });
    return { d: d, score: score };
  }).filter(function (x) { return x.score > 0; }).sort(function (a, b) { return b.score - a.score; });
  return gescoord.slice(0, max).map(function (x) { return x.d; });
}
function feitenSamenvatting() {
  var regels = [], trajecten = lees('Trajecten'), kansen = lees('Kansen').filter(kansOpen), scholen = lees('Scholen');
  regels.push('Schooljaar nu: ' + huidigSchooljaar() + '. Scholen in de administratie: ' + scholen.length + '.');
  regels.push('Trajecten (' + trajecten.length + '):');
  trajecten.slice(0, 120).forEach(function (t) {
    regels.push('- ' + t.school + (t.plaats ? ' (' + t.plaats + ')' : '') + ': ' + t.traject + ', ' + t.schooljaar + ', ' + t.status + (t.urenPerWeek ? ', ' + t.urenPerWeek + ' u/wk' : '') +
      (t.tarief ? ', tarief ' + t.tarief : '') + (t.omzet ? ', omzet ' + t.omzet : '') + (t.contactpersoon ? ', contact ' + t.contactpersoon : '') + (t.am ? ', AM ' + t.am : '') + (t.samenvatting ? '. ' + String(t.samenvatting).slice(0, 160) : ''));
  });
  regels.push('Open kansen (' + kansen.length + '):');
  kansen.slice(0, 40).forEach(function (k) { regels.push('- ' + k.school + ': ' + k.traject + ', fase ' + k.fase + (k.waarde ? ', waarde ' + k.waarde : '') + (k.volgendeActie ? ', volgende actie: ' + k.volgendeActie : '') + (k.deadline ? ' (' + k.deadline + ')' : '')); });
  return regels.join('\n').slice(0, 12000);
}

/* ===================== 3. Nachtelijke review: wat is gedaan, wat is blijven liggen, wat vraagt vandaag aandacht ===================== */

function apiReview() {
  var rs = lees('Reviews').sort(function (a, b) { return String(b.gemaaktOp).localeCompare(String(a.gemaaktOp)); });
  return { laatste: rs[0] ? reviewUit(rs[0]) : null, eerdere: rs.slice(1, 15).map(function (r) { var u = reviewUit(r); return { id: u.id, datum: u.datum, gemaaktOp: u.gemaaktOp, samenvatting: u.samenvatting, tellingen: u.tellingen }; }) };
}
function apiReviewNu() { return metLock(function () { return reviewUit(nachtelijkeReview()); }); }
function nachtelijkeReviewTrigger() {
  try { var r = nachtelijkeReview(); if (P.getProperty('RAPPORT_EMAIL')) mailRapport(reviewUit(r)); }
  catch (e) { Logger.log('Review mislukt: ' + e); }
}
function reviewUit(r) {
  var lees_ = function (v) { try { return typeof v === 'string' ? JSON.parse(v || '[]') : (v || []); } catch (e) { return []; } };
  var gedaan = lees_(r.gedaan), blijven = lees_(r.blijvenLiggen), vandaag = lees_(r.vandaag);
  return { id: r.id, datum: String(r.datum).slice(0, 10), gemaaktOp: r.gemaaktOp, samenvatting: r.samenvatting, gedaan: gedaan, blijvenLiggen: blijven, vandaag: vandaag,
    tellingen: { gedaan: gedaan.length, blijvenLiggen: blijven.length, vandaag: vandaag.length } };
}

function nachtelijkeReview() {
  var nuD = new Date(), grens = new Date(nuD.getTime() - 86400000);
  var dag = nuD.getHours() >= 15 ? plusDagen(1) : nuD;   // 's avonds gaat de review over morgen, overdag over vandaag
  var dagStr = datumStr(dag);
  var acties = lees('Acties'), kansen = lees('Kansen'), trajecten = lees('Trajecten'), docs = lees('Documenten', true);
  var gedaan = [], blijven = [], vandaag = [];
  var naGrens = function (s) { var d = parseDatum(s); return d && d.getTime() >= grens.getTime(); };

  acties.filter(function (a) { return a.status === 'af' && naGrens(a.afgerond); }).forEach(function (a) { gedaan.push({ tekst: a.tekst, bron: 'actie' }); });
  try {
    var verzonden = GmailApp.search('from:me newer_than:1d', 0, 30);
    if (verzonden.length) gedaan.push({ tekst: verzonden.length + ' mail' + (verzonden.length === 1 ? '' : 's') + ' verstuurd' + (verzonden.length <= 3 ? ': ' + verzonden.map(function (t) { return t.getFirstMessageSubject(); }).join(' · ') : ''), bron: 'mail' });
  } catch (e) {}
  docs.filter(function (d) { return naGrens(d.gewijzigd); }).forEach(function (d) { gedaan.push({ tekst: 'Document bijgewerkt: ' + d.titel, bron: 'document' }); });
  kansen.filter(function (k) { return naGrens(k.laatsteContact) || naGrens(k.bijgewerkt); }).forEach(function (k) { gedaan.push({ tekst: 'Kans ' + k.school + ' (' + k.traject + ') bijgewerkt — fase ' + k.fase, bron: 'kans' }); });
  trajecten.filter(function (t) { return naGrens(t.bijgewerkt); }).forEach(function (t) { gedaan.push({ tekst: 'Traject ' + t.school + ' (' + t.traject + ') bijgewerkt — ' + t.status, bron: 'traject' }); });

  acties.filter(function (a) { return a.status !== 'af' && a.deadline && a.deadline < dagStr; }).forEach(function (a) { blijven.push({ tekst: a.tekst, bron: 'actie', dagen: dagenSinds(a.deadline) }); });
  kansen.filter(kansOpen).forEach(function (k) {
    var stil = k.laatsteContact ? dagenSinds(k.laatsteContact) : null;
    if (stil !== null && stil > 7) blijven.push({ tekst: 'Kans ' + k.school + ' (' + k.traject + '): ' + stil + ' dagen geen contact' + (k.volgendeActie ? ' — ' + k.volgendeActie : ''), bron: 'kans', dagen: stil });
    else if (k.deadline && k.deadline < dagStr) blijven.push({ tekst: 'Kans ' + k.school + ': deadline ' + k.deadline + ' verstreken' + (k.volgendeActie ? ' — ' + k.volgendeActie : ''), bron: 'kans', dagen: dagenSinds(k.deadline) });
  });
  mailsOnbeantwoord(10, 3).forEach(function (m) { blijven.push({ tekst: 'Mail van ' + m.van + ' onbeantwoord: ' + m.onderwerp, bron: 'mail', dagen: m.dagen, link: m.link }); });
  trajecten.filter(function (t) { return t.status === 'offerte' && dagenSinds(t.bijgewerkt) > 14; }).forEach(function (t) { blijven.push({ tekst: 'Offerte ' + t.school + ' (' + t.traject + ') wacht al ' + dagenSinds(t.bijgewerkt) + ' dagen', bron: 'traject', dagen: dagenSinds(t.bijgewerkt) }); });

  agendaVoorDag(dag).forEach(function (a) { vandaag.push({ tekst: (a.tijd === 'dag' ? 'Hele dag' : a.tijd) + ' · ' + a.titel, bron: 'agenda' }); });
  acties.filter(function (a) { return a.status !== 'af' && a.deadline === dagStr; }).forEach(function (a) { vandaag.push({ tekst: 'Deadline: ' + a.tekst, bron: 'actie' }); });
  kansen.filter(function (k) { return kansOpen(k) && k.deadline && k.deadline >= dagStr && dagenTot(k.deadline) <= 3; }).forEach(function (k) { vandaag.push({ tekst: 'Kans ' + k.school + ': ' + (k.volgendeActie || 'opvolgen') + ' (uiterlijk ' + k.deadline + ')', bron: 'kans' }); });
  trajecten.filter(function (t) { return t.start && t.start >= dagStr && dagenTot(t.start) <= 7; }).forEach(function (t) { vandaag.push({ tekst: 'Start ' + t.school + ' (' + t.traject + ') op ' + t.start, bron: 'traject' }); });

  var review = { datum: dagStr, gemaaktOp: nu(), gedaan: gedaan, blijvenLiggen: blijven, vandaag: vandaag };
  review.samenvatting = samenvattingReview(review);
  return schrijf('Reviews', { datum: review.datum, gemaaktOp: review.gemaaktOp, samenvatting: review.samenvatting, gedaan: gedaan, blijvenLiggen: blijven, vandaag: vandaag });
}
function samenvattingReview(r) {
  var naam = P.getProperty('NAAM') || 'Menno';
  var basis = 'Goedemorgen ' + naam + '. De afgelopen dag: ' + r.gedaan.length + ' ' + (r.gedaan.length === 1 ? 'ding' : 'dingen') + ' gedaan. ' +
    (r.blijvenLiggen.length ? 'Blijven liggen: ' + r.blijvenLiggen.length + ' punt' + (r.blijvenLiggen.length === 1 ? '' : 'en') + ', te beginnen met: ' + r.blijvenLiggen[0].tekst + '. ' : 'Niets is blijven liggen. ') +
    (r.vandaag.length ? 'Vandaag vraagt ' + r.vandaag.length + ' ' + (r.vandaag.length === 1 ? 'punt' : 'punten') + ' je aandacht.' : 'Vandaag staat er niets vast in de agenda.');
  if (!P.getProperty('ANTHROPIC_API_KEY')) return basis;
  try {
    var systeem = 'Je bent Athena, de assistent van ' + naam + ' (eigenaar van AthenaSchool, onderwijsondersteuning voor scholen). Schrijf in het Nederlands, warm en nuchter, zonder uitroeptekens of emoji.';
    var invoer = 'Schrijf een ochtendbriefing van 3 tot 5 zinnen, beginnend met "Goedemorgen ' + naam + '." Benoem wat gisteren is gedaan, wat is blijven liggen (met het belangrijkste punt) en wat vandaag aandacht vraagt. Geen opsommingstekens, alleen lopende tekst.\n\n' +
      'Gedaan:\n' + (r.gedaan.map(function (x) { return '- ' + x.tekst; }).join('\n') || '- niets geregistreerd') + '\n\nBlijven liggen:\n' + (r.blijvenLiggen.map(function (x) { return '- ' + x.tekst; }).join('\n') || '- niets') +
      '\n\nVandaag:\n' + (r.vandaag.map(function (x) { return '- ' + x.tekst; }).join('\n') || '- niets vast');
    return claude(systeem, invoer, 2000, 'low') || basis;
  } catch (e) { return basis; }
}
function mailRapport(r) {
  var h = huisstijl(), naar = P.getProperty('RAPPORT_EMAIL'); if (!naar) return;
  var lijst = function (items, leeg) { return items.length ? '<ul style="padding-left:18px;margin:6px 0 14px">' + items.map(function (x) { return '<li style="margin:3px 0">' + escHtml(x.tekst) + (x.dagen ? ' <span style="color:#9A8FA0">(' + x.dagen + ' d)</span>' : '') + '</li>'; }).join('') + '</ul>' : '<p style="color:#9A8FA0;margin:4px 0 14px">' + leeg + '</p>'; };
  var kop = function (t) { return '<h3 style="margin:16px 0 4px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:' + h.kleur_primair + '">' + t + '</h3>'; };
  var html = '<div style="font-family:' + h.lettertype_tekst + ',Arial,sans-serif;max-width:620px;margin:0 auto;color:' + h.kleur_tekst + '">' +
    '<div style="background:' + h.kleur_primair + ';color:#fff;padding:18px 22px;border-bottom:4px solid ' + h.kleur_accent + '"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.85">Athena Assistent · nachtelijke review</div><div style="font-size:22px;font-weight:700;margin-top:4px">' + escHtml(datumLang(parseDatum(r.datum) || new Date())) + '</div></div>' +
    '<div style="padding:18px 22px"><p style="font-size:16px;line-height:1.55">' + escHtml(r.samenvatting) + '</p>' +
    kop('Gedaan') + lijst(r.gedaan, 'Niets geregistreerd.') + kop('Blijven liggen') + lijst(r.blijvenLiggen, 'Niets — mooi.') + kop('Vandaag aandacht') + lijst(r.vandaag, 'Niets vast.') +
    '<p style="font-size:12px;color:#9A8FA0;margin-top:20px">Open de app voor de details en om acties af te vinken.</p></div></div>';
  MailApp.sendEmail({ to: naar, subject: 'Athena · review ' + r.datum + ' — ' + r.blijvenLiggen.length + ' blijven liggen, ' + r.vandaag.length + ' vandaag', htmlBody: html, name: 'Athena Assistent' });
}

/* ===================== 4. Huisstijl-kit: posts en mails in de stijl en kleuren van AthenaSchool ===================== */

var HUISSTIJL_STANDAARD = {
  bedrijf: 'AthenaSchool',
  omschrijving: 'AthenaSchool levert onderwijsondersteuning aan scholen: onderwijsondersteuners, studentdocenten, huiswerkbegeleiding, examentraining, NT2-ondersteuning, surveillance en basisvaardigheden. Vaste gezichten, opgeleid via de AthenaAcademy, met een VOG en zonder verborgen kosten.',
  kleur_primair: '#66306E', kleur_accent: '#FAA11B', kleur_secundair: '#5D0095', kleur_tekst: '#241A28', kleur_achtergrond: '#FBF9F6',
  lettertype_kop: 'Nunito', lettertype_tekst: 'Nunito', lettertype_alternatief: 'Arial',
  logo_url: '',
  toon: 'Warm en professioneel, in de wij-vorm.\nConcreet: wat we doen, voor wie, en wat het de school oplevert.\nGeen jargon, geen superlatieven, geen uitroeptekens.\nDe school en de leerling staan centraal, niet wij.\nKorte zinnen, actieve vorm, Nederlands.',
  zinnen: 'Vast gezicht | Onderwijsondersteuning wordt beter wanneer docenten, ondersteuner en leerlingen elkaar kennen. We koppelen een vaste ondersteuner aan de school, met een vaste vervanger bij afwezigheid.\n' +
          'Opleiding | Alle medewerkers volgen een opleiding in onze online omgeving, de AthenaAcademy: klassenmanagement, communicatie in de klas, presentatievaardigheden en metacognitie.\n' +
          'Evaluatie | Aan het eind van elke periode vindt een evaluatiegesprek plaats om de kwaliteit van de ondersteuning nóg hoger te krijgen.\n' +
          'VOG | Onze medewerkers zijn in het bezit van een Verklaring Omtrent het Gedrag.\n' +
          'Geen verborgen kosten | De tarieven op de facturen zijn hetzelfde als op de offerte. Alle diensten zijn vrijgesteld van btw.'
};
var CONTENT_TYPES = {
  linkedin:    { naam: 'LinkedIn-post', instructie: 'Schrijf een LinkedIn-post van 80 tot 140 woorden namens AthenaSchool. Eén sterke openingszin, één concreet voorbeeld of inzicht, en een rustige afsluiting. Maximaal drie hashtags, alleen aan het eind. Geen emoji-opsomming.' },
  mail:        { naam: 'E-mail aan een school', instructie: 'Schrijf een korte e-mail (120 tot 200 woorden) aan een contactpersoon van een school. Eerste regel: "Onderwerp: ...". Aanhef "Beste [naam],". Sluit af met "Met vriendelijke groet," en daaronder "Menno Adan" en "AthenaSchool".' },
  nieuwsbrief: { naam: 'Nieuwsbriefitem', instructie: 'Schrijf een nieuwsbriefitem van 100 tot 160 woorden: een kop op de eerste regel, daarna de tekst, en één duidelijke call-to-action als laatste zin.' },
  vacature:    { naam: 'Vacaturetekst', instructie: 'Schrijf een vacaturetekst van 200 tot 300 woorden voor studenten en starters: kop, wat je doet, wat we vragen, wat we bieden, hoe je reageert. Kopjes op eigen regels.' },
  voorstel:    { naam: 'Intro voor een samenwerkingsvoorstel', instructie: 'Schrijf de inleidende alinea "Hulpvraag" (80 tot 140 woorden) van een samenwerkingsvoorstel: de situatie van de school, de vraag, en wat AthenaSchool voorstelt. Geen prijzen, geen namen van leerlingen.' }
};
function huisstijl() {
  var h = {}; Object.keys(HUISSTIJL_STANDAARD).forEach(function (k) { h[k] = HUISSTIJL_STANDAARD[k]; });
  lees('Huisstijl').forEach(function (r) { if (r.sleutel && r.waarde !== '') h[r.sleutel] = String(r.waarde); });
  return h;
}
function apiHuisstijl() {
  var h = huisstijl();
  var recent = lees('Content').sort(function (a, b) { return String(b.datum).localeCompare(String(a.datum)); }).slice(0, 12);
  return {
    velden: h,
    kleuren: [{ naam: 'Paars', hex: h.kleur_primair, gebruik: 'primair' }, { naam: 'Oranje', hex: h.kleur_accent, gebruik: 'accent' }, { naam: 'Diep paars', hex: h.kleur_secundair, gebruik: 'secundair' }, { naam: 'Inkt', hex: h.kleur_tekst, gebruik: 'tekst' }, { naam: 'Achtergrond', hex: h.kleur_achtergrond, gebruik: 'achtergrond' }],
    toon: h.toon.split('\n').filter(Boolean),
    zinnen: h.zinnen.split('\n').filter(Boolean).map(function (z) { var p = z.split('|'); return { titel: (p[0] || '').trim(), tekst: p.slice(1).join('|').trim() }; }),
    types: Object.keys(CONTENT_TYPES).map(function (k) { return { id: k, naam: CONTENT_TYPES[k].naam }; }),
    recent: recent.map(function (c) { return { id: c.id, datum: c.datum, type: c.type, typeNaam: (CONTENT_TYPES[c.type] || {}).naam || c.type, onderwerp: c.onderwerp, tekst: c.tekst }; })
  };
}
function apiZetHuisstijl(sleutel, waarde) {
  if (!HUISSTIJL_STANDAARD.hasOwnProperty(sleutel)) throw new Error('Onbekend huisstijlveld: ' + sleutel);
  waarde = String(waarde == null ? '' : waarde);
  if (/^kleur_/.test(sleutel) && !/^#[0-9a-fA-F]{6}$/.test(waarde)) throw new Error('Kleur als #RRGGBB.');
  metLock(function () {
    var b = blad('Huisstijl'), hit = lees('Huisstijl').filter(function (r) { return r.sleutel === sleutel; })[0];
    if (hit) b.getRange(hit._rij, 2).setValue(waarde); else b.appendRow([sleutel, waarde]);
  });
  return null;
}
function apiMaakContent(type, onderwerp, extra) {
  var t = CONTENT_TYPES[type]; if (!t) throw new Error('Onbekend contenttype.');
  onderwerp = String(onderwerp || '').trim(); if (!onderwerp) throw new Error('Geef een onderwerp.');
  var h = huisstijl();
  var systeem = 'Je schrijft teksten namens ' + h.bedrijf + '. Over het bedrijf: ' + h.omschrijving + '\n\nToon en stijl:\n' + h.toon +
    '\n\nStandaardzinnen die je mag gebruiken waar ze passen (niet geforceerd):\n' + h.zinnen + '\n\nSchrijf in het Nederlands. Lever alleen de gevraagde tekst, zonder toelichting, zonder aanhalingstekens eromheen.';
  var invoer = t.instructie + '\n\nOnderwerp: ' + onderwerp + (extra ? '\nExtra context van Menno: ' + String(extra).trim() : '');
  var tekst = claude(systeem, invoer, 4000);
  var c = metLock(function () { return schrijf('Content', { datum: nu(), type: type, onderwerp: onderwerp, tekst: tekst }); });
  return { id: c.id, datum: c.datum, type: type, typeNaam: t.naam, onderwerp: onderwerp, tekst: tekst };
}

/* ===================== 5. Geschiedenis: elke schoolopdracht doorzoekbaar ===================== */

function apiTrajecten() {
  var ts = lees('Trajecten').sort(function (a, b) { return String(b.start || b.schooljaar).localeCompare(String(a.start || a.schooljaar)); });
  return {
    trajecten: ts.map(trajectUit),
    filters: { schooljaren: uniek(ts.map(function (t) { return t.schooljaar; })).sort().reverse(), trajecten: uniek(ts.map(function (t) { return t.traject; })).sort(), statussen: TRAJECT_STATUSSEN }
  };
}
function apiTraject(id) {
  var t = vind('Trajecten', id); if (!t) throw new Error('Traject niet gevonden.');
  var school = String(t.school).toLowerCase();
  return {
    traject: trajectUit(t),
    documenten: lees('Documenten', true).filter(function (d) { return (d.school && String(d.school).toLowerCase() === school) || String(d.titel).toLowerCase().indexOf(school) >= 0; }).map(function (d) { return { id: d.id, titel: d.titel, type: d.type, url: d.url, gewijzigd: d.gewijzigd }; }),
    notities: lees('Notities').filter(function (n) { return String(n.trajectId) === String(id); }).sort(function (a, b) { return String(b.datum).localeCompare(String(a.datum)); }).map(function (n) { return { id: n.id, datum: n.datum, tekst: n.tekst }; }),
    kansen: lees('Kansen').filter(function (k) { return String(k.school).toLowerCase() === school; }).map(kansUit),
    school: lees('Scholen').filter(function (s) { return String(s.naam).toLowerCase() === school; }).map(function (s) { return { naam: s.naam, plaats: s.plaats, contactpersoon: s.contactpersoon, email: s.email, telefoon: s.telefoon, status: s.status, am: s.am }; })[0] || null
  };
}
function apiTrajectOpslaan(obj) {
  obj = obj || {};
  var velden = ['id', 'school', 'plaats', 'traject', 'schooljaar', 'start', 'eind', 'status', 'ondersteuners', 'urenPerWeek', 'tarief', 'omzet', 'contactpersoon', 'am', 'samenvatting'], schoon = {};
  velden.forEach(function (k) { if (obj[k] !== undefined) schoon[k] = obj[k]; });
  if (!String(schoon.school || '').trim() && !schoon.id) throw new Error('School is verplicht.');
  if (schoon.status && TRAJECT_STATUSSEN.indexOf(schoon.status) < 0) throw new Error('Onbekende status.');
  if (!schoon.id && !schoon.schooljaar) schoon.schooljaar = huidigSchooljaar();
  var t = metLock(function () { return schrijf('Trajecten', schoon); });
  return trajectUit(t);
}
function apiNotitieToevoegen(trajectId, tekst) {
  tekst = String(tekst || '').trim(); if (!tekst) throw new Error('Geen tekst.');
  if (!vind('Trajecten', trajectId)) throw new Error('Traject niet gevonden.');
  var n = metLock(function () { return schrijf('Notities', { trajectId: trajectId, datum: nu(), tekst: tekst }); });
  return { id: n.id, datum: n.datum, tekst: n.tekst };
}
function trajectUit(t) {
  return { id: t.id, school: t.school, plaats: t.plaats, traject: t.traject, schooljaar: t.schooljaar, start: t.start, eind: t.eind, status: t.status, ondersteuners: t.ondersteuners,
    urenPerWeek: Number(t.urenPerWeek) || 0, tarief: Number(t.tarief) || 0, omzet: Number(t.omzet) || 0, contactpersoon: t.contactpersoon, am: t.am, samenvatting: t.samenvatting, bijgewerkt: t.bijgewerkt };
}

/* ===================== Koppeling met de Cowork-map athena-assistent (data-run) ===================== */

// apiImporteer('Trajecten', [{school:..., traject:..., ...}, ...]) — rijen zonder id krijgen een stabiel id uit school+traject+schooljaar,
// zodat een herhaalde import dezelfde rij bijwerkt in plaats van dupliceert.
function apiImporteer(tabel, rijen) {
  var naam = { scholen: 'Scholen', trajecten: 'Trajecten', kansen: 'Kansen', acties: 'Acties' }[String(tabel || '').toLowerCase()];
  if (!naam) throw new Error('Importeren kan naar scholen, trajecten, kansen of acties.');
  if (!(rijen instanceof Array)) throw new Error('rijen moet een lijst zijn.');
  var kop = TABELLEN[naam];
  return metLock(function () {
    var bestaand = {}, teSchrijven = [], ongewijzigd = 0;
    lees(naam).forEach(function (r) { bestaand[String(r.id)] = r; });
    rijen.forEach(function (r) {
      var o = {}; kop.forEach(function (k) { if (r[k] !== undefined) o[k] = r[k]; });
      if (!o.id) {
        if (naam === 'Trajecten') o.id = slug([o.school, o.traject, o.schooljaar].join('-'));
        else if (naam === 'Scholen') o.id = slug(o.naam);
        else if (naam === 'Kansen') o.id = slug([o.school, o.traject].join('-'));
        else o.id = slug(o.tekst);
      }
      if (naam === 'Acties' && !o.status) o.status = 'open';
      if (naam === 'Acties' && !o.aangemaakt) o.aangemaakt = nu();
      var hit = bestaand[String(o.id)];
      // ongewijzigde rijen niet opnieuw schrijven: anders telt de nachtelijke review elke import als "bijgewerkt"
      if (hit && Object.keys(o).every(function (k) { return k === 'id' || String(hit[k]) === String(o[k]); })) { ongewijzigd++; return; }
      teSchrijven.push(o);
    });
    var stats = schrijfVeel(naam, teSchrijven);
    stats.ongewijzigd = ongewijzigd;
    return stats;
  });
}

function apiStatus() {
  var triggers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  var laatste = lees('Reviews').sort(function (a, b) { return String(b.gemaaktOp).localeCompare(String(a.gemaaktOp)); })[0];
  return { versie: VERSIE, sheetUrl: sheet().getUrl(), mapUrl: mapUrl(), model: P.getProperty('CLAUDE_MODEL') || 'claude-opus-5', effort: P.getProperty('CLAUDE_EFFORT') || 'medium',
    claudeIngesteld: !!P.getProperty('ANTHROPIC_API_KEY'), driveApi: typeof Drive !== 'undefined', laatsteIndex: P.getProperty('LAATSTE_INDEX') || '', laatsteReview: laatste ? laatste.gemaaktOp : '',
    rapportEmail: P.getProperty('RAPPORT_EMAIL') || '', reviewTrigger: triggers.indexOf('nachtelijkeReviewTrigger') >= 0, indexTrigger: triggers.indexOf('indexeerTrigger') >= 0, tijdzone: tz() };
}

/* ===================== Claude API (raw HTTP via UrlFetchApp; Apps Script heeft geen SDK) ===================== */

// Standaard claude-opus-5 met server-side fallbacks ('default'), zodat een geweigerd verzoek automatisch op een ander model landt.
// Sleutel, model en effort staan in de scripteigenschappen: ANTHROPIC_API_KEY, CLAUDE_MODEL, CLAUDE_EFFORT.
function claude(systeem, gebruiker, maxTokens, effort) {
  var sleutel = P.getProperty('ANTHROPIC_API_KEY');
  if (!sleutel) throw new Error('Geen ANTHROPIC_API_KEY ingesteld bij Projectinstellingen → Scripteigenschappen.');
  var body = {
    model: P.getProperty('CLAUDE_MODEL') || 'claude-opus-5',
    max_tokens: maxTokens || 16000,
    fallbacks: 'default',
    output_config: { effort: effort || P.getProperty('CLAUDE_EFFORT') || 'medium' },
    system: systeem,
    messages: [{ role: 'user', content: gebruiker }]
  };
  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': sleutel, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
    payload: JSON.stringify(body)
  });
  var code = resp.getResponseCode(), tekst = resp.getContentText() || '', data;
  try { data = JSON.parse(tekst); } catch (e) { data = {}; }
  if (code !== 200) throw new Error('Claude API ' + code + ': ' + ((data.error && data.error.message) || tekst.slice(0, 200)));
  if (data.stop_reason === 'refusal') return 'Hier kan ik niet bij helpen: het verzoek is door de veiligheidsfilters geweigerd.';
  var uit = (data.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n').trim();
  if (data.stop_reason === 'max_tokens') uit += '\n\n(Antwoord afgekapt — stel een kortere vraag.)';
  return uit;
}

/* ===================== Hulpfuncties ===================== */

function tz() { return Session.getScriptTimeZone(); }
function datumStr(d) { return (d instanceof Date) ? Utilities.formatDate(d, tz(), 'yyyy-MM-dd') : String(d || ''); }
function datumTijdStr(d) { return Utilities.formatDate(d, tz(), 'yyyy-MM-dd HH:mm'); }
function nu() { return datumTijdStr(new Date()); }
function plusDagen(n) { return new Date(Date.now() + n * 86400000); }
function parseDatum(s) {
  if (s instanceof Date) return s;
  s = String(s || '').trim(); if (!s) return null;
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0));
}
function dagenSinds(s) { var d = parseDatum(s); return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null; }
function dagenTot(s) { var d = parseDatum(s); return d ? Math.ceil((d.getTime() - Date.now()) / 86400000) : null; }
var DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
var MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
function datumLang(d) { return DAGEN[d.getDay()] + ' ' + d.getDate() + ' ' + MAANDEN[d.getMonth()]; }
function groet() { var u = new Date().getHours(), n = P.getProperty('NAAM') || 'Menno'; return (u < 12 ? 'Goedemorgen' : u < 18 ? 'Goedemiddag' : 'Goedenavond') + ' ' + n; }
function huidigSchooljaar() { var d = new Date(), j = d.getFullYear(); return d.getMonth() >= 7 ? j + '-' + (j + 1) : (j - 1) + '-' + j; }
function nieuwId() { return 'k' + Utilities.getUuid().replace(/-/g, '').slice(0, 9); }  // begint met een letter: Sheets maakt van een cijferreeks anders een getal
function slug(s) { return zonderAccenten(String(s || '').toLowerCase()).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || nieuwId(); }
function zonderAccenten(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function uniek(lijst) { var uit = []; lijst.forEach(function (x) { if (x !== '' && x != null && uit.indexOf(x) < 0) uit.push(x); }); return uit; }
function vind(naam, id) { return lees(naam).filter(function (r) { return String(r.id) === String(id); })[0] || null; }
function mapUrl() { var id = P.getProperty('DRIVE_MAP_ID'); try { return id ? DriveApp.getFolderById(id).getUrl() : ''; } catch (e) { return ''; } }
function naamUitAdres(van) { var m = String(van).match(/^"?([^"<]+?)"?\s*<|^([^@\s]+)@/); return (m && (m[1] || m[2]) || String(van)).trim(); }
function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function xmlAttr(s) { return escHtml(s).replace(/\n/g, ' '); }
