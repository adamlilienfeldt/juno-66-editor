import test from 'node:test';
import assert from 'node:assert/strict';
import { controlChange, formatBytes, noteOff, noteOn, parseSysexHex } from '../src/midi.js';

test('channels are 1-16 on the wire as 0-15', () => {
  assert.deepEqual([...controlChange(1, 5, 64)], [0xb0, 5, 64]);
  assert.deepEqual([...controlChange(16, 5, 64)], [0xbf, 5, 64]);
  assert.deepEqual([...noteOn(1, 60, 100)], [0x90, 60, 100]);
  assert.deepEqual([...noteOff(10, 60)], [0x89, 60, 0]);
});

test('out-of-range arguments are rejected', () => {
  assert.throws(() => controlChange(0, 5, 64), RangeError);
  assert.throws(() => controlChange(17, 5, 64), RangeError);
  assert.throws(() => controlChange(1, 128, 64), RangeError);
  assert.throws(() => controlChange(1, 5, -1), RangeError);
});

test('sysex framing is added when omitted', () => {
  assert.deepEqual([...parseSysexHex('7E 00 08 01')], [0xf0, 0x7e, 0x00, 0x08, 0x01, 0xf7]);
  assert.deepEqual([...parseSysexHex('F0 7E F7')], [0xf0, 0x7e, 0xf7]);
});

test('sysex accepts 0x prefixes, commas and odd spacing', () => {
  assert.deepEqual([...parseSysexHex('0x7e,  00 ,0X08')], [0xf0, 0x7e, 0x00, 0x08, 0xf7]);
});

test('sysex rejects status bytes in the payload', () => {
  assert.throws(() => parseSysexHex('7E 80 01'), /must be 0x00-0x7f/);
  assert.throws(() => parseSysexHex(''), /no bytes/);
  assert.throws(() => parseSysexHex('zz'), /not a hex byte/);
});

test('long byte runs are elided rather than dumped whole', () => {
  assert.equal(formatBytes([0xf0, 0x0a]), 'F0 0A');
  const long = formatBytes(new Uint8Array(408), { limit: 4 });
  assert.match(long, /^00 00 00 00 … \(408 bytes total\)$/);
});
