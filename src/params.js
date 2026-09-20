// Parameter map for the Tubbutec juno-66, firmware V1.29.
//
// Sourced from the V1.29 user manual: the body prose, plus the MIDI controller
// chart in the Appendix (page 23), which is a figure rather than text and was
// transcribed by hand from:
//
//   https://tubbutec.de/files/Tubbutec%20Juno-66%20Manual%20Remix.pdf
//
//
// `source` records where each number came from:
//
//   'manual'    - stated in the body text of the V1.29 manual.
//   'chart'     - read off the Appendix controller chart on page 23.
//   'conflict'  - chart and body text disagree. Verify by ear.
//
// Note the chart's own warning: its controller numbers are 0-127, so a
// controller that displays 1-128 is offset by one.
//
// Chart rows deliberately left out of the map, all of which the UI has no
// business sending blind: 21 and 22 (CV2 and CV3, only if those outputs are
// installed), 35 and 36 (seq and S/H LFO clock source, switches with no stated
// range), 64 (sustain), 120 (all sound off) and 123 (all notes off).

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
        id: 'porta-fast',
        label: 'Fast',
        cc: 28,
        initial: 64,
        source: 'conflict',
        note:
          'The chart gives 28 for fast and 29 for slow. The body text instead says the '
          + 'times "can be set using midi CC 6 or the config menu 11" — the same sentence '
          + 'pattern that misattributes CC 6 to fatness, so it is likely the error. '
          + 'CC 6 is data entry MSB and would act on whatever the config menu has '
          + 'selected. Trust 28 and 29, but confirm by ear.',
      },
      {
        id: 'porta-slow',
        label: 'Slow',
        cc: 29,
        initial: 64,
        source: 'conflict',
        note: 'See the note on fast: the body text names CC 6 for both speeds instead.',
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
        note: 'Stated twice in the manual and confirmed by the chart.',
      },
      {
        id: 'detune',
        label: 'Detune',
        cc: 26,
        initial: 0,
        source: 'manual',
        note: 'Stated twice in the manual and confirmed by the chart.',
      },
    ],
  },
  {
    name: 'Filter',
    params: [
      {
        id: 'filter-mod',
        label: 'Cutoff mod',
        cc: 17,
        initial: 0,
        source: 'manual',
        note:
          'The manual is explicit: "Controller messages received on controller number 17 '
          + 'will modulate the filter. The default value is 0." The chart names 17 filter '
          + 'cutoff. If this does nothing, the filter cable may not be soldered to the '
          + 'right point on the Juno board.',
      },
    ],
  },
  {
    name: 'Filter ADSR',
    blurb:
      'A global envelope shared by all voices, not one per voice. Ranges run from a '
      + 'few milliseconds to about 5 seconds, on a logarithmic control law.',
    params: [
      { id: 'adsr-delay', label: 'Delay', cc: 37, source: 'chart', note: 'Time before the attack phase begins, 0 to 5 seconds.' },
      { id: 'adsr-attack', label: 'Attack', cc: 30, source: 'chart' },
      { id: 'adsr-decay', label: 'Decay', cc: 31, source: 'chart' },
      { id: 'adsr-sustain', label: 'Sustain', cc: 32, source: 'chart' },
      { id: 'adsr-release', label: 'Release', cc: 33, source: 'chart' },
      { id: 'adsr-amount', label: 'Amount', cc: 34, source: 'chart' },
      {
        id: 'adsr-looping',
        label: 'Looping mode',
        cc: 38,
        source: 'chart',
        note: 'Above 63 is on: the envelope restarts its attack on reaching sustain, until the gate closes.',
      },
      {
        id: 'adsr-polarity',
        label: 'Polarity',
        cc: 39,
        source: 'chart',
        note: 'Above 63 inverts the envelope. The Juno can only output positive values, so zero then sits at the amount setting.',
      },
    ],
  },
  {
    name: 'Triangle filter LFO',
    blurb: 'Frequency spans 0.12 Hz to 8 kHz across the coarse and fine controls.',
    params: [
      { id: 'tri-coarse', label: 'Freq coarse', cc: 23, source: 'chart' },
      { id: 'tri-fine', label: 'Freq fine', cc: 24, source: 'chart' },
      { id: 'tri-amount', label: 'Amount', cc: 25, source: 'chart' },
    ],
  },
  {
    name: 'Sample & hold filter LFO',
    params: [
      { id: 'sh-amount', label: 'Amount', cc: 18, source: 'chart' },
      {
        id: 'sh-divider',
        label: 'MIDI clk div',
        cc: 19,
        source: 'chart',
        note: 'Only applies when the S/H clock source is set to MIDI clock in the config menu.',
      },
    ],
  },
  {
    name: 'Arpeggiator',
    blurb:
      'The config menu gives the arpeggiator two separate divider settings — one under '
      + 'MIDI clock sync, one for its own clock — and the chart has a controller for each.',
    params: [
      {
        id: 'arp-midi-divider',
        label: 'MIDI clk div',
        cc: 16,
        source: 'chart',
        note: 'Chart row "Arp midi clock divider". Only applies when the arp clock source is set to MIDI clock in the config menu.',
      },
      {
        id: 'arp-divider',
        label: 'Clock div',
        cc: 20,
        source: 'chart',
        note:
          'Chart row "Arp clock divider", listed separately from 16. The config menu '
          + 'likewise lists "Midi Clk Div" and "Clk div" as two entries under ARP. If the '
          + 'two turn out to do the same thing, one of them is a chart duplicate.',
      },
    ],
  },
];

/**
 * Play modes, by program number. The mod both responds to program change and
 * sends it when the play mode is changed on the synth itself — the one panel
 * action it reports over MIDI. From the table on page 17 of the manual.
 */
export const PLAY_MODES = Object.freeze(['Poly', 'Duo', 'Mono', 'Chord', 'Polychord']);

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
  conflict: { text: 'conflicting', hint: 'The chart and the body text disagree on this number. Verify by ear.' },
  chart: { text: 'chart', hint: 'Read off the MIDI controller chart in the V1.29 manual Appendix, page 23.' },
});
