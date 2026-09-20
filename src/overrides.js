// CC number overrides.
//
// The manual's controller chart is a figure, so several parameters ship with
// no CC number. Rather than blocking on that, the UI lets each number be typed
// in and remembers it, so the chart can be transcribed once and kept.

const STORAGE_KEY = 'juno66.cc-overrides.v1';

/** Apply stored overrides over the shipped map, without mutating either. */
export function applyOverrides(groups, overrides) {
  return groups.map((group) => ({
    ...group,
    params: group.params.map((param) => (
      Object.hasOwn(overrides, param.id)
        ? { ...param, cc: overrides[param.id], source: 'user' }
        : param
    )),
  }));
}

export function isValidCc(value) {
  return Number.isInteger(value) && value >= 0 && value <= 127;
}

/**
 * Serialise the current map as a JSON summary — for pasting back into
 * params.js, or for sending on to someone else with the same mod.
 */
export function exportMap(groups, overrides) {
  const resolved = applyOverrides(groups, overrides);
  return JSON.stringify(
    {
      firmware: 'V1.29',
      exported: new Date().toISOString().slice(0, 10),
      parameters: resolved.flatMap((group) =>
        group.params.map((param) => ({
          group: group.name,
          id: param.id,
          label: param.label,
          cc: param.cc,
          source: param.source,
        }))),
    },
    null,
    2,
  );
}

export function loadOverrides(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // Drop anything that is not a usable controller number, so a corrupted or
    // hand-edited entry cannot put a bad byte on the wire.
    return Object.fromEntries(
      Object.entries(parsed).filter(([, cc]) => isValidCc(cc)),
    );
  } catch {
    // Private windows and blocked site data both throw here.
    return {};
  }
}

export function saveOverrides(overrides, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(overrides));
    return true;
  } catch {
    return false;
  }
}
