/* Flowly – App-Oberfläche */
import * as L from './logic.js';
import { loadState, saveState, storageAvailable, loadUi, saveUi } from './store.js';
import { icon } from './icons.js';
import { areaChart, attachAreaScrub, barChart, donutChart } from './charts.js';
import * as Lock from './lock.js';

const esc = L.escapeHtml;
const money = L.formatMoney;
const $ = (sel, root = document) => root.querySelector(sel);

const TABS = [
  { id: 'overview', label: 'Übersicht', icon: 'overview' },
  { id: 'transactions', label: 'Buchungen', icon: 'list' },
  { id: 'budgets', label: 'Budgets', icon: 'pie' },
  { id: 'goals', label: 'Sparziele', icon: 'target' },
];

const ui = loadUi();
const state = {
  data: loadState(),
  tab: TABS.some((t) => t.id === ui.tab) ? ui.tab : 'overview',
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
  if (showDate) subParts.push(L.dayLabel(t.date));
  return `<li><button type="button" class="row" data-action="edit-tx" data-id="${esc(t.id)}">
    ${catIcon(cat)}
    <span class="main"><span class="title">${title}</span><span class="sub">${esc(subParts.join(' · '))}</span></span>
    <span class="amount ${isIn ? 'in' : 'out'}">${money(isIn ? t.amount : -t.amount, { signed: true })}</span>
  </button></li>`;
}

function emptyState({ title, text, art = 'sparkle', actions = '', small = false }) {
  return `<div class="card empty${small ? ' small' : ''}">
    <div class="art">${icon(art, small ? 24 : 32)}</div>
    <h2>${title}</h2>
    <p>${text}</p>
    ${actions ? `<div class="actions">${actions}</div>` : ''}
  </div>`;
}

const sampleButtons = `
  <button type="button" class="btn primary block" data-action="load-sample">${icon('database', 20)}Beispieldaten laden</button>
  <button type="button" class="btn block" data-action="open-add">${icon('plus', 20)}Erste Buchung erfassen</button>`;

/* ---------- Kopfzeile & Tabs ---------- */

function renderTopbar() {
  const el = $('#topbar-title');
  if (state.tab === 'overview') {
    const name = state.data.settings.name;
    el.innerHTML = name
      ? `<div class="hello">${esc(L.greeting())},</div><h1>${esc(name)}</h1>`
      : `<div class="hello">${esc(L.greeting())}</div><h1>Willkommen</h1>`;
  } else {
    el.innerHTML = `<h1>${esc(TABS.find((t) => t.id === state.tab).label)}</h1>`;
  }
}

function renderTabbar() {
  const tabBtn = (t) =>
    `<button type="button" class="tab" data-action="tab" data-tab="${t.id}" ${state.tab === t.id ? 'aria-current="page"' : ''}>${icon(t.icon, 24)}<span>${t.label}</span></button>`;
  $('#tabbar').innerHTML = `${tabBtn(TABS[0])}${tabBtn(TABS[1])}
    <div class="fab-wrap"><button type="button" class="fab" data-action="open-add" aria-label="Buchung hinzufügen">${icon('plus', 30)}</button></div>
    ${tabBtn(TABS[2])}${tabBtn(TABS[3])}`;
}

function switchTab(id) {
  if (id === state.tab) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  state.scroll[state.tab] = window.scrollY;
  state.tab = id;
  saveUi({ ...ui, tab: id });
  render();
  window.scrollTo(0, state.scroll[id] || 0);
}

/* ---------- Übersicht ---------- */

function renderOverview() {
  const { transactions, settings } = state.data;
  if (!transactions.length) {
    return `<div class="stack">${emptyState({
      title: 'Willkommen bei Flowly',
      art: 'trend',
      text: 'Hier siehst du bald, wohin dein Geld fließt. Erfasse deine erste Buchung – oder schau dir Flowly mit Beispieldaten an.',
      actions: sampleButtons,
    })}
    ${!settings.name ? `<button type="button" class="card settings-row" data-action="open-settings" style="border-radius:18px"><span class="ri">${icon('user', 18)}</span><span class="main">Wie heißt du?<span class="sub">Name und Startguthaben in den Einstellungen festlegen</span></span>${icon('chevronRight', 18)}</button>` : ''}
    </div>`;
  }

  const month = state.month;
  const sum = L.monthSummary(transactions, month);
  const series = L.balanceSeries(transactions, settings.startBalance, month, 12);
  const current = series[series.length - 1];
  const bars = L.monthlySeries(transactions, month, 6);
  const cats = L.expensesByCategory(L.transactionsInMonth(transactions, month));
  const recent = L.sortTransactions(transactions).slice(0, 5);
  const rate = sum.savingsRate;
  const ratePct = rate == null ? 0 : Math.max(0, Math.min(1, rate));
  const isNow = month === currentMonth();

  const netPill = sum.net === 0
    ? `<span class="pill neutral">±0,00 € im ${esc(L.monthName(month))}</span>`
    : `<span class="pill ${sum.net < 0 ? 'neg' : ''}">${icon(sum.net < 0 ? 'arrowOut' : 'trend', 14)}${money(sum.net, { signed: true })} im ${esc(L.monthName(month))}</span>`;

  return `<div class="stack">
    ${monthSwitcher()}

    <section class="card networth" id="networth">
      <div class="eyebrow" id="nw-label">Gesamtvermögen${isNow ? '' : ` · Ende ${esc(L.monthName(month))}`}</div>
      <div class="big" id="nw-value">${money(current.value)}</div>
      <div class="meta" id="nw-meta">${netPill}</div>
      ${areaChart(series)}
    </section>

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
              .map((c) => `<li><span class="dot" style="background:${c.color}"></span><span class="name">${esc(c.label)}</span><span class="val"><b>${L.formatEuroShort(c.amount)} €</b> · ${L.formatPercent(c.share)}</span></li>`)
              .join('')}</ul>
          </div>`
        : `<p class="muted" style="margin:0">Keine Ausgaben im ${esc(L.monthLabel(month))}.</p>`}
    </section>

    <section class="card">
      <div class="card-head"><h2>Letzte Buchungen</h2><button type="button" class="link" data-action="tab" data-tab="transactions">Alle anzeigen</button></div>
      <ul class="tx-list">${recent.map((t) => txRow(t, { showDate: true })).join('')}</ul>
    </section>
  </div>`;
}

function mountOverview(root) {
  const chart = $('.area-chart', root);
  if (!chart) return;
  const { transactions, settings } = state.data;
  const series = L.balanceSeries(transactions, settings.startBalance, state.month, 12);
  const label = $('#nw-label', root);
  const value = $('#nw-value', root);
  const baseLabel = label.textContent;
  attachAreaScrub(chart, series, (i) => {
    const last = i === series.length - 1;
    label.textContent = last ? baseLabel : `Gesamtvermögen · Ende ${L.monthLabel(series[i].key)}`;
    value.textContent = money(series[i].value);
  });
}

/* ---------- Buchungen ---------- */

function renderTransactions() {
  const { transactions } = state.data;
  if (!transactions.length) {
    return emptyState({
      title: 'Noch keine Buchungen',
      art: 'list',
      text: 'Tippe auf das große Plus unten, um deine erste Einnahme oder Ausgabe zu erfassen.',
      actions: sampleButtons,
    });
  }
  const filters = [
    ['all', 'Alle'],
    ['income', 'Einnahmen'],
    ['expense', 'Ausgaben'],
  ];
  const idx = filters.findIndex((f) => f[0] === state.txFilter);
  return `<div class="toolbar">
      <label class="search ${state.txQuery ? 'has-value' : ''}">
        ${icon('search', 20)}
        <span class="sr-only">Buchungen durchsuchen</span>
        <input type="search" id="tx-search" placeholder="Suchen nach Notiz, Kategorie, Betrag" value="${esc(state.txQuery)}" autocomplete="off" enterkeyhint="search">
        <button type="button" class="clear" data-action="clear-search" aria-label="Suche leeren">${icon('x', 18)}</button>
      </label>
      <div class="seg" role="group" aria-label="Filter">
        <span class="thumb" style="width:calc((100% - 8px) / 3);transform:translateX(${idx * 100}%)"></span>
        ${filters.map(([id, label]) => `<button type="button" data-action="tx-filter" data-filter="${id}" aria-pressed="${state.txFilter === id}">${label}</button>`).join('')}
      </div>
    </div>
    <div id="tx-results">${renderTxResults()}</div>`;
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
        <div class="card"><ul class="tx-list">${g.items.map((t) => txRow(t)).join('')}</ul></div>
      </section>`,
    )
    .join('') + (groups.length > shown.length ? `<p class="settings-note">Ältere Buchungen: bitte die Suche verwenden.</p>` : '');
}

function mountTransactions(root) {
  const input = $('#tx-search', root);
  if (!input) return;
  input.addEventListener('input', () => {
    state.txQuery = input.value;
    input.closest('.search').classList.toggle('has-value', !!input.value);
    $('#tx-results', root).innerHTML = renderTxResults();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
  });
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
  overview: [renderOverview, mountOverview],
  transactions: [renderTransactions, mountTransactions],
  budgets: [renderBudgets, null],
  goals: [renderGoals, null],
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
        el.classList.add('active');
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

function confirmDialog({ title, message, confirmLabel = 'Bestätigen', danger = false, iconName }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    wrap.innerHTML = `<div class="backdrop" data-res="0"></div>
      <div class="dialog ${danger ? 'danger' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
        <div class="d-icon">${icon(iconName || (danger ? 'trash' : 'alert'), 26)}</div>
        <h2 id="dlg-title">${esc(title)}</h2>
        <p>${esc(message)}</p>
        <div class="d-actions">
          <button type="button" class="btn" data-res="0">Abbrechen</button>
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

/* ---------- Buchung anlegen / bearbeiten ---------- */

function amountInputHandler(input) {
  input.addEventListener('input', () => {
    const cleaned = input.value.replace(/[^\d.,-]/g, '');
    if (cleaned !== input.value) input.value = cleaned;
    input.closest('.amount-field')?.classList.remove('invalid');
  });
}

function openTransactionSheet(existing = null) {
  const draft = existing
    ? { ...existing }
    : { type: 'expense', category: 'lebensmittel', amount: null, note: '', date: L.todayISO() };

  const catGrid = () =>
    L.categoriesFor(draft.type)
      .map(
        (c) => `<button type="button" class="cat-btn" role="radio" aria-checked="${c.id === draft.category}" data-cat="${c.id}" style="--c:${c.color}">
          ${catIcon(c, 20)}<span class="lbl">${esc(c.label)}</span></button>`,
      )
      .join('');

  const body = `
    <div class="seg type-${draft.type}" role="group" aria-label="Art der Buchung" style="margin-top:0">
      <span class="thumb" style="width:calc((100% - 8px) / 2);transform:translateX(${draft.type === 'income' ? 100 : 0}%)"></span>
      <button type="button" data-type="expense" aria-pressed="${draft.type === 'expense'}">Ausgabe</button>
      <button type="button" data-type="income" aria-pressed="${draft.type === 'income'}">Einnahme</button>
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
      <span class="label">Kategorie</span>
      <div class="cat-grid" role="radiogroup" aria-label="Kategorie" id="f-cats">${catGrid()}</div>
    </div>
    <div class="field">
      <label for="f-note">Notiz</label>
      <input id="f-note" class="input" type="text" maxlength="100" placeholder="z. B. Wocheneinkauf" autocomplete="off" enterkeyhint="done" value="${esc(draft.note)}">
    </div>
    <div class="field">
      <label for="f-date">Datum</label>
      <input id="f-date" class="input" type="date" value="${esc(draft.date)}" required>
    </div>
    <button type="button" class="btn primary block" id="f-save">${icon('check', 20)}${existing ? 'Änderungen speichern' : 'Buchung speichern'}</button>
    ${existing ? `<button type="button" class="btn danger block" id="f-delete">${icon('trash', 20)}Buchung löschen</button>` : ''}`;

  openSheet({
    title: existing ? 'Buchung bearbeiten' : 'Neue Buchung',
    body,
    onMount(sheet, close) {
      const amount = $('#f-amount', sheet);
      const field = $('.amount-field', sheet);
      const seg = $('.seg', sheet);
      const error = $('#f-error', sheet);
      amountInputHandler(amount);

      seg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-type]');
        if (!b || b.dataset.type === draft.type) return;
        draft.type = b.dataset.type;
        draft.category = draft.type === 'income' ? 'gehalt' : 'lebensmittel';
        seg.className = `seg type-${draft.type}`;
        $('.thumb', seg).style.transform = `translateX(${draft.type === 'income' ? 100 : 0}%)`;
        seg.querySelectorAll('[data-type]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.type === draft.type)));
        field.className = `amount-field ${draft.type}`;
        $('.sign', field).textContent = draft.type === 'income' ? '+' : '−';
        $('#f-cats', sheet).innerHTML = catGrid();
      });

      $('#f-cats', sheet).addEventListener('click', (e) => {
        const b = e.target.closest('[data-cat]');
        if (!b) return;
        draft.category = b.dataset.cat;
        sheet.querySelectorAll('.cat-btn').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      });

      $('#f-note', sheet).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') e.target.blur();
      });

      $('#f-save', sheet).addEventListener('click', () => {
        const cents = L.parseAmount(amount.value);
        if (cents == null) {
          field.classList.remove('invalid');
          void field.offsetWidth;
          field.classList.add('invalid');
          error.textContent = amount.value.trim() ? 'Bitte einen gültigen Betrag eingeben, z. B. 12,50' : 'Bitte gib einen Betrag ein.';
          return;
        }
        const date = $('#f-date', sheet).value;
        if (!L.isValidISODate(date)) {
          error.textContent = 'Bitte ein gültiges Datum wählen.';
          $('#f-date', sheet).classList.add('invalid');
          return;
        }
        const tx = {
          id: existing ? existing.id : L.uid(),
          type: draft.type,
          amount: cents,
          category: L.getCategory(draft.type, draft.category).id,
          note: $('#f-note', sheet).value.trim().slice(0, 100),
          date,
          createdAt: existing ? existing.createdAt : Date.now(),
        };
        const list = state.data.transactions;
        if (existing) {
          const i = list.findIndex((t) => t.id === existing.id);
          if (i >= 0) list[i] = tx;
        } else {
          list.push(tx);
        }
        close();
        commit(existing ? 'Buchung aktualisiert' : 'Buchung gespeichert');
      });

      $('#f-delete', sheet)?.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Buchung löschen?',
          message: `${L.getCategory(existing.type, existing.category).label} über ${money(existing.amount)} wird endgültig entfernt.`,
          confirmLabel: 'Löschen',
          danger: true,
        });
        if (!ok) return;
        state.data.transactions = state.data.transactions.filter((t) => t.id !== existing.id);
        close();
        commit('Buchung gelöscht');
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

function openGoalSheet() {
  openSheet({
    title: 'Neues Sparziel',
    body: `
      <div class="field"><label for="g-name">Name</label><input id="g-name" class="input" type="text" maxlength="40" placeholder="z. B. Urlaub, Notgroschen" autocomplete="off"></div>
      <div class="field"><label for="g-target">Zielbetrag</label><div class="amount-field small"><input id="g-target" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" maxlength="16"><span class="cur">€</span></div></div>
      <div class="field"><label for="g-saved">Schon gespart (optional)</label><div class="amount-field small"><input id="g-saved" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" maxlength="16"><span class="cur">€</span></div></div>
      <div class="form-error" id="g-error"></div>
      <button type="button" class="btn primary block" id="g-save">${icon('check', 20)}Sparziel anlegen</button>`,
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
        if (saved == null) return (err.textContent = 'Der bereits gesparte Betrag ist ungültig.');
        state.data.goals.push({ id: L.uid(), name, target, saved, createdAt: Date.now() });
        close();
        commit('Sparziel angelegt');
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

function openSettingsSheet() {
  const s = state.data.settings;
  openSheet({
    title: 'Einstellungen',
    body: `
      ${canStore ? '' : `<div class="warning-note">${icon('alert', 18)}<span>Dein Browser erlaubt gerade keine Speicherung (z. B. privater Modus). Änderungen gehen beim Schließen verloren.</span></div>`}
      <div class="field"><label for="s-name">Dein Name</label><input id="s-name" class="input" type="text" maxlength="40" placeholder="z. B. Alex" autocomplete="given-name" value="${esc(s.name)}"></div>
      <div class="field"><label for="s-start">Startguthaben</label><div class="amount-field small"><input id="s-start" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" maxlength="17" value="${s.startBalance ? esc(L.formatAmountInput(s.startBalance)) : ''}"><span class="cur">€</span></div>
        <div class="muted" style="font-size:13px;margin-top:6px">Dein Kontostand vor der ersten Buchung. Negative Werte mit „-“.</div></div>
      <div class="form-error" id="s-error"></div>
      <button type="button" class="btn primary block" id="s-save">${icon('check', 20)}Speichern</button>

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
        </ul>
      </div>
      <p class="settings-note">Flowly · Version 1.1</p>`,
    onMount(sheet, close) {
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
    },
  });
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
      openTransactionSheet();
      break;
    case 'open-settings':
      openSettingsSheet();
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
      if (tx) openTransactionSheet(tx);
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

if (unlocked) render();
else {
  renderTabbar();
  showLockScreen();
}

/* ---------- Service Worker ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => console.warn('Service Worker nicht registriert', err));
  });
}
