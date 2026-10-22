import assert from 'node:assert/strict';
import test from 'node:test';
import * as rules from '../lib/rules.js';
import { createSeed } from '../lib/seed.js';

// Jueves 22 de octubre de 2026: la semana de prueba va del lunes 26 al sábado 31.
const TODAY = new Date(2026, 9, 22, 12, 0);
const at = (localIso) => new Date(localIso);
const MON_FULL = 'c-2026-10-26-1930-s1';
const TUE = 'c-2026-10-27-1800-s2';
const remaining = (s, id) => rules.remaining(s, id, '2026-10');

test('datos de prueba: 46 clases de 8 plazas, 2 salas, 4 instructoras y 12 socias', () => {
  const s = createSeed(TODAY);
  assert.equal(s.classes.length, 46);
  assert.equal(new Set(s.classes.map((c) => c.room)).size, 2);
  assert.equal(new Set(s.classes.map((c) => c.instructor)).size, 4);
  assert.equal(s.members.length, 12);
  assert.deepEqual(rules.ownerView(s, TODAY).lowBalance.map((m) => m.remaining), [0, 0, 1, 1]);
});

test('reservar descuenta una clase y sin clases no se puede reservar', () => {
  const s = createSeed(TODAY);
  assert.equal(remaining(s, 'm1'), 4);
  rules.book(s, 'm1', 'c-2026-10-28-0800-s1', TODAY);
  assert.equal(remaining(s, 'm1'), 3);
  assert.throws(() => rules.book(s, 'm2', 'c-2026-10-28-0800-s1', TODAY), rules.RuleError);
});

test('cancelar con 12 horas o más devuelve la clase; con menos, se pierde', () => {
  const early = createSeed(TODAY);
  assert.equal(rules.cancel(early, 'm1', TUE, TODAY).refunded, true);
  assert.equal(remaining(early, 'm1'), 5);

  const late = createSeed(TODAY);
  assert.equal(rules.cancel(late, 'm1', TUE, at('2026-10-27T08:00')).refunded, false);
  assert.equal(remaining(late, 'm1'), 4);
});

test('clase llena: entra en lista de espera y la plaza libre pasa a la primera, que recibe aviso', () => {
  const s = createSeed(TODAY);
  assert.deepEqual(rules.book(s, 'm11', MON_FULL, TODAY), { status: 'waitlist', position: 3 });
  rules.cancel(s, 'm1', MON_FULL, TODAY);
  const ines = rules.memberView(s, 'm9', TODAY);
  assert.equal(ines.classes.find((c) => c.id === MON_FULL).mine, 'confirmed');
  assert.equal(ines.notices.length, 1);
});

test('la plaza se salta a quien ya no tiene clases y sale de la lista', () => {
  const s = createSeed(TODAY);
  rules.book(s, 'm11', MON_FULL, TODAY);
  rules.cancel(s, 'm1', MON_FULL, TODAY); // entra Inés
  rules.cancel(s, 'm2', MON_FULL, TODAY); // Julia no tiene clases: entra Laura
  const view = rules.ownerView(s, TODAY).classes.find((c) => c.id === MON_FULL);
  assert.ok(view.confirmed.includes('Laura Delgado'));
  assert.deepEqual(view.waiting, []);
  assert.equal(rules.memberView(s, 'm10', TODAY).notices[0].tone, 'warn');
});

test('quien entra desde la lista con menos de 12 horas puede cancelar sin perder la clase', () => {
  const s = createSeed(TODAY);
  assert.equal(rules.cancel(s, 'm1', MON_FULL, at('2026-10-26T15:00')).refunded, false);
  assert.equal(rules.cancel(s, 'm9', MON_FULL, at('2026-10-26T16:00')).refunded, true);
});

test('no se puede reservar dos clases a la misma hora ni una clase empezada', () => {
  const s = createSeed(TODAY);
  assert.throws(() => rules.book(s, 'm1', 'c-2026-10-26-1930-s2', TODAY), /otra clase a esa hora/);
  assert.throws(() => rules.book(s, 'm7', 'c-2026-10-26-0800-s1', at('2026-10-26T08:10')), /ya ha empezado/);
});
