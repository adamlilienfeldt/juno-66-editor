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

**The CC numbers in `src/params.js` are not verified.** They come from
Tubbutec's public documentation and from the MIDI specification's own defaults,
not from the CC appendix of the manual for any particular firmware — and that
map has changed between firmware releases.

Every parameter carries a confidence badge in the UI saying where its number
came from. To correct them:

1. Get the user manual PDF for **your** firmware version from
   [tubbutec.de](https://tubbutec.de/juno-66/), or check
   [midi.guide](https://midi.guide/d/tubbutec/juno-66/).
2. Fix the entries in `src/params.js` and drop the `confidence` note.

The **Discovery** panel exists for working them out empirically: hold a note,
sweep a controller number across its range, listen for what moves.

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
| `src/params.js` | The juno-66 parameter map — **needs verification**  |
| `src/app.js`    | UI wiring                                           |
| `serve.js`      | Static server, so the page gets a secure context    |
