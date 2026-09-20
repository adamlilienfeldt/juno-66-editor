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

const describePort = (port) => ({
  id: port.id,
  label: [port.name, port.manufacturer].filter(Boolean).join(' — '),
  port,
});

export function listOutputs(access) {
  return [...access.outputs.values()].map(describePort);
}

export function listInputs(access) {
  return [...access.inputs.values()].map(describePort);
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Name a MIDI note the way the juno-66 manual does, with C3 as middle C. */
export function noteName(note) {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 2}`;
}

/** True for messages that arrive constantly and would drown out the rest. */
export function isHousekeeping(bytes) {
  const status = bytes[0];
  return status === 0xf8 || status === 0xfe; // clock, active sensing
}

/** Render an incoming message as a line of text for the monitor. */
export function describeMessage(bytes) {
  const status = bytes[0];
  const channel = (status & 0x0f) + 1;

  switch (status & 0xf0) {
    case 0x80:
      return `ch${channel} note off  ${noteName(bytes[1])} (${bytes[1]})`;
    case 0x90:
      return bytes[2] === 0
        ? `ch${channel} note off  ${noteName(bytes[1])} (${bytes[1]})`
        : `ch${channel} note on   ${noteName(bytes[1])} (${bytes[1]}) vel ${bytes[2]}`;
    case 0xa0:
      return `ch${channel} aftertouch ${noteName(bytes[1])} ${bytes[2]}`;
    case 0xb0:
      return `ch${channel} CC ${bytes[1]} = ${bytes[2]}`;
    case 0xc0:
      return `ch${channel} program change ${bytes[1]} (play mode)`;
    case 0xd0:
      return `ch${channel} channel pressure ${bytes[1]}`;
    case 0xe0:
      return `ch${channel} pitch bend ${((bytes[2] << 7) | bytes[1]) - 8192}`;
    default:
      break;
  }

  switch (status) {
    case 0xf0: return `sysex ${formatBytes(bytes, { limit: 12 })}`;
    case 0xf8: return 'clock';
    case 0xfa: return 'start';
    case 0xfb: return 'continue';
    case 0xfc: return 'stop';
    case 0xfe: return 'active sensing';
    case 0xff: return 'reset';
    default: return formatBytes(bytes);
  }
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
