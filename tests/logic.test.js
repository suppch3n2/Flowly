import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const tx = (id, type, amount, date, category = type === 'income' ? 'gehalt' : 'lebensmittel', note = '') => ({
  id, type, amount, date, category, note, createdAt: Number(id.replace(/\D/g, '')) || 0,
});

const SAMPLE = [
  tx('t1', 'income', 250000, '2026-10-01'),
  tx('t2', 'expense', 89000, '2026-10-03', 'wohnen', 'Miete'),
  tx('t3', 'expense', 4550, '2026-10-12', 'lebensmittel', 'Supermarkt'),
  tx('t4', 'income', 250000, '2026-11-01'),
  tx('t5', 'expense', 89000, '2026-11-03', 'wohnen', 'Miete'),
  tx('t6', 'expense', 12345, '2026-11-15', 'shopping', 'Schuhe'),
  tx('t7', 'expense', 2001, '2026-11-15', 'lebensmittel', 'Bäckerei <script>'),
  tx('t8', 'income', 30000, '2026-11-20', 'nebenjob', 'Nachhilfe'),
  tx('t9', 'expense', 1000, '2026-09-30', 'freizeit', 'Kino'),
  tx('t10', 'expense', 500, '2025-11-15', 'freizeit', 'Vorjahr'),
];

test('formatMoney: deutsches Format mit Tausenderpunkt und Komma', () => {
  assert.equal(L.formatMoney(123456), '1.234,56 €');
  assert.equal(L.formatMoney(0), '0,00 €');
  assert.equal(L.formatMoney(5), '0,05 €');
  assert.equal(L.formatMoney(100000000), '1.000.000,00 €');
  assert.equal(L.formatMoney(-98765), '−987,65 €');
  assert.equal(L.formatMoney(1500, { signed: true }), '+15,00 €');
  assert.equal(L.formatMoney(-1500, { signed: true }), '−15,00 €');
  assert.equal(L.formatEuroShort(300000), '3.000');
});

test('parseAmount: Komma, Punkt, Tausender, ungültige Eingaben', () => {
  assert.equal(L.parseAmount('12,50'), 1250);
  assert.equal(L.parseAmount('12,5'), 1250);
  assert.equal(L.parseAmount('12.50'), 1250);
  assert.equal(L.parseAmount('1.234,56'), 123456);
  assert.equal(L.parseAmount('1.234'), 123400);
  assert.equal(L.parseAmount('1.234.567'), 123456700);
  assert.equal(L.parseAmount('1,234.56'), 123456);
  assert.equal(L.parseAmount(' 7 € '), 700);
  assert.equal(L.parseAmount(',99'), 99);
  assert.equal(L.parseAmount('15,'), 1500);
  assert.equal(L.parseAmount('0,1'), 10);
  assert.equal(L.parseAmount(''), null);
  assert.equal(L.parseAmount('abc'), null);
  assert.equal(L.parseAmount('1,2,3'), null);
  assert.equal(L.parseAmount('12,345'), null);
  assert.equal(L.parseAmount('1.23.45'), null);
  assert.equal(L.parseAmount('0'), null);
  assert.equal(L.parseAmount('0', { allowZero: true }), 0);
  assert.equal(L.parseAmount('-50'), null);
  assert.equal(L.parseAmount('-50,25', { allowNegative: true }), -5025);
  assert.equal(L.parseAmount('9999999999999'), null);
  // Rundlauf: Eingabefeld-Format wieder einlesen
  for (const c of [1, 99, 100, 123456, 100000]) assert.equal(L.parseAmount(L.formatAmountInput(c)), c);
});

test('formatPercent', () => {
  assert.equal(L.formatPercent(0.234), '23 %');
  assert.equal(L.formatPercent(-0.1), '−10 %');
  assert.equal(L.formatPercent(null), '–');
});

test('Monatsfilter und Monatsarithmetik', () => {
  assert.deepEqual(L.transactionsInMonth(SAMPLE, '2026-11').map((t) => t.id).sort(), ['t4', 't5', 't6', 't7', 't8']);
  assert.deepEqual(L.transactionsInMonth(SAMPLE, '2026-10').map((t) => t.id).sort(), ['t1', 't2', 't3']);
  assert.equal(L.transactionsInMonth(SAMPLE, '2026-12').length, 0);
  assert.equal(L.addMonths('2026-11', 1), '2026-12');
  assert.equal(L.addMonths('2026-12', 1), '2027-01');
  assert.equal(L.addMonths('2026-01', -1), '2025-12');
  assert.equal(L.addMonths('2026-03', -14), '2025-01');
  assert.deepEqual(L.lastMonths('2026-02', 3), ['2025-12', '2026-01', '2026-02']);
  assert.equal(L.endOfMonth('2024-02'), '2024-02-29');
  assert.equal(L.endOfMonth('2026-02'), '2026-02-28');
  assert.equal(L.endOfMonth('2026-11'), '2026-11-30');
  assert.equal(L.monthLabel('2026-03'), 'März 2026');
  assert.ok(L.isValidISODate('2024-02-29'));
  assert.ok(!L.isValidISODate('2026-02-29'));
  assert.ok(!L.isValidISODate('2026-13-01'));
});

test('Summen, Saldo und Sparquote', () => {
  const nov = L.monthSummary(SAMPLE, '2026-11');
  assert.equal(nov.income, 280000);
  assert.equal(nov.expense, 89000 + 12345 + 2001);
  assert.equal(nov.net, 280000 - 103346);
  assert.ok(Math.abs(nov.savingsRate - (280000 - 103346) / 280000) < 1e-12);
  const empty = L.monthSummary(SAMPLE, '2026-12');
  assert.deepEqual([empty.income, empty.expense, empty.savingsRate], [0, 0, null]);
  assert.equal(L.savingsRate(1000, 1500), -0.5);
  // Keine Float-Fehler: 0,10 + 0,20
  assert.equal(L.totals([tx('a', 'expense', 10, '2026-01-01'), tx('b', 'expense', 20, '2026-01-01')]).expense, 30);
});

test('Ausgaben nach Kategorie', () => {
  const cats = L.expensesByCategory(L.transactionsInMonth(SAMPLE, '2026-11'));
  assert.deepEqual(cats.map((c) => c.id), ['wohnen', 'shopping', 'lebensmittel']);
  assert.equal(cats[0].amount, 89000);
  const shareSum = cats.reduce((s, c) => s + c.share, 0);
  assert.ok(Math.abs(shareSum - 1) < 1e-12);
  assert.equal(L.expensesByCategory([]).length, 0);
});

test('Monatsreihe und Vermögensverlauf', () => {
  const series = L.monthlySeries(SAMPLE, '2026-11', 3);
  assert.deepEqual(series.map((s) => s.key), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(series.map((s) => [s.income, s.expense]), [[0, 1000], [250000, 93550], [280000, 103346]]);
  const start = 100000;
  assert.equal(L.balanceUntil(SAMPLE, start, '2026-09-30'), start - 500 - 1000);
  const bal = L.balanceSeries(SAMPLE, start, '2026-11', 3);
  assert.deepEqual(bal.map((b) => b.value), [
    start - 1500,
    start - 1500 + 250000 - 93550,
    start - 1500 + 250000 - 93550 + 280000 - 103346,
  ]);
});

test('Budgets: Status ok / Warnung ab 90 % / über 100 %', () => {
  assert.equal(L.budgetStatus(8999, 10000).level, 'ok');
  assert.equal(L.budgetStatus(9000, 10000).level, 'warn');
  assert.equal(L.budgetStatus(10000, 10000).level, 'warn');
  assert.equal(L.budgetStatus(10001, 10000).level, 'over');
  assert.equal(L.budgetStatus(10001, 10000).remaining, -1);
  assert.equal(L.budgetStatus(100, 0), null);

  const ov = L.budgetOverview(SAMPLE, { wohnen: 100000, shopping: 12000, lebensmittel: 40000 }, '2026-11');
  const by = Object.fromEntries(ov.items.map((i) => [i.id, i]));
  assert.equal(by.wohnen.spent, 89000);
  assert.equal(by.wohnen.status.level, 'ok');
  assert.equal(by.shopping.status.level, 'over');
  assert.equal(by.lebensmittel.spent, 2001);
  assert.equal(by.freizeit.status, null);
  assert.equal(ov.totalLimit, 152000);
  assert.equal(ov.totalSpent, 89000 + 12345 + 2001);
  // Budgets zählen nur den gewählten Monat
  const oct = L.budgetOverview(SAMPLE, { wohnen: 100000 }, '2026-10');
  assert.equal(oct.items.find((i) => i.id === 'wohnen').spent, 89000);
  assert.equal(oct.items.find((i) => i.id === 'shopping').spent, 0);
});

test('Gruppierung nach Datum, Filter und Suche', () => {
  const groups = L.groupByDate(L.transactionsInMonth(SAMPLE, '2026-11'));
  assert.deepEqual(groups.map((g) => g.date), ['2026-11-20', '2026-11-15', '2026-11-03', '2026-11-01']);
  assert.equal(groups[1].items.length, 2);
  assert.equal(groups[1].net, -(12345 + 2001));
  assert.deepEqual(groups[1].items.map((t) => t.id), ['t7', 't6']); // neueste zuerst

  assert.equal(L.filterTransactions(SAMPLE, { type: 'income' }).length, 3);
  assert.equal(L.filterTransactions(SAMPLE, { type: 'expense' }).length, 7);
  assert.deepEqual(L.filterTransactions(SAMPLE, { query: 'miete' }).map((t) => t.id).sort(), ['t2', 't5']);
  assert.deepEqual(L.filterTransactions(SAMPLE, { query: 'backerei' }).map((t) => t.id), ['t7']); // ohne Umlaut
  assert.deepEqual(L.filterTransactions(SAMPLE, { query: 'Shopping' }).map((t) => t.id), ['t6']);
  assert.deepEqual(L.filterTransactions(SAMPLE, { query: '123,45' }).map((t) => t.id), ['t6']);
  assert.equal(L.filterTransactions(SAMPLE, { type: 'income', query: 'miete' }).length, 0);
});

test('Datumsbeschriftung', () => {
  assert.equal(L.dayLabel('2026-11-20', '2026-11-20'), 'Heute');
  assert.equal(L.dayLabel('2026-11-19', '2026-11-20'), 'Gestern');
  assert.equal(L.dayLabel('2026-12-31', '2027-01-01'), 'Gestern');
  assert.equal(L.dayLabel('2026-11-18', '2026-11-20'), 'Mittwoch, 18. November');
  assert.equal(L.dayLabel('2025-11-18', '2026-11-20'), 'Dienstag, 18. November 2025');
});

test('escapeHtml', () => {
  assert.equal(L.escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(L.escapeHtml("Tom's & Jerry`s"), 'Tom&#39;s &amp; Jerry&#96;s');
  assert.equal(L.escapeHtml(null), '');
});

test('sanitizeData: Backup-Import wird geprüft und bereinigt', () => {
  assert.throws(() => L.sanitizeData(null), /kein gültiges/);
  assert.throws(() => L.sanitizeData({ foo: 1 }), /kein gültiges/);
  const clean = L.sanitizeData({
    app: 'Flowly',
    data: {
      settings: { name: '  Alex\u0000 ', startBalance: 5000 },
      transactions: [
        { id: 'ok1', type: 'expense', amount: 1234, date: '2026-11-01', category: 'abos', note: 'Netflix' },
        { id: 'ok1', type: 'income', amount: 500, date: '2026-11-02', category: 'gibtsnicht' },
        { id: '"><svg>', type: 'expense', amount: 100, date: '2026-11-03', category: 'wohnen' },
        { type: 'expense', amount: -5, date: '2026-11-01' },
        { type: 'expense', amount: 1.5, date: '2026-11-01' },
        { type: 'transfer', amount: 100, date: '2026-11-01' },
        { type: 'expense', amount: 100, date: '2026-02-30' },
      ],
      budgets: { abos: 5000, wohnen: -1, foo: 100 },
      goals: [{ name: 'Urlaub', target: 100000, saved: 2000 }, { name: '', target: 5 }, { name: 'X', target: 0 }],
    },
  });
  assert.equal(clean.settings.name, 'Alex');
  assert.equal(clean.settings.startBalance, 5000);
  assert.equal(clean.transactions.length, 3);
  assert.equal(clean.transactions[1].category, 'sonstiges');
  assert.notEqual(clean.transactions[1].id, 'ok1'); // doppelte ID ersetzt
  assert.match(clean.transactions[2].id, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(clean.budgets, { abos: 5000 });
  assert.equal(clean.goals.length, 1);
  assert.equal(L.goalProgress(clean.goals[0]), 0.02);
});

test('Beispieldaten sind gültig und enden heute', () => {
  const today = '2026-11-20';
  const data = L.generateSampleData(today, 'Alex');
  assert.equal(data.settings.name, 'Alex');
  assert.ok(data.transactions.length > 60);
  assert.ok(data.transactions.every((t) => t.date <= today && L.isValidISODate(t.date)));
  assert.deepEqual(L.sanitizeData(data).transactions.length, data.transactions.length);
  const months = new Set(data.transactions.map((t) => L.monthKeyOf(t.date)));
  assert.deepEqual([...months].sort(), L.lastMonths('2026-11', 6));
  // Deterministisch
  assert.deepEqual(L.generateSampleData(today), L.generateSampleData(today));
  // Jeder Monat hat Gehalt
  for (const m of months) assert.ok(L.monthSummary(data.transactions, m).income >= 285000);
});
