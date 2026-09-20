import test from 'node:test';
import assert from 'node:assert/strict';
import {
  controlChange, describeMessage, formatBytes, isHousekeeping,
  noteName, noteOff, noteOn, parseSysexHex,
} from '../src/midi.js';

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

test('channel messages are decoded with 1-based channels', () => {
  assert.equal(describeMessage([0x90, 60, 100]), 'ch1 note on   C3 (60) vel 100');
  assert.equal(describeMessage([0x85, 60, 0]), 'ch6 note off  C3 (60)');
  assert.equal(describeMessage([0xb0, 17, 64]), 'ch1 CC 17 = 64');
  assert.equal(describeMessage([0xc3, 2]), 'ch4 program change 2 (play mode)');
});

test('a note on with zero velocity is a note off', () => {
  assert.equal(describeMessage([0x90, 60, 0]), 'ch1 note off  C3 (60)');
});

test('pitch bend is reported as a signed offset from centre', () => {
  assert.equal(describeMessage([0xe0, 0x00, 0x40]), 'ch1 pitch bend 0');
  assert.equal(describeMessage([0xe0, 0x00, 0x00]), 'ch1 pitch bend -8192');
});

test('note names follow the manual, with middle C as C3', () => {
  assert.equal(noteName(60), 'C3');
  assert.equal(noteName(36), 'C1');   // bottom of the mod's accepted range
  assert.equal(noteName(97), 'C#6');  // top of it
  assert.equal(noteName(0), 'C-2');   // the arpeggiator trigger note
});

test('system messages are named', () => {
  assert.equal(describeMessage([0xf8]), 'clock');
  assert.equal(describeMessage([0xfa]), 'start');
  assert.equal(describeMessage([0xfc]), 'stop');
});

test('clock and active sensing are flagged as housekeeping', () => {
  assert.ok(isHousekeeping([0xf8]));
  assert.ok(isHousekeeping([0xfe]));
  assert.ok(!isHousekeeping([0x90, 60, 100]));
  assert.ok(!isHousekeeping([0xb0, 17, 0]));
});
