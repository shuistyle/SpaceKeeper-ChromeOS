// ======================================================================
// store.js — what SpaceKeeper remembers
// ======================================================================
// Saved in this browser only (localStorage), never sent anywhere:
//   • desks:    for each desk SpaceKeeper has seen — your name for it and
//               its colour. Keyed by ChromeOS's desk ID (a UUID).
//   • order:    your order for the tiles.
//   • settings: show on all desks, text size, ask before removing.
//
// ChromeOS doesn't let apps list every desk, so SpaceKeeper learns desks
// as you visit, add or remove them, and remembers them here.
//
// Everything read back is checked (load → sanitize), so a damaged or
// tampered save can't break the app or inject anything.
// ======================================================================

import { cleanName, isDeskId } from "./text.js";
import { findColor } from "./colors.js";

export const KEY = "spacekeeper.v1";
export const DEMO_KEY = "spacekeeper.demo.v1"; // demo mode keeps its pretend desks separate
export const TEXT_SIZES = ["standard", "large", "larger", "largest"];

export function defaultState() {
  return {
    version: 1,
    desks: {},     // id → { name: string, color: string|null }
    order: [],     // desk ids, in your order
    settings: { allDesks: true, textSize: "standard", confirmRemove: true },
  };
}

/** Accepts only well-formed values; everything else falls back to defaults. */
export function sanitize(raw) {
  const state = defaultState();
  if (!raw || typeof raw !== "object") return state;

  if (raw.desks && typeof raw.desks === "object") {
    for (const [id, desk] of Object.entries(raw.desks)) {
      if (!isDeskId(id) || !desk || typeof desk !== "object") continue;
      state.desks[id] = {
        name: cleanName(desk.name ?? ""),
        color: findColor(desk.color) ? desk.color : null,
      };
    }
  }
  if (Array.isArray(raw.order)) {
    const seen = new Set();
    for (const id of raw.order) {
      if (isDeskId(id) && state.desks[id] && !seen.has(id)) { seen.add(id); state.order.push(id); }
    }
  }
  // Desks missing from the order go at the end.
  for (const id of Object.keys(state.desks)) if (!state.order.includes(id)) state.order.push(id);

  const s = raw.settings;
  if (s && typeof s === "object") {
    if (typeof s.allDesks === "boolean") state.settings.allDesks = s.allDesks;
    if (TEXT_SIZES.includes(s.textSize)) state.settings.textSize = s.textSize;
    if (typeof s.confirmRemove === "boolean") state.settings.confirmRemove = s.confirmRemove;
  }
  return state;
}

/** Reads the saved state (or defaults if storage is unavailable or damaged). */
export function load(storage = globalThis.localStorage, key = KEY) {
  try {
    const text = storage?.getItem(key);
    return sanitize(text ? JSON.parse(text) : null);
  } catch {
    return defaultState();
  }
}

/** Saves the state. Returns false if the browser wouldn't save it. */
export function save(state, storage = globalThis.localStorage, key = KEY) {
  try {
    storage?.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// ----- Changes (each returns true if anything changed) -----

/** Remembers a desk (new ones go at the end of your order). */
export function addDesk(state, id) {
  if (!isDeskId(id) || state.desks[id]) return false;
  state.desks[id] = { name: "", color: null };
  state.order.push(id);
  return true;
}

export function forgetDesk(state, id) {
  if (!state.desks[id]) return false;
  delete state.desks[id];
  state.order = state.order.filter((d) => d !== id);
  return true;
}

export function rename(state, id, name) {
  const desk = state.desks[id];
  if (!desk) return false;
  const clean = cleanName(name);
  if (desk.name === clean) return false;
  desk.name = clean;
  return true;
}

export function setColor(state, id, colorId) {
  const desk = state.desks[id];
  if (!desk) return false;
  const next = findColor(colorId) ? colorId : null;
  if (desk.color === next) return false;
  desk.color = next;
  return true;
}

/** Moves a desk by `offset` places in your order. */
export function move(state, id, offset) {
  const from = state.order.indexOf(id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= state.order.length) return false;
  state.order.splice(from, 1);
  state.order.splice(to, 0, id);
  return true;
}

/** Puts `id` just before `beforeId` (drag and drop). */
export function moveBefore(state, id, beforeId) {
  if (id === beforeId || !state.desks[id]) return false;
  const without = state.order.filter((d) => d !== id);
  const at = beforeId ? without.indexOf(beforeId) : -1;
  if (at < 0) without.push(id); else without.splice(at, 0, id);
  const changed = without.join() !== state.order.join();
  state.order = without;
  return changed;
}
