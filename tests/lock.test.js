import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimaler localStorage-Ersatz für Node
const mem = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  },
});
const Lock = await import('../js/lock.js');

test('PIN-Format', () => {
  assert.ok(Lock.isValidPin('0420'));
  for (const bad of ['123', '12345', 'abcd', '12 4', '', null, 1234]) assert.ok(!Lock.isValidPin(bad));
});

test('PIN wird nur gehasht gespeichert und korrekt geprüft', async () => {
  assert.equal(Lock.isLockEnabled(), false);
  assert.deepEqual(await Lock.verifyPin('0000'), { ok: true }); // ohne Sperre immer offen
  await Lock.setPin('4711');
  assert.equal(Lock.isLockEnabled(), true);
  const stored = [...mem.values()].join(' ');
  assert.ok(!stored.includes('4711'), 'PIN darf nicht im Klartext gespeichert sein');
  assert.equal((await Lock.verifyPin('4711')).ok, true);
  assert.equal((await Lock.verifyPin('1234')).ok, false);
  await assert.rejects(Lock.setPin('12a4'));
});

test('Gleiche PIN ergibt dank Salt unterschiedliche Hashes', async () => {
  await Lock.setPin('1111');
  const a = mem.get('flowly:lock:v1');
  await Lock.setPin('1111');
  assert.notEqual(mem.get('flowly:lock:v1'), a);
});

test('Wartezeit nach 5 Fehlversuchen, Zurücksetzen nach Erfolg', async () => {
  await Lock.setPin('2580');
  const t0 = 1_000_000;
  for (let i = 1; i <= 4; i++) {
    const r = await Lock.verifyPin('0000', t0);
    assert.deepEqual([r.ok, r.left, r.wait], [false, 5 - i, 0]);
  }
  const fifth = await Lock.verifyPin('0000', t0);
  assert.equal(fifth.wait, 30);
  // Auch die richtige PIN wird während der Wartezeit abgelehnt
  assert.equal((await Lock.verifyPin('2580', t0 + 10_000)).ok, false);
  assert.equal(Lock.lockoutRemaining(t0 + 10_000), 20);
  // Nach Ablauf klappt es und der Zähler ist zurückgesetzt
  assert.equal((await Lock.verifyPin('2580', t0 + 31_000)).ok, true);
  assert.equal((await Lock.verifyPin('0000', t0 + 32_000)).left, 4);
});

test('Sperre deaktivieren', async () => {
  Lock.clearPin();
  assert.equal(Lock.isLockEnabled(), false);
  assert.equal(mem.has('flowly:lock:v1'), false);
});
