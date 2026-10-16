// ======================================================================
// colors.js — the ten accessible desk colours
// ======================================================================
// The same palette as SpaceKeeper for Mac and Windows (based on the
// Okabe–Ito colour-blind-safe palette). Each colour:
//   • has text colour chosen so the desk name has at least 7:1 contrast
//     (WCAG AAA) — checked by tests/colors.test.js;
//   • has its own symbol and spoken name, so colour is never the only cue.
// Used by app.js to fill tiles; saved by id in store.js.
// ======================================================================

export const DESK_COLORS = Object.freeze([
  { id: "yellow",  name: "Yellow",    hex: "#F0E442", darkText: true,  symbol: "●" },
  { id: "orange",  name: "Orange",    hex: "#E69F00", darkText: true,  symbol: "■" },
  { id: "skyBlue", name: "Sky blue",  hex: "#56B4E9", darkText: true,  symbol: "▲" },
  { id: "mint",    name: "Mint",      hex: "#4CC9A0", darkText: true,  symbol: "◆" },
  { id: "pink",    name: "Pink",      hex: "#E08FBE", darkText: true,  symbol: "♥" },
  { id: "navy",    name: "Navy",      hex: "#005A8C", darkText: false, symbol: "★" },
  { id: "plum",    name: "Plum",      hex: "#8A396B", darkText: false, symbol: "⬢" },
  { id: "forest",  name: "Forest",    hex: "#005E45", darkText: false, symbol: "⬟" },
  { id: "brick",   name: "Brick",     hex: "#8F3600", darkText: false, symbol: "♣" },
  { id: "slate",   name: "Slate",     hex: "#3F4A55", darkText: false, symbol: "✚" },
].map(Object.freeze));

/** The colour with this id, or null (unknown ids are ignored, never trusted). */
export function findColor(id) {
  return DESK_COLORS.find((c) => c.id === id) ?? null;
}

/** WCAG contrast ratio between a colour and black (or white) text. */
export function contrast(hex, againstBlack) {
  const lum = relativeLuminance(hex);
  const other = againstBlack ? 0 : 1;
  const [hi, lo] = lum > other ? [lum, other] : [other, lum];
  return (hi + 0.05) / (lo + 0.05);
}

function relativeLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel((n >> 16) & 255), g = channel((n >> 8) & 255), b = channel(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
