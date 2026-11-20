/*
 * Flowly – wiederkehrende Buchungen (Daueraufträge & Abos) und deren automatische Erkennung.
 */
import { addMonths, monthKeyOf, toISODate, getCategory } from './logic.js';

export const INTERVALS = [
  { id: 'once', label: 'Einmalig (geplant)' },
  { id: 'weekly', label: 'Wöchentlich' },
  { id: 'monthly', label: 'Monatlich' },
  { id: 'quarterly', label: 'Vierteljährlich' },
  { id: 'yearly', label: 'Jährlich' },
];
const MONTH_STEP = { monthly: 1, quarterly: 3, yearly: 12 };

const pad2 = (n) => String(n).padStart(2, '0');
const daysIn = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
const parse = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Termin im Monat `key` am Tag `day` (bei kurzen Monaten der letzte Tag). */
function dateInMonth(key, day) {
  return `${key}-${pad2(Math.min(day, daysIn(key)))}`;
}

/** Nächster Termin nach `fromDate` gemäß Intervall. */
export function nextOccurrence(rule, fromDate) {
  if (rule.interval === 'once') return '9999-12-31';
  if (rule.interval === 'weekly') {
    const d = parse(fromDate);
    d.setDate(d.getDate() + 7);
    return toISODate(d);
  }
  const step = MONTH_STEP[rule.interval] || 1;
  return dateInMonth(addMonths(monthKeyOf(fromDate), step), rule.day || Number(fromDate.slice(8, 10)));
}

/** Erster Termin am oder nach `date` für einen Tag-im-Monat (z. B. "Gehalt am 28."). */
export function firstOnOrAfter(day, date, interval = 'monthly') {
  if (interval === 'weekly') return date;
  const key = monthKeyOf(date);
  const candidate = dateInMonth(key, day);
  return candidate >= date ? candidate : dateInMonth(addMonths(key, MONTH_STEP[interval] || 1), day);
}

export function describeRule(rule) {
  if (rule.interval === 'once') {
    const [y, m, d] = rule.nextDate.split('-');
    return `Einmalig am ${d}.${m}.${y}`;
  }
  const label = INTERVALS.find((i) => i.id === rule.interval)?.label || 'Monatlich';
  if (rule.interval === 'weekly') {
    const wd = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][parse(rule.nextDate).getDay()];
    return `${label} am ${wd}`;
  }
  return `${label} am ${rule.day}.`;
}

/**
 * Bucht alle fälligen Termine bis einschließlich `today`.
 * Verändert data.transactions und rule.nextDate. Gibt die neuen Buchungen zurück.
 * Doppelbuchungen sind ausgeschlossen (extId pro Regel und Termin).
 */
export function applyRecurring(data, today, uid) {
  const created = [];
  const existing = new Set(data.transactions.map((t) => t.extId).filter(Boolean));
  for (const rule of data.recurring || []) {
    if (rule.active === false) continue;
    let guard = 0;
    while (rule.nextDate <= today && guard < 520) {
      guard++;
      const extId = `rec:${rule.id}:${rule.nextDate}`;
      if (!existing.has(extId)) {
        const tx = {
          id: uid(),
          type: rule.type,
          amount: rule.amount,
          category: getCategory(rule.type, rule.category).id,
          note: rule.note,
          date: rule.nextDate,
          createdAt: Date.now() + created.length,
          src: 'recurring',
          extId,
          rid: rule.id,
          merchant: rule.note,
          mkey: rule.mkey || '',
          auto: false,
        };
        data.transactions.push(tx);
        existing.add(extId);
        created.push(tx);
      }
      if (rule.interval === 'once') {
        rule.done = true;
        break;
      }
      rule.nextDate = nextOccurrence(rule, rule.nextDate);
    }
  }
  // Einmalig geplante Buchungen sind nach dem Buchen erledigt
  if (data.recurring) data.recurring = data.recurring.filter((r) => !(r.interval === 'once' && r.done));
  return created;
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

const days = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

/**
 * Findet Zahlungen, die regelmäßig beim selben Händler mit (fast) gleichem Betrag auftreten.
 * Monatlich: Abstände 25–36 Tage, mind. 3 Mal (oder 2 Mal mit exakt gleichem Betrag).
 * Wöchentlich: Abstände 6–8 Tage, mind. 4 Mal.
 */
export function detectRecurring(data, today) {
  const rules = data.recurring || [];
  const dismissed = new Set(data.dismissedSuggestions || []);
  const ruleKeys = new Set(rules.map((r) => `${r.type}:${r.mkey || ''}`));
  const groups = new Map();
  for (const t of data.transactions) {
    if (!t.mkey || t.src === 'recurring' || t.rid) continue;
    const k = `${t.type}:${t.mkey}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const out = [];
  for (const [key, list] of groups) {
    if (list.length < 2 || ruleKeys.has(key) || dismissed.has(key)) continue;
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const gaps = list.slice(1).map((t, i) => days(list[i].date, t.date));
    const amounts = list.map((t) => t.amount);
    const med = median(amounts);
    const stable = amounts.every((a) => Math.abs(a - med) <= Math.max(100, med * 0.1));
    if (!stable) continue;
    const allSame = amounts.every((a) => a === amounts[0]);
    const last = list[list.length - 1];
    let interval = null;
    if (gaps.every((g) => g >= 25 && g <= 36) && (list.length >= 3 || allSame)) interval = 'monthly';
    else if (gaps.every((g) => g >= 6 && g <= 8) && list.length >= 4) interval = 'weekly';
    if (!interval) continue;
    if (days(last.date, today) > (interval === 'weekly' ? 15 : 45)) continue; // nicht mehr aktiv
    const day = interval === 'monthly' ? median(list.map((t) => Number(t.date.slice(8, 10)))) : 0;
    const rule = { interval, day };
    const counts = new Map();
    list.forEach((t) => counts.set(t.category, (counts.get(t.category) || 0) + 1));
    const category = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    out.push({
      key,
      type: last.type,
      mkey: last.mkey,
      note: last.merchant || last.note,
      amount: last.amount,
      category,
      interval,
      day,
      count: list.length,
      nextDate: nextOccurrence({ ...rule, day: day || Number(last.date.slice(8, 10)) }, last.date),
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

/** Überträgt geänderte Angaben eines Dauerauftrags auf alle schon gebuchten Einträge. */
export function updateRuleBookings(data, ruleId, { type, amount, category, note }) {
  let n = 0;
  for (const t of data.transactions) {
    if (t.rid !== ruleId) continue;
    Object.assign(t, { type, amount, category, note, merchant: note });
    n++;
  }
  return n;
}
