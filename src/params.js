// Parameter map for the Tubbutec juno-66.
//
// !! READ THIS BEFORE TRUSTING ANY NUMBER IN THIS FILE !!
//
// The authoritative source is the CC table in the appendix of the juno-66 user
// manual for the firmware actually installed in the synth - the map has
// changed between firmware releases (1.25, 1.29 and later each ship their own
// manual). Nothing here has been checked against that table.
//
// Every entry carries a `confidence`:
//
//   'documented'    - seen in Tubbutec's own documentation, but not verified
//                     against the manual for a specific firmware version.
//   'midi-standard' - the number the MIDI specification assigns to this
//                     function. Plausible, but the mod is free to ignore it.
//   'guess'         - a placeholder. Almost certainly wrong.
//
// The UI shows this, and refuses to hide an unverified control behind a
// confident-looking slider. Use the Discovery panel to find the real numbers
// by ear, then correct this file and drop the confidence note.

/**
 * @typedef {object} Param
 * @property {string} id
 * @property {string} label
 * @property {'cc'} kind
 * @property {number} cc          Controller number.
 * @property {number} [min]       Lowest useful value (default 0).
 * @property {number} [max]       Highest useful value (default 127).
 * @property {number} [initial]
 * @property {'documented'|'midi-standard'|'guess'} confidence
 * @property {string} [note]      Shown next to the control.
 */

/** @type {{ name: string, params: Param[] }[]} */
export const PARAM_GROUPS = [
  {
    name: 'Portamento',
    params: [
      {
        id: 'porta-switch',
        label: 'Portamento on/off',
        kind: 'cc',
        cc: 65,
        min: 0,
        max: 127,
        initial: 0,
        confidence: 'midi-standard',
        note: 'CC 65 is the MIDI standard portamento switch (0-63 off, 64-127 on).',
      },
      {
        id: 'porta-time',
        label: 'Portamento time',
        kind: 'cc',
        cc: 5,
        initial: 0,
        confidence: 'midi-standard',
        note: 'CC 5 is the MIDI standard portamento time. Unconfirmed on the juno-66.',
      },
      {
        id: 'porta-data-entry',
        label: 'Slow / fast time (data entry)',
        kind: 'cc',
        cc: 6,
        initial: 64,
        confidence: 'documented',
        note:
          'Tubbutec documents the exact slow and fast portamento times as settable ' +
          'via CC 6 or the config menu. CC 6 is data entry MSB, so it very likely ' +
          'sets whichever parameter the config menu currently has selected rather ' +
          'than addressing portamento directly.',
      },
      {
        id: 'porta-range-2',
        label: 'Portamento (RANGE = 2)',
        kind: 'cc',
        cc: 28,
        initial: 0,
        confidence: 'documented',
        note: 'Referenced for portamento when the RANGE switch is set to 2.',
      },
      {
        id: 'porta-range-3',
        label: 'Portamento (RANGE = 3)',
        kind: 'cc',
        cc: 29,
        initial: 0,
        confidence: 'documented',
        note: 'Referenced for portamento when the RANGE switch is set to 3.',
      },
    ],
  },
  {
    name: 'Filter',
    params: [
      {
        id: 'filter-mod',
        label: 'Filter modulation',
        kind: 'cc',
        cc: 17,
        initial: 0,
        confidence: 'documented',
        note: 'Tubbutec documents CC 17 as modulating the filter.',
      },
    ],
  },
];

/** Built-in temperaments selectable in the juno-66 config menu.
 *  Listed so the UI can name them; selecting one over MIDI is not yet mapped. */
export const BUILT_IN_TEMPERAMENTS = Object.freeze([
  'Equal temperament',
  'Pythagorean',
  'Werckmeister III',
  'Werckmeister IV',
  'Werckmeister V',
  'Quarter-comma meantone',
  'Harmonic',
]);

export const CONFIDENCE_LABELS = Object.freeze({
  documented: { text: 'documented', hint: "Seen in Tubbutec's documentation, unverified against your firmware." },
  'midi-standard': { text: 'MIDI standard', hint: 'The MIDI spec default for this function. The mod may not implement it.' },
  guess: { text: 'guess', hint: 'A placeholder. Expect it to be wrong.' },
});
