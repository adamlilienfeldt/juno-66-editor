import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOverrides, exportMap, isValidCc, loadOverrides, saveOverrides } from '../src/overrides.js';

const groups = [
  { name: 'Filter', params: [{ id: 'filter-mod', label: 'Filter modulation', cc: 17, source: 'manual' }] },
  { name: 'ADSR', params: [{ id: 'adsr-attack', label: 'Attack', cc: null, source: 'chart' }] },
];

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = value; },
  };
}

test('an override replaces the shipped number and is marked as the user\'s', () => {
  const result = applyOverrides(groups, { 'adsr-attack': 73 });
  assert.equal(result[1].params[0].cc, 73);
  assert.equal(result[1].params[0].source, 'user');
});

test('parameters without an override are left alone', () => {
  const result = applyOverrides(groups, { 'adsr-attack': 73 });
  assert.equal(result[0].params[0].cc, 17);
  assert.equal(result[0].params[0].source, 'manual');
});

test('applying overrides does not mutate the shipped map', () => {
  applyOverrides(groups, { 'filter-mod': 99 });
  assert.equal(groups[0].params[0].cc, 17);
});

test('controller numbers outside 0-127 are not valid', () => {
  assert.ok(isValidCc(0) && isValidCc(127));
  assert.ok(!isValidCc(-1) && !isValidCc(128) && !isValidCc(1.5) && !isValidCc('5'));
});

test('stored overrides round-trip', () => {
  const storage = fakeStorage();
  saveOverrides({ 'adsr-attack': 73 }, storage);
  assert.deepEqual(loadOverrides(storage), { 'adsr-attack': 73 });
});

test('corrupt or out-of-range stored values are discarded, not sent', () => {
  const storage = fakeStorage();
  saveOverrides({ good: 40, bad: 999, alsoBad: 'x' }, storage);
  assert.deepEqual(loadOverrides(storage), { good: 40 });

  assert.deepEqual(loadOverrides(fakeStorage({ 'juno66.cc-overrides.v1': 'not json' })), {});
  assert.deepEqual(loadOverrides(fakeStorage({ 'juno66.cc-overrides.v1': '[1,2]' })), {});
});

test('storage being unavailable is survivable', () => {
  const throwing = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.deepEqual(loadOverrides(throwing), {});
  assert.equal(saveOverrides({ a: 1 }, throwing), false);
  assert.deepEqual(loadOverrides(undefined), {});
});

test('the exported map lists every parameter with its resolved number', () => {
  const exported = JSON.parse(exportMap(groups, { 'adsr-attack': 73 }));
  assert.equal(exported.firmware, 'V1.29');
  assert.equal(exported.parameters.length, 2);
  assert.deepEqual(exported.parameters[1], {
    group: 'ADSR', id: 'adsr-attack', label: 'Attack', cc: 73, source: 'user',
  });
});
