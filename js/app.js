/* Flowly – App-Oberfläche */
import * as L from './logic.js';
import { loadState, saveState, storageAvailable, loadUi, saveUi } from './store.js';
import { icon } from './icons.js';
import { areaChart, attachAreaScrub, barChart, donutChart } from './charts.js';
import * as Lock from './lock.js';
import { merchantKey, suggestCategory, learnedKey } from './categorize.js';
import { decodeBytes, parseImportText, buildCandidates, candidateToTransaction } from './importer.js';
import { INTERVALS, applyRecurring, detectRecurring, describeRule, updateRuleBookings } from './recurring.js';

const esc = L.escapeHtml;
const money = L.formatMoney;
const rememberSeen = L.rememberSeen;
const $ = (sel, root = document) => root.querySelector(sel);

const TABS = [
  { id: 'start', label: 'Start' },
  { id: 'numbers', label: 'Zahlen' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'goals', label: 'Ziele' },
  { id: 'settings', label: 'Einstellungen' },
];
const LEGACY_TABS = { overview: 'start', transactions: 'numbers' };

const ui = loadUi();
const savedTab = LEGACY_TABS[ui.tab] || ui.tab;
const state = {
  data: loadState(),
  tab: TABS.some((t) => t.id === savedTab) ? savedTab : 'start',
  month: L.monthKeyOf(L.todayISO()),
  txFilter: 'all',
  txQuery: '',
  scroll: {},
};
const canStore = storageAvailable();

/* ---------- Speichern ---------- */

function commit(message) {
  const ok = saveState(state.data);
  if (!ok) toast('Speichern nicht möglich – Speicher voll oder privat?', true);
  else if (message) toast(message);
  render();
}

/* ---------- Hilfen ---------- */

function catIcon(cat, size = 20) {
  return `<span class="cat-icon" style="background:${cat.color}1f;color:${cat.color}">${icon(cat.icon, size)}</span>`;
}

function currentMonth() {
  return L.monthKeyOf(L.todayISO());
}

function monthSwitcher() {
  const atNow = L.compareMonths(state.month, currentMonth()) >= 0;
  return `<div class="month-switch">
    <button type="button" data-action="month-prev" aria-label="Vorheriger Monat">${icon('chevronLeft')}</button>
    <span class="label">${esc(L.monthLabel(state.month))}</span>
    <button type="button" data-action="month-next" aria-label="Nächster Monat" ${atNow ? 'disabled' : ''}>${icon('chevronRight')}</button>
  </div>`;
}

function txRow(t, { showDate = false } = {}) {
  const cat = L.getCategory(t.type, t.category);
  const isIn = t.type === 'income';
  const title = t.note ? esc(t.note) : esc(cat.label);
  const subParts = [t.note ? cat.label : isIn ? 'Einnahme' : 'Ausgabe'];
  if (showDate) subParts.push(shortDay(t.date));
  if (t.src && SOURCE_LABEL[t.src]) subParts.push(SOURCE_LABEL[t.src]);
  return `<li><button type="button" class="row tile" data-action="edit-tx" data-id="${esc(t.id)}">
    ${catIcon(cat)}
    <span class="main"><span class="title">${title}</span><span class="sub">${esc(subParts.join(' · '))}</span></span>
    <span class="amount ${isIn ? 'in' : 'out'}">${money(isIn ? t.amount : -t.amount, { signed: true })}</span>
  </button></li>`;
}

/** Kurzes Datum für Kacheln: „Heute“, „Gestern“ oder „18. Nov“. */
function shortDay(iso) {
  const today = L.todayISO();
  const label = L.dayLabel(iso, today);
  if (label === 'Heute' || label === 'Gestern') return label;
  const [y, , d] = iso.split('-');
  return `${Number(d)}. ${L.monthShort(iso.slice(0, 7))}${y !== today.slice(0, 4) ? ` ${y}` : ''}`;
}

function emptyState({ title, text, art = 'sparkle', actions = '', small = false }) {
  return `<div class="card empty${small ? ' small' : ''}">
    <div class="art">${icon(art, small ? 24 : 32)}</div>
    <h2>${title}</h2>
    <p>${text}</p>
    ${actions ? `<div class="actions">${actions}</div>` : ''}
  </div>`;
}

function startButtons() {
  if (state.data.settings.hideImport) {
    return `<button type="button" class="btn primary block" data-action="open-add">${icon('plus', 20)}Erste Buchung eintragen</button>
      <button type="button" class="btn block" data-action="load-sample">${icon('database', 20)}Beispieldaten laden</button>
      <button type="button" class="link center-link" data-action="show-import">Doch lieber automatisch importieren?</button>`;
  }
  return `<button type="button" class="btn primary block" data-action="import">${icon('download', 20)}Neue Zahlungen importieren</button>
    <button type="button" class="btn block" data-action="manual-mode">${icon('pencil', 20)}Zahlen selbst eintragen</button>
    <button type="button" class="btn block" data-action="open-automation">${icon('sparkle', 20)}Automatik einrichten</button>
    <button type="button" class="btn block" data-action="load-sample">${icon('database', 20)}Beispieldaten laden</button>`;
}

/* ---------- Kopfzeile, Pillen & untere Leiste ---------- */

function renderTopbar() {
  const name = state.data.settings.name.trim();
  $('#avatar').innerHTML = name ? `<span>${esc(name[0].toUpperCase())}</span>` : icon('trend', 20);
  $('#avatar').classList.toggle('on', state.tab === 'settings');
  const pills = $('#pills');
  pills.innerHTML = TABS.map(
    (t) => `<button type="button" class="pill-tab" data-action="tab" data-tab="${t.id}" ${state.tab === t.id ? 'aria-current="page"' : ''}>${t.label}</button>`,
  ).join('');
  const active = pills.querySelector('[aria-current="page"]');
  if (active) {
    const target = active.offsetLeft - (pills.clientWidth - active.offsetWidth) / 2;
    pills.scrollTo({ left: Math.max(0, target), behavior: pills.dataset.ready ? 'smooth' : 'auto' });
    pills.dataset.ready = '1';
  }
}

function renderTabbar() {
  const input = $('#global-search');
  if (input && document.activeElement !== input) input.value = state.txQuery;
  $('#search-pill')?.classList.toggle('has-value', !!state.txQuery);
}

let lastTabIndex = 0;
function switchTab(id) {
  if (id === state.tab) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  state.scroll[state.tab] = window.scrollY;
  lastTabIndex = TABS.findIndex((t) => t.id === state.tab);
  state.tab = id;
  saveUi({ ...ui, tab: id });
  render();
  window.scrollTo(0, state.scroll[id] || 0);
}

/* ---------- Start ---------- */

function renderStart() {
  const { transactions, settings } = state.data;
  if (!transactions.length) {
    return `<div class="stack">${emptyState({
      title: 'Willkommen bei Flowly',
      art: 'trend',
      text: settings.hideImport
        ? 'Trage deine Einnahmen und Ausgaben über das Plus unten ein – alles bleibt auf deinem iPhone.'
        : 'Importiere deine Zahlungen automatisch oder trage sie selbst ein – alles bleibt auf deinem iPhone.',
      actions: startButtons(),
    })}
    ${!settings.name ? `<button type="button" class="card settings-row" data-action="tab" data-tab="settings" style="border-radius:18px"><span class="ri">${icon('user', 18)}</span><span class="main">Wie heißt du?<span class="sub">Name und Startguthaben in den Einstellungen festlegen</span></span>${icon('chevronRight', 18)}</button>` : ''}
    </div>`;
  }
  const today = L.todayISO();
  const nowKey = currentMonth();
  const balance = L.balanceUntil(transactions, settings.startBalance, today);
  const series = L.balanceSeries(transactions, settings.startBalance, nowKey, 12);
  series[series.length - 1] = { key: nowKey, value: balance };
  const limit = settings.monthlyLimit ? L.limitForMonth(settings, nowKey) : 0;
  const month = L.monthSummary(transactions, nowKey);
  // Mit Limit: Kontostand minus Limit. Ohne Limit: Plus/Minus des Monats. Immer nur Vorzeichen + Zahl.
  const delta = settings.monthlyLimit ? balance - limit : month.net;
  const tone = delta < 0 ? 'neg' : 'pos';
  const recent = L.sortTransactions(transactions.filter((t) => t.date <= today)).slice(0, 8);
  const name = settings.name.trim();

  return `<div class="stack">
    <section class="hero ${tone}" id="hero">
      <div class="hero-label" id="hero-label">${esc(name ? `${L.greeting()}, ${name}` : L.greeting())}</div>
      <div class="hero-value" id="hero-value">${money(balance)}</div>
      <button type="button" class="hero-delta" data-action="edit-limit" aria-label="${settings.monthlyLimit ? 'Kontostand über oder unter dem Limit' : 'Plus oder Minus in diesem Monat'}, antippen zum Ändern des Limits">${money(delta, { signed: true })}</button>
      ${areaChart(series, series.length - 1, tone === 'pos' ? '#6EE7B7' : '#F87171')}
    </section>

    ${settings.hideImport ? '' : importCard()}

    <section>
      <button type="button" class="section-link" data-action="tab" data-tab="numbers">Letzte Umsätze ${icon('chevronRight', 20)}</button>
      <ul class="tx-list tiles">${recent.map((t) => txRow(t, { showDate: true })).join('')}</ul>
    </section>
  </div>`;
}

function mountStart(root) {
  const chart = $('.area-chart', root);
  if (!chart) return;
  const { transactions, settings } = state.data;
  const nowKey = currentMonth();
  const series = L.balanceSeries(transactions, settings.startBalance, nowKey, 12);
  series[series.length - 1] = { key: nowKey, value: L.balanceUntil(transactions, settings.startBalance, L.todayISO()) };
  const label = $('#hero-label', root);
  const value = $('#hero-value', root);
  const baseLabel = label.textContent;
  attachAreaScrub(chart, series, (i) => {
    const last = i === series.length - 1;
    label.textContent = last ? baseLabel : `Kontostand Ende ${L.monthLabel(series[i].key)}`;
    value.textContent = money(series[i].value);
  });
}

/* ---------- Zahlen ---------- */

function renderNumbers() {
  const { transactions } = state.data;
  if (!transactions.length) {
    return emptyState({
      title: 'Noch keine Zahlen',
      art: 'list',
      text: 'Tippe unten rechts auf das Plus, um deine erste Einnahme oder Ausgabe einzutragen.',
      actions: startButtons(),
    });
  }
  const month = state.month;
  const sum = L.monthSummary(transactions, month);
  const bars = L.monthlySeries(transactions, month, 6);
  const cats = L.expensesByCategory(L.transactionsInMonth(transactions, month));
  const rate = sum.savingsRate;
  const ratePct = rate == null ? 0 : Math.max(0, Math.min(1, rate));
  const filters = [
    ['all', 'Alle'],
    ['income', 'Einnahmen'],
    ['expense', 'Ausgaben'],
  ];
  const idx = filters.findIndex((f) => f[0] === state.txFilter);
  const rules = state.data.recurring;
  const fix = rules.filter((r) => r.type === 'expense').reduce((acc, r) => acc + monthlyEquivalent(r), 0);

  if (state.txQuery.trim()) {
    return `<div class="search-head"><span>Suche: „${esc(state.txQuery.trim())}“</span><button type="button" class="link" data-action="clear-search">Fertig</button></div>
      <div id="tx-results">${renderTxResults()}</div>`;
  }

  return `<div class="stack">
    ${monthSwitcher()}

    <div class="stats">
      <section class="card stat">
        <div class="stat-top"><span class="badge in">${icon('arrowIn', 18)}</span><span class="eyebrow">Einnahmen</span></div>
        <div class="mid">${money(sum.income)}</div>
      </section>
      <section class="card stat">
        <div class="stat-top"><span class="badge out">${icon('arrowOut', 18)}</span><span class="eyebrow">Ausgaben</span></div>
        <div class="mid">${money(sum.expense)}</div>
      </section>
      <section class="card stat wide">
        <div class="stat-top"><span class="badge pos">${icon('sparkle', 18)}</span><span class="eyebrow">Sparquote</span></div>
        <div class="rate-row">
          <div class="mid">${L.formatPercent(rate)}</div>
          <div class="hint">${rate == null ? 'Noch keine Einnahmen in diesem Monat' : sum.net >= 0 ? `${money(sum.net)} zurückgelegt` : `${money(-sum.net)} mehr ausgegeben`}</div>
        </div>
        <div class="bar pos"><span style="width:${(ratePct * 100).toFixed(1)}%"></span></div>
      </section>
    </div>

    ${limitCard(sum.expense, month)}

    <section class="card">
      <div class="card-head"><h2>Einnahmen vs. Ausgaben</h2></div>
      <div class="legend"><span class="key"><span class="dot" style="background:var(--income)"></span>Einnahmen</span><span class="key"><span class="dot" style="background:var(--expense)"></span>Ausgaben</span></div>
      ${barChart(bars, month)}
      <div class="bar-readout">
        <div>${esc(L.monthShort(month))} · Einnahmen<strong>${money(sum.income)}</strong></div>
        <div style="text-align:right">Ausgaben<strong>${money(sum.expense)}</strong></div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Ausgaben nach Kategorie</h2></div>
      ${cats.length
        ? `<div class="donut-wrap">
            <div class="donut-box">${donutChart(cats)}<div class="donut-center"><span class="eyebrow">Gesamt</span><strong>${money(sum.expense)}</strong></div></div>
            <ul class="cat-legend">${cats
              .map((c) => `<li><span class="dot" style="background:${c.color}"></span><span class="name">${esc(c.label)}</span><span class="val"><b>${L.formatEuroShort(c.amount)}\u00A0€</b> · ${L.formatPercent(c.share)}</span></li>`)
              .join('')}</ul>
          </div>`
        : `<p class="muted" style="margin:0">Keine Ausgaben im ${esc(L.monthLabel(month))}.</p>`}
    </section>

    <button type="button" class="card rec-entry" data-action="open-recurring">
      <span class="badge pos">${icon('repeat', 18)}</span>
      <span class="main"><span class="title">Geplant & Daueraufträge</span><span class="sub">${rules.length ? `${rules.length} geplant · ${money(fix)} Fixkosten im Monat` : 'Geld an einem Datum oder regelmäßig automatisch buchen'}</span></span>
      ${icon('chevronRight', 18)}
    </button>

    <section>
      <h3 class="section-link static">Alle Umsätze</h3>
      <div class="seg" role="group" aria-label="Filter" style="margin:0 0 14px">
        <span class="thumb" style="width:calc((100% - 8px) / 3);transform:translateX(${idx * 100}%)"></span>
        ${filters.map(([id, label]) => `<button type="button" data-action="tx-filter" data-filter="${id}" aria-pressed="${state.txFilter === id}">${label}</button>`).join('')}
      </div>
      <div id="tx-results">${renderTxResults()}</div>
    </section>
  </div>`;
}

function limitCard(expense, month) {
  const settings = state.data.settings;
  if (!settings.monthlyLimit) {
    return `<button type="button" class="card limit-card unset" data-action="edit-limit">
      <span class="badge out">${icon('wallet', 18)}</span>
      <span class="main"><span class="title">Ausgaben-Limit festlegen</span><span class="sub">Lege fest, wie viel du pro Monat höchstens ausgeben willst.</span></span>
      ${icon('plus', 20)}
    </button>`;
  }
  const limit = L.limitForMonth(settings, month);
  const remaining = limit - expense;
  const over = remaining < 0;
  const ratio = limit > 0 ? expense / limit : 1;
  const step = settings.limitStep || 0;
  return `<button type="button" class="card limit-card ${over ? 'neg' : 'pos'}" data-action="edit-limit" aria-label="Ausgaben-Limit bearbeiten">
    <div class="limit-head"><span class="eyebrow">Ausgegeben · ${esc(L.monthName(month))}</span>${icon('pencil', 16)}</div>
    <div class="big limit-value">${money(expense)}</div>
    <div class="limit-diff">${money(remaining, { signed: true })}</div>
    <div class="bar ${over ? 'over' : 'pos'}"><span style="width:${Math.min(100, ratio * 100).toFixed(1)}%"></span></div>
    <div class="limit-foot"><span>Limit ${money(limit)}</span>${step ? `<span>${money(step, { signed: true })} pro Monat</span>` : ''}</div>
  </button>`;
}

function openLimitSheet() {
  const settings = state.data.settings;
  const nowKey = currentMonth();
  const current = L.limitForMonth(settings, nowKey);
  const step = settings.limitStep || 0;
  let mode = step > 0 ? 'up' : step < 0 ? 'down' : 'same';
  openSheet({
    title: 'Ausgaben-Limit pro Monat',
    body: `
      <p class="muted" style="margin:0">So viel willst du pro Monat höchstens ausgeben. In der Übersicht steht darunter <b style="color:var(--positive)">grün mit +</b>, wie viel noch geht – oder <b style="color:var(--danger)">rot mit −</b>, wie viel du drüber bist.</p>
      <div class="field">
        <label for="l-amount">Limit im ${esc(L.monthName(nowKey))}</label>
        <div class="amount-field small"><input id="l-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="z. B. 1.500" maxlength="16" value="${current ? esc(L.formatAmountInput(current)) : ''}"><span class="cur">€</span></div>
      </div>
      <div class="field">
        <span class="label">Jeden Monat</span>
        <div class="seg seg3" id="l-mode" role="group" style="margin-top:0">
          <span class="thumb" style="width:calc((100% - 8px) / 3)"></span>
          <button type="button" data-mode="same">Gleich lassen</button>
          <button type="button" data-mode="up">Erhöhen</button>
          <button type="button" data-mode="down">Verringern</button>
        </div>
      </div>
      <div class="field" id="l-step-field">
        <label for="l-step" id="l-step-label">Um wie viel?</label>
        <div class="amount-field small"><span class="sign" id="l-step-sign">+</span><input id="l-step" type="text" inputmode="decimal" autocomplete="off" placeholder="z. B. 50" maxlength="16" value="${step ? esc(L.formatAmountInput(Math.abs(step))) : ''}"><span class="cur">€</span></div>
      </div>
      <div class="limit-preview" id="l-preview"></div>
      <div class="form-error" id="l-error"></div>
      <button type="button" class="btn primary block" id="l-save">${icon('check', 20)}Limit speichern</button>
      ${settings.monthlyLimit ? `<button type="button" class="btn danger block" id="l-remove">${icon('trash', 20)}Limit entfernen</button>` : ''}`,
    onMount(sheet, close) {
      const input = $('#l-amount', sheet);
      const stepInput = $('#l-step', sheet);
      amountInputHandler(input);
      amountInputHandler(stepInput);
      const modes = ['same', 'up', 'down'];
      const preview = () => {
        const base = L.parseAmount(input.value);
        const st = L.parseAmount(stepInput.value) || 0;
        const signed = mode === 'up' ? st : mode === 'down' ? -st : 0;
        const p = $('#l-preview', sheet);
        if (base == null) return (p.innerHTML = '');
        const tmp = { monthlyLimit: base, limitStep: signed, limitStart: nowKey };
        p.innerHTML = [0, 1, 2, 3]
          .map((i) => {
            const k = L.addMonths(nowKey, i);
            return `<div><span>${esc(L.monthShort(k))}</span><strong>${L.formatEuroShort(L.limitForMonth(tmp, k))} €</strong></div>`;
          })
          .join('');
      };
      const paintMode = () => {
        const seg = $('#l-mode', sheet);
        $('.thumb', seg).style.transform = `translateX(${modes.indexOf(mode) * 100}%)`;
        seg.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
        $('#l-step-field', sheet).hidden = mode === 'same';
        $('#l-step-sign', sheet).textContent = mode === 'down' ? '−' : '+';
        $('#l-step-label', sheet).textContent = mode === 'down' ? 'Jeden Monat verringern um' : 'Jeden Monat erhöhen um';
        preview();
      };
      $('#l-mode', sheet).addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (!b) return;
        mode = b.dataset.mode;
        paintMode();
      });
      input.addEventListener('input', preview);
      stepInput.addEventListener('input', preview);
      paintMode();

      $('#l-save', sheet).addEventListener('click', () => {
        const cents = L.parseAmount(input.value);
        if (cents == null) {
          input.closest('.amount-field').classList.add('invalid');
          $('#l-error', sheet).textContent = 'Bitte einen gültigen Betrag eingeben.';
          return;
        }
        let signed = 0;
        if (mode !== 'same') {
          const st = L.parseAmount(stepInput.value);
          if (st == null) {
            stepInput.closest('.amount-field').classList.add('invalid');
            $('#l-error', sheet).textContent = 'Bitte angeben, um wie viel sich das Limit jeden Monat ändern soll.';
            return;
          }
          signed = mode === 'up' ? st : -st;
        }
        Object.assign(state.data.settings, { monthlyLimit: cents, limitStep: signed, limitStart: nowKey });
        close();
        commit(signed ? `Limit ${money(cents)}, jeden Monat ${money(signed, { signed: true })}` : `Ausgaben-Limit: ${money(cents)} pro Monat`);
      });
      $('#l-remove', sheet)?.addEventListener('click', () => {
        Object.assign(state.data.settings, { monthlyLimit: 0, limitStep: 0, limitStart: '' });
        close();
        commit('Ausgaben-Limit entfernt');
      });
    },
  });
}

function renderTxResults() {
  const list = L.filterTransactions(state.data.transactions, { type: state.txFilter, query: state.txQuery });
  if (!list.length) {
    return emptyState({ title: 'Nichts gefunden', art: 'search', text: 'Keine Buchung passt zu deiner Suche oder deinem Filter.', small: true });
  }
  const groups = L.groupByDate(list);
  const shown = groups.slice(0, 120);
  return shown
    .map(
      (g) => `<section class="day-group">
        <div class="day-head"><span>${esc(L.dayLabel(g.date))}</span><span class="num">${money(g.net, { signed: true })}</span></div>
        <ul class="tx-list tiles">${g.items.map((t) => txRow(t)).join('')}</ul>
      </section>`,
    )
    .join('') + (groups.length > shown.length ? `<p class="settings-note">Ältere Buchungen: bitte die Suche verwenden.</p>` : '');
}

/* ---------- Budgets ---------- */

function budgetStateLabel(status) {
  if (!status) return '';
  if (status.level === 'over') return `<span class="state">${icon('alert', 14)}${money(-status.remaining)} drüber</span>`;
  if (status.level === 'warn') return `<span class="state">${icon('alert', 14)}Fast erreicht</span>`;
  return `<span>Noch ${money(status.remaining)} übrig</span>`;
}

function renderBudgets() {
  const ov = L.budgetOverview(state.data.transactions, state.data.budgets, state.month);
  const set = ov.items.filter((i) => i.limit > 0);
  const unset = ov.items.filter((i) => !i.limit);
  const pctWidth = (s) => `${Math.min(100, (s?.ratio || 0) * 100).toFixed(1)}%`;

  const card = (i) => `<button type="button" class="card budget-card ${i.status ? i.status.level : 'unset'}" data-action="edit-budget" data-cat="${esc(i.id)}">
      <div class="top">
        ${catIcon(i)}
        <div class="main"><div class="title">${esc(i.label)}</div>
          <div class="sub">${i.limit ? `${money(i.spent)} von ${money(i.limit)}` : `${money(i.spent)} ausgegeben · kein Limit`}</div></div>
        ${i.status ? `<div class="pct">${L.formatPercent(i.status.ratio)}</div>` : `<span class="muted">${icon('plus', 20)}</span>`}
      </div>
      ${i.status ? `<div class="bar ${i.status.level === 'ok' ? '' : i.status.level}"><span style="width:${pctWidth(i.status)}"></span></div>
      <div class="foot">${budgetStateLabel(i.status)}<span>${i.status.level === 'over' ? 'Limit überschritten' : ''}</span></div>` : ''}
    </button>`;

  return `<div class="stack">
    ${monthSwitcher()}
    ${set.length
      ? `<section class="card ${ov.status ? `budget-card ${ov.status.level}` : ''}" style="cursor:default">
          <div class="eyebrow">Budget gesamt · ${esc(L.monthLabel(state.month))}</div>
          <div class="big" style="font-size:32px;margin-top:4px">${money(ov.totalSpent)}</div>
          <div class="sub muted">von ${money(ov.totalLimit)} in ${set.length} ${set.length === 1 ? 'Kategorie' : 'Kategorien'}</div>
          <div class="bar ${ov.status.level === 'ok' ? '' : ov.status.level}"><span style="width:${pctWidth(ov.status)}"></span></div>
          <div class="foot" style="display:flex;justify-content:space-between;margin-top:8px;font-size:13px;color:var(--muted)">${budgetStateLabel(ov.status)}<span class="pct">${L.formatPercent(ov.status.ratio)}</span></div>
        </section>`
      : emptyState({ title: 'Lege dein erstes Budget fest', art: 'pie', text: 'Tippe auf eine Kategorie und setze ein monatliches Limit. Ab 90 % warnt dich Flowly.', small: true })}
  </div>
  ${set.length ? `<h3 class="section-title">Mit Limit</h3><div class="grid-list">${set.map(card).join('')}</div>` : ''}
  ${unset.length ? `<h3 class="section-title">Ohne Limit</h3><div class="grid-list">${unset.map(card).join('')}</div>` : ''}`;
}

/* ---------- Sparziele ---------- */

function goalRing(ratio) {
  const r = 19;
  const c = 2 * Math.PI * r;
  return `<svg class="goal-ring" viewBox="0 0 46 46" aria-hidden="true">
    <circle cx="23" cy="23" r="${r}" fill="none" stroke="var(--border)" stroke-width="5"/>
    <circle cx="23" cy="23" r="${r}" fill="none" stroke="var(--positive)" stroke-width="5" stroke-linecap="round"
      stroke-dasharray="${(c * ratio).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 23 23)"/>
  </svg>`;
}

function renderGoals() {
  const goals = state.data.goals;
  const addBtn = `<button type="button" class="btn primary block" data-action="new-goal">${icon('plus', 20)}Neues Sparziel</button>`;
  if (!goals.length) {
    return `<div class="stack">${emptyState({
      title: 'Wofür sparst du?',
      art: 'target',
      text: 'Ob Urlaub, Notgroschen oder neues Handy – lege ein Ziel an und verfolge deinen Fortschritt.',
      actions: addBtn,
    })}</div>`;
  }
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  return `<div class="stack">
    <section class="card">
      <div class="eyebrow">Insgesamt gespart</div>
      <div class="big" style="font-size:32px;margin-top:4px">${money(totalSaved)}</div>
      <div class="muted" style="font-size:13px">von ${money(totalTarget)} · ${goals.length} ${goals.length === 1 ? 'Ziel' : 'Ziele'}</div>
      <div class="bar pos"><span style="width:${(Math.min(1, totalTarget ? totalSaved / totalTarget : 0) * 100).toFixed(1)}%"></span></div>
    </section>
    ${goals
      .map((g) => {
        const p = L.goalProgress(g);
        const done = g.saved >= g.target;
        return `<section class="card goal">
          <div class="top">
            ${goalRing(p)}
            <div class="main"><h3>${esc(g.name)}</h3>
              <div class="sub">${done ? `<span class="done-badge">${icon('check', 14)}Ziel erreicht</span>` : `Noch ${money(g.target - g.saved)}`}</div></div>
          </div>
          <div class="figures"><span class="mid" style="font-size:20px">${money(g.saved)} <span class="muted" style="font-size:14px;font-family:var(--font)">von ${money(g.target)}</span></span><span class="pct">${L.formatPercent(p)}</span></div>
          <div class="bar pos"><span style="width:${(p * 100).toFixed(1)}%"></span></div>
          <div class="actions">
            <button type="button" class="btn small" data-action="goal-add" data-id="${esc(g.id)}">${icon('plus', 18)}Geld hinzufügen</button>
            <button type="button" class="icon-btn" data-action="goal-edit" data-id="${esc(g.id)}" aria-label="Sparziel ${esc(g.name)} bearbeiten">${icon('pencil', 20)}</button>
            <button type="button" class="icon-btn" data-action="goal-delete" data-id="${esc(g.id)}" aria-label="Sparziel ${esc(g.name)} löschen">${icon('trash', 20)}</button>
          </div>
        </section>`;
      })
      .join('')}
    ${addBtn}
  </div>`;
}

/* ---------- Rendern ---------- */

const VIEWS = {
  start: [renderStart, mountStart],
  numbers: [renderNumbers, null],
  budgets: [renderBudgets, null],
  goals: [renderGoals, null],
  settings: [renderSettings, mountSettings],
};

function render() {
  renderTopbar();
  renderTabbar();
  for (const t of TABS) {
    const el = document.getElementById(`view-${t.id}`);
    const active = t.id === state.tab;
    if (active) {
      const [renderFn, mountFn] = VIEWS[t.id];
      const wasActive = el.classList.contains('active');
      el.innerHTML = renderFn();
      if (!wasActive) {
        const dir = TABS.findIndex((x) => x.id === t.id) >= lastTabIndex ? 'from-right' : 'from-left';
        el.classList.remove('from-right', 'from-left');
        el.classList.add('active', dir);
      }
      mountFn?.(el);
      // Fortschrittsbalken weich einlaufen lassen
      el.querySelectorAll('.bar > span').forEach((s) => {
        const w = s.style.width;
        if (wasActive) return;
        s.style.width = '0';
        requestAnimationFrame(() => requestAnimationFrame(() => (s.style.width = w)));
      });
    } else if (el.classList.contains('active')) {
      el.classList.remove('active');
      el.innerHTML = '';
    }
  }
}

/* ---------- Toast ---------- */

let toastTimer;
function toast(message, isError = false) {
  const el = $('#toast');
  el.className = `toast${isError ? ' error' : ''}`;
  el.innerHTML = `${icon(isError ? 'alert' : 'check', 18)}<span>${esc(message)}</span>`;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- Overlays: Scroll-Sperre, Sheets, Dialoge ---------- */

let lockCount = 0;
let lockedY = 0;
function lockScroll() {
  if (lockCount++ === 0) {
    lockedY = window.scrollY;
    document.body.style.top = `-${lockedY}px`;
    document.body.classList.add('locked');
  }
}
function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.classList.remove('locked');
    document.body.style.top = '';
    window.scrollTo(0, lockedY);
  }
}

// Tastatur auf dem iPhone: Sheet über der Tastatur halten
function updateViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  document.documentElement.style.setProperty('--kb', `${Math.round(kb)}px`);
  document.documentElement.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
}
window.visualViewport?.addEventListener('resize', updateViewport);
window.visualViewport?.addEventListener('scroll', updateViewport);

function openSheet({ title, body, onMount }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="backdrop" data-close></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grab"><span></span></div>
      <header class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn plain" data-close aria-label="Schließen">${icon('x')}</button></header>
      <div class="sheet-body">${body}</div>
    </section>`;
  $('#overlay-root').appendChild(wrap);
  lockScroll();
  const sheet = $('.sheet', wrap);
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    document.activeElement?.blur?.();
    wrap.classList.remove('open');
    sheet.style.transform = '';
    const done = () => {
      wrap.remove();
      unlockScroll();
    };
    sheet.addEventListener('transitionend', done, { once: true });
    setTimeout(() => wrap.isConnected && done(), 600);
  };

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });

  // Zum Schließen nach unten ziehen
  let startY = null;
  let dy = 0;
  const handles = [$('.sheet-grab', wrap), $('.sheet-head', wrap)];
  handles.forEach((h) => {
    h.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      startY = e.clientY;
      dy = 0;
      wrap.classList.add('dragging');
      h.setPointerCapture?.(e.pointerId);
    });
    h.addEventListener('pointermove', (e) => {
      if (startY == null) return;
      dy = Math.max(0, e.clientY - startY);
      sheet.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (startY == null) return;
      startY = null;
      wrap.classList.remove('dragging');
      if (dy > 110) close();
      else sheet.style.transform = '';
    };
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
  });

  updateViewport();
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  onMount?.(sheet, close);
  return close;
}

function confirmDialog({ title, message, confirmLabel = 'Bestätigen', cancelLabel = 'Abbrechen', danger = false, iconName }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    wrap.innerHTML = `<div class="backdrop" data-res="0"></div>
      <div class="dialog ${danger ? 'danger' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
        <div class="d-icon">${icon(iconName || (danger ? 'trash' : 'alert'), 26)}</div>
        <h2 id="dlg-title">${esc(title)}</h2>
        <p>${esc(message)}</p>
        <div class="d-actions">
          <button type="button" class="btn" data-res="0">${esc(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? 'danger solid' : 'primary'}" data-res="1">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    lockScroll();
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-res]');
      if (!b) return;
      wrap.classList.remove('open');
      setTimeout(() => {
        wrap.remove();
        unlockScroll();
      }, 260);
      resolve(b.dataset.res === '1');
    });
  });
}

/* ---------- Buchung / Dauerauftrag anlegen & bearbeiten ---------- */

function amountInputHandler(input) {
  input.addEventListener('input', () => {
    const cleaned = input.value.replace(/[^\d.,-]/g, '');
    if (cleaned !== input.value) input.value = cleaned;
    input.closest('.amount-field')?.classList.remove('invalid');
  });
}

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return L.toISODate(new Date(y, m - 1, d + n));
}

const SOURCE_LABEL = { applepay: 'Apple Pay', bank: 'Kontoauszug', recurring: 'Dauerauftrag' };

/** Kategorie gezielt geändert: für den Händler merken und automatisch zugeordnete Buchungen mitziehen. */
function learnCategory(type, mkey, category, exceptId) {
  if (!mkey) return 0;
  state.data.learned[learnedKey(type, mkey)] = category;
  let changed = 0;
  for (const t of state.data.transactions) {
    if (t.id !== exceptId && t.auto && t.type === type && t.mkey === mkey && t.category !== category) {
      t.category = category;
      changed++;
    }
  }
  return changed;
}

/** Fällige Daueraufträge buchen. Gibt die Anzahl neuer Buchungen zurück. */
function runRecurring() {
  return applyRecurring(state.data, L.todayISO(), L.uid).length;
}

function segLabel(type, planned) {
  if (planned) return type === 'income' ? '+ Geld hinzufügen' : '− Geld abziehen';
  return type === 'income' ? 'Einnahme' : 'Ausgabe';
}

function noteLabel(type, planned) {
  if (!planned) return 'Notiz / Händler';
  return type === 'income' ? 'Von was? (woher kommt das Geld)' : 'Wofür? (wofür wird abgezogen)';
}

function notePlaceholder(type, planned) {
  if (!planned) return 'z. B. REWE, Wocheneinkauf';
  return type === 'income' ? 'z. B. Gehalt, Kindergeld, Taschengeld' : 'z. B. Miete, Netflix, Handyvertrag';
}

function dateLabel(mode, repeat) {
  if (repeat === 'none') return 'Datum';
  if (repeat === 'once') return 'An welchem Tag?';
  if (mode === 'rule-edit') return 'Nächste Buchung am';
  return 'Ab wann? (erste Buchung)';
}

function dateHint(date) {
  if (!L.isValidISODate(date) || date <= L.todayISO()) return 'Tipp: Wähle ein Datum in der Zukunft, dann wird der Betrag erst an diesem Tag gebucht.';
  return `Geplant: Der Betrag wird am ${L.shortDate(date)} automatisch gebucht.`;
}

function repeatHint(repeat, date) {
  if (repeat === 'once' && L.isValidISODate(date)) return `Wird am ${L.shortDate(date)} automatisch gebucht.`;
  if (repeat === 'none' || !L.isValidISODate(date)) return '';
  const r = { interval: repeat, day: Number(date.slice(8, 10)), nextDate: date };
  const due = date <= L.todayISO() ? 'Fällige Termine bis heute werden sofort gebucht.' : `Erste Buchung am ${L.shortDate(date)}.`;
  return `${describeRule(r)} automatisch. ${due}`;
}

function openEntrySheet({ tx = null, rule = null, newRule = false, once = false } = {}) {
  const mode = tx ? 'tx-edit' : rule ? 'rule-edit' : newRule ? 'rule-new' : 'tx-new';
  const isRule = mode.startsWith('rule');
  const today = L.todayISO();
  const draft =
    mode === 'tx-edit'
      ? { type: tx.type, category: tx.category, amount: tx.amount, note: tx.note, date: tx.date, repeat: 'none' }
      : mode === 'rule-edit'
        ? { type: rule.type, category: rule.category, amount: rule.amount, note: rule.note, date: rule.nextDate, repeat: rule.interval }
        : { type: 'expense', category: newRule && !once ? 'wohnen' : 'lebensmittel', amount: null, note: '', date: once ? addDays(today, 7) : today, repeat: once ? 'once' : newRule ? 'monthly' : 'none' };
  let catTouched = false;

  const catGrid = () =>
    L.categoriesFor(draft.type)
      .map(
        (c) => `<button type="button" class="cat-btn" role="radio" aria-checked="${c.id === draft.category}" data-cat="${c.id}" style="--c:${c.color}">
          ${catIcon(c, 20)}<span class="lbl">${esc(c.label)}</span></button>`,
      )
      .join('');
  const repeatOptions = [...(isRule ? [] : [{ id: 'none', label: 'Nie (einmalig)' }]), ...INTERVALS.filter((o) => isRule || o.id !== 'once')]
    .map((o) => `<option value="${o.id}" ${o.id === draft.repeat ? 'selected' : ''}>${esc(o.label)}</option>`)
    .join('');
  const ruleOfTx = tx?.rid ? state.data.recurring.find((r) => r.id === tx.rid) : null;
  const srcInfo =
    mode === 'tx-edit' && tx.src && SOURCE_LABEL[tx.src]
      ? `<div class="src-note">${icon(tx.src === 'recurring' ? 'repeat' : 'download', 16)}<span>Automatisch erfasst: ${esc(SOURCE_LABEL[tx.src])}${ruleOfTx ? ` „${esc(ruleOfTx.note || L.getCategory(ruleOfTx.type, ruleOfTx.category).label)}“` : ''}</span></div>`
      : '';

  const body = `
    ${srcInfo}
    <div class="seg type-${draft.type}" role="group" aria-label="Art der Buchung" style="margin-top:0">
      <span class="thumb" style="width:calc((100% - 8px) / 2);transform:translateX(${draft.type === 'income' ? 100 : 0}%)"></span>
      <button type="button" data-type="expense" aria-pressed="${draft.type === 'expense'}">${segLabel('expense', isRule || draft.repeat !== 'none')}</button>
      <button type="button" data-type="income" aria-pressed="${draft.type === 'income'}">${segLabel('income', isRule || draft.repeat !== 'none')}</button>
    </div>
    <div class="field">
      <label for="f-amount">Betrag</label>
      <div class="amount-field ${draft.type}">
        <span class="sign">${draft.type === 'income' ? '+' : '−'}</span>
        <input id="f-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" maxlength="16" value="${draft.amount ? esc(L.formatAmountInput(draft.amount)) : ''}">
        <span class="cur">€</span>
      </div>
      <div class="form-error" id="f-error"></div>
    </div>
    <div class="field">
      <label for="f-note" id="f-note-label">${esc(noteLabel(draft.type, isRule || draft.repeat !== 'none'))}</label>
      <input id="f-note" class="input" type="text" maxlength="100" placeholder="${esc(notePlaceholder(draft.type, isRule || draft.repeat !== 'none'))}" autocomplete="off" enterkeyhint="done" value="${esc(draft.note)}">
    </div>
    <div class="field">
      <span class="label">Kategorie <span class="cat-hint" id="f-cat-hint"></span></span>
      <div class="cat-grid" role="radiogroup" aria-label="Kategorie" id="f-cats">${catGrid()}</div>
    </div>
    ${mode === 'tx-edit' ? '' : `<div class="field">
      <label for="f-repeat">Wie oft?</label>
      <select id="f-repeat" class="input">${repeatOptions}</select>
    </div>`}
    <div class="field">
      <label for="f-date" id="f-date-label">${esc(dateLabel(mode, draft.repeat))}</label>
      <input id="f-date" class="input" type="date" value="${esc(draft.date)}" required>
      ${mode === 'tx-new' ? `<div class="field-hint" id="f-date-hint">${esc(draft.repeat === 'none' ? dateHint(draft.date) : '')}</div>` : ''}
      ${mode === 'tx-edit' ? '' : `<div class="field-hint" id="f-repeat-hint">${esc(repeatHint(draft.repeat, draft.date))}</div>`}
    </div>
    <button type="button" class="btn primary block" id="f-save">${icon('check', 20)}${mode === 'tx-edit' || mode === 'rule-edit' ? 'Änderungen speichern' : isRule ? 'Dauerauftrag speichern' : 'Buchung speichern'}</button>
    ${mode === 'tx-edit' && ruleOfTx ? `<button type="button" class="btn block" id="f-rule">${icon('repeat', 20)}Dauerauftrag bearbeiten</button>` : ''}
    ${mode === 'tx-edit' ? `<button type="button" class="btn danger block" id="f-delete">${icon('trash', 20)}Buchung löschen</button>` : ''}
    ${mode === 'rule-edit' ? `<button type="button" class="btn danger block" id="f-delete">${icon('trash', 20)}${rule.interval === 'once' ? 'Geplante Buchung löschen' : 'Dauerauftrag löschen'}</button>` : ''}`;

  const titles = {
    'tx-new': 'Neue Buchung',
    'tx-edit': 'Buchung bearbeiten',
    'rule-new': 'Neuer Dauerauftrag',
    'rule-edit': rule?.interval === 'once' ? 'Geplante Buchung' : 'Dauerauftrag bearbeiten',
  };

  openSheet({
    title: titles[mode],
    body,
    onMount(sheet, close) {
      const amount = $('#f-amount', sheet);
      const field = $('.amount-field', sheet);
      const seg = $('.seg', sheet);
      const error = $('#f-error', sheet);
      const noteInput = $('#f-note', sheet);
      const repeatSel = $('#f-repeat', sheet);
      const dateInput = $('#f-date', sheet);
      const catHint = $('#f-cat-hint', sheet);
      amountInputHandler(amount);

      const paintCats = () => ($('#f-cats', sheet).innerHTML = catGrid());
      const suggest = () => {
        if (catTouched || mode === 'tx-edit') return;
        const note = noteInput.value.trim();
        if (!note) return (catHint.textContent = '');
        const s = suggestCategory(draft.type, note, merchantKey(note), state.data.learned);
        if (s.source === 'default') return (catHint.textContent = '');
        if (s.category !== draft.category) {
          draft.category = s.category;
          paintCats();
        }
        catHint.textContent = s.source === 'learned' ? '· gemerkt' : '· vorgeschlagen';
      };

      seg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-type]');
        if (!b || b.dataset.type === draft.type) return;
        draft.type = b.dataset.type;
        draft.category = draft.type === 'income' ? 'gehalt' : 'lebensmittel';
        catTouched = false;
        seg.className = `seg type-${draft.type}`;
        $('.thumb', seg).style.transform = `translateX(${draft.type === 'income' ? 100 : 0}%)`;
        seg.querySelectorAll('[data-type]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.type === draft.type)));
        field.className = `amount-field ${draft.type}`;
        $('.sign', field).textContent = draft.type === 'income' ? '+' : '−';
        paintCats();
        suggest();
        updateHint();
      });

      $('#f-cats', sheet).addEventListener('click', (e) => {
        const b = e.target.closest('[data-cat]');
        if (!b) return;
        draft.category = b.dataset.cat;
        catTouched = true;
        catHint.textContent = '';
        sheet.querySelectorAll('.cat-btn').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      });

      let t;
      noteInput.addEventListener('input', () => {
        noteInput.classList.remove('invalid');
        clearTimeout(t);
        t = setTimeout(suggest, 250);
      });
      noteInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') e.target.blur();
      });
      const updateHint = () => {
        const rep = repeatSel ? repeatSel.value : 'none';
        const planned = isRule || rep !== 'none';
        const h = $('#f-repeat-hint', sheet);
        if (h) h.textContent = repeatHint(rep, dateInput.value);
        const dh = $('#f-date-hint', sheet);
        if (dh) dh.textContent = rep === 'none' ? dateHint(dateInput.value) : '';
        $('#f-date-label', sheet).textContent = dateLabel(mode, rep);
        $('#f-note-label', sheet).textContent = noteLabel(draft.type, planned);
        noteInput.placeholder = notePlaceholder(draft.type, planned);
        seg.querySelectorAll('[data-type]').forEach((x) => (x.textContent = segLabel(x.dataset.type, planned)));
        if (mode === 'tx-new') $('#f-save', sheet).innerHTML = `${icon('check', 20)}${rep === 'none' ? 'Buchung speichern' : rep === 'once' ? 'Planen' : 'Dauerauftrag speichern'}`;
      };
      repeatSel?.addEventListener('change', updateHint);
      dateInput.addEventListener('change', updateHint);

      $('#f-save', sheet).addEventListener('click', async () => {
        const cents = L.parseAmount(amount.value);
        if (cents == null) {
          field.classList.remove('invalid');
          void field.offsetWidth;
          field.classList.add('invalid');
          error.textContent = amount.value.trim() ? 'Bitte einen gültigen Betrag eingeben, z. B. 12,50' : 'Bitte gib einen Betrag ein.';
          return;
        }
        const date = dateInput.value;
        if (!L.isValidISODate(date)) {
          error.textContent = 'Bitte ein gültiges Datum wählen.';
          dateInput.classList.add('invalid');
          return;
        }
        const note = noteInput.value.trim().slice(0, 100);
        if (!note && (isRule || (repeatSel && repeatSel.value !== 'none'))) {
          noteInput.classList.add('invalid');
          noteInput.focus();
          error.textContent = draft.type === 'income' ? 'Bitte angeben, von was das Geld kommt (z. B. Gehalt).' : 'Bitte angeben, wofür abgezogen wird (z. B. Miete).';
          return;
        }
        const category = L.getCategory(draft.type, draft.category).id;
        const mk = merchantKey(note);
        const repeat = repeatSel ? repeatSel.value : 'none';
        const list = state.data.transactions;

        if (mode === 'tx-edit') {
          const i = list.findIndex((x) => x.id === tx.id);
          const updated = { ...tx, type: draft.type, amount: cents, category, note, date };
          let msg = 'Buchung aktualisiert';
          if (catTouched && category !== tx.category) {
            updated.auto = false;
            const key = tx.mkey || mk;
            if (key) {
              updated.mkey = key;
              const n = learnCategory(draft.type, key, category, tx.id);
              const name = tx.merchant || note || 'diesen Händler';
              msg = `Gemerkt: ${name} → ${L.getCategory(draft.type, category).label}${n ? ` (${n} weitere angepasst)` : ''}`;
            }
          }
          if (i >= 0) list[i] = updated;
          close();
          return commit(msg);
        }

        // Einmalige Buchung in der Zukunft -> als geplante Buchung speichern
        const scheduleOnce = mode === 'tx-new' && repeat === 'none' && date > L.todayISO();
        if (mode === 'tx-new' && repeat === 'none' && !scheduleOnce) {
          const newTx = { id: L.uid(), type: draft.type, amount: cents, category, note, date, createdAt: Date.now(), src: 'manual' };
          if (mk) newTx.mkey = mk;
          if (catTouched && mk) learnCategory(draft.type, mk, category, newTx.id);
          list.push(newTx);
          close();
          return commit('Buchung gespeichert');
        }

        // Dauerauftrag anlegen oder ändern
        const target = mode === 'rule-edit' ? state.data.recurring.find((r) => r.id === rule.id) : { id: L.uid(), createdAt: Date.now() };
        if (!target) return close();
        // Auch schon gebuchte Einträge ändern?
        let pastUpdated = 0;
        if (mode === 'rule-edit') {
          const newNote = note || L.getCategory(draft.type, category).label;
          const changed = target.amount !== cents || target.category !== category || target.note !== newNote || target.type !== draft.type;
          const past = state.data.transactions.filter((t) => t.rid === target.id).length;
          if (changed && past) {
            const all = await confirmDialog({
              title: 'Auch vergangene Einträge ändern?',
              message: `Von „${target.note}“ gibt es schon ${past} ${past === 1 ? 'gebuchten Eintrag' : 'gebuchte Einträge'}. Sollen die auch geändert werden?`,
              confirmLabel: 'Alle ändern',
              cancelLabel: 'Nur künftige',
              iconName: 'repeat',
            });
            if (all) pastUpdated = updateRuleBookings(state.data, target.id, { type: draft.type, amount: cents, category, note: newNote });
          }
        }
        Object.assign(target, {
          type: draft.type,
          amount: cents,
          category,
          note: note || L.getCategory(draft.type, category).label,
          mkey: mk,
          interval: scheduleOnce ? 'once' : repeat,
          day: Number(date.slice(8, 10)),
          nextDate: date,
          active: true,
        });
        if (mode !== 'rule-edit') state.data.recurring.push(target);
        if (catTouched && mk) learnCategory(draft.type, mk, category, null);
        const n = runRecurring();
        close();
        if (target.interval === 'once') {
          return commit(n ? 'Geplante Buchung gebucht' : `Geplant: wird am ${L.shortDate(date)} gebucht`);
        }
        commit(
          mode === 'rule-edit'
            ? `Dauerauftrag gespeichert${pastUpdated ? ` · ${pastUpdated} vergangene angepasst` : ''}${n ? ` · ${n} gebucht` : ''}`
            : n
              ? `Dauerauftrag angelegt · ${n} ${n === 1 ? 'Buchung' : 'Buchungen'} erstellt`
              : `Dauerauftrag angelegt – erste Buchung am ${L.shortDate(target.nextDate)}`,
        );
      });

      $('#f-rule', sheet)?.addEventListener('click', () => {
        close();
        setTimeout(() => openEntrySheet({ rule: ruleOfTx }), 150);
      });

      $('#f-delete', sheet)?.addEventListener('click', async () => {
        if (mode === 'rule-edit') {
          const ok = await confirmDialog({
            title: 'Dauerauftrag löschen?',
            message: rule.interval === 'once' ? `„${rule.note}“ am ${L.shortDate(rule.nextDate)} wird nicht gebucht.` : `„${rule.note}“ wird künftig nicht mehr automatisch gebucht. Bereits erstellte Buchungen bleiben erhalten.`,
            confirmLabel: 'Löschen',
            danger: true,
          });
          if (!ok) return;
          state.data.recurring = state.data.recurring.filter((r) => r.id !== rule.id);
          close();
          return commit(rule.interval === 'once' ? 'Geplante Buchung gelöscht' : 'Dauerauftrag gelöscht');
        }
        const ok = await confirmDialog({
          title: 'Buchung löschen?',
          message: `${tx.note || L.getCategory(tx.type, tx.category).label} über ${money(tx.amount)} wird endgültig entfernt.`,
          confirmLabel: 'Löschen',
          danger: true,
        });
        if (!ok) return;
        state.data.transactions = state.data.transactions.filter((x) => x.id !== tx.id);
        close();
        commit('Buchung gelöscht');
      });
    },
  });
}

/* ---------- Daueraufträge & Abos ---------- */

function monthlyEquivalent(r) {
  const f = { once: 0, weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[r.interval] ?? 1;
  return Math.round(r.amount * f);
}

function openRecurringList() {
  const rules = [...state.data.recurring].sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
  const fixOut = rules.filter((r) => r.type === 'expense').reduce((s, r) => s + monthlyEquivalent(r), 0);
  const fixIn = rules.filter((r) => r.type === 'income').reduce((s, r) => s + monthlyEquivalent(r), 0);
  const rows = rules
    .map((r) => {
      const cat = L.getCategory(r.type, r.category);
      return `<button type="button" class="settings-row" data-rule="${esc(r.id)}">${catIcon(cat, 18)}
        <span class="main">${esc(r.note || cat.label)}<span class="sub">${esc(describeRule(r))}${r.interval === 'once' ? '' : ` · nächste ${esc(L.shortDate(r.nextDate))}`}</span></span>
        <span class="amount ${r.type === 'income' ? 'in' : 'out'}">${money(r.type === 'income' ? r.amount : -r.amount, { signed: true })}</span></button>`;
    })
    .join('');
  openSheet({
    title: 'Geplant & Daueraufträge',
    body: `
      <p class="muted" style="margin:0">Flowly bucht diese Einträge automatisch an ihrem Datum – du musst nichts tun.</p>
      ${rules.length ? `<div class="fix-sum"><div><span class="eyebrow">Fixkosten / Monat</span><strong>${money(fixOut)}</strong></div><div><span class="eyebrow">Feste Einnahmen / Monat</span><strong>${money(fixIn)}</strong></div></div>
        <div class="settings-group">${rows}</div>` : emptyState({ title: 'Noch keine Daueraufträge', art: 'repeat', text: 'Lege Miete, Gehalt oder Abos einmal an. Nach einem Kontoauszug-Import schlägt Flowly wiederkehrende Zahlungen auch selbst vor.', small: true })}
      <button type="button" class="btn primary block" id="r-new">${icon('plus', 20)}Neuer Dauerauftrag</button>
      <button type="button" class="btn block" id="r-once">${icon('calendar', 20)}Einmalig an einem Datum planen</button>`,
    onMount(sheet, close) {
      sheet.addEventListener('click', (e) => {
        const row = e.target.closest('[data-rule]');
        if (row) {
          const r = state.data.recurring.find((x) => x.id === row.dataset.rule);
          close();
          if (r) setTimeout(() => openEntrySheet({ rule: r }), 120);
        }
      });
      $('#r-new', sheet).addEventListener('click', () => {
        close();
        setTimeout(() => openEntrySheet({ newRule: true }), 120);
      });
      $('#r-once', sheet).addEventListener('click', () => {
        close();
        setTimeout(() => openEntrySheet({ newRule: true, once: true }), 120);
      });
    },
  });
}

function openRecurringSuggestions(suggestions) {
  const row = (s, i) => {
    const cat = L.getCategory(s.type, s.category);
    return `<div class="sugg" data-i="${i}">
      <div class="sugg-top">${catIcon(cat, 18)}<div class="main"><div class="title">${esc(s.note)}</div>
        <div class="sub">${esc(describeRule({ interval: s.interval, day: s.day, nextDate: s.nextDate }))} · ${s.count}× gefunden</div></div>
        <span class="amount ${s.type === 'income' ? 'in' : 'out'}">${money(s.type === 'income' ? s.amount : -s.amount, { signed: true })}</span></div>
      <div class="sugg-actions"><button type="button" class="btn small" data-sugg="ignore">Ignorieren</button><button type="button" class="btn small primary" data-sugg="save">${icon('repeat', 16)}Als Dauerauftrag</button></div>
    </div>`;
  };
  openSheet({
    title: 'Wiederkehrende Zahlungen erkannt',
    body: `<p class="muted" style="margin:0">Diese Zahlungen kommen regelmäßig. Als Dauerauftrag gespeichert, bucht Flowly sie künftig automatisch – und erkennt sie beim nächsten Import als bereits erfasst.</p>
      <div class="stack" id="sugg-list">${suggestions.map(row).join('')}</div>`,
    onMount(sheet, close) {
      let open = suggestions.length;
      $('#sugg-list', sheet).addEventListener('click', (e) => {
        const b = e.target.closest('[data-sugg]');
        if (!b) return;
        const box = b.closest('.sugg');
        const s = suggestions[Number(box.dataset.i)];
        if (b.dataset.sugg === 'save') {
          state.data.recurring.push({
            id: L.uid(), type: s.type, amount: s.amount, category: s.category, note: s.note, mkey: s.mkey,
            interval: s.interval, day: s.day || Number(s.nextDate.slice(8, 10)), nextDate: s.nextDate, active: true, createdAt: Date.now(),
          });
          runRecurring();
          box.innerHTML = `<div class="sugg-done">${icon('check', 18)}${esc(s.note)} als Dauerauftrag gespeichert</div>`;
        } else {
          state.data.dismissedSuggestions.push(s.key);
          box.remove();
        }
        saveState(state.data);
        render();
        if (--open === 0) setTimeout(close, 700);
      });
    },
  });
}

/* ---------- Import ---------- */

function daysSince(ms) {
  return Math.floor((Date.now() - ms) / 86400000);
}

function importStatus() {
  const last = state.data.importInfo.lastImportAt;
  if (!last) return { text: 'Noch kein Import – richte einmalig die Automatik ein.', stale: false, never: true };
  const d = daysSince(last);
  const when = d <= 0 ? 'heute' : d === 1 ? 'gestern' : `vor ${d} Tagen`;
  return d > 7 ? { text: `Letzter Import ${when} – Zeit für ein Update`, stale: true } : { text: `Letzter Import ${when}`, stale: false };
}

function importCard() {
  const st = importStatus();
  return `<section class="card import-card${st.stale ? ' stale' : ''}">
    <div class="import-top">
      <span class="badge in">${icon('download', 18)}</span>
      <div class="main"><div class="title">Zahlungen importieren</div>
        <div class="sub${st.stale ? ' warn' : ''}">${st.stale ? icon('alert', 13, 'inline') + ' ' : ''}${esc(st.text)}</div></div>
      <button type="button" class="icon-btn plain card-close" data-action="hide-import" aria-label="Import-Hinweis ausblenden">${icon('x', 20)}</button>
    </div>
    <button type="button" class="btn primary block" data-action="import">${icon('download', 20)}Neue Zahlungen importieren</button>
    <div class="import-links"><button type="button" class="link muted-link" data-action="hide-import">Ich trage meine Zahlen selbst ein</button><button type="button" class="link" data-action="open-automation">${st.never ? 'Automatik einrichten' : 'Anleitung'}</button></div>
  </section>`;
}

function pickImportFile() {
  const input = $('#import-file');
  input.value = '';
  input.click();
}

async function handleImportFile(file) {
  if (file.size > 15 * 1024 * 1024) return toast('Die Datei ist zu groß.', true);
  let result;
  try {
    const text = decodeBytes(await file.arrayBuffer());
    result = buildCandidates(parseImportText(text), state.data);
  } catch (err) {
    return toast(err?.message || 'Datei konnte nicht gelesen werden.', true);
  }
  openImportPreview(result);
}

function openCategoryPicker(type, current, onPick) {
  openSheet({
    title: 'Kategorie wählen',
    body: `<div class="cat-grid">${L.categoriesFor(type)
      .map((c) => `<button type="button" class="cat-btn" aria-checked="${c.id === current}" data-cat="${c.id}" style="--c:${c.color}">${catIcon(c, 20)}<span class="lbl">${esc(c.label)}</span></button>`)
      .join('')}</div>
      <p class="settings-note">Flowly merkt sich die Wahl für diesen Händler.</p>`,
    onMount(sheet, close) {
      sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cat]');
        if (!b) return;
        onPick(b.dataset.cat);
        close();
      });
    },
  });
}

function openImportPreview(result) {
  const list = result.candidates;
  const dupCount = list.filter((c) => c.duplicateOf).length;
  const markChecked = () => {
    state.data.importInfo.lastImportAt = Date.now();
    rememberSeen(state.data, list.map((c) => c.key));
  };

  if (!list.length) {
    markChecked();
    saveState(state.data);
    render();
    return toast(result.known ? `Keine neuen Zahlungen (${result.known} schon importiert)` : 'Keine Zahlungen in der Datei gefunden');
  }

  const rowHtml = (c, i) => {
    const cat = L.getCategory(c.type, c.category);
    const isIn = c.type === 'income';
    const catNote = c.catSource === 'learned' ? ' · gemerkt' : c.catSource === 'manual' ? ' · geändert' : c.catSource === 'default' ? ' · bitte prüfen' : '';
    return `<div class="imp-row${c.selected ? '' : ' off'}" data-i="${i}">
      <button type="button" class="imp-check" data-imp="toggle" aria-pressed="${c.selected}" aria-label="Übernehmen">${icon('check', 16)}</button>
      <button type="button" class="imp-cat" data-imp="cat" aria-label="Kategorie ändern">${catIcon(cat, 18)}</button>
      <div class="main"><div class="title">${esc(c.name)}</div>
        <div class="sub">${esc(L.shortDate(c.date))}${c.time ? ` ${esc(c.time.slice(0, 5))}` : ''} · ${esc(cat.label)}${catNote}</div>
        ${c.duplicateOf ? `<div class="dup">${icon('alert', 12, 'inline')} Schon erfasst? ${esc(c.duplicateOf.label || 'Buchung')} · ${esc(L.shortDate(c.duplicateOf.date))} · ${money(c.duplicateOf.amount)}</div>` : ''}
      </div>
      <span class="amount ${isIn ? 'in' : 'out'}">${money(isIn ? c.amount : -c.amount, { signed: true })}</span>
    </div>`;
  };
  const shown = list.slice(0, 500);

  openSheet({
    title: result.format === 'applepay' ? 'Apple-Pay-Zahlungen' : 'Kontoauszug importieren',
    body: `
      <div class="import-summary">
        <div><span class="eyebrow">Erkannt</span><strong>${esc(result.label)}</strong></div>
        <div class="chips-row">
          <span class="pill">${list.length} neu</span>
          ${result.known ? `<span class="pill neutral">${result.known} schon importiert</span>` : ''}
          ${dupCount ? `<span class="pill neg">${dupCount === 1 ? '1 mögliches Duplikat' : `${dupCount} mögliche Duplikate`}</span>` : ''}
          ${result.pending ? `<span class="pill neutral">${result.pending} vorgemerkt übersprungen</span>` : ''}
        </div>
        <p class="muted" style="margin:8px 0 0;font-size:13px">Tippe auf ein Symbol, um die Kategorie zu ändern. Mögliche Duplikate sind abgewählt.</p>
      </div>
      <div class="imp-tools"><button type="button" class="link" data-imp="all">Alle auswählen</button><button type="button" class="link" data-imp="none">Keine</button></div>
      <div class="imp-list" id="imp-list">${shown.map(rowHtml).join('')}</div>
      ${list.length > shown.length ? `<p class="settings-note">${list.length - shown.length} weitere Einträge werden ebenfalls übernommen.</p>` : ''}
      <div class="sheet-cta"><button type="button" class="btn primary block" id="imp-go"></button></div>`,
    onMount(sheet, close) {
      const listEl = $('#imp-list', sheet);
      const go = $('#imp-go', sheet);
      const paintButton = () => {
        const n = list.filter((c) => c.selected).length;
        go.innerHTML = `${icon('check', 20)}${n} ${n === 1 ? 'Buchung' : 'Buchungen'} übernehmen`;
        go.disabled = false;
      };
      const repaint = (i) => {
        const el = listEl.querySelector(`[data-i="${i}"]`);
        if (el) el.outerHTML = rowHtml(list[i], i);
      };
      paintButton();

      sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-imp]');
        if (!b) return;
        const act = b.dataset.imp;
        if (act === 'all' || act === 'none') {
          list.forEach((c) => (c.selected = act === 'all'));
          listEl.innerHTML = shown.map(rowHtml).join('');
          return paintButton();
        }
        const i = Number(b.closest('[data-i]').dataset.i);
        const c = list[i];
        if (act === 'toggle') {
          c.selected = !c.selected;
          repaint(i);
          return paintButton();
        }
        if (act === 'cat') {
          openCategoryPicker(c.type, c.category, (cat) => {
            c.category = cat;
            c.catSource = 'manual';
            // Gleiche Händler in dieser Liste mitziehen
            list.forEach((o, j) => {
              if (o !== c && o.mkey && o.mkey === c.mkey && o.type === c.type && o.catSource !== 'manual') {
                o.category = cat;
                o.catSource = 'learned';
                repaint(j);
              }
            });
            repaint(i);
          });
        }
      });

      go.addEventListener('click', () => {
        const chosen = list.filter((c) => c.selected);
        for (const c of list) if (c.catSource === 'manual' && c.mkey) learnCategory(c.type, c.mkey, c.category, null);
        for (const c of chosen) state.data.transactions.push(candidateToTransaction(c, L.uid));
        markChecked();
        const suggestions = detectRecurring(state.data, L.todayISO());
        close();
        commit(chosen.length ? `${chosen.length} ${chosen.length === 1 ? 'Buchung' : 'Buchungen'} importiert` : 'Import abgeschlossen');
        if (suggestions.length) setTimeout(() => openRecurringSuggestions(suggestions), 500);
      });
    },
  });
}

/* ---------- Anleitung „Automatik einrichten“ ---------- */

function copyBtn(text) {
  return `<button type="button" class="copy" data-copy="${esc(text)}">${esc(text)}<span>Kopieren</span></button>`;
}

function openAutomationGuide() {
  const step = (n, html) => `<li><span class="n">${n}</span><div>${html}</div></li>`;
  openSheet({
    title: 'Automatik einrichten',
    body: `
      <p class="muted" style="margin:0">Einmal einrichten (ca. 5 Minuten): Danach schreibt dein iPhone jede Apple-Pay-Zahlung automatisch in eine Datei auf deinem iPhone. Flowly liest sie beim Import – ohne Server, ohne Bankverbindung, ohne Upload. Voraussetzung: iOS 17 oder neuer.</p>

      <h3 class="guide-h">A · Ordner anlegen</h3>
      <ol class="guide">
        ${step(1, 'Öffne die App <b>Dateien</b>.')}
        ${step(2, 'Tippe unten auf <b>Durchsuchen</b> und dann auf <b>Auf meinem iPhone</b>.')}
        ${step(3, 'Tippe oben rechts auf <b>•••</b> → <b>Neuer Ordner</b>, nenne ihn <b>Flowly</b> und tippe auf <b>Fertig</b>.')}
      </ol>

      <h3 class="guide-h">B · Automation anlegen</h3>
      <ol class="guide">
        ${step(1, 'Öffne die App <b>Kurzbefehle</b> und tippe unten auf <b>Automation</b>.')}
        ${step(2, 'Tippe oben rechts auf <b>+</b> (oder auf <b>Neue Automation</b>).')}
        ${step(3, 'Wähle <b>Transaktion</b>.')}
        ${step(4, 'Wähle bei <b>Karten</b> alle Karten aus, mit denen du bezahlst. <b>Kategorien</b> und <b>Händler</b> lässt du auf „Beliebig“.')}
        ${step(5, 'Wähle unten <b>Sofort ausführen</b> und schalte <b>Bei Ausführung benachrichtigen</b> aus. Tippe auf <b>Weiter</b>.')}
        ${step(6, 'Tippe auf <b>Neuer leerer Kurzbefehl</b>.')}
      </ol>

      <h3 class="guide-h">C · Vier Aktionen hinzufügen</h3>
      <p class="muted" style="margin:0 0 8px;font-size:14px">Jede Aktion findest du über das Suchfeld <b>„Nach Apps und Aktionen suchen“</b>.</p>
      <ol class="guide">
        ${step(1, `Aktion <b>Datum formatieren</b>: Tippe auf „Datum“ und wähle <b>Aktuelles Datum</b>. Tippe auf den Pfeil <b>›</b>, setze <b>Datumsformat</b> auf <b>Eigene</b> und trage bei <b>Formatzeichenfolge</b> ein: ${copyBtn('yyyy-MM-dd;HH:mm:ss')}`)}
        ${step(2, `Aktion <b>Zufallszahl</b>: Minimum ${copyBtn('1')} Maximum ${copyBtn('999999999')}`)}
        ${step(3, `Aktion <b>Text</b>. Baue den Inhalt so auf – ohne Leerzeichen:
          <div class="formula"><span class="var">Formatiertes Datum</span>;<span class="var">Betrag</span>;<span class="var">Händler</span>;<span class="var">Zufallszahl</span></div>
          So geht's: Tippe ins Textfeld. Über der Tastatur erscheinen Variablen – tippe <b>Formatiertes Datum</b>, dann ein <b>;</b>. Füge <b>Kurzbefehleingabe</b> ein, tippe auf das blaue Feld und wähle <b>Betrag</b>, dann <b>;</b>. Füge noch einmal <b>Kurzbefehleingabe</b> ein und wähle <b>Händler</b>, dann <b>;</b>. Zum Schluss <b>Zufallszahl</b> einfügen. (Nicht sichtbar? Lange ins Feld tippen → <b>Variable auswählen</b>.)`)}
        ${step(4, `Aktion <b>An Textdatei anhängen</b>: Als Text ist <b>Text</b> eingetragen. Tippe auf den Ordner (zeigt meist „Kurzbefehle“) und wähle <b>Auf meinem iPhone › Flowly</b>. Bei <b>Dateipfad</b>: ${copyBtn('eingang.csv')} Schalte <b>Neue Zeile anlegen</b> ein.`)}
        ${step(5, 'Tippe oben rechts auf <b>Fertig</b>. Fertig – ab jetzt läuft alles ohne Nachfrage.')}
      </ol>

      <h3 class="guide-h">D · Importieren</h3>
      <ol class="guide">
        ${step(1, 'Bezahle wie gewohnt mit Apple Pay.')}
        ${step(2, 'Tippe in Flowly in der Übersicht auf <b>Neue Zahlungen importieren</b>.')}
        ${step(3, 'Wähle <b>Durchsuchen › Auf meinem iPhone › Flowly › eingang.csv</b>. Flowly übernimmt nur neue Zahlungen – die Datei darf einfach weiterwachsen.')}
      </ol>

      <h3 class="guide-h">E · Kontoauszug (Überweisungen, Lastschriften)</h3>
      <ol class="guide">
        ${step(1, 'Öffne dein Online-Banking (Banking-App oder Safari) und exportiere die Umsätze als <b>CSV</b>. Tipp: Viele Banken bieten das nur auf der Website an – in Safari über <b>aA › Desktop-Website anfordern</b>.')}
        ${step(2, 'Sichere die Datei mit <b>In Dateien sichern</b> unter <b>Auf meinem iPhone › Flowly</b>.')}
        ${step(3, 'Tippe in Flowly auf <b>Neue Zahlungen importieren</b> und wähle die Datei. Flowly erkennt das Format (Sparkasse, Volksbank, ING, DKB, Commerzbank, N26, comdirect u. a.) und zeigt dir vorher eine Vorschau.')}
      </ol>

      <div class="privacy-card">
        <div class="privacy-head">${icon('lock', 18)}<strong>Datenschutz</strong></div>
        <ul>
          <li>„Auf meinem iPhone“ bleibt nur auf diesem Gerät.</li>
          <li>Wählst du stattdessen <b>iCloud Drive</b>, wird die Datei über Apples Server synchronisiert. Für „nur lokal“ also „Auf meinem iPhone“ verwenden.</li>
          <li>Bietet dein iOS in Schritt C4 nur den Ordner „Kurzbefehle“ an, liegt die Datei in iCloud Drive › Kurzbefehle – das funktioniert, wird aber mit iCloud synchronisiert.</li>
        </ul>
      </div>`,
    onMount(sheet) {
      sheet.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-copy]');
        if (!b) return;
        try {
          await navigator.clipboard.writeText(b.dataset.copy);
          toast('Kopiert');
        } catch {
          toast('Kopieren nicht möglich – bitte abtippen', true);
        }
      });
    },
  });
}

/* ---------- Gelernte Kategorien ---------- */

function openLearnedList() {
  const entries = Object.entries(state.data.learned).sort((a, b) => a[0].localeCompare(b[0]));
  openSheet({
    title: 'Gelernte Kategorien',
    body: `<p class="muted" style="margin:0">Wenn du bei einem Händler die Kategorie änderst, merkt Flowly sich das hier.</p>
      ${entries.length
        ? `<div class="settings-group">${entries
            .map(([k, v]) => {
              const [type, mkey] = k.split(':');
              const cat = L.getCategory(type, v);
              return `<div class="settings-row" data-key="${esc(k)}">${catIcon(cat, 18)}<span class="main">${esc(mkey)}<span class="sub">${type === 'income' ? 'Einnahme' : 'Ausgabe'} → ${esc(cat.label)}</span></span><button type="button" class="icon-btn plain" data-forget="${esc(k)}" aria-label="Vergessen">${icon('x', 18)}</button></div>`;
            })
            .join('')}</div>`
        : emptyState({ title: 'Noch nichts gelernt', art: 'sparkle', text: 'Ändere bei einer importierten Buchung die Kategorie – Flowly übernimmt das künftig automatisch.', small: true })}`,
    onMount(sheet) {
      sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-forget]');
        if (!b) return;
        delete state.data.learned[b.dataset.forget];
        b.closest('.settings-row').remove();
        saveState(state.data);
      });
    },
  });
}

/* ---------- Budget bearbeiten ---------- */

function openBudgetSheet(catId) {
  const cat = L.getCategory('expense', catId);
  const limit = state.data.budgets[cat.id] || 0;
  const ov = L.budgetOverview(state.data.transactions, state.data.budgets, state.month);
  const spent = ov.items.find((i) => i.id === cat.id)?.spent || 0;
  openSheet({
    title: `Budget: ${cat.label}`,
    body: `
      <div class="settings-group"><div class="settings-row" style="cursor:default">${catIcon(cat)}<span class="main">${esc(L.monthLabel(state.month))}<span class="sub">${money(spent)} ausgegeben</span></span></div></div>
      <div class="field">
        <label for="b-amount">Monatliches Limit</label>
        <div class="amount-field small"><input id="b-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" maxlength="16" value="${limit ? esc(L.formatAmountInput(limit)) : ''}"><span class="cur">€</span></div>
        <div class="form-error" id="b-error"></div>
      </div>
      <button type="button" class="btn primary block" id="b-save">${icon('check', 20)}Limit speichern</button>
      ${limit ? `<button type="button" class="btn danger block" id="b-remove">${icon('trash', 20)}Limit entfernen</button>` : ''}`,
    onMount(sheet, close) {
      const input = $('#b-amount', sheet);
      amountInputHandler(input);
      $('#b-save', sheet).addEventListener('click', () => {
        const cents = L.parseAmount(input.value);
        if (cents == null) {
          input.closest('.amount-field').classList.add('invalid');
          $('#b-error', sheet).textContent = 'Bitte einen gültigen Betrag eingeben.';
          return;
        }
        state.data.budgets[cat.id] = cents;
        close();
        commit(`Budget für ${cat.label} gespeichert`);
      });
      $('#b-remove', sheet)?.addEventListener('click', () => {
        delete state.data.budgets[cat.id];
        close();
        commit(`Limit für ${cat.label} entfernt`);
      });
    },
  });
}

/* ---------- Sparziele ---------- */

function openGoalSheet(goal = null) {
  const val = (c) => (c ? esc(L.formatAmountInput(c)) : '');
  openSheet({
    title: goal ? 'Sparziel bearbeiten' : 'Neues Sparziel',
    body: `
      <div class="field"><label for="g-name">Name</label><input id="g-name" class="input" type="text" maxlength="40" placeholder="z. B. Urlaub, Notgroschen" autocomplete="off" value="${goal ? esc(goal.name) : ''}"></div>
      <div class="field"><label for="g-target">Zielbetrag</label><div class="amount-field small"><input id="g-target" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" maxlength="16" value="${goal ? val(goal.target) : ''}"><span class="cur">€</span></div></div>
      <div class="field"><label for="g-saved">${goal ? 'Bisher gespart' : 'Schon gespart (optional)'}</label><div class="amount-field small"><input id="g-saved" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" maxlength="16" value="${goal ? val(goal.saved) : ''}"><span class="cur">€</span></div></div>
      <div class="form-error" id="g-error"></div>
      <button type="button" class="btn primary block" id="g-save">${icon('check', 20)}${goal ? 'Änderungen speichern' : 'Sparziel anlegen'}</button>`,
    onMount(sheet, close) {
      const err = $('#g-error', sheet);
      ['#g-target', '#g-saved'].forEach((s) => amountInputHandler($(s, sheet)));
      $('#g-save', sheet).addEventListener('click', () => {
        const name = $('#g-name', sheet).value.trim().slice(0, 40);
        const target = L.parseAmount($('#g-target', sheet).value);
        const savedRaw = $('#g-saved', sheet).value.trim();
        const saved = savedRaw ? L.parseAmount(savedRaw, { allowZero: true }) : 0;
        if (!name) return (err.textContent = 'Bitte gib deinem Ziel einen Namen.');
        if (target == null) return (err.textContent = 'Bitte einen gültigen Zielbetrag eingeben.');
        if (saved == null) return (err.textContent = 'Der gesparte Betrag ist ungültig.');
        if (goal) {
          const g = state.data.goals.find((x) => x.id === goal.id);
          if (g) Object.assign(g, { name, target, saved });
        } else {
          state.data.goals.push({ id: L.uid(), name, target, saved, createdAt: Date.now() });
        }
        close();
        commit(goal ? 'Sparziel gespeichert' : 'Sparziel angelegt');
      });
    },
  });
}

function openGoalAddSheet(goal) {
  openSheet({
    title: `${goal.name}`,
    body: `
      <div class="muted">Bisher ${money(goal.saved)} von ${money(goal.target)}</div>
      <div class="field"><label for="ga-amount">Betrag hinzufügen</label><div class="amount-field small income"><span class="sign">+</span><input id="ga-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" maxlength="16"><span class="cur">€</span></div></div>
      <div class="chips">${[2500, 5000, 10000, 25000].map((c) => `<button type="button" class="chip" data-quick="${c}">+${L.formatEuroShort(c)} €</button>`).join('')}</div>
      <div class="form-error" id="ga-error"></div>
      <button type="button" class="btn primary block" id="ga-save">${icon('plus', 20)}Hinzufügen</button>`,
    onMount(sheet, close) {
      const input = $('#ga-amount', sheet);
      amountInputHandler(input);
      sheet.querySelector('.chips').addEventListener('click', (e) => {
        const b = e.target.closest('[data-quick]');
        if (!b) return;
        const current = L.parseAmount(input.value) || 0;
        input.value = L.formatAmountInput(current + Number(b.dataset.quick));
      });
      $('#ga-save', sheet).addEventListener('click', () => {
        const cents = L.parseAmount(input.value);
        if (cents == null) {
          input.closest('.amount-field').classList.add('invalid');
          $('#ga-error', sheet).textContent = 'Bitte einen gültigen Betrag eingeben.';
          return;
        }
        const g = state.data.goals.find((x) => x.id === goal.id);
        if (!g) return close();
        const before = g.saved;
        g.saved = Math.min(L.MAX_CENTS, g.saved + cents);
        close();
        commit(before < g.target && g.saved >= g.target ? 'Ziel erreicht – stark!' : `${money(cents)} hinzugefügt`);
      });
    },
  });
}

/* ---------- Einstellungen ---------- */

function renderSettings() {
  const s = state.data.settings;
  return `<div class="settings-page">
      <h3 class="section-title" style="margin-top:0">Profil</h3>
      ${canStore ? '' : `<div class="warning-note">${icon('alert', 18)}<span>Dein Browser erlaubt gerade keine Speicherung (z. B. privater Modus). Änderungen gehen beim Schließen verloren.</span></div>`}
      <div class="field"><label for="s-name">Dein Name</label><input id="s-name" class="input" type="text" maxlength="40" placeholder="z. B. Alex" autocomplete="given-name" value="${esc(s.name)}"></div>
      <div class="field"><label for="s-start">Startguthaben</label><div class="amount-field small"><input id="s-start" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" maxlength="17" value="${s.startBalance ? esc(L.formatAmountInput(s.startBalance)) : ''}"><span class="cur">€</span></div>
        <div class="muted" style="font-size:13px;margin-top:6px">Dein Kontostand vor der ersten Buchung. Negative Werte mit „-“.</div></div>
      <button type="button" class="settings-group settings-row" id="s-limit" style="margin-top:16px"><span class="ri">${icon('wallet', 18)}</span><span class="main">Ausgaben-Limit pro Monat<span class="sub">${state.data.settings.monthlyLimit ? `${money(L.limitForMonth(state.data.settings, currentMonth()))}${state.data.settings.limitStep ? ` · ${money(state.data.settings.limitStep, { signed: true })} pro Monat` : ''}` : 'Nicht festgelegt'}</span></span>${icon('chevronRight', 18)}</button>
      <div class="form-error" id="s-error"></div>
      <button type="button" class="btn primary block" id="s-save">${icon('check', 20)}Speichern</button>

      <h3 class="section-title" style="margin-bottom:0">Automatik</h3>
      <div class="settings-group">
        <button type="button" class="settings-row" id="s-auto"><span class="ri">${icon('sparkle', 18)}</span><span class="main">Automatik einrichten<span class="sub">Apple-Pay-Zahlungen per Kurzbefehl erfassen</span></span>${icon('chevronRight', 18)}</button>
        <button type="button" class="settings-row" id="s-csv"><span class="ri">${icon('download', 18)}</span><span class="main">Zahlungen importieren<span class="sub">Apple-Pay-Datei oder Kontoauszug (CSV)</span></span>${icon('chevronRight', 18)}</button>
        <button type="button" class="settings-row" id="s-rec"><span class="ri">${icon('repeat', 18)}</span><span class="main">Geplant & Daueraufträge<span class="sub">${state.data.recurring.length} angelegt</span></span>${icon('chevronRight', 18)}</button>
        <button type="button" class="settings-row" id="s-importcard" role="switch" aria-checked="${!state.data.settings.hideImport}"><span class="ri">${icon('overview', 18)}</span><span class="main">Import-Karte auf Start<span class="sub">Aus = du trägst deine Zahlen selbst ein</span></span><span class="switch"></span></button>
        <button type="button" class="settings-row" id="s-learned"><span class="ri">${icon('pencil', 18)}</span><span class="main">Gelernte Kategorien<span class="sub">${Object.keys(state.data.learned).length} Händler gemerkt</span></span>${icon('chevronRight', 18)}</button>
      </div>

      <h3 class="section-title" style="margin-bottom:0">Daten</h3>
      <div class="settings-group">
        <button type="button" class="settings-row" id="s-export"><span class="ri">${icon('download', 18)}</span><span class="main">Backup exportieren<span class="sub">Als JSON-Datei auf diesem Gerät speichern (Dateien › Downloads)</span></span></button>
        <button type="button" class="settings-row" id="s-import"><span class="ri">${icon('upload', 18)}</span><span class="main">Backup importieren<span class="sub">Ersetzt die aktuellen Daten</span></span></button>
        <button type="button" class="settings-row" id="s-sample"><span class="ri">${icon('database', 18)}</span><span class="main">Beispieldaten laden<span class="sub">Zum Ausprobieren – ersetzt die aktuellen Daten</span></span></button>
        <button type="button" class="settings-row danger" id="s-wipe"><span class="ri">${icon('trash', 18)}</span><span class="main">Alle Daten löschen<span class="sub">Kann nicht rückgängig gemacht werden</span></span></button>
      </div>
      <input type="file" id="s-file" accept="application/json,.json" hidden>

      <h3 class="section-title" style="margin-bottom:0">Sicherheit</h3>
      <div class="settings-group">
        <button type="button" class="settings-row" id="s-lock" ${Lock.lockSupported ? '' : 'disabled'}><span class="ri">${icon('lock', 18)}</span><span class="main">App-Sperre mit PIN<span class="sub" id="s-lock-state">${lockStateText()}</span></span>${icon('chevronRight', 18)}</button>
      </div>

      <div class="privacy-card">
        <div class="privacy-head">${icon('lock', 18)}<strong>Deine Daten bleiben bei dir</strong></div>
        <ul>
          <li>Alles wird nur lokal in diesem Browser auf deinem Gerät gespeichert.</li>
          <li>Kein Server, kein Konto, kein Tracking, keine Analytics, keine Cookies.</li>
          <li>Flowly baut keine Verbindungen zu fremden Diensten auf.</li>
          <li>Backups werden nur als Datei auf deinem Gerät abgelegt – nie hochgeladen.</li>
          <li>Importierte Dateien werden nur gelesen, nie verschickt.</li>
        </ul>
      </div>
      <p class="settings-note">Flowly · Version 2.0</p>
    </div>`;
}

function mountSettings(sheet) {
  const close = () => {};
  {
      const startInput = $('#s-start', sheet);
      amountInputHandler(startInput);
      $('#s-save', sheet).addEventListener('click', () => {
        const raw = startInput.value.trim();
        const start = raw ? L.parseAmount(raw, { allowNegative: true, allowZero: true }) : 0;
        if (start == null) {
          startInput.closest('.amount-field').classList.add('invalid');
          $('#s-error', sheet).textContent = 'Bitte ein gültiges Startguthaben eingeben.';
          return;
        }
        state.data.settings.name = $('#s-name', sheet).value.trim().slice(0, 40);
        state.data.settings.startBalance = start;
        close();
        commit('Einstellungen gespeichert');
      });

      $('#s-export', sheet).addEventListener('click', exportBackup);
      $('#s-auto', sheet).addEventListener('click', openAutomationGuide);
      $('#s-csv', sheet).addEventListener('click', pickImportFile);
      $('#s-rec', sheet).addEventListener('click', openRecurringList);
      $('#s-learned', sheet).addEventListener('click', openLearnedList);
      $('#s-limit', sheet).addEventListener('click', openLimitSheet);
      $('#s-importcard', sheet).addEventListener('click', (e) => {
        const b = e.currentTarget;
        state.data.settings.hideImport = !state.data.settings.hideImport;
        b.setAttribute('aria-checked', String(!state.data.settings.hideImport));
        saveState(state.data);
        render();
      });
      $('#s-lock', sheet).addEventListener('click', () =>
        openLockSettings(() => {
          const el = $('#s-lock-state', sheet);
          if (el) el.textContent = lockStateText();
        }),
      );

      const file = $('#s-file', sheet);
      $('#s-import', sheet).addEventListener('click', () => file.click());
      file.addEventListener('change', async () => {
        const f = file.files?.[0];
        file.value = '';
        if (!f) return;
        let imported;
        try {
          if (f.size > 5 * 1024 * 1024) throw new Error('Die Datei ist zu groß.');
          imported = L.sanitizeData(JSON.parse(await f.text()));
        } catch (err) {
          toast(err instanceof SyntaxError ? 'Die Datei ist kein gültiges JSON.' : err.message, true);
          return;
        }
        const ok = await confirmDialog({
          title: 'Backup importieren?',
          message: `${imported.transactions.length} Buchungen, ${Object.keys(imported.budgets).length} Budgets und ${imported.goals.length} Sparziele werden geladen. Deine aktuellen Daten werden ersetzt.`,
          confirmLabel: 'Importieren',
          iconName: 'upload',
        });
        if (!ok) return;
        state.data = imported;
        state.month = currentMonth();
        close();
        commit('Backup importiert');
      });

      $('#s-sample', sheet).addEventListener('click', async () => {
        if (state.data.transactions.length || state.data.goals.length) {
          const ok = await confirmDialog({
            title: 'Beispieldaten laden?',
            message: 'Deine aktuellen Buchungen, Budgets und Sparziele werden durch Beispieldaten ersetzt.',
            confirmLabel: 'Laden',
            iconName: 'database',
          });
          if (!ok) return;
        }
        close();
        loadSample();
      });

      $('#s-wipe', sheet).addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Alle Daten löschen?',
          message: 'Alle Buchungen, Budgets, Sparziele, Einstellungen und die PIN-Sperre werden unwiderruflich von diesem Gerät entfernt.',
          confirmLabel: 'Alles löschen',
          danger: true,
        });
        if (!ok) return;
        state.data = L.createEmptyState();
        state.month = currentMonth();
        Lock.clearPin();
        close();
        commit('Alle Daten gelöscht');
      });
  }
}

/* Backup wird ausschließlich als Datei auf dem Gerät gespeichert – kein Teilen, kein Upload. */
function exportBackup() {
  const payload = { app: 'Flowly', version: 1, exportedAt: new Date().toISOString(), data: state.data };
  const json = JSON.stringify(payload, null, 2);
  const filename = `flowly-backup-${L.todayISO()}.json`;
  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('Backup gespeichert');
  } catch {
    toast('Export nicht möglich', true);
  }
}

function loadSample() {
  state.data = L.generateSampleData(L.todayISO(), state.data.settings.name);
  state.month = currentMonth();
  commit('Beispieldaten geladen');
}

/* ---------- Ereignisse ---------- */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.closest('.sheet-wrap, .dialog-wrap')) return;
  const { action } = el.dataset;
  switch (action) {
    case 'tab':
      switchTab(el.dataset.tab);
      break;
    case 'open-add':
      openEntrySheet();
      break;
    case 'open-settings':
      switchTab('settings');
      break;
    case 'import':
      pickImportFile();
      break;
    case 'open-automation':
      openAutomationGuide();
      break;
    case 'open-recurring':
      openRecurringList();
      break;
    case 'hide-import':
      state.data.settings.hideImport = true;
      commit('Ausgeblendet – Import findest du weiter in den Einstellungen');
      break;
    case 'show-import':
      state.data.settings.hideImport = false;
      commit('Import-Karte wieder eingeblendet');
      break;
    case 'manual-mode':
      state.data.settings.hideImport = true;
      saveState(state.data);
      render();
      openEntrySheet();
      break;
    case 'edit-limit':
      openLimitSheet();
      break;
    case 'month-prev':
      state.month = L.addMonths(state.month, -1);
      render();
      break;
    case 'month-next':
      if (L.compareMonths(state.month, currentMonth()) < 0) state.month = L.addMonths(state.month, 1);
      render();
      break;
    case 'select-month':
      if (el.dataset.month && el.dataset.month !== state.month) {
        state.month = el.dataset.month;
        render();
      }
      break;
    case 'edit-tx': {
      const tx = state.data.transactions.find((t) => t.id === el.dataset.id);
      if (tx) openEntrySheet({ tx });
      break;
    }
    case 'load-sample':
      loadSample();
      break;
    case 'tx-filter':
      state.txFilter = el.dataset.filter;
      render();
      break;
    case 'clear-search':
      e.preventDefault();
      state.txQuery = '';
      $('#global-search').value = '';
      render();
      break;
    case 'edit-budget':
      openBudgetSheet(el.dataset.cat);
      break;
    case 'new-goal':
      openGoalSheet();
      break;
    case 'goal-add': {
      const g = state.data.goals.find((x) => x.id === el.dataset.id);
      if (g) openGoalAddSheet(g);
      break;
    }
    case 'goal-edit': {
      const g = state.data.goals.find((x) => x.id === el.dataset.id);
      if (g) openGoalSheet(g);
      break;
    }
    case 'goal-delete': {
      const g = state.data.goals.find((x) => x.id === el.dataset.id);
      if (!g) break;
      confirmDialog({
        title: 'Sparziel löschen?',
        message: `„${g.name}“ mit ${money(g.saved)} Fortschritt wird entfernt.`,
        confirmLabel: 'Löschen',
        danger: true,
      }).then((ok) => {
        if (!ok) return;
        state.data.goals = state.data.goals.filter((x) => x.id !== g.id);
        commit('Sparziel gelöscht');
      });
      break;
    }
  }
});

// Pinch-Zoom und Doppeltipp-Zoom auf iOS unterbinden
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

// Suche unten: springt zu „Zahlen“ und filtert live
const searchInput = $('#global-search');
searchInput.addEventListener('focus', () => {
  if (state.tab !== 'numbers') switchTab('numbers');
});
searchInput.addEventListener('input', () => {
  const had = !!state.txQuery.trim();
  state.txQuery = searchInput.value;
  $('#search-pill').classList.toggle('has-value', !!searchInput.value);
  const has = !!state.txQuery.trim();
  const results = $('#tx-results');
  if (state.tab === 'numbers' && results && had === has) {
    results.innerHTML = renderTxResults();
    const head = $('.search-head span');
    if (head) head.textContent = `Suche: „${state.txQuery.trim()}“`;
  }
  else if (state.tab === 'numbers') render();
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchInput.blur();
});
$('#search-clear').addEventListener('click', (e) => {
  e.preventDefault();
  state.txQuery = '';
  searchInput.value = '';
  $('#search-pill').classList.remove('has-value');
  render();
});

// Kopfzeile bekommt beim Scrollen eine Trennlinie
const topbar = $('#topbar');
window.addEventListener('scroll', () => topbar.classList.toggle('scrolled', window.scrollY > 4), { passive: true });

// Datenänderungen in einem anderen Tab übernehmen
window.addEventListener('storage', (e) => {
  if (unlocked && e.key && e.key.startsWith('flowly:data')) {
    state.data = loadState();
    render();
  }
});

// Beim Zurückkehren in die App: Monat aktualisieren (z. B. nach Monatswechsel)
let lastSeenMonth = currentMonth();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !unlocked) return;
  const now = currentMonth();
  if (now !== lastSeenMonth) {
    if (state.month === lastSeenMonth) state.month = now;
    lastSeenMonth = now;
    render();
  }
});

/* ---------- App-Sperre (PIN) ---------- */

function lockStateText() {
  if (!Lock.lockSupported) return 'In diesem Browser nicht verfügbar';
  return Lock.isLockEnabled() ? 'An – PIN beim Öffnen' : 'Aus';
}

/**
 * Ziffernblock für die PIN-Eingabe.
 * onSubmit(pin) liefert true (fertig), einen Fehlertext (nochmal) oder ein Objekt { title, subtitle } (nächster Schritt).
 */
function createPinPad(host, { title, subtitle = '', onSubmit, extra = '' }) {
  host.innerHTML = `<div class="pin">
    <div class="pin-title">${esc(title)}</div>
    <div class="pin-sub">${esc(subtitle)}</div>
    <div class="pin-dots" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
    <div class="pin-msg" role="alert"></div>
    <div class="pin-pad">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" class="pin-key" data-key="${n}">${n}</button>`).join('')}
      <span class="pin-extra">${extra}</span>
      <button type="button" class="pin-key" data-key="0">0</button>
      <button type="button" class="pin-key fn" data-key="del" aria-label="Löschen">${icon('chevronLeft', 26)}</button>
    </div>
  </div>`;
  const dots = host.querySelectorAll('.pin-dots span');
  const msg = $('.pin-msg', host);
  const box = $('.pin', host);
  let pin = '';
  let busy = false;
  const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const fail = (text) => {
    msg.textContent = text;
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
    navigator.vibrate?.(80);
    pin = '';
    paint();
  };
  const press = async (key) => {
    if (busy) return;
    if (key === 'del') pin = pin.slice(0, -1);
    else if (pin.length < 4) pin += key;
    paint();
    if (pin.length < 4) return;
    busy = true;
    const res = await onSubmit(pin);
    busy = false;
    if (res === true) return;
    if (typeof res === 'string') return fail(res);
    if (res && res.title) {
      $('.pin-title', host).textContent = res.title;
      $('.pin-sub', host).textContent = res.subtitle || '';
      msg.textContent = '';
      pin = '';
      paint();
    }
  };
  box.addEventListener('click', (e) => {
    const k = e.target.closest('[data-key]');
    if (k) press(k.dataset.key);
  });
  return { press, setMessage: (t) => (msg.textContent = t) };
}

let unlocked = !Lock.isLockEnabled();
let lockEl = null;

function lockKeyHandler(e) {
  if (!lockEl || document.querySelector('.dialog-wrap')) return;
  if (/^\d$/.test(e.key)) lockEl._pad.press(e.key);
  else if (e.key === 'Backspace') lockEl._pad.press('del');
}

function showLockScreen() {
  unlocked = false;
  document.body.classList.add('is-locked');
  if (lockEl) return;
  lockEl = document.createElement('div');
  lockEl.className = 'lock-screen';
  lockEl.setAttribute('role', 'dialog');
  lockEl.setAttribute('aria-modal', 'true');
  lockEl.setAttribute('aria-label', 'Flowly ist gesperrt');
  lockEl.innerHTML = `<div class="lock-logo">${icon('trend', 30)}</div><div class="lock-host"></div>
    <button type="button" class="lock-forgot">PIN vergessen?</button>`;
  document.body.appendChild(lockEl);
  const pad = createPinPad($('.lock-host', lockEl), {
    title: 'Flowly ist gesperrt',
    subtitle: 'Gib deine PIN ein',
    async onSubmit(pin) {
      const res = await Lock.verifyPin(pin);
      if (res.ok) {
        hideLockScreen();
        return true;
      }
      if (res.wait) return `Zu viele Versuche. Bitte ${res.wait} Sekunden warten.`;
      return `Falsche PIN – noch ${res.left} ${res.left === 1 ? 'Versuch' : 'Versuche'} bis zur Wartezeit`;
    },
  });
  lockEl._pad = pad;
  const wait = Lock.lockoutRemaining();
  if (wait) pad.setMessage(`Zu viele Versuche. Bitte ${wait} Sekunden warten.`);
  $('.lock-forgot', lockEl).addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'PIN vergessen?',
      message: 'Die PIN kann nicht wiederhergestellt werden – sie ist nirgends gespeichert außer als Prüfwert auf diesem Gerät. Du kannst nur alle Daten löschen und neu beginnen.',
      confirmLabel: 'Alles löschen',
      danger: true,
    });
    if (!ok) return;
    state.data = L.createEmptyState();
    saveState(state.data);
    Lock.clearPin();
    hideLockScreen();
    toast('Daten und PIN gelöscht');
  });
  document.addEventListener('keydown', lockKeyHandler);
}

function hideLockScreen() {
  unlocked = true;
  document.body.classList.remove('is-locked', 'privacy-cover');
  document.removeEventListener('keydown', lockKeyHandler);
  if (lockEl) {
    const el = lockEl;
    lockEl = null;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 320);
  }
  render();
}

// Beim Wechsel in den Hintergrund sofort verdecken (auch im App-Umschalter),
// nach mehr als 15 Sekunden im Hintergrund wieder PIN abfragen.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (!Lock.isLockEnabled()) return;
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    if (unlocked) document.body.classList.add('privacy-cover');
  } else if (unlocked) {
    if (Date.now() - hiddenAt > 15000) showLockScreen();
    document.body.classList.remove('privacy-cover');
  }
});

function openLockSettings(onChange) {
  const enabled = Lock.isLockEnabled();
  openSheet({
    title: enabled ? 'App-Sperre' : 'PIN festlegen',
    body: `<div id="pin-host"></div>
      <p class="settings-note" id="pin-note">${enabled ? 'Zum Ändern oder Deaktivieren erst die aktuelle PIN eingeben.' : 'Flowly fragt diese PIN bei jedem Öffnen ab. Sie wird nur als Prüfwert auf diesem Gerät gespeichert.'}</p>`,
    onMount(sheet, close) {
      const host = $('#pin-host', sheet);
      const newPinFlow = (doneText) => {
        let first = null;
        createPinPad(host, {
          title: 'Neue PIN eingeben',
          subtitle: '4 Ziffern',
          async onSubmit(pin) {
            if (!first) {
              first = pin;
              return { title: 'PIN bestätigen', subtitle: 'Gib dieselbe PIN noch einmal ein' };
            }
            if (pin !== first) {
              first = null;
              setTimeout(() => {
                $('.pin-title', host).textContent = 'Neue PIN eingeben';
                $('.pin-sub', host).textContent = '4 Ziffern';
              }, 0);
              return 'Die PINs stimmen nicht überein. Bitte neu beginnen.';
            }
            try {
              await Lock.setPin(pin);
            } catch (err) {
              return err.message;
            }
            unlocked = true;
            close();
            onChange?.();
            toast(doneText);
            return true;
          },
        });
      };

      if (!enabled) return newPinFlow('App-Sperre aktiviert');

      createPinPad(host, {
        title: 'Aktuelle PIN',
        subtitle: 'Zur Bestätigung',
        async onSubmit(pin) {
          const res = await Lock.verifyPin(pin);
          if (!res.ok) return res.wait ? `Zu viele Versuche. Bitte ${res.wait} Sekunden warten.` : 'Falsche PIN';
          $('#pin-note', sheet).remove();
          host.innerHTML = `<div class="stack">
            <button type="button" class="btn block" id="pin-change">${icon('pencil', 20)}PIN ändern</button>
            <button type="button" class="btn danger block" id="pin-off">${icon('lock', 20)}App-Sperre deaktivieren</button>
          </div>`;
          $('#pin-change', host).addEventListener('click', () => newPinFlow('PIN geändert'));
          $('#pin-off', host).addEventListener('click', () => {
            Lock.clearPin();
            close();
            onChange?.();
            toast('App-Sperre deaktiviert');
          });
          return true;
        },
      });
    },
  });
}

// Browser bitten, die lokalen Daten nicht automatisch zu löschen
try {
  navigator.storage?.persist?.().catch(() => {});
} catch {
  /* optional */
}

/** Fällige Daueraufträge buchen (beim Start und wenn die App wieder geöffnet wird). */
function processDue({ silent = false } = {}) {
  const n = runRecurring();
  if (!n) return;
  saveState(state.data);
  if (!silent) toast(`${n} ${n === 1 ? 'Dauerauftrag' : 'Daueraufträge'} automatisch gebucht`);
}

$('#import-file').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (f) handleImportFile(f);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && unlocked) {
    const before = state.data.transactions.length;
    processDue();
    if (state.data.transactions.length !== before) render();
  }
});

processDue({ silent: true });
if (unlocked) render();
else {
  renderTabbar();
  showLockScreen();
}

/* ---------- Service Worker & Updates ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  let pendingReload = false;
  const reloadNow = () => {
    // Nicht mitten in einer Eingabe neu laden – dann beim nächsten Verlassen der App
    if (document.querySelector('.sheet-wrap, .dialog-wrap')) pendingReload = true;
    else location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) reloadNow();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && pendingReload) location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './', updateViaCache: 'none' })
      .then((reg) => {
        const check = () => reg.update().catch(() => {});
        check();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
      })
      .catch((err) => console.warn('Service Worker nicht registriert', err));
  });
}
