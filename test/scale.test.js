import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILT_IN_SCALES, formatScl, parseScl, scaleToFrequencies } from '../src/scale.js';

const equal = BUILT_IN_SCALES[0];

test('equal temperament rooted at middle C puts A4 at 440 Hz', () => {
  const frequencies = scaleToFrequencies(equal, { rootNote: 60, rootFrequency: 261.6255653 });
  assert.ok(Math.abs(frequencies[69] - 440) < 1e-6, `got ${frequencies[69]}`);
});

test('every MIDI note gets a frequency', () => {
  const frequencies = scaleToFrequencies(equal);
  assert.equal(frequencies.length, 128);
  assert.ok(frequencies.every((hz) => hz > 0));
});

test('notes below the root are mapped into lower periods', () => {
  const frequencies = scaleToFrequencies(equal, { rootNote: 60, rootFrequency: 261.6255653 });
  assert.ok(Math.abs(frequencies[48] - 130.8127827) < 1e-6, `got ${frequencies[48]}`);
  assert.ok(Math.abs(frequencies[59] - 246.9416506) < 1e-6, `got ${frequencies[59]}`);
});

test('frequencies ascend monotonically', () => {
  for (const scale of BUILT_IN_SCALES) {
    const frequencies = scaleToFrequencies(scale);
    for (let i = 1; i < frequencies.length; i += 1) {
      assert.ok(frequencies[i] > frequencies[i - 1], `${scale.name} is not ascending at note ${i}`);
    }
  }
});

test('a non-octave period repeats at that period', () => {
  const bohlenPierce = BUILT_IN_SCALES.find((s) => s.name.startsWith('Bohlen-Pierce'));
  const frequencies = scaleToFrequencies(bohlenPierce, { rootNote: 60, rootFrequency: 440 });
  // 13 scale degrees later should be one tritave (3/1) up.
  assert.ok(Math.abs(frequencies[73] - 1320) < 1e-6, `got ${frequencies[73]}`);
});

test('scala files parse cents and ratios alike', () => {
  const scl = [
    '! pythagorean.scl',
    '!',
    'Pythagorean intonation',
    ' 3',
    '!',
    ' 203.910',
    ' 3/2',
    ' 2/1',
  ].join('\n');
  const scale = parseScl(scl);
  assert.equal(scale.name, 'Pythagorean intonation');
  assert.equal(scale.degrees.length, 3);
  assert.ok(Math.abs(scale.degrees[0] - 203.91) < 1e-6);
  assert.ok(Math.abs(scale.degrees[1] - 701.955) < 1e-3);
  assert.ok(Math.abs(scale.degrees[2] - 1200) < 1e-9);
});

test('a bare integer is read as a ratio over 1', () => {
  const scale = parseScl(['d', ' 2', '!', ' 3', ' 9'].join('\n'));
  assert.ok(Math.abs(scale.degrees[0] - 1901.955) < 1e-3);
  assert.ok(Math.abs(scale.degrees[1] - 3803.91) < 1e-2);
});

test('trailing comments after a degree are ignored', () => {
  const scale = parseScl(['d', ' 1', '!', ' 3/2 perfect fifth'].join('\n'));
  assert.ok(Math.abs(scale.degrees[0] - 701.955) < 1e-3);
});

test('a truncated or mislabelled scale file is rejected', () => {
  assert.throws(() => parseScl('!only a comment'), SyntaxError);
  assert.throws(() => parseScl(['d', ' 5', '!', ' 100.0'].join('\n')), /declares 5 notes/);
  assert.throws(() => parseScl(['d', ' 1', '!', ' 3/0'].join('\n')), /invalid ratio/);
});

test('scales round-trip through .scl text', () => {
  for (const scale of BUILT_IN_SCALES) {
    const reparsed = parseScl(formatScl(scale));
    assert.equal(reparsed.degrees.length, scale.degrees.length, scale.name);
    for (const [i, cents] of scale.degrees.entries()) {
      assert.ok(Math.abs(reparsed.degrees[i] - cents) < 1e-5, `${scale.name} degree ${i}`);
    }
  }
});
