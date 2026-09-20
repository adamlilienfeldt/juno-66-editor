import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBulkTuningDump, frequencyToMtsBytes, noteNumberToMtsBytes } from '../src/mts.js';

const equalTemperament = Array.from({ length: 128 }, (_, n) => 440 * 2 ** ((n - 69) / 12));

test('A440 encodes as note 69 with no fractional part', () => {
  assert.deepEqual(frequencyToMtsBytes(440), [69, 0, 0]);
});

test('middle C encodes as note 60 with no fractional part', () => {
  assert.deepEqual(frequencyToMtsBytes(261.6255653), [60, 0, 0]);
});

test('a half semitone is the midpoint of the 14-bit fraction', () => {
  // 8192 = 0x2000 -> MSB 0x40, LSB 0x00
  assert.deepEqual(noteNumberToMtsBytes(69.5), [69, 64, 0]);
});

test('one fraction step is the smallest representable increment', () => {
  assert.deepEqual(noteNumberToMtsBytes(69 + 1 / 16384), [69, 0, 1]);
});

test('rounding up out of a semitone carries into the next one', () => {
  assert.deepEqual(noteNumberToMtsBytes(69 + 16383.6 / 16384), [70, 0, 0]);
});

test('pitches are clamped to the representable range', () => {
  assert.deepEqual(noteNumberToMtsBytes(-5), [0, 0, 0]);
  assert.deepEqual(noteNumberToMtsBytes(200), [127, 127, 127]);
});

test('a bulk dump is 408 bytes and correctly framed', () => {
  const dump = buildBulkTuningDump({ frequencies: equalTemperament });
  assert.equal(dump.length, 408);
  assert.equal(dump[0], 0xf0);
  assert.equal(dump.at(-1), 0xf7);
  assert.deepEqual([...dump.slice(1, 6)], [0x7e, 0x00, 0x08, 0x01, 0x00]);
});

test('no byte between the framing bytes has the high bit set', () => {
  const dump = buildBulkTuningDump({
    deviceId: 0,
    program: 3,
    name: 'Werckmeister III',
    frequencies: equalTemperament,
  });
  const interior = dump.slice(1, -1);
  assert.ok(interior.every((byte) => byte <= 0x7f), 'found a status byte inside the payload');
});

test('the checksum is the XOR of the body, masked to seven bits', () => {
  const dump = buildBulkTuningDump({ program: 2, name: 'test', frequencies: equalTemperament });
  const body = dump.slice(1, -2);
  const expected = body.reduce((acc, byte) => acc ^ byte, 0) & 0x7f;
  assert.equal(dump.at(-2), expected);
});

test('the device ID can be excluded from the checksum', () => {
  const args = { deviceId: 5, frequencies: equalTemperament };
  const included = buildBulkTuningDump({ ...args });
  const excluded = buildBulkTuningDump({ ...args, checksumIncludesDeviceId: false });
  assert.equal(included.at(-2) ^ excluded.at(-2), 5);
});

test('the name is padded to 16 characters and truncated when too long', () => {
  const short = buildBulkTuningDump({ name: 'hi', frequencies: equalTemperament });
  assert.equal(String.fromCharCode(...short.slice(6, 22)), 'hi              ');

  const long = buildBulkTuningDump({ name: 'a'.repeat(30), frequencies: equalTemperament });
  assert.equal(String.fromCharCode(...long.slice(6, 22)), 'a'.repeat(16));
});

test('non-ASCII characters in the name are replaced rather than emitted raw', () => {
  const dump = buildBulkTuningDump({ name: 'Pythagoräisch', frequencies: equalTemperament });
  assert.ok(dump.slice(6, 22).every((byte) => byte >= 0x20 && byte <= 0x7e));
});

test('null entries send the reserved no-change value', () => {
  const frequencies = [...equalTemperament];
  frequencies[0] = null;
  const dump = buildBulkTuningDump({ frequencies });
  assert.deepEqual([...dump.slice(22, 25)], [0x7f, 0x7f, 0x7f]);
});

test('malformed input is rejected', () => {
  assert.throws(() => buildBulkTuningDump({ frequencies: [440] }), RangeError);
  assert.throws(() => buildBulkTuningDump({ program: 128, frequencies: equalTemperament }), RangeError);
  assert.throws(() => buildBulkTuningDump({ deviceId: -1, frequencies: equalTemperament }), RangeError);
  assert.throws(() => frequencyToMtsBytes(0), RangeError);
});

test('a zero frequency names the note that caused it', () => {
  const frequencies = [...equalTemperament];
  frequencies[64] = 0;
  assert.throws(() => buildBulkTuningDump({ frequencies }), /note 64/);
});
