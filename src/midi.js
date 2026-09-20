// Web MIDI access and outbound message helpers.
//
// SysEx permission is requested up front: the tuning dumps are SysEx, so
// without it the most interesting half of this tool cannot work. Chrome
// prompts once per origin. Firefox 108+ also implements this; Safari does not
// ship Web MIDI at all.

export class MidiUnavailableError extends Error {}

/** @returns {Promise<MIDIAccess>} */
export async function requestMidiAccess() {
  if (!navigator.requestMIDIAccess) {
    throw new MidiUnavailableError(
      'This browser has no Web MIDI API. Use Chrome or Firefox 108+ — Safari does not support it.',
    );
  }
  if (!window.isSecureContext) {
    throw new MidiUnavailableError(
      'Web MIDI needs a secure context. Open this over http://localhost rather than as a file:// URL.',
    );
  }
  try {
    return await navigator.requestMIDIAccess({ sysex: true });
  } catch (cause) {
    throw new MidiUnavailableError(
      `MIDI access was refused: ${cause.message.replace(/\.$/, '')}. `
      + 'SysEx permission is required for tuning dumps.',
      { cause },
    );
  }
}

export function listOutputs(access) {
  return [...access.outputs.values()].map((port) => ({
    id: port.id,
    label: [port.name, port.manufacturer].filter(Boolean).join(' — '),
    port,
  }));
}

/** Control change. `channel` is 1-16 as printed on hardware, not 0-15. */
export function controlChange(channel, controller, value) {
  assertRange(channel, 1, 16, 'channel');
  assertRange(controller, 0, 127, 'controller');
  assertRange(value, 0, 127, 'value');
  return Uint8Array.from([0xb0 | (channel - 1), controller, value]);
}

export function noteOn(channel, note, velocity = 100) {
  assertRange(channel, 1, 16, 'channel');
  assertRange(note, 0, 127, 'note');
  assertRange(velocity, 0, 127, 'velocity');
  return Uint8Array.from([0x90 | (channel - 1), note, velocity]);
}

export function noteOff(channel, note) {
  assertRange(channel, 1, 16, 'channel');
  assertRange(note, 0, 127, 'note');
  return Uint8Array.from([0x80 | (channel - 1), note, 0]);
}

/**
 * Parse a hand-typed SysEx string: whitespace-separated hex bytes, with or
 * without the enclosing F0/F7, which are added when missing.
 */
export function parseSysexHex(text) {
  const tokens = text.trim().split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) throw new SyntaxError('no bytes given');

  const bytes = tokens.map((token) => {
    const byte = Number.parseInt(token.replace(/^0x/i, ''), 16);
    if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) {
      throw new SyntaxError(`not a hex byte: ${token}`);
    }
    return byte;
  });

  if (bytes[0] !== 0xf0) bytes.unshift(0xf0);
  if (bytes.at(-1) !== 0xf7) bytes.push(0xf7);

  const interior = bytes.slice(1, -1);
  const bad = interior.findIndex((byte) => byte > 0x7f);
  if (bad !== -1) {
    throw new SyntaxError(
      `byte ${bad + 1} is 0x${interior[bad].toString(16)}; SysEx data bytes must be 0x00-0x7f`,
    );
  }
  return Uint8Array.from(bytes);
}

export function formatBytes(bytes, { limit = 32 } = {}) {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0').toUpperCase());
  if (hex.length <= limit) return hex.join(' ');
  return `${hex.slice(0, limit).join(' ')} … (${hex.length} bytes total)`;
}

function assertRange(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer ${min}-${max}, got ${value}`);
  }
}
