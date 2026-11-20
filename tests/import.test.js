import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';
import * as I from '../js/importer.js';
import * as C from '../js/categorize.js';
import * as R from '../js/recurring.js';

// Alle Beispieldaten in dieser Datei sind frei erfunden.

const SPARKASSE = `"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Glaeubiger ID";"Mandatsreferenz";"Kundenreferenz (End-to-End)";"Sammlerreferenz";"Lastschrift Ursprungsbetrag";"Auslagenersatz Ruecklastschrift";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info"
"DE00123456780000000001";"18.11.26";"18.11.26";"KARTENZAHLUNG";"2026-11-18T12:03 Debitk.1 2029-12";"";"";"";"";"";"";"REWE Markt GmbH";"DE00999";"COBADEFFXXX";"-23,45";"EUR";"Umsatz gebucht"
"DE00123456780000000001";"03.11.26";"03.11.26";"FOLGELASTSCHRIFT";"Miete November Whg 4";"";"";"";"";"";"";"Hausverwaltung Beispiel";"DE00888";"";"-890,00";"EUR";"Umsatz gebucht"
"DE00123456780000000001";"28.10.26";"28.10.26";"GUTSCHR. UEBERWEISUNG";"Gehalt Oktober";"";"";"";"";"";"";"Beispiel AG";"DE00777";"";"2.850,00";"EUR";"Umsatz gebucht"
"DE00123456780000000001";"19.11.26";"19.11.26";"KARTENZAHLUNG";"vorgemerkt";"";"";"";"";"";"";"Bäckerei Körner";"";"";"-3,20";"EUR";"Umsatz vorgemerkt"
`;

const VOLKSBANK = `Bezeichnung Auftragskonto;IBAN Auftragskonto;BIC Auftragskonto;Bankname Auftragskonto;Buchungstag;Valutadatum;Name Zahlungsbeteiligter;IBAN Zahlungsbeteiligter;BIC (SWIFT-Code) Zahlungsbeteiligter;Buchungstext;Verwendungszweck;Betrag;Waehrung;Saldo nach Buchung;Bemerkung;Kategorie;Steuerrelevant;Glaeubiger ID;Mandatsreferenz
Girokonto;DE00111;GENODEF1XXX;Volksbank Beispiel;05.11.2026;05.11.2026;Netflix International B.V.;NL00222;;Lastschrift;Netflix Abo 123;-13,99;EUR;1.234,56;;;;;
Girokonto;DE00111;GENODEF1XXX;Volksbank Beispiel;06.11.2026;06.11.2026;ARAL Station 123;;;Kartenzahlung;Tanken;-61,20;EUR;1.173,36;;;;;
`;

const ING = `Umsatzanzeige;Datei erstellt am: 20.11.2026 10:00
;Letztes Update: aktuell

IBAN;DE00 1234 5678 9000 0000 00
Kontoname;Girokonto
Bank;ING
Kunde;Erika Beispiel
Zeitraum;01.11.2026 - 20.11.2026
Saldo;1.234,56;EUR

Sortierung;Datum absteigend

Buchung;Wertstellungsdatum;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung
12.11.2026;12.11.2026;VISA SPOTIFY;Lastschrift;Spotify P1234;1.234,56;EUR;-10,99;EUR
10.11.2026;10.11.2026;Stadtwerke Beispielstadt;Lastschrift;Abschlag Strom;1.245,55;EUR;-65,00;EUR
`;

const DKB = `"Konto";"Girokonto DE00 1200 3000 0000 0000 00"
""
"Kontostand vom 20.11.2026:";"1.000,00 €"
""
"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)";"Gläubiger-ID";"Mandatsreferenz";"Kundenreferenz"
"14.11.26";"14.11.26";"Gebucht";"Erika Beispiel";"Lidl sagt Danke";"Kartenzahlung";"Ausgang";"DE00";"-18,7";"";"";""
"15.11.26";"15.11.26";"Gebucht";"Max Beispiel";"Erika Beispiel";"Nachhilfe Oktober";"Eingang";"DE00";"120";"";"";""
"20.11.26";"20.11.26";"Vorgemerkt";"Erika Beispiel";"Cafe Beispiel";"";"Ausgang";"";"-4,5";"";"";""
`;

const COMMERZBANK = `Buchungstag;Wertstellung;Umsatzart;Buchungstext;Betrag;Währung;IBAN Kontoinhaber;Kategorie
11.11.2026;11.11.2026;Lastschrift;DB Vertrieb GmbH//Frankfurt/DE 2026-11-10T08:12:00 Karte Nr. XXXX1234;-49,90;EUR;DE00444;
`;

const N26 = `"Booking Date","Value Date","Partner Name","Partner Iban",Type,"Payment Reference","Account Name","Amount (EUR)","Original Amount","Original Currency","Exchange Rate"
2026-11-09,2026-11-09,"Edeka Center",,"Debit Transfer","","Hauptkonto",-42.37,,,
2026-11-01,2026-11-01,"Beispiel GmbH",DE00555,"Credit Transfer","Lohn 10/2026","Hauptkonto",2850.00,,,
`;

const COMDIRECT = `;
"Umsätze Girokonto";"Zeitraum: 30 Tage";
"Neuer Kontostand";"1.234,56 EUR";

"Buchungstag";"Wertstellung (Valuta)";"Vorgang";"Buchungstext";"Umsatz in EUR";
"offen";"20.11.2026";"Visa-Umsatz";"Buchungstext: AMAZON EU";"-29,99";
"16.11.2026";"16.11.2026";"Lastschrift / Belastung";"Auftraggeber: PayPal Europe S.a.r.l. et Cie S.C.A Buchungstext: . Spotify AB, Ihr Einkauf bei Spotify AB Ref. 123";"-10,99";
"13.11.2026";"13.11.2026";"Übertrag / Überweisung";"Empfänger: Vermieter Beispiel Kto/IBAN: DE00 Buchungstext: Miete Dezember";"-890,00";
`;

const DEUTSCHE_BANK = `Umsätze Girokonto;Zeitraum: 01.11.2026 - 20.11.2026
Buchungstag;Wert;Umsatzart;Begünstigter / Auftraggeber;Verwendungszweck;IBAN;BIC;Kundenreferenz;Mandatsreferenz ;Gläubiger ID;Fremde Gebühren;Betrag;Abweichender Empfänger;Anzahl der Aufträge;Anzahl der Schecks;Soll;Haben;Währung
07.11.2026;07.11.2026;SEPA-Lastschrift;Apotheke am Markt;Rezept;DE00;;;;;;;;;;-12,50;;EUR
08.11.2026;08.11.2026;SEPA-Gutschrift;Oma Beispiel;Geschenk;DE00;;;;;;;;;;;50,00;EUR
`;

const VOLKSBANK_OLD = `Buchungstag;Valuta;Auftraggeber/Zahlungsempfänger;Empfänger/Zahlungspflichtiger;Konto-Nr.;IBAN;BLZ;BIC;Vorgang/Verwendungszweck;Kundenreferenz;Währung;Umsatz;
04.11.2026;04.11.2026;Erika Beispiel;Shell Station;;;;;Tanken;;EUR;55,10;S
05.11.2026;05.11.2026;Erika Beispiel;Firma Beispiel;;;;;Honorar;;EUR;300,00;H
`;

const byName = (rows, name) => rows.find((r) => r.name.toLowerCase().includes(name.toLowerCase()));

test('CSV-Grundlagen: Trennzeichen, Anführungszeichen, Datum, Beträge', () => {
  assert.equal(I.detectDelimiter(SPARKASSE), ';');
  assert.equal(I.detectDelimiter(N26), ',');
  assert.deepEqual(I.parseCSV('a;"b;c";"d ""x"""\n1;2;3'), [['a', 'b;c', 'd "x"'], ['1', '2', '3']]);
  assert.equal(I.parseDate('18.11.26'), '2026-11-18');
  assert.equal(I.parseDate('2026-11-18'), '2026-11-18');
  assert.equal(I.parseDate('18/11/2026'), '2026-11-18');
  assert.equal(I.parseDate('31.02.2026'), null);
  assert.equal(I.parseDate('offen'), null);
  assert.equal(I.parseSignedAmount('-1.234,56'), -123456);
  assert.equal(I.parseSignedAmount('2.850,00'), 285000);
  assert.equal(I.parseSignedAmount('-42.37'), -4237);
  assert.equal(I.parseSignedAmount('-18,7'), -1870);
  assert.equal(I.parseSignedAmount('12,50 €'), 1250);
  assert.equal(I.parseSignedAmount('12,50-'), -1250);
  assert.equal(I.parseSignedAmount('(3,00)'), -300);
  assert.equal(I.parseSignedAmount('EUR 7,00'), 700);
  assert.equal(I.parseSignedAmount('€12.50'), 1250);
  assert.equal(I.parseSignedAmount(''), null);
});

test('Sparkasse: zweistellige Jahre, Soll/Haben über Vorzeichen, vorgemerkte übersprungen', () => {
  const p = I.parseBankCsv(SPARKASSE);
  assert.equal(p.label, 'Sparkasse');
  assert.equal(p.rows.length, 3);
  assert.equal(p.pending, 1);
  const rewe = byName(p.rows, 'REWE');
  assert.deepEqual([rewe.date, rewe.amount, rewe.type], ['2026-11-18', 2345, 'expense']);
  const gehalt = byName(p.rows, 'Beispiel AG');
  assert.deepEqual([gehalt.amount, gehalt.type], [285000, 'income']);
});

test('Sparkasse als Windows-1252 (Umlaute) wird korrekt dekodiert', () => {
  const text = SPARKASSE.replace('Hausverwaltung Beispiel', 'Hausverwaltung Müller');
  const bytes = Uint8Array.from(text, (ch) => ch.charCodeAt(0)); // Latin-1/Windows-1252
  const decoded = I.decodeBytes(bytes);
  assert.ok(decoded.includes('Müller'));
  assert.ok(byName(I.parseBankCsv(decoded).rows, 'Müller'));
  // UTF-8 mit BOM
  const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Bäckerei')]);
  assert.equal(I.decodeBytes(utf8), 'Bäckerei');
});

test('Volksbank (neu): Betrag statt „Saldo nach Buchung“', () => {
  const p = I.parseBankCsv(VOLKSBANK);
  assert.equal(p.label, 'Volksbank / Raiffeisenbank');
  assert.deepEqual(p.rows.map((r) => r.amount), [1399, 6120]);
  assert.equal(p.rows[0].name, 'Netflix International B.V.');
});

test('Volksbank (alt): S/H-Kennzeichen in Spalte ohne Überschrift', () => {
  const p = I.parseBankCsv(VOLKSBANK_OLD);
  assert.deepEqual(p.rows.map((r) => [r.type, r.amount]), [['expense', 5510], ['income', 30000]]);
  assert.equal(p.rows[0].name, 'Shell Station');
  assert.equal(p.rows[1].name, 'Firma Beispiel');
});

test('ING: Vorspann-Zeilen, Betrag statt Saldo', () => {
  const p = I.parseBankCsv(ING);
  assert.equal(p.label, 'ING');
  assert.deepEqual(p.rows.map((r) => [r.date, r.amount, r.name]), [
    ['2026-11-12', 1099, 'VISA SPOTIFY'],
    ['2026-11-10', 6500, 'Stadtwerke Beispielstadt'],
  ]);
});

test('DKB: Empfänger bei Ausgaben, Zahlungspflichtiger bei Einnahmen, Vorgemerkt übersprungen', () => {
  const p = I.parseBankCsv(DKB);
  assert.equal(p.label, 'DKB');
  assert.equal(p.pending, 1);
  assert.deepEqual(p.rows.map((r) => [r.type, r.amount, r.name]), [
    ['expense', 1870, 'Lidl sagt Danke'],
    ['income', 12000, 'Max Beispiel'],
  ]);
});

test('Commerzbank: Händler aus dem Buchungstext', () => {
  const p = I.parseBankCsv(COMMERZBANK);
  assert.equal(p.label, 'Commerzbank');
  assert.equal(p.rows[0].amount, 4990);
  assert.equal(p.rows[0].name, 'DB Vertrieb GmbH');
});

test('N26: Komma als Trennzeichen, Punkt als Dezimalzeichen, ISO-Datum', () => {
  const p = I.parseBankCsv(N26);
  assert.equal(p.label, 'N26');
  assert.deepEqual(p.rows.map((r) => [r.date, r.type, r.amount, r.name]), [
    ['2026-11-09', 'expense', 4237, 'Edeka Center'],
    ['2026-11-01', 'income', 285000, 'Beispiel GmbH'],
  ]);
});

test('comdirect: "offen" übersprungen, Auftraggeber/Empfänger und PayPal-Händler extrahiert', () => {
  const p = I.parseBankCsv(COMDIRECT);
  assert.equal(p.label, 'comdirect');
  assert.equal(p.pending, 1);
  assert.deepEqual(p.rows.map((r) => r.name), ['Spotify AB', 'Vermieter Beispiel Kto/IBAN: DE00'.split(' Kto')[0]]);
  assert.deepEqual(p.rows.map((r) => r.amount), [1099, 89000]);
});

test('Deutsche Bank / Postbank: getrennte Soll- und Haben-Spalten', () => {
  const p = I.parseBankCsv(DEUTSCHE_BANK);
  assert.equal(p.label, 'Deutsche Bank / Postbank');
  assert.deepEqual(p.rows.map((r) => [r.type, r.amount, r.name]), [
    ['expense', 1250, 'Apotheke am Markt'],
    ['income', 5000, 'Oma Beispiel'],
  ]);
});

test('Unbekanntes Format liefert verständliche Fehlermeldung', () => {
  assert.throws(() => I.parseBankCsv('foo;bar\n1;2'), /Format nicht erkannt/);
});

/* ---------- Apple Pay ---------- */

const AP_FILE = `2026-11-18;12:03:44;23,45 €;REWE;483920175
2026-11-18;17:20:01;3,90 €;Bäckerei Körner;12
2026-11-19;08:15:00;€4.50;Café; am Markt;999

2026-11-20;09:00:00;-15,00 €;Zalando;77
kaputt;;;;
`;

test('Apple-Pay-Datei: Erkennung, Felder, Händler mit Semikolon, Erstattungen', () => {
  assert.equal(I.looksLikeApplePay(AP_FILE), true);
  assert.equal(I.looksLikeApplePay(SPARKASSE), false);
  const p = I.parseImportText(AP_FILE);
  assert.equal(p.format, 'applepay');
  assert.equal(p.rows.length, 4);
  assert.equal(p.skipped, 1);
  assert.deepEqual(p.rows[0], { key: 'ap:2026-11-18:12:03:44:483920175:2345', src: 'applepay', date: '2026-11-18', time: '12:03:44', amount: 2345, type: 'expense', name: 'REWE', text: 'REWE' });
  assert.equal(p.rows[2].name, 'Café; am Markt');
  assert.equal(p.rows[2].amount, 450);
  assert.equal(p.rows[3].type, 'income'); // Erstattung
});

test('Apple-Pay-Import: nur neue Einträge, bekannte IDs werden übersprungen', () => {
  const data = L.createEmptyState();
  const first = I.buildCandidates(I.parseImportText(AP_FILE), data);
  assert.equal(first.candidates.length, 4);
  assert.equal(first.known, 0);
  // Übernehmen
  for (const c of first.candidates) data.transactions.push(I.candidateToTransaction(c, L.uid));
  L.rememberSeen(data, first.candidates.map((c) => c.key));
  // Datei ist gewachsen: eine neue Zeile
  const grown = `${AP_FILE}2026-11-21;10:00:00;7,80 €;Aral;5555\n`;
  const second = I.buildCandidates(I.parseImportText(grown), data);
  assert.equal(second.known, 4);
  assert.deepEqual(second.candidates.map((c) => c.name), ['Aral']);
  assert.equal(second.candidates[0].category, 'mobilitaet');
  // Zwei echte Kaffees am selben Tag mit gleichem Betrag sind KEINE Duplikate (unterschiedliche IDs)
  const twoCoffees = I.buildCandidates(I.parseImportText('2026-11-22;08:00:00;3,20;Café Blau;1\n2026-11-22;15:00:00;3,20;Café Blau;2\n'), data);
  assert.equal(twoCoffees.candidates.filter((c) => c.selected).length, 2);
});

test('Duplikate: Kontoauszug gegen bereits importierte Apple-Pay-Zahlung', () => {
  const data = L.createEmptyState();
  const ap = I.buildCandidates(I.parseImportText('2026-11-18;12:03:44;23,45 €;REWE;1\n'), data);
  data.transactions.push(I.candidateToTransaction(ap.candidates[0], L.uid));

  const bank = I.buildCandidates(I.parseBankCsv(SPARKASSE), data);
  const rewe = bank.candidates.find((c) => c.name.includes('REWE'));
  assert.ok(rewe.duplicateOf, 'REWE vom Kontoauszug soll als Duplikat erkannt werden');
  assert.equal(rewe.selected, false);
  assert.equal(bank.candidates.find((c) => c.name.includes('Hausverwaltung')).duplicateOf, null);

  // Bank bucht einen Tag später: trotzdem Duplikat (ähnlicher Händler, gleicher Betrag)
  const later = SPARKASSE.replace('"18.11.26";"18.11.26";"KARTENZAHLUNG"', '"19.11.26";"19.11.26";"KARTENZAHLUNG"');
  assert.ok(I.buildCandidates(I.parseBankCsv(later), data).candidates.find((c) => c.name.includes('REWE')).duplicateOf);

  // Gleicher Betrag, gleicher Tag, aber anderer Händler -> kein Duplikat
  const other = SPARKASSE.replace('REWE Markt GmbH', 'Kino Beispiel');
  assert.equal(I.buildCandidates(I.parseBankCsv(other), data).candidates.find((c) => c.name.includes('Kino')).duplicateOf, null);

  // Derselbe Kontoauszug zweimal: zweiter Import findet nichts Neues
  const once = I.buildCandidates(I.parseBankCsv(VOLKSBANK), data);
  L.rememberSeen(data, once.candidates.map((c) => c.key));
  const twice = I.buildCandidates(I.parseBankCsv(VOLKSBANK), data);
  assert.equal(twice.candidates.length, 0);
  assert.equal(twice.known, 2);
});

test('Duplikate: Kontoauszug gegen automatisch gebuchten Dauerauftrag', () => {
  const data = L.createEmptyState();
  data.recurring.push({ id: 'r1', type: 'expense', amount: 89000, category: 'wohnen', note: 'Miete', mkey: 'miete', interval: 'monthly', day: 1, nextDate: '2026-11-01', active: true });
  R.applyRecurring(data, '2026-11-20', L.uid);
  const bank = I.buildCandidates(I.parseBankCsv(SPARKASSE), data);
  const miete = bank.candidates.find((c) => c.name.includes('Hausverwaltung'));
  assert.ok(miete.duplicateOf, 'Miete vom Konto (03.11.) = Dauerauftrag (01.11.)');
});

/* ---------- Kategorien ---------- */

test('Automatische Kategorien aus Händler und Verwendungszweck', () => {
  const cat = (type, text) => C.suggestCategory(type, text, C.merchantKey(text), {}).category;
  for (const t of ['REWE Markt GmbH', 'EDEKA Center', 'Lidl sagt Danke', 'ALDI SUED', 'Netto Marken-Discount', 'Kaufland']) assert.equal(cat('expense', t), 'lebensmittel', t);
  for (const t of ['ARAL Station 123', 'Shell Deutschland', 'DB Vertrieb GmbH', 'Deutsche Bahn', 'BVG Ticket', 'UBER *TRIP']) assert.equal(cat('expense', t), 'mobilitaet', t);
  for (const t of ['Netflix International B.V.', 'VISA SPOTIFY', 'Spotify AB', 'Amazon Prime', 'Disney Plus']) assert.equal(cat('expense', t), 'abos', t);
  for (const t of ['Miete November Whg 4', 'Stadtwerke Beispielstadt Abschlag Strom', 'Rundfunk ARD ZDF Beitragsservice']) assert.equal(cat('expense', t), 'wohnen', t);
  assert.equal(cat('expense', 'Amazon EU S.a.r.l.'), 'shopping');
  assert.equal(cat('expense', 'Uber Eats'), 'freizeit');
  assert.equal(cat('expense', 'Apotheke am Markt'), 'gesundheit');
  assert.equal(cat('expense', 'Bahnhofsbuchhandlung'), 'sonstiges');
  assert.equal(cat('income', 'Gehalt Oktober'), 'gehalt');
  assert.equal(cat('income', 'Lohn 10/2026'), 'gehalt');
  assert.equal(cat('income', 'Nachhilfe Oktober'), 'nebenjob');
  assert.equal(cat('income', 'Geschenk von Oma'), 'geschenk');
  assert.equal(cat('expense', 'Unbekannter Laden XY'), 'sonstiges');
});

test('Händler-Schlüssel und Ähnlichkeit', () => {
  assert.equal(C.merchantKey('REWE Markt GmbH'), 'rewe');
  assert.equal(C.merchantKey('REWE'), 'rewe');
  assert.equal(C.merchantKey('Netflix.com'), 'netflix');
  assert.equal(C.merchantKey('Lidl sagt Danke'), 'lidl');
  assert.equal(C.merchantSimilar('REWE', 'REWE Markt GmbH'), true);
  assert.equal(C.merchantSimilar('Spotify', 'PayPal Europe Spotify AB'), true);
  assert.equal(C.merchantSimilar('REWE', 'Kino Beispiel'), false);
  assert.equal(C.merchantSimilar('', 'REWE'), null);
});

test('Gelernte Kategorie hat Vorrang und gilt für ähnliche Händlernamen', () => {
  const learned = {};
  learned[C.learnedKey('expense', 'rewe')] = 'freizeit';
  assert.deepEqual(C.suggestCategory('expense', 'REWE Markt GmbH', C.merchantKey('REWE Markt GmbH'), learned), { category: 'freizeit', source: 'learned' });
  learned[C.learnedKey('expense', 'edeka')] = 'shopping';
  assert.equal(C.suggestCategory('expense', 'Edeka Center Süd', C.merchantKey('Edeka Center Süd'), learned).category, 'shopping');
  // Einnahmen und Ausgaben werden getrennt gelernt
  assert.equal(C.suggestCategory('income', 'REWE', 'rewe', learned).category, 'sonstiges');

  // Beim Import wird Gelerntes angewendet
  const data = L.createEmptyState();
  data.learned = learned;
  const c = I.buildCandidates(I.parseImportText('2026-11-18;12:00:00;9,99;REWE;1\n'), data).candidates[0];
  assert.deepEqual([c.category, c.catSource], ['freizeit', 'learned']);
});

/* ---------- Wiederkehrende Buchungen ---------- */

test('Dauerauftrag bucht fällige Termine genau einmal, Monatsende wird korrekt behandelt', () => {
  const data = L.createEmptyState();
  data.recurring.push(
    { id: 'miete', type: 'expense', amount: 89000, category: 'wohnen', note: 'Miete', mkey: 'miete', interval: 'monthly', day: 1, nextDate: '2026-09-01', active: true },
    { id: 'gehalt', type: 'income', amount: 285000, category: 'gehalt', note: 'Gehalt', mkey: 'gehalt', interval: 'monthly', day: 31, nextDate: '2026-08-31', active: true },
    { id: 'netflix', type: 'expense', amount: 1399, category: 'abos', note: 'Netflix', mkey: 'netflix', interval: 'monthly', day: 25, nextDate: '2026-11-25', active: true },
    { id: 'pause', type: 'expense', amount: 100, category: 'abos', note: 'Pausiert', interval: 'monthly', day: 1, nextDate: '2026-01-01', active: false },
  );
  const created = R.applyRecurring(data, '2026-11-20', L.uid);
  const dates = (id) => data.transactions.filter((t) => t.rid === id).map((t) => t.date);
  assert.deepEqual(dates('miete'), ['2026-09-01', '2026-10-01', '2026-11-01']);
  assert.deepEqual(dates('gehalt'), ['2026-08-31', '2026-09-30', '2026-10-31']);
  assert.deepEqual(dates('netflix'), []);
  assert.deepEqual(dates('pause'), []);
  assert.equal(created.length, 6);
  assert.equal(data.recurring[0].nextDate, '2026-12-01');
  assert.equal(data.recurring[1].nextDate, '2026-11-30');
  // Erneut ausführen: keine Doppelbuchung
  assert.equal(R.applyRecurring(data, '2026-11-20', L.uid).length, 0);
  // Später: Netflix und Gehalt fällig
  assert.equal(R.applyRecurring(data, '2026-11-30', L.uid).length, 2);
  assert.ok(data.transactions.every((t) => t.src === 'recurring' && t.auto === false));
  // Summen stimmen
  assert.equal(L.monthSummary(data.transactions, '2026-11').expense, 89000 + 1399);
});

test('Intervalle: wöchentlich, vierteljährlich, jährlich (29.02.)', () => {
  assert.equal(R.nextOccurrence({ interval: 'weekly' }, '2026-12-28'), '2027-01-04');
  assert.equal(R.nextOccurrence({ interval: 'quarterly', day: 31 }, '2026-11-30'), '2027-02-28');
  assert.equal(R.nextOccurrence({ interval: 'yearly', day: 29 }, '2028-02-29'), '2029-02-28');
  assert.equal(R.firstOnOrAfter(28, '2026-11-20'), '2026-11-28');
  assert.equal(R.firstOnOrAfter(1, '2026-11-20'), '2026-12-01');
  assert.equal(R.describeRule({ interval: 'monthly', day: 28, nextDate: '2026-11-28' }), 'Monatlich am 28.');
});

test('Erkennung wiederkehrender Zahlungen nach dem Import', () => {
  const data = L.createEmptyState();
  const add = (date, name, amount, type = 'expense', category = 'abos') =>
    data.transactions.push({ id: L.uid(), type, amount, category, note: name, merchant: name, mkey: C.merchantKey(name), date, createdAt: 0, src: 'bank' });
  ['2026-08-05', '2026-09-05', '2026-10-06', '2026-11-05'].forEach((d) => add(d, 'Netflix International B.V.', 1399));
  ['2026-08-28', '2026-09-28', '2026-10-28'].forEach((d, i) => add(d, 'Beispiel AG', 285000 + i * 1000, 'income', 'gehalt'));
  // Einkäufe: unregelmäßig und unterschiedliche Beträge -> kein Vorschlag
  ['2026-11-01', '2026-11-04', '2026-11-12', '2026-11-15'].forEach((d, i) => add(d, 'REWE', 2000 + i * 1500, 'expense', 'lebensmittel'));
  // Zwei identische Monatsbeträge reichen
  ['2026-10-12', '2026-11-12'].forEach((d) => add(d, 'Handyvertrag Fraenk', 1000));
  // Altes Abo, längst gekündigt -> kein Vorschlag
  ['2026-01-03', '2026-02-03', '2026-03-03'].forEach((d) => add(d, 'Altes Magazin', 499));

  const s = R.detectRecurring(data, '2026-11-20');
  const names = s.map((x) => x.note).sort();
  assert.deepEqual(names, ['Beispiel AG', 'Handyvertrag Fraenk', 'Netflix International B.V.']);
  const netflix = s.find((x) => x.note.startsWith('Netflix'));
  assert.deepEqual([netflix.interval, netflix.day, netflix.nextDate, netflix.count], ['monthly', 5, '2026-12-05', 4]);
  const gehalt = s.find((x) => x.type === 'income');
  assert.deepEqual([gehalt.category, gehalt.day, gehalt.nextDate], ['gehalt', 28, '2026-11-28']);

  // Abgelehnt oder schon angelegt -> nicht erneut vorschlagen
  data.dismissedSuggestions.push(netflix.key);
  data.recurring.push({ id: 'g', type: 'income', amount: 285000, category: 'gehalt', note: 'Gehalt', mkey: gehalt.mkey, interval: 'monthly', day: 28, nextDate: '2026-11-28', active: true });
  assert.deepEqual(R.detectRecurring(data, '2026-11-20').map((x) => x.note), ['Handyvertrag Fraenk']);
});

test('Gespeicherte Automatik-Daten überstehen Export/Import (sanitizeData)', () => {
  const data = L.generateSampleData('2026-11-20');
  data.learned['expense:rewe'] = 'lebensmittel';
  data.learned['expense:<script>'] = 'abos';
  data.learned['expense:netflix'] = 'gibtsnicht';
  data.importInfo = { lastImportAt: 123, seen: ['ap:1', 42] };
  const clean = L.sanitizeData(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(clean.learned, { 'expense:rewe': 'lebensmittel' });
  assert.deepEqual(clean.importInfo, { lastImportAt: 123, seen: ['ap:1'] });
  assert.equal(clean.recurring.length, 8);
  assert.ok(clean.recurring.every((r) => r.nextDate > '2026-11-20'));
  assert.ok(clean.transactions.some((t) => t.src === 'recurring' && t.rid));
  // Beispieldaten: Daueraufträge sind schon gebucht -> applyRecurring erzeugt heute nichts doppelt
  assert.equal(R.applyRecurring(clean, '2026-11-20', L.uid).length, 0);
});
