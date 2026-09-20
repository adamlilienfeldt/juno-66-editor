# juno-66 editor

A browser UI for controlling a Roland Juno-60 fitted with the
[Tubbutec juno-66](https://tubbutec.de/juno-66/) mod over MIDI.

Two things it does:

- **Parameters** — sends control changes for things like portamento time.
- **Tuning** — builds and uploads custom scales into the mod's four user scale
  slots as MIDI Tuning Standard bulk dumps, without going through Scala.

No build step, no dependencies. Everything is plain ES modules.

## Running it

```sh
npm run serve      # http://localhost:8173
npm test           # unit tests for the encoders
```

It has to be *served* rather than opened as a `file://` URL: Web MIDI requires
a secure context, and `localhost` counts as one.

**Chrome or Firefox 108+.** Safari does not implement Web MIDI. The page asks
for SysEx permission on load, which the tuning dumps need.

## Hardware setup

```
Mac ──USB── MIDI interface ──DIN/TRS-A── juno-66 MIDI in
```

The juno-66 exposes MIDI on TRS-A jacks (DIN adapters are supplied with the
mod), so a USB-MIDI interface goes in between — there is no USB port on the mod
itself. Set the channel in the Connection panel to match the mod's receive
channel.

## Status of the parameter map

Built against the **firmware V1.29** user manual.

Four numbers come from the manual's body text and are in `src/params.js`:

| Parameter          | CC | Confidence                            |
| ------------------ | -- | ------------------------------------- |
| Filter modulation  | 17 | Stated explicitly, default value 0    |
| Fatness            | 27 | Stated twice, in Duo and Mono alike   |
| Detune             | 26 | Stated twice, in Duo and Mono alike   |
| Portamento time    | 6  | **Conflicting** — see below           |

The portamento section says the exact slow and fast times "can be set using
midi CC 6 or the config menu 11". But the Duo section says the same of
*fatness* — while also naming CC 27 for fatness two paragraphs later. One of
those is a copy-paste error in the manual. CC 6 is data entry MSB, which
suggests it acts on whatever the config menu currently has selected rather than
addressing portamento directly. Check it by ear.

Everything else the manual describes as MIDI-controllable — the filter ADSR,
both filter LFOs, the clock dividers — has its controller number **only in the
chart on page 23**, which is a figure rather than text. Those parameters ship
blank. Type the numbers into the CC field next to each one; the page remembers
them, and **Export CC map** writes them out as JSON.

### What the panel does vs. what MIDI does

Portamento speed is selected by the **RANGE** switch on the panel: 1 is off,
2 is fast, 3 is slow. MIDI does not choose between them — it sets what "fast"
and "slow" actually mean. There are also two portamento modes, Constant Time
(the default) and Constant Speed, selected only in config menu 11.

### Values set over MIDI are not saved automatically

From the manual: *"Parameters that are also controlled using midi are saved
when pressing any unused key in the config menu."* So the workflow for anything
you want to keep is:

1. Send the value from here until it sounds right.
2. On the synth, long-press KEY TRANSPOSE until it flashes.
3. Press any unused key to commit.
4. Press KEY TRANSPOSE again to leave.

Custom scales are the exception — those persist on upload.

### Other constraints worth knowing

- The mod accepts notes **36–97** only (six octaves, C0–C5).
- Note 0 triggers the arpeggiator and note 1 the sample & hold, when the config
  menu has them set to MIDI-note clocking.
- MIDI out runs on **two channels at once**: "as played" (the keyboard) and
  "as sounds" (what the arp, chord and mono modes actually produce). Both are
  configurable, or can be switched off, in the config menu.
- Program change messages switch play mode, in both directions. The number-to-
  mode table is also a figure, so the Received panel is the easiest way to read
  it off: change the mode on the panel and watch what arrives.
- If filter control does nothing, the manual's first suggestion is that the
  filter cable may not be soldered to the right point on the Juno board.

## Tuning

The tuning side is built on a published specification rather than on guesses,
so it should be correct as written.

Scales are edited as cents above the tonic, with the final degree acting as the
period — `1200` for an octave, or anything else for non-octave scales such as
the included Bohlen–Pierce. The juno-66 accepts any number of notes per period.
Scala `.scl` files import and export.

Tubbutec documents device ID `0` and MTS presets `0–3` for the four slots, and
the scales survive a power cycle.

One caveat: circulating copies of the MIDI Tuning Specification disagree about
whether the device ID participates in the SysEx checksum. The default includes
it; the **Device ID in checksum** toggle switches to the other reading if the
mod rejects a dump.

## Prior art

Worth knowing about before extending this:

- Tubbutec's own [Juno-66 Ableton Live controller](https://tubbutec.de/juno-66-ableton-live-plugin/)
- midierror's Juno-66 Editor, and Jesse Miller's Juno-66 Controls (both Max for Live)
- [Midi Quest](https://squest.com/Products/MidiQuest13/Instruments/TubbutecJuno-66/index.html)'s editor/librarian (commercial)

The free ones are all Max for Live, so they only run inside Ableton. None of
them appears to handle MTS tuning upload.

## Layout

| Path            | What it is                                          |
| --------------- | --------------------------------------------------- |
| `src/mts.js`    | MIDI Tuning Standard bulk dump encoding             |
| `src/scale.js`  | Temperaments, scale→frequency mapping, `.scl` I/O   |
| `src/midi.js`   | Web MIDI access and message construction            |
| `src/params.js` | The juno-66 parameter map, from the V1.29 manual    |
| `src/overrides.js` | CC numbers transcribed from the manual chart     |
| `src/app.js`    | UI wiring                                           |
| `serve.js`      | Static server, so the page gets a secure context    |
