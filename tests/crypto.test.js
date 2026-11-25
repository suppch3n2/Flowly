import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/crypto.js';
import * as L from '../js/logic.js';

const BTC = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', image: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png' };

test('Mengen einlesen und formatieren', () => {
  assert.equal(C.parseQty('0,5'), 0.5);
  assert.equal(C.parseQty('0.00012345'), 0.00012345);
  assert.equal(C.parseQty('1.234,5'), 1234.5);
  assert.equal(C.parseQty('0,123456789'), null); // mehr als 8 Nachkommastellen
  assert.equal(C.parseQty('0'), null);
  assert.equal(C.parseQty('abc'), null);
  assert.equal(C.formatQty(0.00012345), '0,00012345');
  assert.equal(C.formatQty(1.5), '1,5');
  assert.equal(C.formatQty(12345.678), '12.345,68');
  assert.equal(C.formatPrice(81234.5), '81.234,50 €');
  assert.equal(C.formatPrice(0.00001234), '0,00001234 €');
  assert.equal(C.formatPrice(0.5432), '0,5432 €');
  assert.equal(C.formatChange(2.345), '+2,35 %');
  assert.equal(C.formatChange(-1), '−1,00 %');
});

test('Kaufen: für Euro, nach Menge, mit allem Geld', () => {
  const base = { side: 'buy', priceEur: 50000, cashCents: 100000, holdingQty: 0 };
  assert.deepEqual(C.quoteTrade({ ...base, mode: 'eur', input: 25000 }), { ok: true, qty: 0.005, totalCents: 25000 });
  assert.deepEqual(C.quoteTrade({ ...base, mode: 'qty', input: 0.01 }), { ok: true, qty: 0.01, totalCents: 50000 });
  assert.deepEqual(C.quoteTrade({ ...base, mode: 'all' }), { ok: true, qty: 0.02, totalCents: 100000 });
  assert.equal(C.quoteTrade({ ...base, mode: 'eur', input: 100001 }).ok, false); // zu wenig Guthaben
  assert.equal(C.quoteTrade({ ...base, mode: 'qty', input: 0.03 }).ok, false);
  assert.equal(C.quoteTrade({ ...base, mode: 'all', cashCents: -500 }).ok, false); // Konto im Minus
  assert.equal(C.quoteTrade({ ...base, mode: 'eur', input: 100, priceEur: 0 }).ok, false); // kein Kurs
  // Krummer Kurs: Menge wird abgerundet, Betrag bleibt exakt
  const q = C.quoteTrade({ ...base, priceEur: 61234.57, mode: 'eur', input: 10000 });
  assert.equal(q.totalCents, 10000);
  assert.ok(q.qty * 61234.57 <= 100.0000001);
});

test('Verkaufen: Menge, für Euro-Betrag, alles', () => {
  const base = { side: 'sell', priceEur: 50000, cashCents: 0, holdingQty: 0.02 };
  assert.deepEqual(C.quoteTrade({ ...base, mode: 'qty', input: 0.005 }), { ok: true, qty: 0.005, totalCents: 25000 });
  assert.deepEqual(C.quoteTrade({ ...base, mode: 'eur', input: 30000 }), { ok: true, qty: 0.006, totalCents: 30000 });
  assert.deepEqual(C.quoteTrade({ ...base, mode: 'all' }), { ok: true, qty: 0.02, totalCents: 100000 });
  assert.equal(C.quoteTrade({ ...base, mode: 'qty', input: 0.03 }).ok, false); // mehr als vorhanden
  assert.equal(C.quoteTrade({ ...base, mode: 'all', holdingQty: 0 }).ok, false);
  // Euro-Betrag größer als Bestand -> auf Bestand begrenzt
  const q = C.quoteTrade({ ...base, mode: 'eur', input: 500000 });
  assert.equal(q.qty, 0.02);
});

test('Depot: Kauf, Teilverkauf, Wert und Gewinn', () => {
  const crypto = C.createCryptoState();
  C.applyTrade(crypto, { side: 'buy', coin: BTC, qty: 0.02, totalCents: 100000, priceEur: 50000, date: '2026-11-22', id: 't1', createdAt: 1 });
  assert.deepEqual([crypto.holdings.bitcoin.qty, crypto.holdings.bitcoin.costCents], [0.02, 100000]);
  C.applyTrade(crypto, { side: 'sell', coin: BTC, qty: 0.005, totalCents: 30000, priceEur: 60000, date: '2026-11-22', id: 't2', createdAt: 2 });
  assert.deepEqual([crypto.holdings.bitcoin.qty, crypto.holdings.bitcoin.costCents], [0.015, 75000]);
  const sum = C.portfolioSummary(crypto, { bitcoin: { price: 60000, change24h: 1 } });
  assert.equal(sum.valueCents, 90000);
  assert.equal(sum.pnlCents, 15000);
  // Alles verkaufen -> Position verschwindet
  C.applyTrade(crypto, { side: 'sell', coin: BTC, qty: 0.015, totalCents: 90000, priceEur: 60000, date: '2026-11-22', id: 't3', createdAt: 3 });
  assert.equal(crypto.holdings.bitcoin, undefined);
  assert.equal(crypto.trades.length, 3);
});

test('Trade rückgängig machen', () => {
  const crypto = C.createCryptoState();
  C.applyTrade(crypto, { side: 'buy', coin: BTC, qty: 0.01, totalCents: 50000, priceEur: 50000, date: 'x', id: 'b1', createdAt: 1 });
  C.applyTrade(crypto, { side: 'sell', coin: BTC, qty: 0.01, totalCents: 55000, priceEur: 55000, date: 'x', id: 's1', createdAt: 2 });
  // Kauf zurücknehmen geht nicht, solange die Coins verkauft sind
  assert.equal(C.revertTrade(crypto, 'b1'), false);
  assert.equal(C.revertTrade(crypto, 's1'), true);
  assert.equal(crypto.holdings.bitcoin.qty, 0.01);
  assert.equal(C.revertTrade(crypto, 'b1'), true);
  assert.equal(crypto.holdings.bitcoin, undefined);
  assert.equal(crypto.trades.length, 0);
});

test('Kauf als Umsatz verringert den Kontostand (Spielgeld)', () => {
  const data = L.createEmptyState();
  data.settings.startBalance = 100000;
  data.transactions.push({ id: 'k', type: 'expense', amount: 25000, category: 'krypto', note: 'Kauf 0,005 BTC', date: '2026-11-22', createdAt: 1, src: 'crypto', extId: 'crypto:t1' });
  assert.equal(L.balanceUntil(data.transactions, data.settings.startBalance, '2026-11-22'), 75000);
  assert.equal(L.getCategory('expense', 'krypto').label, 'Krypto');
  assert.equal(L.getCategory('income', 'krypto').label, 'Krypto');
  const clean = L.sanitizeData(JSON.parse(JSON.stringify(data)));
  assert.equal(clean.transactions[0].src, 'crypto');
  assert.equal(clean.transactions[0].category, 'krypto');
});

test('Depot übersteht Export/Import und wird geprüft', () => {
  const raw = {
    chart: 'candles',
    holdings: {
      bitcoin: { qty: 0.01, costCents: 50000, symbol: 'btc', name: 'Bitcoin', image: BTC.image },
      'bad id!': { qty: 1 },
      evil: { qty: 1, costCents: 1, symbol: '<b>', name: '<script>x</script>', image: 'https://evil.example/x.png' },
      zero: { qty: 0 },
    },
    trades: [{ id: 't1', coinId: 'bitcoin', side: 'buy', qty: 0.01, totalCents: 50000, priceEur: 50000, date: '2026-11-22', createdAt: 1 }, { coinId: 'x', side: 'steal', qty: 1, totalCents: 1 }],
  };
  const c = C.sanitizeCrypto(raw);
  assert.equal(c.chart, 'candles');
  assert.deepEqual(Object.keys(c.holdings).sort(), ['bitcoin', 'evil']);
  assert.equal(c.holdings.bitcoin.symbol, 'BTC');
  assert.equal(c.holdings.evil.image, ''); // fremde Bildquelle verworfen
  assert.ok(!c.holdings.evil.name.includes('<'));
  assert.equal(c.trades.length, 1);
  const state = L.sanitizeData({ transactions: [], crypto: raw });
  assert.equal(state.crypto.holdings.bitcoin.qty, 0.01);
  assert.equal(L.sanitizeData({ transactions: [] }).crypto.chart, 'line');
  assert.equal(L.sanitizeData({ transactions: [], settings: { coinsOnline: false } }).settings.coinsOnline, false);
});

test('CoinGecko-Antworten werden sauber übernommen', () => {
  const m = C.normalizeMarkets([
    { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', image: BTC.image, current_price: 81234.5, price_change_percentage_24h: 1.23, market_cap_rank: 1 },
    { id: 'broken', symbol: 'x', name: 'X', current_price: null },
  ]);
  assert.equal(m.length, 1);
  assert.deepEqual([m[0].symbol, m[0].price, m[0].change24h, m[0].rank], ['BTC', 81234.5, 1.23, 1]);
  assert.deepEqual(C.normalizeSimplePrices({ bitcoin: { eur: 1, eur_24h_change: -2, eur_market_cap: 5e9 }, bad: {} }), { bitcoin: { price: 1, change24h: -2, marketCap: 5e9 } });
  assert.deepEqual(C.normalizeLine({ prices: [[1, 2], [3, 4], ['x', 1]] }), [{ t: 1, v: 2 }, { t: 3, v: 4 }]);
  assert.deepEqual(C.normalizeOhlc([[1, 2, 3, 1, 2.5], [2, 'x']]), [{ t: 1, o: 2, h: 3, l: 1, c: 2.5 }]);
  assert.equal(C.normalizeSearch({ coins: [{ id: 'solana', symbol: 'SOL', name: 'Solana', large: 'https://coin-images.coingecko.com/coins/images/4128/large/solana.png', market_cap_rank: 5 }] })[0].rank, 5);
});

test('Sortierung wie Phantom: Trending, Majors, Gewinner, Verlierer, Favoriten', () => {
  const markets = [
    { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 50000, change24h: 1, rank: 1 },
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', price: 3000, change24h: -4, rank: 2 },
    { id: 'solana', symbol: 'SOL', name: 'Solana', price: 130, change24h: 9, rank: 5 },
    { id: 'dead', symbol: 'DEAD', name: 'Dead', price: 1, change24h: null, rank: 9 },
  ];
  const trending = C.normalizeTrending({ coins: [{ item: { id: 'basket', symbol: 'basket', name: 'BASKET', market_cap_rank: null, large: 'https://coin-images.coingecko.com/coins/images/1/large/x.png', data: { price_change_percentage_24h: { eur: 451.6 } } } }, { item: { id: 'solana', symbol: 'sol', name: 'Solana', market_cap_rank: 5 } }, { item: { id: 'bad id' } }] });
  assert.deepEqual(trending.map((t) => [t.id, t.trendRank]), [['basket', 1], ['solana', 2]]);
  assert.equal(trending[0].change24h, 451.6);
  const live = { solana: { price: 131, change24h: 12 } };
  const priceOf = (id) => live[id] || null;
  const opts = { markets, trending, favorites: [{ id: 'ethereum', symbol: 'ETH', name: 'Ethereum', image: '' }], priceOf };
  assert.deepEqual(C.sortForTab('majors', opts).map((c) => c.id), ['bitcoin', 'ethereum', 'solana', 'dead']);
  assert.deepEqual(C.sortForTab('gainers', opts).map((c) => c.id), ['solana', 'bitcoin', 'ethereum']);
  assert.deepEqual(C.sortForTab('losers', opts).map((c) => c.id), ['ethereum', 'bitcoin', 'solana']);
  assert.deepEqual(C.sortForTab('trending', opts).map((c) => c.id), ['basket', 'solana']);
  assert.equal(C.sortForTab('trending', opts)[1].price, 131); // Live-Kurs hat Vorrang
  const fav = C.sortForTab('favorites', opts);
  assert.deepEqual([fav[0].id, fav[0].price, fav[0].rank], ['ethereum', 3000, 2]);
});

test('Marktkapitalisierung kurz und Favoriten werden gespeichert/geprüft', () => {
  assert.equal(C.formatCompactEur(1.7e6), '1,7\u00A0Mio.\u00A0€');
  assert.equal(C.formatCompactEur(657000), '657\u00A0Tsd.\u00A0€');
  assert.equal(C.formatCompactEur(2.25e9), '2,3\u00A0Mrd.\u00A0€');
  assert.equal(C.formatCompactEur(0), '');
  const c = C.sanitizeCrypto({ listTab: 'gainers', favorites: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', image: 'https://evil.example/a.png' }, { id: 'bitcoin' }, { id: 'x y' }] });
  assert.equal(c.listTab, 'gainers');
  assert.deepEqual(c.favorites, [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', image: '' }]);
  assert.equal(C.sanitizeCrypto({ listTab: 'hack' }).listTab, 'trending');
});
