/*
 * Flowly – automatische Kategorien anhand von Händler und Verwendungszweck.
 * Reine Funktionen, alles lokal.
 */

/** Kleinbuchstaben, Umlaute ausgeschrieben, nur a–z/0–9, einfache Leerzeichen. */
export function normalizeText(str) {
  return String(str ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const STOP = new Set(
  ('gmbh co kg ag se ohg ug mbh ek gbr inc ltd llc sarl sca cie et bv nv sa srl plc de com net org www http https eu ' +
    'the und der die das markt maerkte sagt danke filiale fil visa mastercard master card debitk debitkarte kartenzahlung karte ' +
    'girocard ec pos sepa lastschrift folgelastschrift erstlastschrift basislastschrift ueberweisung dauerauftrag gutschrift zahlung payment ' +
    'europe deutschland germany online shop store services service digital bill kartenumsatz umsatz einkauf apple pay applepay ' +
    'nfc kontaktlos vertrieb gmbh&co').split(' '),
);

export function merchantTokens(name) {
  return normalizeText(name)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t) && !/^\d+[a-z]{0,2}\d*$/.test(t));
}

/** Stabiler Schlüssel für einen Händler, z. B. "REWE Markt GmbH" -> "rewe". */
export function merchantKey(name) {
  const t = merchantTokens(name);
  if (!t.length) return '';
  // Firmenzusätze wie "markt" sind schon entfernt; maximal zwei Wörter
  return t.slice(0, 2).join(' ');
}

/** true/false, wenn beide Namen bekannt sind; null, wenn einer fehlt. */
export function merchantSimilar(a, b) {
  const ta = merchantTokens(a).filter((t) => t.length >= 3);
  const tb = merchantTokens(b).filter((t) => t.length >= 3);
  if (!ta.length || !tb.length) return null;
  const sb = new Set(tb);
  if (ta.some((t) => sb.has(t))) return true;
  const ca = ta.join('');
  const cb = tb.join('');
  return ca.includes(tb[0]) || cb.includes(ta[0]);
}

/* Reihenfolge ist wichtig: spezifische Begriffe (z. B. "amazon prime") vor allgemeinen ("amazon"). */
const EXPENSE_RULES = [
  ['abos', ['amazon prime', 'prime video', 'netflix', 'spotify', 'disney plus', 'disney', 'dazn', 'sky deutschland', 'wow tv', 'apple com bill', 'itunes', 'icloud', 'youtube premium', 'google one', 'google storage', 'audible', 'kindle unlimited', 'deezer', 'tidal', 'chatgpt', 'openai', 'adobe', 'microsoft 365', 'office 365', 'xbox', 'playstation', 'nintendo', 'telekom', 'vodafone', 'o2', 'telefonica', '1 1 telecom', '1und1', 'congstar', 'fraenk', 'freenet', 'mobilcom', 'fitx', 'mcfit', 'urban sports', 'fitnessstudio', 'fitness', 'clever fit', 'patreon', 'abo', 'abonnement', 'mitgliedsbeitrag']],
  ['wohnen', ['miete', 'kaltmiete', 'warmmiete', 'nebenkosten', 'hausgeld', 'hausverwaltung', 'vermieter', 'wohnungsbau', 'wohnungsgesellschaft', 'vonovia', 'deutsche wohnen', 'stadtwerke', 'strom', 'vattenfall', 'e on', 'eon energie', 'enbw', 'eprimo', 'tibber', 'lichtblick', 'naturstrom', 'yello', 'gasag', 'rheinenergie', 'rundfunk', 'beitragsservice', 'hausrat', 'heizung', 'schornsteinfeger']],
  ['mobilitaet', ['aral', 'shell', 'esso', 'totalenergies', 'total tankstelle', 'jet tankstelle', 'agip', 'avia', 'omv', 'star tankstelle', 'tankstelle', 'tanken', 'db vertrieb', 'db fernverkehr', 'db regio', 'deutsche bahn', 'bahn de', 'db bahn', 'bvg', 'mvg', 'hvv', 'vbb', 'rmv', 'kvb', 'vrr', 'vvs', 'uber', 'uber trip', 'bolt', 'free now', 'freenow', 'tier', 'lime', 'voi', 'sixt', 'share now', 'miles mobility', 'flixbus', 'flixtrain', 'parkhaus', 'parken', 'parkster', 'apcoa', 'easypark', 'contipark', 'deutschlandticket', 'adac', 'kfz', 'autowerkstatt', 'atu', 'ladesaeule', 'ionity', 'enbw mobility']],
  ['lebensmittel', ['rewe', 'edeka', 'lidl', 'aldi', 'netto', 'penny', 'kaufland', 'tegut', 'globus', 'norma', 'denns', 'alnatura', 'bio company', 'basic bio', 'nahkauf', 'combi', 'famila', 'marktkauf', 'hit markt', 'v markt', 'mix markt', 'flink', 'getir', 'picnic', 'knuspr', 'supermarkt', 'wochenmarkt', 'baeckerei', 'backerei', 'backwerk', 'baecker', 'metzgerei', 'fleischerei', 'dm drogerie', 'dm markt', 'rossmann', 'mueller drogerie', 'budni', 'lebensmittel']],
  ['freizeit', ['kino', 'cinemaxx', 'cineplex', 'uci kinowelt', 'restaurant', 'ristorante', 'pizzeria', 'pizza', 'burger', 'mcdonalds', 'mc donalds', 'burger king', 'kfc', 'subway', 'starbucks', 'coffee', 'cafe', 'kaffee', 'bar', 'kneipe', 'biergarten', 'imbiss', 'doener', 'sushi', 'vapiano', 'lieferando', 'wolt', 'uber eats', 'eventim', 'ticketmaster', 'theater', 'museum', 'konzert', 'bowling', 'schwimmbad', 'therme', 'zoo', 'steam', 'hotel', 'booking com', 'airbnb', 'urlaub', 'reise', 'tui', 'ryanair', 'eurowings', 'lufthansa', 'easyjet']],
  ['shopping', ['amazon', 'amzn', 'zalando', 'otto', 'about you', 'h m', 'hm', 'zara', 'primark', 'c a', 'peek cloppenburg', 'tk maxx', 'ebay', 'kleinanzeigen', 'mediamarkt', 'media markt', 'saturn', 'cyberport', 'notebooksbilliger', 'apple store', 'ikea', 'decathlon', 'douglas', 'thalia', 'hugendubel', 'galeria', 'shein', 'temu', 'aliexpress', 'etsy', 'obi', 'hornbach', 'bauhaus', 'toom', 'depot', 'tchibo', 'action', 'woolworth', 'kik', 'deichmann', 'snipes', 'nike', 'adidas']],
  ['gesundheit', ['apotheke', 'docmorris', 'shop apotheke', 'arzt', 'aerztin', 'zahnarzt', 'praxis', 'klinik', 'krankenhaus', 'physio', 'physiotherapie', 'optiker', 'fielmann', 'apollo optik', 'hoergeraete', 'labor', 'medizin', 'sanitaetshaus']],
];

const INCOME_RULES = [
  ['gehalt', ['gehalt', 'lohn', 'bezuege', 'besoldung', 'salary', 'payroll', 'entgelt', 'verdienstabrechnung', 'arbeitgeber']],
  ['nebenjob', ['honorar', 'rechnung', 'freelance', 'nebenjob', 'minijob', 'aushilfe', 'nachhilfe', 'provision']],
  ['geschenk', ['geschenk', 'geburtstag', 'weihnachten', 'taschengeld']],
];

function matches(hay, kw) {
  // Kurze Begriffe nur als ganzes Wort, längere auch als Wortanfang
  if (kw.length <= 4) return new RegExp(`(^| )${kw}( |$)`).test(hay);
  return hay === kw || hay.startsWith(`${kw}`) || hay.includes(` ${kw}`);
}

/** Kategorie nur aus den eingebauten Regeln (oder null). Der längste passende Begriff gewinnt. */
export function ruleCategory(type, text) {
  const hay = normalizeText(text);
  if (!hay) return null;
  let best = null;
  let bestLen = 0;
  for (const [cat, kws] of type === 'income' ? INCOME_RULES : EXPENSE_RULES) {
    for (const kw of kws) {
      if (kw.length > bestLen && matches(hay, kw)) {
        best = cat;
        bestLen = kw.length;
      }
    }
  }
  return best;
}

export function learnedKey(type, mkey) {
  return `${type}:${mkey}`;
}

/** Gelernte Zuordnung: exakter Händler, sonst erstes Wort (z. B. "edeka" für "edeka center"). */
export function learnedCategory(type, mkey, learned = {}) {
  if (!mkey) return null;
  const exact = learned[learnedKey(type, mkey)];
  if (exact) return exact;
  const first = mkey.split(' ')[0];
  return learned[learnedKey(type, first)] || null;
}

/**
 * Vorschlag: zuerst Gelerntes, dann Regeln, sonst "sonstiges".
 * Gibt { category, source: 'learned' | 'rule' | 'default' } zurück.
 */
export function suggestCategory(type, text, mkey, learned) {
  const l = learnedCategory(type, mkey, learned);
  if (l) return { category: l, source: 'learned' };
  const r = ruleCategory(type, text);
  if (r) return { category: r, source: 'rule' };
  return { category: type === 'income' ? 'sonstiges' : 'sonstiges', source: 'default' };
}
