// MIDI Name Document generation.
//
// Pro Tools, Logic and Digital Performer all read `.midnam` files: an XML
// description of what a device's controllers and programs are called. With one
// installed, a MIDI automation lane says "Filter ADSR — Attack" instead of
// "controller-30", and the program change lane lists the play modes by name.
//
// The file is built from the live parameter map, so any controller number
// corrected in the UI ends up in the export too.
//
// Install on macOS by dropping the file in:
//   ~/Library/Audio/MIDI Patch Names/DigiDesign/
// then restarting Pro Tools.

import { applyOverrides, isValidCc } from './overrides.js';

const MANUFACTURER = 'Tubbutec';
const MODEL = 'juno-66';
const NAME_SET = 'juno-66';
const CONTROL_LIST = 'juno-66 controls';

/** XML text escaping. "Sample & hold filter LFO" is a group name, so this matters. */
function escapeXml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }[char]));
}

/**
 * Flatten the parameter map into the controls the document will list: one per
 * usable CC number, sorted, with the group folded into the name so a lane is
 * readable on its own.
 *
 * A controller number can only be named once. If two parameters end up sharing
 * one — which hand-edited numbers allow — the first wins rather than the
 * document carrying a duplicate.
 */
export function controlsFor(groups, overrides = {}) {
  const seen = new Set();
  const controls = [];

  for (const group of applyOverrides(groups, overrides)) {
    for (const param of group.params) {
      if (!isValidCc(param.cc) || seen.has(param.cc)) continue;
      seen.add(param.cc);
      controls.push({ cc: param.cc, name: `${group.name} — ${param.label}` });
    }
  }

  return controls.sort((a, b) => a.cc - b.cc);
}

/**
 * Build the document. `playModes` are program numbers by index, as the manual's
 * page 17 table gives them.
 */
export function buildMidnam(groups, playModes, overrides = {}, today = new Date()) {
  const controls = controlsFor(groups, overrides);
  const channels = Array.from({ length: 16 }, (_, i) => i + 1);

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE MIDINameDocument PUBLIC "-//MIDI Manufacturers Association//DTD MIDINameDocument 1.0//EN" '
      + '"http://www.midi.org/dtds/MIDINameDocument10.dtd">',
    '<MIDINameDocument>',
    `  <Author>juno-66 editor, ${today.toISOString().slice(0, 10)}</Author>`,
    '  <MasterDeviceNames>',
    `    <Manufacturer>${MANUFACTURER}</Manufacturer>`,
    `    <Model>${MODEL}</Model>`,
    '    <CustomDeviceMode Name="Default">',
    '      <ChannelNameSetAssignments>',
    ...channels.map((channel) =>
      `        <ChannelNameSetAssign Channel="${channel}" NameSet="${NAME_SET}"/>`),
    '      </ChannelNameSetAssignments>',
    '    </CustomDeviceMode>',
    `    <ChannelNameSet Name="${NAME_SET}">`,
    '      <AvailableForChannels>',
    ...channels.map((channel) =>
      `        <AvailableChannel Channel="${channel}" Available="true"/>`),
    '      </AvailableForChannels>',
    '      <PatchBank Name="Play modes">',
    '        <PatchNameList Name="Play modes">',
    ...playModes.map((mode, program) =>
      `          <Patch Number="${program}" Name="${escapeXml(mode)}" ProgramChange="${program}"/>`),
    '        </PatchNameList>',
    '      </PatchBank>',
    `      <UsesControlNameList Name="${CONTROL_LIST}"/>`,
    '    </ChannelNameSet>',
    `    <ControlNameList Name="${CONTROL_LIST}">`,
    ...controls.map(({ cc, name }) =>
      `      <Control Type="7bit" Number="${cc}" Name="${escapeXml(name)}"/>`),
    '    </ControlNameList>',
    '  </MasterDeviceNames>',
    '</MIDINameDocument>',
    '',
  ];

  return lines.join('\n');
}
