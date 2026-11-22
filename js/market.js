/*
 * Flowly – Kurse von CoinGecko (einzige erlaubte externe Verbindung).
 * Es werden ausschließlich öffentliche Kursdaten abgefragt; es werden keine Nutzerdaten gesendet
 * (kein Cookie, kein Referrer, keine Kennung). Ergebnisse werden kurz zwischengespeichert.
 */
import { normalizeMarkets, normalizeSearch, normalizeSimplePrices, normalizeLine, normalizeOhlc } from './crypto.js';

const API = 'https://api.coingecko.com/api/v3';
const MARKETS_KEY = 'flowly:markets:v1';
const memo = new Map();

export class MarketError extends Error {}

async function getJson(path, ttlMs) {
  const hit = memo.get(path);
  if (hit && Date.now() - hit.t < ttlMs) return hit.data;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      signal: ctrl.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      mode: 'cors',
      headers: { accept: 'application/json' },
    });
  } catch (err) {
    if (hit) return hit.data;
    throw new MarketError(err?.name === 'AbortError' ? 'Zeitüberschreitung – bitte später nochmal.' : 'Keine Verbindung zum Kursdienst.');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) {
    if (hit) return hit.data;
    throw new MarketError('Zu viele Abfragen – bitte eine Minute warten.');
  }
  if (!res.ok) {
    if (hit) return hit.data;
    throw new MarketError(`Kursdienst antwortet nicht (${res.status}).`);
  }
  const data = await res.json();
  memo.set(path, { t: Date.now(), data });
  return data;
}

/** Zuletzt gespeicherte Marktliste (auch offline). */
export function cachedMarkets() {
  try {
    const raw = JSON.parse(localStorage.getItem(MARKETS_KEY) || 'null');
    if (raw && Array.isArray(raw.list)) return { t: raw.t || 0, list: normalizeMarkets(raw.raw || []) };
  } catch {
    /* ignorieren */
  }
  return { t: 0, list: [] };
}

/** Top-Coins nach Marktkapitalisierung mit Euro-Kursen. */
export async function fetchMarkets({ force = false, perPage = 100 } = {}) {
  const path = `/coins/markets?vs_currency=eur&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=false&price_change_percentage=24h`;
  if (force) memo.delete(path);
  const json = await getJson(path, 60_000);
  const list = normalizeMarkets(json);
  try {
    localStorage.setItem(MARKETS_KEY, JSON.stringify({ t: Date.now(), list: [], raw: json }));
  } catch {
    /* Speicher voll – egal */
  }
  return { t: Date.now(), list };
}

/** Suche über alle Coins, die CoinGecko kennt. */
export async function searchCoins(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  return normalizeSearch(await getJson(`/search?query=${encodeURIComponent(q.slice(0, 40))}`, 300_000));
}

/** Aktuelle Preise für bestimmte Coins. */
export async function fetchPrices(ids, { force = false } = {}) {
  const list = [...new Set(ids)].filter(Boolean).slice(0, 100);
  if (!list.length) return {};
  const path = `/simple/price?ids=${list.map(encodeURIComponent).join(',')}&vs_currencies=eur&include_24hr_change=true`;
  if (force) memo.delete(path);
  return normalizeSimplePrices(await getJson(path, 30_000));
}

/** Kursverlauf: Linie (Preise) oder Kerzen (OHLC). days: 1, 7, 30, 365 */
export async function fetchChart(id, days, type) {
  const d = ['1', '7', '30', '365'].includes(String(days)) ? String(days) : '7';
  if (type === 'candles') return normalizeOhlc(await getJson(`/coins/${encodeURIComponent(id)}/ohlc?vs_currency=eur&days=${d}`, 300_000));
  return normalizeLine(await getJson(`/coins/${encodeURIComponent(id)}/market_chart?vs_currency=eur&days=${d}`, 300_000));
}
