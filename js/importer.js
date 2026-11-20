/*
 * Flowly – Import von Apple-Pay-Eingangsdatei (Kurzbefehle) und Bank-CSV-Kontoauszügen.
 * Alles passiert lokal im Browser; Dateien werden nur gelesen, nie hochgeladen.
 */
import { parseAmount, isValidISODate, getCategory, MAX_CENTS } from './logic.js';
import { normalizeText, merchantKey, merchantSimilar, suggestCategory } from './categorize.js';

/* ---------- Text & CSV ---------- */

/** Bytes -> Text. UTF-8 bevorzugt, sonst Windows-1252 (typisch für Sparkasse & Co.). */
export function decodeBytes(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      text = new TextDecoder('windows-1252').decode(bytes);
    } catch {
      text = new TextDecoder('iso-8859-1').decode(bytes);
    }
  }
  return text.replace(/^﻿/, '');
}

/** CSV-Parser mit Anführungszeichen ("" als Escape) und Zeilenumbrüchen in Feldern. */
export function parseCSV(text, delimiter = ';') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ''));
}

export function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 40).join('\n');
  let best = ';';
  let bestScore = -1;
  for (const d of [';', ',', '\t', '|']) {
    const counts = parseCSV(sample, d).map((r) => r.length).filter((n) => n > 1);
    if (!counts.length) continue;
    const freq = new Map();
    counts.forEach((n) => freq.set(n, (freq.get(n) || 0) + 1));
    const [mode, times] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = times * Math.min(mode, 12);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/* ---------- Datum & Betrag ---------- */

const pad2 = (n) => String(n).padStart(2, '0');

/** "20.11.2026", "20.11.26", "2026-11-20", "20/11/2026", "20-11-2026" -> "2026-11-20" */
export function parseDate(str) {
  const s = String(str ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y;
  let mo;
  let d;
  if (m) [, y, mo, d] = m;
  else if ((m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/))) {
    [, d, mo, y] = m;
    if (y.length === 2) y = `20${y}`;
    else if (y.length === 3) return null;
  } else return null;
  const iso = `${y}-${pad2(mo)}-${pad2(d)}`;
  return isValidISODate(iso) ? iso : null;
}

/** Vorzeichenbehafteter Betrag in Cent: "-1.234,56", "12,50 €", "-12.5", "12,50-", "(3,00)", "EUR 7,00" */
export function parseSignedAmount(str) {
  let s = String(str ?? '').trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[A-Za-z€$£\s  ']/g, '');
  if (/[-−]$/.test(s)) {
    neg = !neg;
    s = s.slice(0, -1);
  }
  if (/^\+/.test(s)) s = s.slice(1);
  if (/^[-−]/.test(s)) {
    neg = !neg;
    s = s.slice(1);
  }
  const v = parseAmount(s, { allowZero: true });
  if (v == null) return null;
  return neg ? -v : v;
}

/* ---------- Apple-Pay-Eingangsdatei ---------- */

const AP_LINE = /^\s*"?(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4})"?\s*;\s*"?(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?)"?\s*;/;

export function looksLikeApplePay(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return false;
  const hits = lines.filter((l) => AP_LINE.test(l)).length;
  return hits > 0 && hits >= lines.length * 0.6;
}

/**
 * Zeilen der Kurzbefehl-Datei: Datum;Uhrzeit;Betrag;Händler;ID
 * Händler darf selbst Semikolons enthalten (alles zwischen Betrag und ID).
 */
export function parseApplePay(text) {
  const rows = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const rawParts = line.split(';');
    const parts = rawParts.map((p) => p.trim().replace(/^"|"$/g, ''));
    const date = parseDate(parts[0]);
    if (!date || parts.length < 4) {
      skipped++;
      continue;
    }
    const time = (parts[1] || '').replace(/\./g, ':');
    const signed = parseSignedAmount(parts[2]);
    if (signed == null || signed === 0 || Math.abs(signed) > MAX_CENTS) {
      skipped++;
      continue;
    }
    const id = parts.length >= 5 ? parts[parts.length - 1] : '';
    const merchant = (parts.length >= 5 ? rawParts.slice(3, -1).join(';') : rawParts[3]).trim().replace(/^"|"$/g, '').trim() || 'Apple Pay';
    // Positive Beträge sind Zahlungen (Ausgaben), negative z. B. Erstattungen
    const type = signed > 0 ? 'expense' : 'income';
    const key = `ap:${date}:${time}:${id || normalizeText(merchant)}:${Math.abs(signed)}`;
    rows.push({ key, src: 'applepay', date, time, amount: Math.abs(signed), type, name: merchant.slice(0, 80), text: merchant });
  }
  return { format: 'applepay', label: 'Apple Pay (Kurzbefehl)', rows, skipped, pending: 0 };
}

/* ---------- Bank-CSV ---------- */

const H = (s) => normalizeText(s).replace(/ /g, '');

function findCol(headers, exact, prefixes = [], exclude = []) {
  for (const e of exact) {
    const i = headers.indexOf(e);
    if (i >= 0) return i;
  }
  for (const p of prefixes) {
    const i = headers.findIndex((h) => h.startsWith(p) && !exclude.some((x) => h.includes(x)));
    if (i >= 0) return i;
  }
  return -1;
}

function mapColumns(rawHeaders) {
  const h = rawHeaders.map(H);
  const col = {
    date: findCol(h, ['buchungstag', 'buchungsdatum', 'buchung', 'datum', 'date', 'bookingdate', 'transaktionsdatum'], ['buchungstag', 'buchungsdatum']),
    valuta: findCol(h, ['valuta', 'valutadatum', 'wertstellung', 'wert', 'valuedate', 'wertstellungsdatum', 'wertstellungvaluta']),
    amount: findCol(
      h,
      ['betrag', 'betrageur', 'betragineur', 'betrageuro', 'umsatz', 'umsatzineur', 'umsatzeur', 'amount', 'amounteur', 'betragwaehrung'],
      ['betrag', 'umsatzin', 'amount'],
      ['ursprung', 'original', 'auslagen', 'saldo', 'waehrung', 'fremd'],
    ),
    soll: findCol(h, ['soll', 'solleur', 'sollineur', 'belastung', 'ausgang', 'debit']),
    haben: findCol(h, ['haben', 'habeneur', 'habenineur', 'gutschrift', 'eingang', 'credit']),
    sh: findCol(h, ['sollhaben', 'sh', 'sollhabenkennzeichen', 'kennzeichen']),
    payee: findCol(h, ['zahlungsempfaengerin', 'zahlungsempfaenger', 'empfaenger', 'beguenstigter', 'payee']),
    payer: findCol(h, ['zahlungspflichtiger', 'zahlungspflichtige', 'auftraggeber', 'payer']),
    name: findCol(h, [
      'empfaengerzahlungspflichtiger', 'beguenstigterzahlungspflichtiger', 'namezahlungsbeteiligter', 'auftraggeberempfaenger', 'auftraggeberbeguenstigter',
      'beguenstigterauftraggeber', 'empfaengerauftraggeber', 'partnername', 'name', 'gegenpartei', 'zahlungsbeteiligter',
      'counterparty', 'gegenkontoinhaber', 'kontoinhabergegenkonto',
    ]),
    purpose: findCol(h, ['verwendungszweck', 'paymentreference', 'vorgangverwendungszweck', 'beschreibung', 'description', 'zweck', 'reference', 'referenz']),
    btext: findCol(h, ['buchungstext']),
    kind: findCol(h, ['umsatzart', 'umsatztyp', 'vorgang', 'transactiontype', 'type', 'buchungsart', 'art']),
    status: findCol(h, ['status', 'info']),
    currency: findCol(h, ['waehrung', 'currency']),
  };
  return { col, h };
}

function guessBank(h) {
  const has = (x) => h.includes(x);
  if (has('beguenstigterzahlungspflichtiger')) return 'Sparkasse';
  if (has('namezahlungsbeteiligter')) return 'Volksbank / Raiffeisenbank';
  if (has('auftraggeberempfaenger')) return 'ING';
  if (has('zahlungsempfaengerin') || has('auftraggeberbeguenstigter')) return 'DKB';
  if (has('partnername') || (has('payee') && has('amounteur'))) return 'N26';
  if (has('umsatzineur')) return 'comdirect';
  if (has('ibankontoinhaber') || (has('umsatzart') && has('buchungstext') && has('betrag'))) return 'Commerzbank';
  if (has('beguenstigterauftraggeber')) return 'Deutsche Bank / Postbank';
  return 'Bank-CSV';
}

/** Händler aus Freitext ziehen, z. B. "Auftraggeber: Max Muster Buchungstext: ..." oder PayPal "Ihr Einkauf bei Spotify". */
export function extractCounterparty(text) {
  const s = String(text ?? '');
  let m = s.match(/Ihr Einkauf bei\s+(.+?)(?=\s+(?:Ref\.?|Buchungstext|Verwendungszweck|IBAN|End-to-End)\b|[,.;/]|$)/i);
  if (m) return m[1].trim();
  m = s.match(/(?:Auftraggeber|Empf(?:ä|ae)nger|Zahlungsempf(?:ä|ae)nger|Beg(?:ü|ue)nstigter|Zahlungspflichtiger)\s*:\s*(.+?)(?=\s+(?:Buchungstext|Verwendungszweck|Ref\.?|IBAN|BIC|Kto|BLZ|End-to-End|Mandat)\b|\s{2,}|$)/i);
  if (m) return m[1].trim();
  // Erstes Segment vor "//" oder vielen Ziffern, z. B. "REWE SAGT DANKE 12345678 // Berlin"
  const first = s.split(/\/\/|\s{2,}/)[0];
  const words = first.split(/\s+/).filter((w) => w && !/\d{4,}/.test(w) && !/^\d/.test(w));
  return words.slice(0, 4).join(' ').trim();
}

const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

function shortHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function parseBankCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = parseCSV(text, delimiter);
  let headerIdx = -1;
  let mapping = null;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const m = mapColumns(rows[i]);
    if (m.col.date >= 0 && (m.col.amount >= 0 || m.col.soll >= 0 || m.col.haben >= 0)) {
      headerIdx = i;
      mapping = m;
      break;
    }
  }
  if (headerIdx < 0) throw new Error('Format nicht erkannt: keine Spalten für Datum und Betrag gefunden.');
  const { col, h } = mapping;

  // Volksbank-Altformat: Spalte ohne Überschrift mit "S"/"H"
  if (col.sh < 0) {
    const sample = rows.slice(headerIdx + 1, headerIdx + 30);
    for (let c = 0; c < h.length + 1 && sample.length; c++) {
      if (sample.every((r) => /^[SH]$/i.test(r[c] || ''))) {
        col.sh = c;
        break;
      }
    }
  }

  const out = [];
  const seenBase = new Map();
  let skipped = 0;
  let pending = 0;
  for (const r of rows.slice(headerIdx + 1)) {
    const get = (i) => (i >= 0 ? (r[i] || '').trim() : '');
    const status = normalizeText(get(col.status));
    if (/vorgemerkt|pending|offen|ausstehend/.test(status) || /^offen$/i.test(get(col.date))) {
      pending++;
      continue;
    }
    const date = parseDate(get(col.date)) || parseDate(get(col.valuta));
    let amount = col.amount >= 0 && get(col.amount) ? parseSignedAmount(get(col.amount)) : null;
    if (amount == null || amount === 0) {
      const soll = parseSignedAmount(get(col.soll));
      const haben = parseSignedAmount(get(col.haben));
      if (soll) amount = -Math.abs(soll);
      else if (haben) amount = Math.abs(haben);
    }
    if (amount != null && col.sh >= 0) {
      const sh = get(col.sh).toUpperCase();
      if (sh === 'S') amount = -Math.abs(amount);
      else if (sh === 'H') amount = Math.abs(amount);
    }
    if (!date || amount == null || amount === 0 || Math.abs(amount) > MAX_CENTS) {
      skipped++;
      continue;
    }
    const type = amount < 0 ? 'expense' : 'income';
    const purpose = get(col.purpose);
    const btext = get(col.btext);
    const kind = get(col.kind);
    const freeText = [purpose, col.purpose >= 0 ? '' : btext].filter(Boolean).join(' ');
    let name = type === 'expense' ? get(col.payee) || get(col.name) || get(col.payer) : get(col.payer) || get(col.name) || get(col.payee);
    const pp = /paypal/i.test(name) ? extractCounterparty(freeText) : '';
    if (pp && /Einkauf bei/i.test(freeText)) name = pp;
    if (!name) name = extractCounterparty(freeText || btext) || btext || kind || 'Bankbuchung';
    name = cleanName(name);
    const text = [name, purpose, btext, kind].filter(Boolean).join(' ');
    const base = `${date}|${amount}|${normalizeText(`${name} ${purpose || btext}`).slice(0, 80)}`;
    const n = (seenBase.get(base) || 0) + 1;
    seenBase.set(base, n);
    out.push({ key: `bank:${shortHash(base)}:${n}`, src: 'bank', date, time: '', amount: Math.abs(amount), type, name, text });
  }
  return { format: 'bank', label: guessBank(h), rows: out, skipped, pending, delimiter };
}

/** Erkennt automatisch, ob es die Apple-Pay-Datei oder ein Kontoauszug ist. */
export function parseImportText(text) {
  if (looksLikeApplePay(text)) return parseApplePay(text);
  return parseBankCsv(text);
}

/* ---------- Abgleich & Duplikate ---------- */

function dayDiff(a, b) {
  return Math.abs((Date.UTC(...a.split('-').map((x, i) => (i === 1 ? x - 1 : +x))) - Date.UTC(...b.split('-').map((x, i) => (i === 1 ? x - 1 : +x)))) / 86400000);
}

/**
 * Sucht eine bestehende Buchung, die vermutlich dieselbe Zahlung ist.
 * Gleiche Quelle mit anderer ID gilt NICHT als Duplikat (zwei Kaffees am selben Tag sind echt).
 */
export function findDuplicate(row, transactions) {
  let best = null;
  for (const t of transactions) {
    if (t.type !== row.type) continue;
    if (t.src && t.src === row.src) continue;
    const dd = dayDiff(t.date, row.date);
    if (dd > 5) continue;
    const label = t.merchant || t.note || '';
    const sim = merchantSimilar(row.name, label);
    const sameAmount = t.amount === row.amount;
    let hit = false;
    if (t.src === 'recurring') {
      hit = (sameAmount && dd <= 4) || (sim === true && dd <= 5 && Math.abs(t.amount - row.amount) <= row.amount * 0.1);
    } else if (sameAmount) {
      hit = (dd === 0 && sim !== false) || (dd <= 3 && sim === true);
    }
    if (hit && (!best || dd < best.dd)) best = { tx: t, dd };
  }
  return best ? best.tx : null;
}

/**
 * Baut die Vorschau-Liste: bereits importierte Einträge fallen weg, mögliche Duplikate
 * werden markiert (standardmäßig abgewählt), Kategorien werden vorgeschlagen.
 */
export function buildCandidates(parsed, data) {
  const seen = new Set(data.importInfo?.seen || []);
  const extIds = new Set(data.transactions.map((t) => t.extId).filter(Boolean));
  const fresh = [];
  let known = 0;
  for (const r of parsed.rows) {
    if (seen.has(r.key) || extIds.has(r.key)) {
      known++;
      continue;
    }
    const mkey = merchantKey(r.name);
    const sug = suggestCategory(r.type, r.text, mkey, data.learned);
    const dup = findDuplicate(r, data.transactions);
    fresh.push({
      ...r,
      mkey,
      category: getCategory(r.type, sug.category).id,
      catSource: sug.source,
      duplicateOf: dup ? { id: dup.id, date: dup.date, amount: dup.amount, label: dup.merchant || dup.note || '' } : null,
      selected: !dup,
    });
  }
  fresh.sort((a, b) => (a.date === b.date ? (b.time || '').localeCompare(a.time || '') : a.date < b.date ? 1 : -1));
  return { ...parsed, candidates: fresh, known };
}

/** Wandelt ausgewählte Kandidaten in Buchungen um. */
export function candidateToTransaction(c, uid) {
  const createdAt = c.time ? Date.parse(`${c.date}T${c.time.length === 5 ? `${c.time}:00` : c.time}`) || Date.now() : Date.now();
  return {
    id: uid(),
    type: c.type,
    amount: c.amount,
    category: c.category,
    note: c.name.slice(0, 100),
    date: c.date,
    createdAt,
    src: c.src,
    extId: c.key,
    merchant: c.name.slice(0, 80),
    mkey: c.mkey,
    auto: c.catSource !== 'manual',
  };
}
