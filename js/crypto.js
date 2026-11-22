/*
 * Flowly – Coins: Depot-Rechnung, Kauf/Verkauf mit Spielgeld, Formatierung.
 * Reine Funktionen ohne Netz/DOM. Geldbeträge in Cent (Integer), Coin-Mengen als Zahl (max. 8 Nachkommastellen).
 */

export const QTY_DECIMALS = 8;
const QTY_FACTOR = 10 ** QTY_DECIMALS;

export const roundQty = (q) => Math.round(q * QTY_FACTOR) / QTY_FACTOR;
export const floorQty = (q) => Math.floor(q * QTY_FACTOR + 1e-6) / QTY_FACTOR;

/** Coin-Menge einlesen: „0,5“, „0.5“, „1.234,5“, „0,00012345“. null bei ungültig/≤0. */
export function parseQty(input) {
  let s = String(input ?? '').trim().replace(/\s/g, '');
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.';
    const thou = dec === ',' ? '.' : ',';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    if (s.split(',').length > 2) return null;
    s = s.replace(',', '.');
  } else if (s.split('.').length > 2) return null;
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return null;
  const [, frac = ''] = s.split('.');
  if (frac.length > QTY_DECIMALS) return null;
  const q = Number(s);
  return Number.isFinite(q) && q > 0 ? roundQty(q) : null;
}

const nf = (min, max) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max });

/** 0.01234 -> „0,01234“; große Mengen mit Tausenderpunkt. */
export function formatQty(q) {
  if (!q) return '0';
  const abs = Math.abs(q);
  const max = abs >= 1000 ? 2 : abs >= 1 ? 4 : QTY_DECIMALS;
  return nf(0, max).format(roundQty(q));
}

/** Kurs in Euro: ab 1 € zwei Stellen, darunter bis zu 6 gültige Stellen. */
export function formatPrice(eur) {
  if (eur == null || !Number.isFinite(eur)) return '–';
  const abs = Math.abs(eur);
  let max = 2;
  if (abs > 0 && abs < 1) max = Math.min(10, Math.max(4, 2 - Math.floor(Math.log10(abs)) + 2));
  return `${nf(2, max).format(eur)} €`;
}

export function formatChange(pct) {
  if (pct == null || !Number.isFinite(pct)) return '–';
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${nf(2, 2).format(Math.abs(pct))} %`;
}

/* ---------- Depot ---------- */

export function createCryptoState() {
  return { holdings: {}, trades: [], chart: 'line' };
}

/** Wert eines Bestands in Cent. */
export function holdingValueCents(qty, priceEur) {
  return Math.round(qty * priceEur * 100);
}

/**
 * Depot-Übersicht mit aktuellen Preisen.
 * prices: { [coinId]: { price, change24h } }
 */
export function portfolioSummary(crypto, prices = {}) {
  const rows = [];
  let value = 0;
  let cost = 0;
  let known = true;
  for (const [id, h] of Object.entries(crypto?.holdings || {})) {
    if (!(h.qty > 0)) continue;
    const p = prices[id]?.price;
    const v = p != null ? holdingValueCents(h.qty, p) : null;
    if (v == null) known = false;
    else value += v;
    cost += h.costCents || 0;
    rows.push({ id, ...h, price: p ?? null, change24h: prices[id]?.change24h ?? null, valueCents: v, pnlCents: v == null ? null : v - (h.costCents || 0) });
  }
  rows.sort((a, b) => (b.valueCents ?? 0) - (a.valueCents ?? 0));
  return { rows, valueCents: value, costCents: cost, pnlCents: value - cost, complete: known };
}

/**
 * Berechnet einen Auftrag (ohne etwas zu verändern).
 * side: 'buy' | 'sell'; mode: 'eur' | 'qty' | 'all'; input: Betrag in Cent (eur) oder Menge (qty).
 * cashCents: verfügbares Spielgeld; holdingQty: vorhandene Menge.
 * Ergebnis: { ok, qty, totalCents, error }
 */
export function quoteTrade({ side, mode, input, priceEur, cashCents, holdingQty }) {
  if (!(priceEur > 0)) return { ok: false, error: 'Kein aktueller Kurs verfügbar.' };
  let qty;
  let total;
  if (side === 'buy') {
    const cash = Math.max(0, cashCents || 0);
    if (mode === 'all') total = cash;
    else if (mode === 'eur') total = input;
    else {
      qty = input;
      total = Math.ceil(qty * priceEur * 100 - 1e-9);
    }
    if (!(total > 0)) return { ok: false, error: mode === 'all' ? 'Kein Guthaben zum Kaufen vorhanden.' : 'Bitte einen Betrag eingeben.' };
    if (qty == null) qty = floorQty(total / 100 / priceEur);
    if (!(qty > 0)) return { ok: false, error: 'Der Betrag ist zu klein für diesen Coin.' };
    if (total > cash) return { ok: false, error: `Nicht genug Guthaben – verfügbar sind ${nf(2, 2).format(cash / 100)}\u00A0€.` };
    return { ok: true, qty, totalCents: total };
  }
  // Verkauf
  const have = holdingQty || 0;
  if (!(have > 0)) return { ok: false, error: 'Du hast diesen Coin nicht im Depot.' };
  if (mode === 'all') qty = have;
  else if (mode === 'qty') qty = input;
  else {
    total = input;
    if (!(total > 0)) return { ok: false, error: 'Bitte einen Betrag eingeben.' };
    qty = Math.min(have, Math.ceil((total / 100 / priceEur) * QTY_FACTOR - 1e-6) / QTY_FACTOR);
  }
  if (!(qty > 0)) return { ok: false, error: 'Bitte eine Menge eingeben.' };
  if (qty > have + 1e-12) return { ok: false, error: `So viele hast du nicht – im Depot sind ${formatQty(have)}.` };
  if (total == null) total = Math.round(qty * priceEur * 100);
  if (!(total > 0)) return { ok: false, error: 'Der Gegenwert ist zu klein.' };
  return { ok: true, qty: roundQty(qty), totalCents: total };
}

/**
 * Führt einen Auftrag im Depot aus (verändert crypto) und liefert den Trade.
 * coin: { id, symbol, name, image }
 */
export function applyTrade(crypto, { side, coin, qty, totalCents, priceEur, date, id, createdAt }) {
  const h = crypto.holdings[coin.id] || { qty: 0, costCents: 0, symbol: coin.symbol, name: coin.name, image: coin.image || '' };
  if (side === 'buy') {
    h.qty = roundQty(h.qty + qty);
    h.costCents += totalCents;
  } else {
    const share = h.qty > 0 ? Math.min(1, qty / h.qty) : 1;
    h.costCents = Math.round(h.costCents * (1 - share));
    h.qty = roundQty(h.qty - qty);
    if (h.qty <= 1e-10) {
      h.qty = 0;
      h.costCents = 0;
    }
  }
  Object.assign(h, { symbol: coin.symbol, name: coin.name, image: coin.image || h.image || '' });
  if (h.qty > 0) crypto.holdings[coin.id] = h;
  else delete crypto.holdings[coin.id];
  const trade = { id, coinId: coin.id, symbol: coin.symbol, name: coin.name, side, qty, totalCents, priceEur, date, createdAt };
  crypto.trades.push(trade);
  return trade;
}

/** Macht einen Trade rückgängig. Gibt false zurück, wenn das Depot dafür nicht reicht. */
export function revertTrade(crypto, tradeId) {
  const t = crypto.trades.find((x) => x.id === tradeId);
  if (!t) return true;
  const h = crypto.holdings[t.coinId] || { qty: 0, costCents: 0, symbol: t.symbol, name: t.name, image: '' };
  if (t.side === 'buy') {
    if (h.qty + 1e-10 < t.qty) return false;
    const share = h.qty > 0 ? t.qty / h.qty : 1;
    h.costCents = Math.max(0, Math.round(h.costCents - Math.min(t.totalCents, h.costCents * share * 1.000001)));
    h.qty = roundQty(h.qty - t.qty);
  } else {
    h.qty = roundQty(h.qty + t.qty);
    h.costCents += t.totalCents;
  }
  if (h.qty > 1e-10) crypto.holdings[t.coinId] = h;
  else delete crypto.holdings[t.coinId];
  crypto.trades = crypto.trades.filter((x) => x.id !== tradeId);
  return true;
}

/* ---------- Prüfung beim Laden/Import ---------- */

const cleanStr = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, max) : '');
const validId = (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(v);
const validImg = (v) => (typeof v === 'string' && /^https:\/\/(coin-images|assets)\.coingecko\.com\/[\w./%-]+(\?[\w=&.-]*)?$/.test(v) ? v : '');

export function sanitizeCrypto(raw) {
  const out = createCryptoState();
  if (!raw || typeof raw !== 'object') return out;
  out.chart = raw.chart === 'candles' ? 'candles' : 'line';
  if (raw.holdings && typeof raw.holdings === 'object') {
    for (const [id, h] of Object.entries(raw.holdings)) {
      if (!validId(id) || !h || !(h.qty > 0) || !Number.isFinite(h.qty)) continue;
      out.holdings[id] = {
        qty: roundQty(h.qty),
        costCents: Number.isSafeInteger(h.costCents) && h.costCents >= 0 ? h.costCents : 0,
        symbol: cleanStr(h.symbol, 15).toUpperCase(),
        name: cleanStr(h.name, 60),
        image: validImg(h.image),
      };
    }
  }
  if (Array.isArray(raw.trades)) {
    for (const t of raw.trades.slice(-5000)) {
      if (!t || !validId(t.coinId) || !['buy', 'sell'].includes(t.side) || !(t.qty > 0) || !Number.isSafeInteger(t.totalCents) || t.totalCents <= 0) continue;
      out.trades.push({
        id: typeof t.id === 'string' ? cleanStr(t.id, 40) : '',
        coinId: t.coinId,
        symbol: cleanStr(t.symbol, 15).toUpperCase(),
        name: cleanStr(t.name, 60),
        side: t.side,
        qty: roundQty(t.qty),
        totalCents: t.totalCents,
        priceEur: Number.isFinite(t.priceEur) ? t.priceEur : 0,
        date: typeof t.date === 'string' ? t.date.slice(0, 10) : '',
        createdAt: Number.isFinite(t.createdAt) ? t.createdAt : 0,
      });
    }
  }
  return out;
}

/* ---------- CoinGecko-Antworten vereinheitlichen ---------- */

export function normalizeMarkets(json) {
  if (!Array.isArray(json)) return [];
  return json
    .filter((c) => c && validId(c.id) && Number.isFinite(c.current_price))
    .map((c) => ({
      id: c.id,
      symbol: cleanStr(c.symbol, 15).toUpperCase(),
      name: cleanStr(c.name, 60),
      image: validImg(c.image),
      price: c.current_price,
      change24h: Number.isFinite(c.price_change_percentage_24h) ? c.price_change_percentage_24h : null,
      marketCap: Number.isFinite(c.market_cap) ? c.market_cap : null,
      rank: Number.isFinite(c.market_cap_rank) ? c.market_cap_rank : null,
      high24h: Number.isFinite(c.high_24h) ? c.high_24h : null,
      low24h: Number.isFinite(c.low_24h) ? c.low_24h : null,
    }));
}

export function normalizeSearch(json) {
  const list = Array.isArray(json?.coins) ? json.coins : [];
  return list
    .filter((c) => c && validId(c.id))
    .slice(0, 40)
    .map((c) => ({ id: c.id, symbol: cleanStr(c.symbol, 15).toUpperCase(), name: cleanStr(c.name, 60), image: validImg(c.large || c.thumb), rank: c.market_cap_rank ?? null }));
}

export function normalizeSimplePrices(json) {
  const out = {};
  if (!json || typeof json !== 'object') return out;
  for (const [id, v] of Object.entries(json)) {
    if (validId(id) && v && Number.isFinite(v.eur)) out[id] = { price: v.eur, change24h: Number.isFinite(v.eur_24h_change) ? v.eur_24h_change : null };
  }
  return out;
}

export function normalizeLine(json) {
  const arr = Array.isArray(json?.prices) ? json.prices : [];
  return arr.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map(([t, v]) => ({ t, v }));
}

export function normalizeOhlc(json) {
  if (!Array.isArray(json)) return [];
  return json
    .filter((c) => Array.isArray(c) && c.length >= 5 && c.every(Number.isFinite))
    .map(([t, o, h, l, c]) => ({ t, o, h, l, c }));
}

export const RANGES = [
  { id: '1', label: '1T' },
  { id: '7', label: '1W' },
  { id: '30', label: '1M' },
  { id: '365', label: '1J' },
];
