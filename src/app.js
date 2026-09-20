import { buildBulkTuningDump } from './mts.js';
import { BUILT_IN_SCALES, formatScl, parseScl, scaleToFrequencies } from './scale.js';
import { NOTE_RANGE, PARAM_GROUPS, PLAY_MODES, SOURCE_LABELS } from './params.js';
import { buildMidnam } from './midnam.js';
import { applyOverrides, exportMap, isValidCc, loadOverrides, saveOverrides } from './overrides.js';
import {
  controlChange, describeMessage, formatBytes, isHousekeeping, listInputs,
  listOutputs, noteOff, noteOn, parseSysexHex, requestMidiAccess,
} from './midi.js';

const $ = (id) => document.getElementById(id);

const state = {
  output: null,
  input: null,
  /** CC numbers typed in from the manual's chart, keyed by parameter id. */
  overrides: loadOverrides(),
  /** Working copy of the selected scale, edited in place by the degree fields. */
  scale: { ...BUILT_IN_SCALES[0], degrees: [...BUILT_IN_SCALES[0].degrees] },
  heldNote: null,
};

const channel = () => clamp(Number.parseInt($('channel-input').value, 10) || 1, 1, 16);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------- sending

function send(bytes, description) {
  if (!state.output) {
    log(description, 'no MIDI output selected', true);
    return false;
  }
  try {
    state.output.send(bytes);
    log(description, formatBytes(bytes));
    return true;
  } catch (error) {
    log(description, error.message, true);
    return false;
  }
}

function log(what, detail, failed = false) {
  const item = document.createElement('li');
  const time = new Date().toLocaleTimeString([], { hour12: false });
  item.innerHTML = `${time} <span class="what">${escape(what)}</span> `
    + `<span class="${failed ? 'failed' : ''}">${escape(detail)}</span>`;
  const list = $('log');
  list.prepend(item);
  while (list.children.length > 200) list.lastElementChild.remove();
}

function escape(text) {
  return String(text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// ------------------------------------------------------------- connection

async function connect() {
  const status = $('midi-status');
  let access;
  try {
    access = await requestMidiAccess();
  } catch (error) {
    status.textContent = error.message;
    status.className = 'status status-error';
    return;
  }

  // Repopulate a port picker, keeping the current selection if it survived.
  const fillSelect = (select, ports, emptyLabel) => {
    const previous = select.value;
    select.replaceChildren();
    if (ports.length === 0) {
      select.append(new Option(emptyLabel, ''));
      select.disabled = true;
      return null;
    }
    for (const { id, label } of ports) select.append(new Option(label, id));
    select.disabled = false;
    select.value = ports.some((port) => port.id === previous) ? previous : ports[0].id;
    return select.value;
  };

  const refresh = () => {
    const outputs = listOutputs(access);
    const inputs = listInputs(access);

    const outputId = fillSelect($('output-select'), outputs, 'No MIDI outputs found');
    state.output = outputId ? access.outputs.get(outputId) ?? null : null;

    const inputId = fillSelect($('input-select'), inputs, 'No MIDI inputs found');
    listenTo(inputId ? access.inputs.get(inputId) : null);

    if (outputs.length === 0) {
      status.textContent = 'MIDI is available, but no outputs are connected. Plug in your interface.';
      status.className = 'status status-error';
    } else {
      const ins = inputs.length === 1 ? '1 input' : `${inputs.length} inputs`;
      status.textContent = `MIDI ready with SysEx — ${outputs.length} output(s), ${ins}.`;
      status.className = 'status status-ok';
    }
    setEnabled(outputs.length > 0);
  };

  access.onstatechange = refresh;

  $('output-select').addEventListener('change', (event) => {
    state.output = access.outputs.get(event.target.value) ?? null;
    setEnabled(Boolean(state.output));
  });
  $('input-select').addEventListener('change', (event) => {
    listenTo(access.inputs.get(event.target.value) ?? null);
  });

  refresh();
}

function setEnabled(enabled) {
  for (const id of ['send-tuning', 'raw-sweep', 'note-hold', 'all-notes-off', 'send-sysex']) {
    $(id).disabled = !enabled;
  }
  // Only the sliders depend on having an output. The CC number fields stay
  // editable so the chart can be transcribed before anything is plugged in.
  for (const sync of rowSyncs) sync();
}

// ------------------------------------------------------------- parameters

/** Per-row callbacks that re-read whether their slider should be live. */
const rowSyncs = [];

/** Per-row callbacks that mirror an incoming CC onto the row's slider. */
const rowReceivers = [];

function renderParams() {
  const container = $('param-groups');
  container.replaceChildren();
  rowSyncs.length = 0;
  rowReceivers.length = 0;

  for (const group of applyOverrides(PARAM_GROUPS, state.overrides)) {
    const section = document.createElement('section');
    section.className = 'group';

    const title = document.createElement('h3');
    title.className = 'group-title';
    title.textContent = group.name;
    // The blurbs are a couple of sentences each. Shown inline they would cost
    // more height than the parameters they introduce, so they become the
    // header's tooltip — same trick the source badges use.
    if (group.blurb) {
      title.title = group.blurb;
      title.classList.add('has-note');
    }
    section.append(title);

    for (const param of group.params) section.append(renderParam(param));
    container.append(section);
  }

  updateMapStatus();
}

function updateMapStatus() {
  const unassigned = PARAM_GROUPS
    .flatMap((group) => group.params)
    .filter((param) => !isValidCc(state.overrides[param.id] ?? param.cc)).length;
  $('map-status').textContent = unassigned === 0
    ? 'Every parameter has a controller number.'
    : `${unassigned} parameter${unassigned === 1 ? '' : 's'} still without a number.`;
}

function renderParam(param) {
  const row = document.createElement('div');
  row.className = 'param';

  const name = document.createElement('div');
  name.className = 'param-name';
  name.textContent = param.label;

  // A dot rather than a word: the label for it lives in the tooltip, which
  // keeps every parameter on one line.
  const badge = document.createElement('span');

  const showSource = (which) => {
    const source = SOURCE_LABELS[which]
      ?? { text: 'yours', hint: 'Entered by you, from the manual chart.' };
    badge.className = `badge badge-${which}`;
    badge.title = `${source.text} — ${source.hint}`;
  };
  showSource(param.source);

  // The controller number is editable: the manual's chart is a figure, so the
  // numbers it alone carries have to be transcribed by hand.
  const ccField = document.createElement('input');
  ccField.type = 'number';
  ccField.min = '0';
  ccField.max = '127';
  ccField.className = 'cc-input';
  ccField.value = isValidCc(param.cc) ? String(param.cc) : '';
  ccField.placeholder = 'CC';
  ccField.title = 'Controller number. Blank until filled in from the manual chart.';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(param.min ?? 0);
  slider.max = String(param.max ?? 127);
  slider.value = String(param.initial ?? 0);

  const readout = document.createElement('output');
  readout.textContent = slider.value;

  const sync = () => {
    const cc = Number.parseInt(ccField.value, 10);
    slider.disabled = !isValidCc(cc) || !state.output;
    row.classList.toggle('unassigned', !isValidCc(cc));
  };
  rowSyncs.push(sync);

  // Updating this row in place rather than re-rendering the list: the field is
  // mid-blur when `change` fires, so replacing its own ancestor throws.
  ccField.addEventListener('change', () => {
    const cc = Number.parseInt(ccField.value, 10);

    if (ccField.value.trim() === '') {
      delete state.overrides[param.id];
      ccField.value = isValidCc(param.cc) ? String(param.cc) : '';
      showSource(param.source);
    } else if (isValidCc(cc)) {
      state.overrides[param.id] = cc;
      showSource(cc === param.cc ? param.source : 'user');
    } else {
      ccField.value = isValidCc(param.cc) ? String(param.cc) : '';
      return;
    }

    if (!saveOverrides(state.overrides)) {
      log('cc map', 'browser storage unavailable — this number will not persist', true);
    }
    sync();
    updateMapStatus();
  });

  slider.addEventListener('input', () => {
    readout.textContent = slider.value;
    const cc = Number.parseInt(ccField.value, 10);
    if (!isValidCc(cc)) return;
    send(controlChange(channel(), cc, Number(slider.value)), `${param.label} (CC ${cc})`);
  });

  // Scrolling over the bar nudges the value. It is deliberately on the bar and
  // not the whole row: twenty row-wide scroll traps stacked down the panel
  // would swallow ordinary page scrolling and send CC while doing it.
  slider.addEventListener('wheel', (event) => {
    if (slider.disabled) return;
    event.preventDefault();
    const next = clamp(
      Number(slider.value) + (event.deltaY < 0 ? 1 : -1) * (event.shiftKey ? 8 : 1),
      Number(slider.min),
      Number(slider.max),
    );
    if (next === Number(slider.value)) return;
    slider.value = String(next);
    // Reuse the input handler above rather than repeating the send.
    slider.dispatchEvent(new Event('input'));
  }, { passive: false });

  // Mirror an incoming CC onto this row. Deliberately sets the value rather
  // than dispatching 'input': firing the handler above would echo the message
  // straight back out, which is the midi loop the manual warns about.
  rowReceivers.push((cc, value) => {
    if (Number.parseInt(ccField.value, 10) !== cc) return;
    slider.value = String(clamp(value, Number(slider.min), Number(slider.max)));
    readout.textContent = slider.value;
  });

  sync();
  row.append(name, badge, ccField, slider, readout);
  if (param.note) row.title = param.note;
  return row;
}

function download(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

function exportMidnam() {
  download(
    buildMidnam(PARAM_GROUPS, PLAY_MODES, state.overrides),
    'Tubbutec juno-66.midnam',
    'application/xml',
  );
  log('exported .midnam', 'install in ~/Library/Audio/MIDI Patch Names/DigiDesign/, then restart Pro Tools');
}

function exportCcMap() {
  download(
    exportMap(PARAM_GROUPS, state.overrides),
    'juno-66-cc-map.json',
    'application/json',
  );
}

// ----------------------------------------------------------------- tuning

function renderScaleSelect() {
  const select = $('scale-select');
  select.replaceChildren();
  for (const [index, scale] of BUILT_IN_SCALES.entries()) {
    select.append(new Option(scale.name, String(index)));
  }
  select.append(new Option('— imported —', 'imported'));
  select.value = '0';
}

function loadScale(scale) {
  state.scale = { ...scale, degrees: [...scale.degrees] };
  if (!$('tuning-name').value) $('tuning-name').value = scale.name.slice(0, 16);
  renderDegrees();
  updateSummary();
}

function renderDegrees() {
  const editor = $('degree-editor');
  editor.replaceChildren();

  for (const [index, cents] of state.scale.degrees.entries()) {
    const wrapper = document.createElement('div');
    wrapper.className = 'degree';

    const label = document.createElement('span');
    label.textContent = String(index + 1);

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.001';
    input.value = cents.toFixed(3);
    input.title = index === state.scale.degrees.length - 1
      ? 'Final degree is the period — 1200 for an octave.'
      : `Degree ${index + 1}, cents above the tonic.`;

    input.addEventListener('change', () => {
      const next = Number.parseFloat(input.value);
      if (!Number.isFinite(next)) {
        input.value = state.scale.degrees[index].toFixed(3);
        return;
      }
      state.scale.degrees[index] = next;
      updateSummary();
    });

    wrapper.append(label, input);
    editor.append(wrapper);
  }
}

function currentDump() {
  const frequencies = scaleToFrequencies(state.scale, {
    rootNote: clamp(Number.parseInt($('root-note').value, 10) || 60, 0, 127),
    rootFrequency: Number.parseFloat($('root-freq').value) || 261.6255653,
  });
  return buildBulkTuningDump({
    deviceId: clamp(Number.parseInt($('device-id').value, 10) || 0, 0, 127),
    program: Number.parseInt($('slot-select').value, 10),
    name: $('tuning-name').value,
    frequencies,
    checksumIncludesDeviceId: $('checksum-variant').checked,
  });
}

function updateSummary() {
  const summary = $('dump-summary');
  try {
    const dump = currentDump();
    const notes = state.scale.degrees.length;
    const period = state.scale.degrees.at(-1);
    summary.textContent =
      `${notes} notes per ${period.toFixed(2)}¢ period · ${dump.length} bytes`;
    summary.classList.remove('failed');
  } catch (error) {
    summary.textContent = error.message;
    summary.classList.add('failed');
  }
}

// -------------------------------------------------------------- discovery

async function sweep() {
  const cc = clamp(Number.parseInt($('raw-cc').value, 10) || 0, 0, 127);
  const button = $('raw-sweep');
  button.disabled = true;
  try {
    for (let value = 0; value <= 127; value += 1) {
      if (!send(controlChange(channel(), cc, value), `sweep CC ${cc}`)) break;
      $('raw-value').value = String(value);
      $('raw-value-out').textContent = String(value);
      await new Promise((resolve) => { setTimeout(resolve, 12); });
    }
  } finally {
    button.disabled = false;
  }
}

function checkNoteRange() {
  const note = Number.parseInt($('test-note').value, 10);
  const outside = Number.isInteger(note) && (note < NOTE_RANGE.min || note > NOTE_RANGE.max);
  $('note-range-warning').textContent = outside
    ? `The mod only plays notes ${NOTE_RANGE.min}-${NOTE_RANGE.max}; 0 and 1 are arp and S/H triggers.`
    : '';
}

function toggleHeldNote() {
  const button = $('note-hold');
  const note = clamp(Number.parseInt($('test-note').value, 10) || 60, 0, 127);

  if (state.heldNote !== null) {
    send(noteOff(channel(), state.heldNote), `note off ${state.heldNote}`);
    state.heldNote = null;
    button.textContent = 'Hold note';
    return;
  }
  if (send(noteOn(channel(), note), `note on ${note}`)) {
    state.heldNote = note;
    button.textContent = 'Release note';
  }
}

function allNotesOff() {
  // CC 123 is the standard all-notes-off; follow it with explicit note-offs in
  // case the mod does not implement the controller.
  send(controlChange(channel(), 123, 0), 'all notes off');
  if (state.heldNote !== null) {
    send(noteOff(channel(), state.heldNote), `note off ${state.heldNote}`);
    state.heldNote = null;
    $('note-hold').textContent = 'Hold note';
  }
}

// ------------------------------------------------------------------ wiring

function monitor(event) {
  const bytes = event.data;
  if (isHousekeeping(bytes) && !$('monitor-clock').checked) return;

  const item = document.createElement('li');
  const time = new Date().toLocaleTimeString([], { hour12: false });
  item.innerHTML = `${time} <span class="what">${escape(describeMessage(bytes))}</span>`;

  const list = $('monitor');
  list.prepend(item);
  while (list.children.length > 200) list.lastElementChild.remove();

  follow(bytes);
}

/**
 * Update the UI from a message the synth (or anything else on the input port)
 * sent us. Exported so it can be driven directly in a browser test.
 *
 * Channel is deliberately not filtered. The mod's midi out channels are set
 * separately from its in channel, so requiring a match would mostly mean the
 * display quietly never updating.
 */
export function follow(bytes) {
  switch (bytes[0] & 0xf0) {
    case 0xc0:
      showPlayMode(bytes[1]);
      return;
    case 0xb0:
      for (const receive of rowReceivers) receive(bytes[1], bytes[2]);
      return;
    default:
  }
}

function showPlayMode(program) {
  const known = PLAY_MODES[program];
  const field = $('play-mode');
  field.textContent = known ?? `unknown (program ${program})`;
  field.classList.toggle('play-mode-unknown', !known);
}

function listenTo(port) {
  if (state.input) state.input.onmidimessage = null;
  state.input = port ?? null;
  if (state.input) state.input.onmidimessage = monitor;
}

function wire() {
  $('scale-select').addEventListener('change', (event) => {
    if (event.target.value === 'imported') return;
    loadScale(BUILT_IN_SCALES[Number(event.target.value)]);
  });

  $('import-scl').addEventListener('click', () => $('scl-file').click());
  $('scl-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const scale = parseScl(await file.text(), file.name.replace(/\.scl$/i, ''));
      loadScale(scale);
      $('scale-select').value = 'imported';
      log('imported scale', `${scale.name} (${scale.degrees.length} notes)`);
    } catch (error) {
      log('import failed', error.message, true);
    } finally {
      event.target.value = '';
    }
  });

  $('export-scl').addEventListener('click', () => {
    const blob = new Blob([formatScl(state.scale)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: `${state.scale.name.replace(/\s+/g, '_')}.scl`,
    });
    link.click();
    URL.revokeObjectURL(url);
  });

  $('send-tuning').addEventListener('click', () => {
    let dump;
    try {
      dump = currentDump();
    } catch (error) {
      log('tuning dump', error.message, true);
      return;
    }
    send(dump, `tuning dump → slot ${$('slot-select').value}`);
  });

  for (const id of ['root-note', 'root-freq', 'device-id', 'slot-select', 'tuning-name', 'checksum-variant']) {
    $(id).addEventListener('change', updateSummary);
  }

  $('raw-value').addEventListener('input', (event) => {
    const value = Number(event.target.value);
    $('raw-value-out').textContent = String(value);
    const cc = clamp(Number.parseInt($('raw-cc').value, 10) || 0, 0, 127);
    send(controlChange(channel(), cc, value), `CC ${cc}`);
  });

  $('raw-sweep').addEventListener('click', sweep);
  $('note-hold').addEventListener('click', toggleHeldNote);
  $('all-notes-off').addEventListener('click', allNotesOff);

  $('send-sysex').addEventListener('click', () => {
    try {
      send(parseSysexHex($('sysex-hex').value), 'sysex');
    } catch (error) {
      log('sysex', error.message, true);
    }
  });

  $('clear-log').addEventListener('click', () => $('log').replaceChildren());
  $('clear-monitor').addEventListener('click', () => $('monitor').replaceChildren());
  $('export-map').addEventListener('click', exportCcMap);
  $('export-midnam').addEventListener('click', exportMidnam);
  $('test-note').addEventListener('input', checkNoteRange);

  $('reset-map').addEventListener('click', () => {
    state.overrides = {};
    saveOverrides(state.overrides);
    renderParams();
    log('cc map', 'reset to the numbers from the manual');
  });

  // A held note outliving the page is a stuck note on the synth.
  window.addEventListener('pagehide', () => {
    if (state.heldNote !== null) {
      try {
        state.output?.send(noteOff(channel(), state.heldNote));
      } catch { /* the port may already be gone */ }
    }
  });
}

renderParams();
renderScaleSelect();
loadScale(BUILT_IN_SCALES[0]);
wire();
connect();
