// Parameter map for the Tubbutec juno-66, firmware V1.29.
//
// Sourced from the prose of the V1.29 user manual. The manual's full MIDI
// controller chart is a figure in the Appendix (page 23) rather than text, so
// the numbers it alone carries are not here. Those parameters are listed with
// `cc: null` and can be filled in from the chart in the UI, which remembers
// them and can export the result.
//
// `source` records where each number came from:
//
//   'manual'    - stated in the body text of the V1.29 manual.
//   'conflict'  - the manual gives this number two different meanings.
//   'chart'     - named as MIDI-controllable, but the number is only in the
//                 Appendix chart. `cc` is null until someone fills it in.
//
// Note the manual's own warning about the chart: its controller numbers are
// 0-127, so a controller that displays 1-128 is offset by one.

/**
 * @typedef {object} Param
 * @property {string} id
 * @property {string} label
 * @property {number|null} cc
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [initial]
 * @property {'manual'|'conflict'|'chart'} source
 * @property {string} [note]
 */

/** @type {{ name: string, blurb?: string, params: Param[] }[]} */
export const PARAM_GROUPS = [
  {
    name: 'Portamento',
    blurb:
      'The RANGE switch on the panel selects the speed: 1 is off, 2 is fast, '
      + '3 is slow. MIDI sets what "fast" and "slow" actually mean.',
    params: [
      {
        id: 'porta-time',
        label: 'Portamento time (slow / fast)',
        cc: 6,
        initial: 64,
        source: 'conflict',
        note:
          'The manual states the exact slow and fast times "can be set using midi CC 6 '
          + 'or the config menu 11" — but the same manual also gives CC 6 for fatness, '
          + 'while separately naming CC 27 for fatness. One of the two is a copy-paste '
          + 'error. Verify by ear before trusting it. Note that CC 6 is data entry MSB, '
          + 'so it may act on whatever the config menu has selected. Which of slow or '
          + 'fast it sets likely depends on the RANGE switch position.',
      },
    ],
  },
  {
    name: 'Voice thickness',
    blurb: 'Applies to Duo, Three Voice and both Mono modes.',
    params: [
      {
        id: 'fatness',
        label: 'Fatness',
        cc: 27,
        initial: 0,
        source: 'manual',
        note: 'Stated twice in the manual, in the Duo and Mono sections alike.',
      },
      {
        id: 'detune',
        label: 'Detune',
        cc: 26,
        initial: 0,
        source: 'manual',
        note: 'Stated twice in the manual, in the Duo and Mono sections alike.',
      },
    ],
  },
  {
    name: 'Filter',
    params: [
      {
        id: 'filter-mod',
        label: 'Filter modulation',
        cc: 17,
        initial: 0,
        source: 'manual',
        note:
          'The manual is explicit: "Controller messages received on controller number 17 '
          + 'will modulate the filter. The default value is 0." If this does nothing, the '
          + 'filter cable may not be soldered to the right point on the Juno board.',
      },
    ],
  },
  {
    name: 'Filter ADSR',
    blurb:
      'A global envelope shared by all voices, not one per voice. Ranges run from a '
      + 'few milliseconds to about 5 seconds, on a logarithmic control law.',
    params: [
      { id: 'adsr-delay', label: 'Delay', cc: null, source: 'chart', note: 'Time before the attack phase begins, 0 to 5 seconds.' },
      { id: 'adsr-attack', label: 'Attack', cc: null, source: 'chart' },
      { id: 'adsr-decay', label: 'Decay', cc: null, source: 'chart' },
      { id: 'adsr-sustain', label: 'Sustain', cc: null, source: 'chart' },
      { id: 'adsr-release', label: 'Release', cc: null, source: 'chart' },
      { id: 'adsr-amount', label: 'Amount', cc: null, source: 'chart' },
      {
        id: 'adsr-looping',
        label: 'Looping mode',
        cc: null,
        source: 'chart',
        note: 'Above 63 is on: the envelope restarts its attack on reaching sustain, until the gate closes.',
      },
      {
        id: 'adsr-polarity',
        label: 'Polarity',
        cc: null,
        source: 'chart',
        note: 'Above 63 inverts the envelope. The Juno can only output positive values, so zero then sits at the amount setting.',
      },
    ],
  },
  {
    name: 'Triangle filter LFO',
    blurb: 'Frequency spans 0.12 Hz to 8 kHz across the coarse and fine controls.',
    params: [
      { id: 'tri-coarse', label: 'Frequency (coarse)', cc: null, source: 'chart' },
      { id: 'tri-fine', label: 'Frequency (fine)', cc: null, source: 'chart' },
      { id: 'tri-amount', label: 'Amount', cc: null, source: 'chart' },
    ],
  },
  {
    name: 'Sample & hold filter LFO',
    params: [
      { id: 'sh-amount', label: 'Amount', cc: null, source: 'chart' },
      {
        id: 'sh-divider',
        label: 'MIDI clock divider',
        cc: null,
        source: 'chart',
        note: 'Only applies when the S/H clock source is set to MIDI clock in the config menu.',
      },
    ],
  },
  {
    name: 'Arpeggiator',
    params: [
      {
        id: 'arp-divider',
        label: 'MIDI clock divider',
        cc: null,
        source: 'chart',
        note: 'Only applies when the arp clock source is set to MIDI clock in the config menu.',
      },
    ],
  },
];

/** MIDI notes the mod acts on, rather than passes over. */
export const TRIGGER_NOTES = Object.freeze([
  { note: 0, label: 'Arpeggiator trigger' },
  { note: 1, label: 'Sample & hold trigger' },
]);

/** The mod accepts notes 36-97 only — six octaves, C0 to C5. */
export const NOTE_RANGE = Object.freeze({ min: 36, max: 97 });

/** Built-in scales, selectable from the config menu under the Scale key. */
export const BUILT_IN_TEMPERAMENTS = Object.freeze([
  'Pythagorean', 'Werckmeister III', 'Werckmeister IV', 'Werckmeister V',
  'Quarter-comma meantone', 'Harmonic',
]);

export const SOURCE_LABELS = Object.freeze({
  manual: { text: 'manual', hint: 'Stated in the body text of the V1.29 manual.' },
  conflict: { text: 'conflicting', hint: 'The manual gives this number two different meanings. Verify by ear.' },
  chart: { text: 'needs chart', hint: 'MIDI-controllable, but the number is only in the Appendix chart on page 23. Enter it here.' },
});
