import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMidnam, controlsFor } from '../src/midnam.js';
import { PARAM_GROUPS, PLAY_MODES } from '../src/params.js';

const groups = [
  {
    name: 'Sample & hold filter LFO',
    params: [
      { id: 'sh-amount', label: 'Amount', cc: 18, source: 'chart' },
      { id: 'sh-divider', label: 'MIDI clk div', cc: 19, source: 'chart' },
    ],
  },
  {
    name: 'Filter',
    params: [
      { id: 'filter-mod', label: 'Cutoff mod', cc: 17, source: 'manual' },
      { id: 'nameless', label: 'Unmapped', cc: null, source: 'chart' },
    ],
  },
];

const modes = ['Poly', 'Duo'];

test('controls carry their group and come out in controller order', () => {
  const controls = controlsFor(groups);
  assert.deepEqual(controls.map((c) => c.cc), [17, 18, 19]);
  assert.equal(controls[0].name, 'Filter — Cutoff mod');
  assert.equal(controls[1].name, 'Sample & hold filter LFO — Amount');
});

test('a parameter with no controller number is left out', () => {
  assert.equal(controlsFor(groups).some((c) => c.name.includes('Unmapped')), false);
});

test('overrides reach the document, so a corrected number exports', () => {
  const xml = buildMidnam(groups, modes, { 'sh-amount': 100 });
  assert.match(xml, /<Control Type="7bit" Number="100" Name="Sample &amp; hold filter LFO — Amount"\/>/);
  assert.equal(xml.includes('Number="18"'), false);
});

test('a controller number is named once even if two parameters claim it', () => {
  // Hand-edited numbers allow a collision; the document must not list one twice.
  const controls = controlsFor(groups, { 'sh-amount': 17 });
  assert.deepEqual(controls.map((c) => c.cc), [17, 19]);
  assert.equal(controls.filter((c) => c.cc === 17).length, 1);
});

test('XML special characters in a group name are escaped', () => {
  const xml = buildMidnam(groups, modes);
  assert.match(xml, /Name="Sample &amp; hold filter LFO — Amount"/);
  assert.equal(xml.includes('Name="Sample & hold'), false);
});

test('play modes become a patch bank addressed by program number', () => {
  const xml = buildMidnam(groups, modes);
  assert.match(xml, /<Patch Number="0" Name="Poly" ProgramChange="0"\/>/);
  assert.match(xml, /<Patch Number="1" Name="Duo" ProgramChange="1"\/>/);
});

test('the document is addressed to all sixteen channels', () => {
  const xml = buildMidnam(groups, modes);
  assert.equal((xml.match(/<ChannelNameSetAssign /g) ?? []).length, 16);
  assert.equal((xml.match(/<AvailableChannel /g) ?? []).length, 16);
  assert.match(xml, /Channel="16"/);
});

test('the real parameter map produces a well-formed document', () => {
  const xml = buildMidnam(PARAM_GROUPS, PLAY_MODES, {}, new Date('2026-09-21'));

  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /MIDINameDocument10\.dtd/);
  assert.match(xml, /<Author>juno-66 editor, 2026-09-21<\/Author>/);

  // Every mapped parameter is named, and the play modes are all present.
  const mapped = PARAM_GROUPS.flatMap((g) => g.params).filter((p) => p.cc !== null);
  assert.equal((xml.match(/<Control /g) ?? []).length, mapped.length);
  for (const mode of PLAY_MODES) assert.ok(xml.includes(`Name="${mode}"`), mode);

  // Tags balance — a cheap stand-in for a parser the repo does not depend on.
  for (const tag of ['MIDINameDocument', 'MasterDeviceNames', 'ChannelNameSet', 'ControlNameList']) {
    assert.equal((xml.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length, 1, tag);
    assert.equal((xml.match(new RegExp(`</${tag}>`, 'g')) ?? []).length, 1, tag);
  }
});
