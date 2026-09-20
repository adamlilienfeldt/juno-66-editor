import { buildBulkTuningDump } from './mts.js';
import { BUILT_IN_SCALES, formatScl, parseScl, scaleToFrequencies } from './scale.js';
import { CONFIDENCE_LABELS, PARAM_GROUPS } from './params.js';
import {
  controlChange, formatBytes, listOutputs, noteOff, noteOn,
  parseSysexHex, requestMidiAccess,
} from './midi.js';

const $ = (id) => document.getElementById(id);

const state = {
  output: null,
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

  const refresh = () => {
    const outputs = listOutputs(access);
    const select = $('output-select');
    const previous = select.value;
    select.replaceChildren();

    if (outputs.length === 0) {
      select.append(new Option('No MIDI outputs found', ''));
      select.disabled = true;
      state.output = null;
      status.textContent = 'MIDI is available, but no outputs are connected. Plug in your interface.';
      status.className = 'status status-error';
      setEnabled(false);
      return;
    }

    for (const { id, label } of outputs) select.append(new Option(label, id));
    select.disabled = false;
    select.value = outputs.some((o) => o.id === previous) ? previous : outputs[0].id;
    state.output = access.outputs.get(select.value) ?? null;

    status.textContent = `MIDI ready with SysEx — ${outputs.length} output(s).`;
    status.className = 'status status-ok';
    setEnabled(true);
  };

  access.onstatechange = refresh;
  $('output-select').addEventListener('change', (event) => {
    state.output = access.outputs.get(event.target.value) ?? null;
  });
  refresh();
}

function setEnabled(enabled) {
  for (const id of ['send-tuning', 'raw-sweep', 'note-hold', 'all-notes-off', 'send-sysex']) {
    $(id).disabled = !enabled;
  }
  for (const input of document.querySelectorAll('#param-groups input')) {
    input.disabled = !enabled;
  }
}

// ------------------------------------------------------------- parameters

function renderParams() {
  const container = $('param-groups');
  container.replaceChildren();

  for (const group of PARAM_GROUPS) {
    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = group.name;
    container.append(title);

    for (const param of group.params) {
      const row = document.createElement('div');
      row.className = 'param';

      const confidence = CONFIDENCE_LABELS[param.confidence];
      const name = document.createElement('div');
      name.className = 'param-name';
      name.innerHTML = `<strong>${escape(param.label)}</strong>`
        + `<span class="badge badge-${param.confidence}" title="${escape(confidence.hint)}">`
        + `${escape(confidence.text)}</span>`;

      const cc = document.createElement('span');
      cc.className = 'cc-num';
      cc.textContent = `CC ${param.cc}`;
      cc.title = param.note ?? '';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(param.min ?? 0);
      slider.max = String(param.max ?? 127);
      slider.value = String(param.initial ?? 0);
      slider.disabled = true;

      const readout = document.createElement('output');
      readout.textContent = slider.value;

      slider.addEventListener('input', () => {
        readout.textContent = slider.value;
        send(
          controlChange(channel(), param.cc, Number(slider.value)),
          `${param.label} (CC ${param.cc})`,
        );
      });

      row.append(name, cc, slider, readout);
      row.title = param.note ?? '';
      container.append(row);
    }
  }
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
