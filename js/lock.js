/*
 * Flowly – optionale App-Sperre mit 4-stelliger PIN.
 * Die PIN wird nie im Klartext gespeichert: nur ein PBKDF2-Hash (SHA-256, zufälliges Salt)
 * liegt lokal im localStorage. Nichts davon verlässt das Gerät.
 * Hinweis: Die Sperre ist ein Sichtschutz beim Öffnen der App, keine Verschlüsselung der Daten.
 */

const LOCK_KEY = 'flowly:lock:v1';
const TRIES_KEY = 'flowly:lock-tries:v1';
const ITERATIONS = 150000;
export const MAX_TRIES = 5;

export const lockSupported = !!(globalThis.crypto && globalThis.crypto.subtle && globalThis.crypto.getRandomValues);

export function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

export async function hashPin(pin, saltB64, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations }, key, 256);
  return toB64(bits);
}

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function isLockEnabled() {
  const c = read(LOCK_KEY);
  return !!(c && typeof c.hash === 'string' && typeof c.salt === 'string');
}

export async function setPin(pin) {
  if (!isValidPin(pin)) throw new Error('Die PIN muss aus 4 Ziffern bestehen.');
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await hashPin(pin, salt, ITERATIONS);
  write(TRIES_KEY, null);
  if (!write(LOCK_KEY, { v: 1, salt, hash, iterations: ITERATIONS })) throw new Error('PIN konnte nicht gespeichert werden.');
}

export function clearPin() {
  write(TRIES_KEY, null);
  return write(LOCK_KEY, null);
}

/** Sekunden, die noch gewartet werden muss (nach zu vielen Fehlversuchen). */
export function lockoutRemaining(now = Date.now()) {
  const t = read(TRIES_KEY);
  if (!t || !t.until) return 0;
  return Math.max(0, Math.ceil((t.until - now) / 1000));
}

/**
 * Prüft die PIN. Ergebnis: { ok: true } oder { ok: false, wait: Sekunden, left: verbleibende Versuche }.
 * Nach 5 Fehlversuchen 30 s Pause, danach bei jedem weiteren Fehler 60 s.
 */
export async function verifyPin(pin, now = Date.now()) {
  const c = read(LOCK_KEY);
  if (!c) return { ok: true };
  const wait = lockoutRemaining(now);
  if (wait > 0) return { ok: false, wait, left: 0 };
  const hash = isValidPin(pin) ? await hashPin(pin, c.salt, c.iterations || ITERATIONS) : '';
  let diff = hash.length ^ c.hash.length;
  for (let i = 0; i < Math.min(hash.length, c.hash.length); i++) diff |= hash.charCodeAt(i) ^ c.hash.charCodeAt(i);
  if (diff === 0) {
    write(TRIES_KEY, null);
    return { ok: true };
  }
  const t = read(TRIES_KEY) || { fails: 0 };
  t.fails = (t.fails || 0) + 1;
  t.until = t.fails >= MAX_TRIES ? now + (t.fails === MAX_TRIES ? 30 : 60) * 1000 : 0;
  write(TRIES_KEY, t);
  return { ok: false, wait: t.until ? Math.ceil((t.until - now) / 1000) : 0, left: Math.max(0, MAX_TRIES - t.fails) };
}
