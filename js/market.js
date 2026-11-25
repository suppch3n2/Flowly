/*
 * Flowly – Kurse (einzige erlaubte externe Verbindungen, nur Kursdaten, keine Nutzerdaten):
 *  - CoinGecko: Coin-Liste, Marktkapitalisierung, Trends, Suche, Bilder, Charts für Coins ohne Binance-Listing
 *  - Binance (öffentlicher Marktdaten-Stream): Live-Kurse jede Sekunde und Charts
 * Es werden keine Cookies, kein Referrer und keine Kennung gesendet.
 */
import { normalizeMarkets, normalizeSearch, normalizeSimplePrices, normalizeLine, normalizeOhlc, normalizeTrending } from './crypto.js';

const CG = 'https://api.coingecko.com/api/v3';
const BN_REST = 'https://data-api.binance.vision/api/v3';
const BN_WS = ['wss://data-stream.binance.vision/ws/!miniTicker@arr', 'wss://stream.binance.com:9443/ws/!miniTicker@arr'];
const MARKETS_KEY = 'flowly:markets:v1';
const TRENDING_KEY = 'flowly:trending:v1';

export class MarketError extends Error {
  constructor(message, busy = false) {
    super(message);
    this.busy = busy;
  }
}

const fetchOpts = { credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors', headers: { accept: 'application/json' } };

async function fetchWithTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...fetchOpts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- CoinGecko mit eigenem Abfrage-Limit ---------- */

const memo = new Map();
const cgCalls = [];
let cgCooldownUntil = 0;
const CG_PER_MINUTE = 8;

/** Darf gerade eine CoinGecko-Abfrage raus? (bleibt sicher unter dem kostenlosen Limit) */
export function cgReady() {
  const now = Date.now();
  while (cgCalls.length && now - cgCalls[0] > 60_000) cgCalls.shift();
  return now >= cgCooldownUntil && cgCalls.length < CG_PER_MINUTE;
}

/** Millisekunden, bis wieder eine Abfrage möglich ist. */
export function cgWaitMs() {
  const now = Date.now();
  if (now < cgCooldownUntil) return cgCooldownUntil - now;
  if (cgCalls.length < CG_PER_MINUTE) return 0;
  return Math.max(0, 60_000 - (now - cgCalls[0])) + 250;
}

async function cgJson(path, ttlMs) {
  const hit = memo.get(path);
  if (hit && Date.now() - hit.t < ttlMs) return hit.data;
  if (!cgReady()) {
    if (hit) return hit.data;
    throw new MarketError('busy', true);
  }
  cgCalls.push(Date.now());
  let res;
  try {
    res = await fetchWithTimeout(`${CG}${path}`);
  } catch {
    if (hit) return hit.data;
    throw new MarketError('offline');
  }
  if (res.status === 429) {
    cgCooldownUntil = Date.now() + 65_000;
    if (hit) return hit.data;
    throw new MarketError('busy', true);
  }
  if (!res.ok) {
    if (hit) return hit.data;
    throw new MarketError(`http ${res.status}`);
  }
  const data = await res.json();
  memo.set(path, { t: Date.now(), data });
  return data;
}

function readCache(key, normalize) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (raw && raw.raw) return { t: raw.t || 0, list: normalize(raw.raw) };
  } catch {
    /* ignorieren */
  }
  return { t: 0, list: [] };
}

function writeCache(key, raw) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), raw }));
  } catch {
    /* Speicher voll – egal */
  }
}

export const cachedMarkets = () => readCache(MARKETS_KEY, normalizeMarkets);
export const cachedTrending = () => readCache(TRENDING_KEY, (r) => normalizeTrending(r));

/** Top-Coins nach Marktkapitalisierung (Euro). */
export async function fetchMarkets() {
  const path = '/coins/markets?vs_currency=eur&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h';
  const json = await cgJson(path, 150_000);
  writeCache(MARKETS_KEY, json);
  return { t: Date.now(), list: normalizeMarkets(json) };
}

/** Im Trend (CoinGecko „Trending“). */
export async function fetchTrending() {
  const json = await cgJson('/search/trending', 240_000);
  writeCache(TRENDING_KEY, json);
  return { t: Date.now(), list: normalizeTrending(json) };
}

export async function searchCoins(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  return normalizeSearch(await cgJson(`/search?query=${encodeURIComponent(q.slice(0, 40))}`, 600_000));
}

/** Preise, 24h-Änderung und Marktkapitalisierung für bestimmte Coins (Euro). */
export async function fetchPrices(ids, { maxAgeMs = 60_000 } = {}) {
  const list = [...new Set(ids)].filter(Boolean).sort().slice(0, 100);
  if (!list.length) return {};
  const path = `/simple/price?ids=${list.map(encodeURIComponent).join(',')}&vs_currencies=eur&include_24hr_change=true&include_market_cap=true`;
  return normalizeSimplePrices(await cgJson(path, maxAgeMs));
}

async function cgChart(id, days, type) {
  if (type === 'candles') return normalizeOhlc(await cgJson(`/coins/${encodeURIComponent(id)}/ohlc?vs_currency=eur&days=${days}`, 300_000));
  return normalizeLine(await cgJson(`/coins/${encodeURIComponent(id)}/market_chart?vs_currency=eur&days=${days}`, 300_000));
}

/* ---------- Binance Live-Kurse ---------- */

export const live = { tickers: new Map(), connected: false, lastMsg: 0 };
const listeners = new Set();
let ws = null;
let wsIdx = 0;
let wsRetry = 0;
let wanted = false;
let reconnectTimer = 0;
let flushTimer = 0;
let dirty = false;

function setTicker(symbol, close, open) {
  if (!symbol.endsWith('USDT') || !(close > 0)) return;
  live.tickers.set(symbol, { c: close, o: open > 0 ? open : close });
}

/** Ein Abo auf Kurs-Updates (höchstens einmal pro Sekunde). */
export function onTick(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function flush() {
  if (!dirty) return;
  dirty = false;
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch (err) {
      console.warn('Kurs-Update fehlgeschlagen', err);
    }
  }
}

async function loadSnapshot() {
  try {
    const res = await fetchWithTimeout(`${BN_REST}/ticker/24hr?type=MINI`, 10000);
    if (!res.ok) return;
    const arr = await res.json();
    if (!Array.isArray(arr)) return;
    for (const t of arr) if (t && typeof t.symbol === 'string') setTicker(t.symbol, Number(t.lastPrice), Number(t.openPrice));
    dirty = true;
    flush();
  } catch {
    /* Stream liefert die Kurse ohnehin binnen Sekunden */
  }
}

function connect() {
  clearTimeout(reconnectTimer);
  if (!wanted || ws) return;
  let opened = false;
  try {
    ws = new WebSocket(BN_WS[wsIdx % BN_WS.length]);
  } catch {
    ws = null;
    scheduleReconnect();
    return;
  }
  ws.onopen = () => {
    opened = true;
    wsRetry = 0;
    live.connected = true;
  };
  ws.onmessage = (ev) => {
    let arr;
    try {
      arr = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!Array.isArray(arr)) return;
    for (const t of arr) if (t && typeof t.s === 'string') setTicker(t.s, Number(t.c), Number(t.o));
    live.lastMsg = Date.now();
    dirty = true;
  };
  ws.onclose = () => {
    ws = null;
    live.connected = false;
    if (!opened) wsIdx++; // anderen Endpunkt probieren
    scheduleReconnect();
  };
  ws.onerror = () => {
    try {
      ws?.close();
    } catch {
      /* egal */
    }
  };
}

function scheduleReconnect() {
  if (!wanted) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** wsRetry++));
}

export function startLive() {
  if (wanted) return;
  wanted = true;
  if (!live.tickers.size) loadSnapshot();
  connect();
  if (!flushTimer) flushTimer = setInterval(flush, 1000);
}

export function stopLive() {
  wanted = false;
  clearTimeout(reconnectTimer);
  clearInterval(flushTimer);
  flushTimer = 0;
  if (ws) {
    try {
      ws.close();
    } catch {
      /* egal */
    }
  }
  ws = null;
  live.connected = false;
}

/** Euro-Kurs eines Binance-Symbols (USDT-Paar, umgerechnet mit EUR/USDT). */
export function liveEur(symbol) {
  const eur = live.tickers.get('EURUSDT');
  if (!eur) return null;
  const S = String(symbol || '').toUpperCase();
  if (S === 'USDT') return { price: 1 / eur.c, change24h: eur.o ? ((eur.o - eur.c) / eur.c) * 100 : null };
  if (S === 'EUR' || S === 'EURC' || S === 'EURI') return null;
  const t = live.tickers.get(`${S}USDT`);
  if (!t) return null;
  return { price: t.c / eur.c, change24h: t.o ? ((t.c - t.o) / t.o) * 100 : null };
}

export const liveAvailable = () => live.tickers.has('EURUSDT');

const KLINES = { 1: ['5m', 288], 7: ['1h', 168], 30: ['4h', 180], 365: ['1d', 365] };

async function binanceChart(symbol, days, type) {
  const [interval, limit] = KLINES[days] || KLINES[7];
  const res = await fetchWithTimeout(`${BN_REST}/klines?symbol=${encodeURIComponent(`${symbol}USDT`)}&interval=${interval}&limit=${limit}`);
  if (!res.ok) throw new MarketError(`http ${res.status}`);
  const rows = await res.json();
  const eur = live.tickers.get('EURUSDT')?.c;
  if (!Array.isArray(rows) || !eur) throw new MarketError('no data');
  const out = rows
    .map((r) => ({ t: Number(r[0]), o: Number(r[1]) / eur, h: Number(r[2]) / eur, l: Number(r[3]) / eur, c: Number(r[4]) / eur }))
    .filter((c) => [c.t, c.o, c.h, c.l, c.c].every(Number.isFinite));
  return type === 'candles' ? out : out.map((c) => ({ t: c.t, v: c.c }));
}

/**
 * Kursverlauf. Mit Binance-Symbol aus Binance (genauer, live fortschreibbar), sonst CoinGecko.
 * days: '1' | '7' | '30' | '365'
 */
export async function fetchChart(id, days, type, binanceSymbol = null) {
  const d = ['1', '7', '30', '365'].includes(String(days)) ? String(days) : '7';
  if (binanceSymbol) {
    try {
      return { source: 'binance', data: await binanceChart(binanceSymbol, d, type) };
    } catch {
      /* auf CoinGecko ausweichen */
    }
  }
  return { source: 'coingecko', data: await cgChart(id, d, type) };
}
