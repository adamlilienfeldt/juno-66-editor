// Scale representation, built-in temperaments, and Scala .scl import.
//
// A scale is a list of cents values above the tonic, ascending, where the
// final value is the period (1200 for an octave). The implicit 1/1 at 0 cents
// is never listed, matching the Scala .scl convention.

/** @typedef {{ name: string, degrees: number[], description?: string }} Scale */

const EQUAL = Array.from({ length: 12 }, (_, i) => (i + 1) * 100);

/** Temperaments worth starting from. The juno-66 has its own built-in set;
 *  these exist so a custom slot can be built and edited from a known base. */
export const BUILT_IN_SCALES = Object.freeze([
  { name: '12-tone equal temperament', degrees: EQUAL },
  {
    name: 'Pythagorean (on C)',
    degrees: [
      90.225, 203.91, 294.135, 407.82, 498.045, 611.73,
      701.955, 792.18, 905.865, 996.09, 1109.775, 1200,
    ],
  },
  {
    name: 'Quarter-comma meantone (on C)',
    degrees: [
      76.049, 193.157, 310.265, 386.314, 503.422, 579.471,
      696.578, 772.627, 889.735, 1006.843, 1082.892, 1200,
    ],
  },
  {
    name: 'Werckmeister III',
    degrees: [
      90.225, 192.18, 294.135, 390.225, 498.045, 588.27,
      696.09, 792.18, 888.27, 996.09, 1092.18, 1200,
    ],
  },
  {
    name: 'Just intonation (5-limit major)',
    degrees: [
      111.731, 203.91, 315.641, 386.314, 498.045, 590.224,
      701.955, 813.686, 884.359, 996.09, 1088.269, 1200,
    ],
  },
  {
    name: 'Bohlen-Pierce (equal, 13 per tritave)',
    degrees: Array.from({ length: 13 }, (_, i) => ((i + 1) * 1901.955) / 13),
  },
]);

/**
 * Map a scale across the whole MIDI note range.
 *
 * `rootNote` is the MIDI note that sits on the tonic, and `rootFrequency` is
 * its pitch in Hz. Degrees repeat every period, which need not be an octave -
 * that is the point of allowing a non-1200 final degree.
 *
 * Returns 128 frequencies in Hz, one per MIDI note.
 */
export function scaleToFrequencies(scale, { rootNote = 60, rootFrequency = 261.6255653 } = {}) {
  const { degrees } = scale;
  if (!Array.isArray(degrees) || degrees.length === 0) {
    throw new RangeError('scale must have at least one degree');
  }
  const period = degrees[degrees.length - 1];
  if (!(period > 0)) {
    throw new RangeError(`scale period must be positive, got ${period}`);
  }
  // Degree 0 is the implicit tonic; degrees 1..n-1 are the listed steps below
  // the period. The final entry closes the scale rather than being a step.
  const steps = [0, ...degrees.slice(0, -1)];

  return Array.from({ length: 128 }, (_, note) => {
    const index = note - rootNote;
    // Floor division so notes below the root land on the right period.
    const periodIndex = Math.floor(index / steps.length);
    const degreeIndex = index - periodIndex * steps.length;
    const cents = periodIndex * period + steps[degreeIndex];
    return rootFrequency * 2 ** (cents / 1200);
  });
}

/**
 * Parse a Scala .scl file.
 *
 * Format: `!` starts a comment line. The first non-comment line is a free-text
 * description, the second is the degree count, and the remaining lines are the
 * degrees - either cents (any token containing a '.') or a ratio ("3/2", "2").
 */
export function parseScl(text, fallbackName = 'Imported scale') {
  const lines = text.split(/\r?\n/);
  const payload = [];
  for (const line of lines) {
    if (line.trimStart().startsWith('!')) continue;
    payload.push(line.trim());
  }
  if (payload.length < 2) {
    throw new SyntaxError('not a Scala scale file: missing description or note count');
  }

  const description = payload[0];
  const declaredCount = Number.parseInt(payload[1], 10);
  if (!Number.isInteger(declaredCount) || declaredCount < 1) {
    throw new SyntaxError(`invalid note count: ${payload[1]}`);
  }

  const degrees = [];
  for (const line of payload.slice(2)) {
    if (line === '') continue;
    if (degrees.length === declaredCount) break;
    degrees.push(parseDegree(line));
  }
  if (degrees.length !== declaredCount) {
    throw new SyntaxError(
      `scale declares ${declaredCount} notes but ${degrees.length} were found`,
    );
  }

  return { name: description || fallbackName, degrees, description };
}

function parseDegree(line) {
  // Only the first token matters; Scala allows trailing comments after it.
  const token = line.split(/\s+/)[0];

  if (token.includes('.')) {
    const cents = Number.parseFloat(token);
    if (!Number.isFinite(cents)) throw new SyntaxError(`invalid cents value: ${token}`);
    return cents;
  }

  const [numerator, denominator = '1'] = token.split('/');
  const n = Number.parseInt(numerator, 10);
  const d = Number.parseInt(denominator, 10);
  if (!Number.isInteger(n) || !Number.isInteger(d) || n <= 0 || d <= 0) {
    throw new SyntaxError(`invalid ratio: ${token}`);
  }
  return 1200 * Math.log2(n / d);
}

/** Render a scale back out as .scl text, for round-tripping into Scala. */
export function formatScl(scale) {
  const header = [
    `! ${scale.name.replace(/\s+/g, '_')}.scl`,
    '!',
    scale.description || scale.name,
    ` ${scale.degrees.length}`,
    '!',
  ];
  const body = scale.degrees.map((cents) => ` ${cents.toFixed(6)}`);
  return [...header, ...body, ''].join('\n');
}
