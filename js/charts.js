/* Flowly – kleine SVG-Diagramme ohne Bibliothek. Alle Werte in Cent. */
import { escapeHtml as esc, formatEuroShort, monthShort } from './logic.js';

const C = {
  accent: '#8B7CF6',
  income: '#5BC0EB',
  expense: '#F59E5B',
  grid: '#1F2533',
  muted: '#A3ABBD',
  text: '#E8EAF0',
  surface: '#12161E',
};

const r1 = (n) => Math.round(n * 10) / 10;

/** Monotone kubische Interpolation (Fritsch–Carlson) – weich, ohne Überschwinger. */
export function monotonePath(pts) {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${r1(pts[0][0])},${r1(pts[0][1])}`;
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      t[i] = tau * a * m[i];
      t[i + 1] = tau * b * m[i];
    }
  }
  let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${r1(pts[i][0] + h)},${r1(pts[i][1] + t[i] * h)} ${r1(pts[i + 1][0] - h)},${r1(pts[i + 1][1] - t[i + 1] * h)} ${r1(pts[i + 1][0])},${r1(pts[i + 1][1])}`;
  }
  return d;
}

/* ---------- Verlaufskurve Gesamtvermögen ---------- */

const AREA_W = 340;
const AREA_H = 110;

export function areaPoints(values) {
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const top = 10;
  const bottom = AREA_H - 8;
  return values.map((v, i) => {
    const x = n === 1 ? AREA_W / 2 : (i / (n - 1)) * AREA_W;
    const y = span === 0 ? (top + bottom) / 2 : bottom - ((v - min) / span) * (bottom - top);
    return [x, y];
  });
}

export function areaChart(series, activeIndex = series.length - 1) {
  const pts = areaPoints(series.map((s) => s.value));
  const line = monotonePath(pts);
  const area = `${line}L${AREA_W},${AREA_H}L0,${AREA_H}Z`;
  const [ax, ay] = pts[activeIndex] || pts[pts.length - 1];
  const labels = series
    .map((s, i) => {
      const n = series.length;
      const left = n === 1 ? 50 : (i / (n - 1)) * 100;
      const edge = i === 0 ? ' first' : i === n - 1 ? ' last' : '';
      const hidden = i % 2 !== (n - 1) % 2 ? ' minor' : '';
      return `<span class="${i === activeIndex ? 'on' : ''}${edge}${hidden}" style="left:${r1(left)}%">${esc(monthShort(s.key))}</span>`;
    })
    .join('');
  return `
    <div class="area-chart" role="img" aria-label="Verlauf des Gesamtvermögens über ${series.length} Monate">
      <div class="area-plot">
        <svg viewBox="0 0 ${AREA_W} ${AREA_H}" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="${C.accent}" stop-opacity="0.38"/>
              <stop offset="1" stop-color="${C.accent}" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="${area}" fill="url(#nwFill)"/>
          <path d="${line}" fill="none" stroke="${C.accent}" stroke-width="2.25" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
        </svg>
        <div class="area-cursor" style="left:${r1((ax / AREA_W) * 100)}%"><span class="area-dot" style="top:${r1((ay / AREA_H) * 100)}%"></span></div>
      </div>
      <div class="area-labels">${labels}</div>
    </div>`;
}

/** Fingerbedienung: über die Kurve wischen zeigt den Wert des jeweiligen Monats. */
export function attachAreaScrub(root, series, onChange) {
  const plot = root.querySelector('.area-plot');
  if (!plot) return;
  const pts = areaPoints(series.map((s) => s.value));
  const cursor = plot.querySelector('.area-cursor');
  const dot = plot.querySelector('.area-dot');
  const labels = root.querySelectorAll('.area-labels span');
  let last = -1;
  const show = (i) => {
    if (i === last) return;
    last = i;
    cursor.style.left = `${(pts[i][0] / AREA_W) * 100}%`;
    dot.style.top = `${(pts[i][1] / AREA_H) * 100}%`;
    labels.forEach((l, j) => l.classList.toggle('on', j === i));
    onChange(i);
  };
  const fromEvent = (e) => {
    const rect = plot.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    return Math.round(f * (series.length - 1));
  };
  plot.addEventListener('pointerdown', (e) => {
    plot.setPointerCapture?.(e.pointerId);
    show(fromEvent(e));
  });
  plot.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || e.buttons) show(fromEvent(e));
  });
  const reset = () => show(series.length - 1);
  plot.addEventListener('pointerup', reset);
  plot.addEventListener('pointercancel', reset);
  plot.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') reset();
  });
}

/* ---------- Balkendiagramm Einnahmen vs. Ausgaben ---------- */

export function niceStep(max, targetTicks = 3) {
  if (max <= 0) return 1;
  const raw = max / targetTicks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * pow >= raw) return f * pow;
  return 10 * pow;
}

function topRoundedBar(x, y, w, h, r) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${r1(x)},${r1(y + h)}V${r1(y + rr)}Q${r1(x)},${r1(y)} ${r1(x + rr)},${r1(y)}H${r1(x + w - rr)}Q${r1(x + w)},${r1(y)} ${r1(x + w)},${r1(y + rr)}V${r1(y + h)}Z`;
}

export function barChart(series, selectedKey) {
  const W = 340;
  const H = 176;
  const left = 40;
  const top = 10;
  const bottom = 26;
  const plotW = W - left;
  const plotH = H - top - bottom;
  const max = Math.max(1, ...series.flatMap((s) => [s.income, s.expense]));
  const step = niceStep(max);
  const yMax = Math.ceil(max / step) * step;
  const y = (v) => top + plotH - (v / yMax) * plotH;

  let grid = '';
  for (let v = 0; v <= yMax + 1; v += step) {
    grid += `<line x1="${left}" x2="${W}" y1="${r1(y(v))}" y2="${r1(y(v))}" stroke="${C.grid}" stroke-width="1"/>`;
    grid += `<text x="${left - 8}" y="${r1(y(v) + 3.5)}" text-anchor="end" class="axis">${formatEuroShort(v)}</text>`;
  }

  const gw = plotW / series.length;
  const bw = Math.min(14, gw * 0.26);
  const gap = 3;
  let bars = '';
  series.forEach((s, i) => {
    const cx = left + gw * i + gw / 2;
    const sel = s.key === selectedKey;
    if (sel) bars += `<rect x="${r1(cx - gw / 2 + 4)}" y="2" width="${r1(gw - 8)}" height="${H - 4}" rx="10" fill="${C.accent}" fill-opacity="0.09"/>`;
    bars += `<path d="${topRoundedBar(cx - gap / 2 - bw, y(s.income), bw, top + plotH - y(s.income), 4)}" fill="${C.income}"/>`;
    bars += `<path d="${topRoundedBar(cx + gap / 2, y(s.expense), bw, top + plotH - y(s.expense), 4)}" fill="${C.expense}"/>`;
    bars += `<text x="${r1(cx)}" y="${H - 8}" text-anchor="middle" class="axis${sel ? ' on' : ''}">${esc(monthShort(s.key))}</text>`;
    bars += `<rect x="${r1(cx - gw / 2)}" y="0" width="${r1(gw)}" height="${H}" fill="transparent" class="hit" data-action="select-month" data-month="${esc(s.key)}"><title>${esc(monthShort(s.key))}</title></rect>`;
  });

  return `<svg class="bar-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Einnahmen und Ausgaben der letzten ${series.length} Monate">${grid}${bars}</svg>`;
}

/* ---------- Ringdiagramm ---------- */

export function donutChart(items) {
  const size = 180;
  const r = 72;
  const sw = 20;
  const circ = 2 * Math.PI * r;
  const gap = items.length > 1 ? 3 : 0;
  let offset = 0;
  let segs = '';
  for (const it of items) {
    const len = it.share * circ;
    const dash = Math.max(len - gap, 0.5);
    segs += `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${it.color}" stroke-width="${sw}" stroke-dasharray="${r1(dash)} ${r1(circ - dash)}" stroke-dashoffset="${r1(-offset)}"/>`;
    offset += len;
  }
  return `<svg class="donut" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${C.grid}" stroke-width="${sw}"/>
    <g transform="rotate(-90 ${size / 2} ${size / 2})">${segs}</g>
  </svg>`;
}
