// ======================================================================
// text.js — cleaning up desk names
// ======================================================================
// Names you type are only ever shown with textContent (never as HTML), so
// they can't run code. This also removes invisible characters that could
// make a name misleading: control characters, and the "bidi override"
// characters that can display text backwards.
// ======================================================================

export const MAX_NAME_LENGTH = 60;

const INVISIBLE = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g;

/** Tidies a typed name: no invisible characters, single spaces, 60 characters at most. */
export function cleanName(text) {
  if (typeof text !== "string") return "";
  const tidy = text.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
  return Array.from(tidy).slice(0, MAX_NAME_LENGTH).join("").trim();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ChromeOS identifies each desk by a UUID. Anything else is ignored. */
export function isDeskId(value) {
  return typeof value === "string" && UUID.test(value);
}
