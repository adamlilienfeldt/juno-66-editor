// MIDI Tuning Standard (MTS) encoding.
//
// Reference: MIDI Manufacturers Association, "MIDI Tuning Specification"
// (MIDI 1.0 Detailed Specification, section on Universal System Exclusive
// non-realtime sub-ID 08H).
//
// The Tubbutec juno-66 accepts BULK TUNING DUMP messages (sub-ID2 01H) into
// one of four custom scale slots, addressed by the tuning program number.
// Tubbutec documents device ID 0 and MTS presets 0-3.

export const MTS_NO_CHANGE = Object.freeze([0x7f, 0x7f, 0x7f]);

// Highest pitch the 3-byte format can express: note 127 plus 16383/16384 of a
// semitone. Note 127 with fraction 0x3fff is the documented ceiling.
const MAX_NOTE_NUMBER = 127 + 16383 / 16384;

/**
 * Encode a fractional MIDI note number as the MTS 3-byte pitch representation:
 * [semitone, fractionMsb, fractionLsb]. The fraction is a 14-bit value
 * spanning one semitone, so one step is 100/16384 cents (~0.0061 cents).
 */
export function noteNumberToMtsBytes(noteNumber) {
  if (!Number.isFinite(noteNumber)) {
    throw new RangeError(`note number must be finite, got ${noteNumber}`);
  }
  const clamped = Math.min(Math.max(noteNumber, 0), MAX_NOTE_NUMBER);
  let semitone = Math.floor(clamped);
  let fraction = Math.round((clamped - semitone) * 16384);
  if (fraction === 16384) {
    // Rounding carried the fraction into the next semitone.
    semitone += 1;
    fraction = 0;
  }
  if (semitone > 127) {
    semitone = 127;
    fraction = 16383;
  }
  return [semitone, (fraction >> 7) & 0x7f, fraction & 0x7f];
}

/** Encode a frequency in Hz, using the standard A4 = 440 Hz reference. */
export function frequencyToMtsBytes(hz) {
  if (!(hz > 0)) {
    throw new RangeError(`frequency must be positive, got ${hz}`);
  }
  return noteNumberToMtsBytes(69 + 12 * Math.log2(hz / 440));
}

function encodeName(name) {
  // 16 ASCII characters, space padded. Anything outside printable ASCII would
  // put a byte >= 0x80 into the SysEx stream, which is not legal.
  const bytes = new Array(16).fill(0x20);
  for (let i = 0; i < Math.min(name.length, 16); i += 1) {
    const code = name.charCodeAt(i);
    bytes[i] = code >= 0x20 && code <= 0x7e ? code : 0x20;
  }
  return bytes;
}

/**
 * Build a BULK TUNING DUMP message.
 *
 * `frequencies` is 128 entries, one per MIDI note. Each entry is either a
 * frequency in Hz (number) or `null` to send the reserved "no change" value.
 *
 * The checksum is an XOR over the message body. The published spec text is
 * ambiguous about whether the device ID participates — circulating copies of
 * the document disagree, and implementations in the wild differ. We follow the
 * common convention (device ID included); `checksumIncludesDeviceId: false`
 * switches to the other reading if a device rejects the dump.
 *
 * @param {object} options
 * @param {number} [options.deviceId] 0-127; Tubbutec documents 0 for the juno-66.
 * @param {number} [options.program] Tuning program 0-127; the juno-66's four slots are 0-3.
 * @param {string} [options.name] Up to 16 printable ASCII characters.
 * @param {(number|null)[]} options.frequencies 128 entries, Hz or null for "no change".
 * @param {boolean} [options.checksumIncludesDeviceId] False excludes the device ID.
 * @returns {Uint8Array} A complete SysEx message, F0 through F7.
 */
export function buildBulkTuningDump({
  deviceId = 0,
  program = 0,
  name = '',
  frequencies,
  checksumIncludesDeviceId = true,
} = {}) {
  if (!Array.isArray(frequencies) || frequencies.length !== 128) {
    throw new RangeError(
      `frequencies must be an array of 128 entries, got ${frequencies?.length}`,
    );
  }
  assertSevenBit(deviceId, 'deviceId');
  assertSevenBit(program, 'program');

  const pitchBytes = [];
  for (const [note, hz] of frequencies.entries()) {
    if (hz === null || hz === undefined) {
      pitchBytes.push(...MTS_NO_CHANGE);
      continue;
    }
    try {
      pitchBytes.push(...frequencyToMtsBytes(hz));
    } catch (cause) {
      throw new RangeError(`note ${note}: ${cause.message}`, { cause });
    }
  }

  const header = [0x7e, deviceId, 0x08, 0x01, program];
  const body = [...header, ...encodeName(name), ...pitchBytes];

  const checksumOver = checksumIncludesDeviceId
    ? body
    : body.filter((_, i) => i !== 1);
  const checksum = checksumOver.reduce((acc, byte) => acc ^ byte, 0) & 0x7f;

  return Uint8Array.from([0xf0, ...body, checksum, 0xf7]);
}

function assertSevenBit(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 127) {
    throw new RangeError(`${label} must be an integer 0-127, got ${value}`);
  }
}
