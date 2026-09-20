# juno-66 editor

A browser UI for controlling a Roland Juno-60 fitted with the
[Tubbutec juno-66](https://tubbutec.de/juno-66/) mod over MIDI.

Two things it does:

- **Parameters** — sends control changes for things like portamento time.
- **Tuning** — builds and uploads custom scales into the mod's four user scale
  slots as MIDI Tuning Standard bulk dumps, without going through Scala.

No build step, no dependencies. Everything is plain ES modules.

## Running it

Needs **Node 20.11 or newer** (`serve.js` uses `import.meta.dirname`). There is
nothing to install — no dependencies.

```sh
git clone https://github.com/adamlilienfeldt/juno-66-editor.git
cd juno-66-editor

npm run serve       # http://localhost:8173
npm test            # 45 unit tests for the encoders
npm run test:watch  # re-runs them on save
```

It has to be *served* rather than opened as a `file://` URL: Web MIDI requires
a secure context, and `localhost` counts as one.

### In VS Code

`F5` runs **Open in Chrome**, which starts the server as a pre-launch task and
opens the page with the debugger attached — breakpoints in `src/*.js` work
directly. `Cmd-Shift-B` style task running covers `serve`, `test` and
`test:watch` from the command palette under *Run Task*.

Type checking is deliberately off in `jsconfig.json`. This is vanilla DOM code,
so `document.getElementById` hands back `HTMLElement` and every `.value` and
`.checked` would need a cast — about forty complaints that would bury anything
real. Autocomplete for DOM and ES2023 still works. To turn it on anyway, set
`checkJs` true and `npm i -D @types/node`.

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

Every controllable parameter now has a number in `src/params.js`. Three come
from the body text; the rest are transcribed from the **MIDI controller chart
on page 23**, which is a figure rather than text:

| Parameter                  | CC | Source                              |
| -------------------------- | -- | ----------------------------------- |
| Arp MIDI clock divider     | 16 | Chart                               |
| Filter cutoff modulation   | 17 | Body text, confirmed by the chart   |
| S/H LFO amount             | 18 | Chart                               |
| S/H LFO clock divider      | 19 | Chart                               |
| Arp clock divider          | 20 | Chart                               |
| Triangle LFO freq. coarse  | 23 | Chart                               |
| Triangle LFO freq. fine    | 24 | Chart                               |
| Triangle LFO amount        | 25 | Chart                               |
| Detune                     | 26 | Body text, confirmed by the chart   |
| Fatness                    | 27 | Body text, confirmed by the chart   |
| Portamento speed fast      | 28 | Chart — **conflicting**, see below   |
| Portamento speed slow      | 29 | Chart — **conflicting**, see below   |
| Filter ADSR attack         | 30 | Chart                               |
| Filter ADSR decay          | 31 | Chart                               |
| Filter ADSR sustain        | 32 | Chart                               |
| Filter ADSR release        | 33 | Chart                               |
| Filter ADSR amount         | 34 | Chart                               |
| Filter ADSR delay          | 37 | Chart                               |
| Filter ADSR looping        | 38 | Chart, off 0-63 / on 64-127         |
| Filter ADSR polarity       | 39 | Chart, off 0-63 / on 64-127         |

The chart's numbers are 0-127. A controller that displays 1-128 is offset by
one.

**The portamento conflict.** The chart gives 28 for fast and 29 for slow, but
the body text says the times "can be set using midi CC 6 or the config menu
11" — and the Duo section says exactly the same of *fatness*, while naming CC
27 for fatness two paragraphs later and the chart agreeing on 27. So the CC 6
sentence is the one that repeats itself wrongly. CC 6 is also data entry MSB,
which would act on whatever the config menu has selected rather than on
portamento directly. 28 and 29 are the numbers to trust; check by ear.

**Two arp dividers.** The chart lists both "Arp midi clock divider" (16) and
"Arp clock divider" (20), and the config menu likewise has separate *Midi Clk
Div* and *Clk div* entries under ARP, so both are mapped. If they turn out to
do the same thing, one is a chart duplicate.

Chart rows left out of the map: 21 and 22 (CV2 and CV3, only if installed), 35
and 36 (seq and S/H LFO clock source), 64 (sustain), 120 (all sound off) and
123 (all notes off) — the last of which the Discovery panel already sends.

Any number here can be corrected in the CC field next to the parameter; the
page remembers what you type, and **Export CC map** writes the result out as
JSON.

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

## Naming the controllers in a DAW

**Export .midnam** writes a MIDI Name Document: an XML file describing what
this device's controllers and programs are called. With one installed, a MIDI
automation lane reads *Filter ADSR — Attack* rather than *controller-30*, and
the program change lane lists the play modes by name instead of 0-4.

On macOS, drop the file in either of:

```
~/Library/Audio/MIDI Patch Names/DigiDesign/
/Library/Audio/MIDI Patch Names/DigiDesign/
```

then restart Pro Tools and assign the device to the MIDI track. Logic and
Digital Performer read the same format from their own locations.

It is generated from the live map, including any controller number corrected
in the UI, so re-export after fixing one. Note that the numbers live in the
browser that typed them — moving between machines means either re-typing a
correction or re-exporting on each one.

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
| `src/midnam.js` | MIDI Name Document export, for DAW controller names |
| `src/overrides.js` | Per-parameter CC overrides, stored in the browser |
| `src/app.js`    | UI wiring                                           |
| `serve.js`      | Static server, so the page gets a secure context    |
