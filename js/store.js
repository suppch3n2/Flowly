/* Flowly – lokale Speicherung im Browser (localStorage), komplett in try/catch. */
import { createEmptyState, sanitizeData } from './logic.js';

const KEY = 'flowly:data:v1';
const UI_KEY = 'flowly:ui:v1';

export function storageAvailable() {
  try {
    const probe = '__flowly_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createEmptyState();
    return sanitizeData(JSON.parse(raw));
  } catch (err) {
    console.warn('Flowly: Daten konnten nicht geladen werden', err);
    return createEmptyState();
  }
}

/** Gibt true zurück, wenn gespeichert wurde. */
export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn('Flowly: Daten konnten nicht gespeichert werden', err);
    return false;
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

/* Kleine UI-Einstellungen (z. B. zuletzt geöffneter Tab) – reine Komfortfunktion. */
export function loadUi() {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function saveUi(ui) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch {
    /* egal – nur Komfort */
  }
}
