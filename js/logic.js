/*
 * Flowly – reine Logik ohne DOM-Zugriff.
 * Alle Beträge werden als ganze Cent-Werte (Integer) gespeichert, damit
 * keine Rundungsfehler bei Summen entstehen.
 * Daten sind als lokale Kalendertage im Format "YYYY-MM-DD" gespeichert.
 */

export const EXPENSE_CATEGORIES = [
  { id: 'wohnen', label: 'Wohnen', color: '#8B7CF6', icon: 'home' },
  { id: 'lebensmittel', label: 'Lebensmittel', color: '#6EE7B7', icon: 'cart' },
  { id: 'mobilitaet', label: 'Mobilität', color: '#5BC0EB', icon: 'car' },
  { id: 'freizeit', label: 'Freizeit', color: '#F59E5B', icon: 'ticket' },
  { id: 'abos', label: 'Abos', color: '#F472B6', icon: 'repeat' },
  { id: 'shopping', label: 'Shopping', color: '#FBBF24', icon: 'bag' },
  { id: 'gesundheit', label: 'Gesundheit', color: '#F87171', icon: 'heart' },
  { id: 'sonstiges', label: 'Sonstiges', color: '#94A3B8', icon: 'dots' },
];

export const INCOME_CATEGORIES = [
  { id: 'gehalt', label: 'Gehalt', color: '#5BC0EB', icon: 'briefcase' },
  { id: 'nebenjob', label: 'Nebenjob', color: '#8B7CF6', icon: 'laptop' },
  { id: 'geschenk', label: 'Geschenk', color: '#F472B6', icon: 'gift' },
  { id: 'sonstiges', label: 'Sonstiges', color: '#94A3B8', icon: 'dots' },
];

export const MAX_CENTS = 99_999_999_999; // 999.999.999,99 €

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export function categoriesFor(type) {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export function getCategory(type, id) {
  const list = categoriesFor(type);
  return list.find((c) => c.id === id) || list[list.length - 1];
}

/* ---------- Escaping ---------- */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (ch) => ESC[ch]);
}

/* ---------- Beträge ---------- */

/**
 * Wandelt eine Benutzereingabe in Cent um. Unterstützt deutsches Format
 * ("1.234,56"), einfache Komma-Eingaben ("12,5") und Punkt als Dezimaltrenner ("12.50").
 * Gibt null zurück, wenn die Eingabe ungültig ist.
 */
export function parseAmount(input, { allowNegative = false, allowZero = false } = {}) {
  let s = String(input ?? '').replace(/[\s  €]/g, '');
  let negative = false;
  if (/^[-−]/.test(s)) {
    negative = true;
    s = s.slice(1);
  }
  if (!s || !/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  if (negative && !allowNegative) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let intPart;
  let decPart = '';
  let thousandsSep = null;

  if (lastComma >= 0 && lastDot >= 0) {
    const decSep = lastComma > lastDot ? ',' : '.';
    thousandsSep = decSep === ',' ? '.' : ',';
    const idx = s.lastIndexOf(decSep);
    intPart = s.slice(0, idx);
    decPart = s.slice(idx + 1);
    if (intPart.includes(decSep)) return null;
  } else if (lastComma >= 0) {
    const count = s.split(',').length - 1;
    if (count > 1) return null;
    [intPart, decPart] = s.split(',');
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    if (parts.length > 2) {
      thousandsSep = '.';
      intPart = s;
    } else if (parts[1].length === 3 && parts[0].length >= 1 && parts[0].length <= 3 && parts[0] !== '0') {
      // "1.234" ist im Deutschen eintausendzweihundertvierunddreißig
      thousandsSep = '.';
      intPart = s;
    } else {
      [intPart, decPart] = parts;
    }
  } else {
    intPart = s;
  }

  if (thousandsSep) {
    const esc = thousandsSep === '.' ? '\\.' : ',';
    if (intPart.includes(thousandsSep) && !new RegExp(`^\\d{1,3}(${esc}\\d{3})+$`).test(intPart)) return null;
    intPart = intPart.split(thousandsSep).join('');
  }
  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(decPart)) return null;

  const cents = Number(intPart) * 100 + Number((decPart + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  if (cents === 0 && !allowZero) return null;
  return negative ? -cents : cents;
}

function groupThousands(intString) {
  return intString.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 123456 -> "1.234,56 €" (geschütztes Leerzeichen vor dem €) */
export function formatMoney(cents, { signed = false } = {}) {
  const value = Math.round(Number(cents) || 0);
  const abs = Math.abs(value);
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  const sign = value < 0 ? '−' : signed && value > 0 ? '+' : '';
  return `${sign}${groupThousands(String(euros))},${rest} €`;
}

/** Ganze Euro ohne Nachkommastellen, z. B. für Achsenbeschriftungen: 300000 -> "3.000" */
export function formatEuroShort(cents) {
  const value = Math.round((Number(cents) || 0) / 100);
  return (value < 0 ? '−' : '') + groupThousands(String(Math.abs(value)));
}

/** Wert für ein Eingabefeld: 123450 -> "1234,50", 5000 -> "50" */
export function formatAmountInput(cents) {
  const value = Math.round(Number(cents) || 0);
  const abs = Math.abs(value);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  const sign = value < 0 ? '-' : '';
  return rest === 0 ? `${sign}${euros}` : `${sign}${euros},${String(rest).padStart(2, '0')}`;
}

export function formatPercent(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return '–';
  const pct = Math.round(ratio * 100);
  return `${pct < 0 ? '−' : ''}${Math.abs(pct)} %`;
}

/* ---------- Datum & Monate ---------- */

const pad2 = (n) => String(n).padStart(2, '0');

export function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function isValidISODate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function monthKeyOf(isoDate) {
  return String(isoDate).slice(0, 7);
}

export function addMonths(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`;
}

/** Vergleich zweier Monatsschlüssel: negativ, 0 oder positiv */
export function compareMonths(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function endOfMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return `${key}-${pad2(daysInMonth(y, m))}`;
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function monthName(key) {
  return MONTHS[Number(key.split('-')[1]) - 1];
}

export function monthShort(key) {
  return MONTHS_SHORT[Number(key.split('-')[1]) - 1];
}

/** Die letzten n Monate bis einschließlich key, älteste zuerst. */
export function lastMonths(key, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addMonths(key, -i));
  return out;
}

function parseLocal(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function dayLabel(iso, today = todayISO()) {
  if (iso === today) return 'Heute';
  const t = parseLocal(today);
  t.setDate(t.getDate() - 1);
  if (iso === toISODate(t)) return 'Gestern';
  const d = parseLocal(iso);
  const base = `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
  return iso.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${d.getFullYear()}`;
}

export function shortDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function greeting(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 11) return 'Guten Morgen';
  if (hour >= 11 && hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

/* ---------- Auswertungen ---------- */

export function sortTransactions(txs) {
  return [...txs].sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));
}

export function transactionsInMonth(txs, key) {
  return txs.filter((t) => monthKeyOf(t.date) === key);
}

export function totals(txs) {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { income, expense, net: income - expense };
}

/** Anteil des Einkommens, der nicht ausgegeben wurde. null, wenn es keine Einnahmen gibt. */
export function savingsRate(income, expense) {
  if (!income || income <= 0) return null;
  return (income - expense) / income;
}

export function monthSummary(txs, key) {
  const t = totals(transactionsInMonth(txs, key));
  return { ...t, savingsRate: savingsRate(t.income, t.expense) };
}

export function expensesByCategory(txs) {
  const sums = new Map();
  let total = 0;
  for (const t of txs) {
    if (t.type !== 'expense') continue;
    sums.set(t.category, (sums.get(t.category) || 0) + t.amount);
    total += t.amount;
  }
  return EXPENSE_CATEGORIES.filter((c) => sums.get(c.id) > 0)
    .map((c) => ({ ...c, amount: sums.get(c.id), share: total ? sums.get(c.id) / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export function monthlySeries(txs, endKey, n) {
  const keys = lastMonths(endKey, n);
  const map = new Map(keys.map((k) => [k, { key: k, income: 0, expense: 0 }]));
  for (const t of txs) {
    const row = map.get(monthKeyOf(t.date));
    if (!row) continue;
    if (t.type === 'income') row.income += t.amount;
    else if (t.type === 'expense') row.expense += t.amount;
  }
  return keys.map((k) => map.get(k));
}

/** Kontostand inkl. aller Buchungen bis einschließlich isoDate. */
export function balanceUntil(txs, startBalance, isoDate) {
  let sum = startBalance || 0;
  for (const t of txs) {
    if (t.date > isoDate) continue;
    sum += t.type === 'income' ? t.amount : -t.amount;
  }
  return sum;
}

/** Vermögen jeweils am Monatsende für die letzten n Monate bis endKey. */
export function balanceSeries(txs, startBalance, endKey, n) {
  return lastMonths(endKey, n).map((key) => ({ key, value: balanceUntil(txs, startBalance, endOfMonth(key)) }));
}

export function budgetStatus(spent, limit) {
  if (!limit || limit <= 0) return null;
  const ratio = spent / limit;
  const level = ratio > 1 ? 'over' : ratio >= 0.9 ? 'warn' : 'ok';
  return { ratio, level, remaining: limit - spent };
}

export function budgetOverview(txs, budgets, key) {
  const spentBy = {};
  for (const t of transactionsInMonth(txs, key)) {
    if (t.type === 'expense') spentBy[t.category] = (spentBy[t.category] || 0) + t.amount;
  }
  const items = EXPENSE_CATEGORIES.map((c) => {
    const limit = budgets?.[c.id] > 0 ? budgets[c.id] : 0;
    const spent = spentBy[c.id] || 0;
    return { ...c, limit, spent, status: budgetStatus(spent, limit) };
  });
  const budgeted = items.filter((i) => i.limit > 0);
  const totalLimit = budgeted.reduce((s, i) => s + i.limit, 0);
  const totalSpent = budgeted.reduce((s, i) => s + i.spent, 0);
  return { items, totalLimit, totalSpent, status: budgetStatus(totalSpent, totalLimit) };
}

export function groupByDate(txs) {
  const groups = [];
  let current = null;
  for (const t of sortTransactions(txs)) {
    if (!current || current.date !== t.date) {
      current = { date: t.date, items: [], net: 0 };
      groups.push(current);
    }
    current.items.push(t);
    current.net += t.type === 'income' ? t.amount : -t.amount;
  }
  return groups;
}

function normalizeSearch(s) {
  return String(s).toLocaleLowerCase('de-DE').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function filterTransactions(txs, { type = 'all', query = '' } = {}) {
  const q = normalizeSearch(query.trim());
  return txs.filter((t) => {
    if (type !== 'all' && t.type !== type) return false;
    if (!q) return true;
    const cat = getCategory(t.type, t.category);
    const hay = normalizeSearch(`${t.note || ''} ${cat.label} ${formatMoney(t.amount)} ${formatAmountInput(t.amount)} ${shortDate(t.date)}`);
    return hay.includes(q);
  });
}

export function goalProgress(goal) {
  if (!goal.target || goal.target <= 0) return 0;
  return Math.max(0, Math.min(1, goal.saved / goal.target));
}

/* ---------- Daten & Validierung ---------- */

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createEmptyState() {
  return { version: 1, settings: { name: '', startBalance: 0 }, transactions: [], budgets: {}, goals: [] };
}

const cleanText = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max) : '');
const isCents = (v) => Number.isSafeInteger(v) && Math.abs(v) <= MAX_CENTS;
const cleanId = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : uid());

/**
 * Prüft und bereinigt gespeicherte oder importierte Daten.
 * Akzeptiert sowohl den reinen Zustand als auch eine Backup-Datei ({ app, data }).
 * Wirft einen Error mit deutscher Meldung, wenn die Struktur unbrauchbar ist.
 */
export function sanitizeData(raw) {
  if (raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) raw = raw.data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.transactions)) {
    throw new Error('Die Datei ist kein gültiges Flowly-Backup.');
  }
  const out = createEmptyState();
  const s = raw.settings || {};
  out.settings.name = cleanText(s.name, 40);
  out.settings.startBalance = isCents(s.startBalance) ? s.startBalance : 0;

  const seen = new Set();
  for (const t of raw.transactions) {
    if (!t || typeof t !== 'object') continue;
    const type = t.type === 'income' ? 'income' : t.type === 'expense' ? 'expense' : null;
    if (!type || !isCents(t.amount) || t.amount <= 0 || !isValidISODate(t.date)) continue;
    let id = cleanId(t.id);
    while (seen.has(id)) id = uid();
    seen.add(id);
    out.transactions.push({
      id,
      type,
      amount: t.amount,
      category: getCategory(type, t.category).id,
      note: cleanText(t.note, 100),
      date: t.date,
      createdAt: Number.isFinite(t.createdAt) ? t.createdAt : 0,
    });
  }

  if (raw.budgets && typeof raw.budgets === 'object') {
    for (const c of EXPENSE_CATEGORIES) {
      const v = raw.budgets[c.id];
      if (isCents(v) && v > 0) out.budgets[c.id] = v;
    }
  }

  if (Array.isArray(raw.goals)) {
    for (const g of raw.goals) {
      if (!g || typeof g !== 'object') continue;
      const name = cleanText(g.name, 40);
      if (!name || !isCents(g.target) || g.target <= 0) continue;
      out.goals.push({
        id: cleanId(g.id),
        name,
        target: g.target,
        saved: isCents(g.saved) && g.saved > 0 ? g.saved : 0,
        createdAt: Number.isFinite(g.createdAt) ? g.createdAt : 0,
      });
    }
  }
  return out;
}

/* ---------- Beispieldaten ---------- */

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Realistische Beispieldaten für die letzten 6 Monate bis heute (deterministisch). */
export function generateSampleData(today = todayISO(), name = '') {
  const rnd = mulberry32(20261120);
  const between = (min, max) => Math.round((min + rnd() * (max - min)) * 100);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const state = createEmptyState();
  state.settings = { name, startBalance: 420000 };
  let counter = 0;
  const currentKey = monthKeyOf(today);

  for (const key of lastMonths(currentKey, 6)) {
    const [y, m] = key.split('-').map(Number);
    const dim = daysInMonth(y, m);
    const add = (day, type, category, amount, note) => {
      const date = `${key}-${pad2(Math.min(day, dim))}`;
      if (date > today) return;
      counter += 1;
      state.transactions.push({ id: `demo${counter}`, type, category, amount, note, date, createdAt: counter });
    };

    add(1, 'income', 'gehalt', 285000, 'Gehalt');
    add(1, 'expense', 'mobilitaet', 5800, 'Deutschlandticket');
    add(2, 'expense', 'abos', 2990, 'Fitnessstudio');
    add(3, 'expense', 'wohnen', 89000, 'Miete');
    add(5, 'expense', 'abos', 1299, 'Streaming');
    add(8, 'expense', 'abos', 1099, 'Musik-Abo');
    add(10, 'expense', 'wohnen', 6500, 'Strom');
    add(12, 'expense', 'abos', 1999, 'Handyvertrag');
    if (rnd() > 0.35) add(15, 'income', 'nebenjob', between(180, 420), pick(['Nachhilfe', 'Freelance-Projekt', 'Fotoshooting']));
    if (m === 12 || rnd() > 0.85) add(Math.ceil(rnd() * 26), 'income', 'geschenk', between(40, 150), pick(['Geburtstag', 'Von Oma']));

    const groceryNotes = ['Wocheneinkauf', 'Supermarkt', 'Bäckerei', 'Wochenmarkt', 'Drogerie & Lebensmittel', 'Bio-Laden'];
    for (let i = 0; i < 8; i++) add(2 + i * 3 + Math.floor(rnd() * 3), 'expense', 'lebensmittel', between(12, 78), pick(groceryNotes));
    add(9 + Math.floor(rnd() * 12), 'expense', 'mobilitaet', between(45, 72), 'Tanken');
    const leisure = ['Kino', 'Restaurant', 'Konzert', 'Café mit Freunden', 'Bowling', 'Museum'];
    const leisureCount = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < leisureCount; i++) add(4 + Math.floor(rnd() * 24), 'expense', 'freizeit', between(9, 55), pick(leisure));
    const shopping = ['Kleidung', 'Schuhe', 'Elektronik', 'Bücher', 'Deko fürs Wohnzimmer'];
    const shoppingCount = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < shoppingCount; i++) add(6 + Math.floor(rnd() * 20), 'expense', 'shopping', between(18, 95), pick(shopping));
    if (rnd() > 0.5) add(7 + Math.floor(rnd() * 18), 'expense', 'gesundheit', between(8, 35), pick(['Apotheke', 'Zahnreinigung', 'Physiotherapie']));
    if (rnd() > 0.6) add(5 + Math.floor(rnd() * 20), 'expense', 'sonstiges', between(10, 40), pick(['Geschenk für Freunde', 'Spende', 'Haarschnitt']));
  }
  // Ein Shopping-Ausreißer im aktuellen Monat, damit eine Budgetwarnung sichtbar wird
  const dayNow = Number(today.slice(8, 10));
  counter += 1;
  state.transactions.push({ id: `demo${counter}`, type: 'expense', category: 'shopping', amount: 11999, note: 'Neue Sneaker', date: `${currentKey}-${pad2(Math.max(1, dayNow - 1))}`, createdAt: counter });

  state.budgets = { wohnen: 110000, lebensmittel: 40000, mobilitaet: 15000, freizeit: 15000, abos: 8000, shopping: 15000 };
  state.goals = [
    { id: 'demogoal1', name: 'Notgroschen', target: 500000, saved: 235000, createdAt: 1 },
    { id: 'demogoal2', name: 'Urlaub Portugal', target: 150000, saved: 98000, createdAt: 2 },
    { id: 'demogoal3', name: 'Neues Fahrrad', target: 120000, saved: 120000, createdAt: 3 },
  ];
  return state;
}
