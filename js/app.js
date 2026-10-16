// ======================================================================
// app.js — SpaceKeeper for ChromeOS: the screen and what you do on it
// ======================================================================
// Based on SpaceKeeper for Mac. One tile per desk:
//   click / Enter          go to that desk
//   double-click / F2 / R  name it (the cursor goes straight into the box)
//   right-click / M / Shift+F10   menu: colour, move, remove
//   drag / Alt+Shift+arrows       put tiles in your order
//   1–9                    jump to the first nine tiles
//   Ctrl+Alt+N             add a desk
//
// desks.js talks to ChromeOS (or pretends, in demo mode); store.js
// remembers names, colours and order. All text you type is shown with
// textContent only, never as HTML.
// ======================================================================

import { ChromeDesks, DemoDesks, DeskError } from "./desks.js";
import * as store from "./store.js";
import { DESK_COLORS, findColor } from "./colors.js";
import { MAX_NAME_LENGTH } from "./text.js";

const $ = (id) => document.getElementById(id);
const els = {
  current: $("current"), mode: $("mode"), grid: $("desks"), learning: $("learning"),
  status: $("status"), add: $("add"), menu: $("menu"),
  allDesks: $("set-all-desks"), confirm: $("set-confirm"), textSize: $("set-text-size"),
  forgetMissing: $("forget-missing"),
};

const DOUBLE_CLICK_MS = 300;
const POLL_MS = 2000;
const ADMIN_GUIDE = "https://github.com/shuistyle/SpaceKeeper-ChromeOS/blob/main/ADMIN-SETUP.md";

const app = {
  desks: null,          // ChromeDesks or DemoDesks
  storageKey: store.KEY,
  state: store.defaultState(),
  activeId: null,       // the desk you're on
  chromeNames: new Map(), // id → ChromeOS's own name for the desk
  focusId: null,        // the tile with keyboard focus (roving tabindex)
  renamingId: null,
  confirmingId: null,
  busy: false,
  rendering: false,     // true while the tiles are being redrawn
  pendingClick: null,
};

// ----------------------------------------------------------------------
// Start-up
// ----------------------------------------------------------------------

async function start() {
  const forceDemo = new URLSearchParams(location.search).has("demo");
  const chrome = forceDemo ? null : await ChromeDesks.connect();
  if (chrome) {
    app.desks = chrome;
  } else {
    app.desks = new DemoDesks();
    app.storageKey = store.DEMO_KEY;
    showDemoBanner(forceDemo);
  }

  app.state = store.load(globalThis.localStorage, app.storageKey);
  if (app.desks.isDemo) {
    // Demo desks are new each time, so start the pretend list afresh.
    app.state = { ...store.defaultState(), settings: app.state.settings };
    for (const id of app.desks.all()) store.addDesk(app.state, id);
  }
  applySettings();
  wireUp();

  if (app.state.settings.allDesks) app.desks.showOnAllDesks(true).catch(() => {});
  app.desks.listen(onDeskEvent);

  await updateActive();
  await refreshNames();
  render();
  focusTile(app.activeId ?? app.state.order[0], { scroll: false, onlyRoving: true });

  setInterval(() => { if (document.visibilityState === "visible") updateActive(); }, POLL_MS);
  window.addEventListener("focus", () => updateActive());
}

function showDemoBanner(forced) {
  const isChromeOS = /\bCrOS\b/.test(navigator.userAgent);
  const reason = forced ? "You asked for demo mode."
    : !isChromeOS ? "To control real desks, open SpaceKeeper on a school or work Chromebook."
    : typeof globalThis.chrome?.runtime?.sendMessage !== "function"
      ? "Your administrator needs to switch on the ChromeOS Desk API for this web address."
      : "ChromeOS's Desk API didn't answer. Check that your administrator has allowed this web address.";
  els.mode.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = "Demo mode: these are pretend desks.";
  const text = document.createTextNode(` ${reason} `);
  const link = document.createElement("a");
  link.href = ADMIN_GUIDE;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Set-up guide for administrators";
  els.mode.append(strong, text, link);
  els.mode.hidden = false;
}

// ----------------------------------------------------------------------
// Keeping up with ChromeOS
// ----------------------------------------------------------------------

/** Asks ChromeOS which desk you're on, and remembers it if it's new. */
async function updateActive() {
  try {
    const id = await app.desks.activeDesk();
    if (!id) return;
    const isNew = store.addDesk(app.state, id);
    if (isNew) { persist(); await fetchName(id); }
    if (id !== app.activeId || isNew) {
      app.activeId = id;
      render();
    }
  } catch {
    // ChromeOS busy or unavailable for a moment; the next check will catch up.
  }
}

async function fetchName(id) {
  try {
    app.chromeNames.set(id, await app.desks.deskName(id));
    return true;
  } catch (error) {
    return !(error instanceof DeskError && error.code === "ResourceNotFoundError");
  }
}

/** Gets ChromeOS's names; forgets desks that were removed while SpaceKeeper was closed. */
async function refreshNames() {
  let forgot = 0;
  for (const id of [...app.state.order]) {
    if (!(await fetchName(id))) { store.forgetDesk(app.state, id); forgot++; }
  }
  if (forgot) persist();
  return forgot;
}

async function onDeskEvent(event) {
  if (event.type === "DeskSwitched" && event.activated) {
    if (store.addDesk(app.state, event.activated)) { persist(); await fetchName(event.activated); }
    app.activeId = event.activated;
  } else if (event.type === "DeskAdded" && event.deskId) {
    if (store.addDesk(app.state, event.deskId)) { persist(); await fetchName(event.deskId); }
  } else if (event.type === "DeskRemoved" && event.deskId) {
    if (store.forgetDesk(app.state, event.deskId)) persist();
    if (app.focusId === event.deskId) app.focusId = null;
  } else if (event.type === "DeskUndone" && event.deskId) {
    if (store.addDesk(app.state, event.deskId)) { persist(); await fetchName(event.deskId); }
  }
  render();
}

// ----------------------------------------------------------------------
// Names and labels
// ----------------------------------------------------------------------

function displayName(id) {
  return app.state.desks[id]?.name || app.chromeNames.get(id) || `Desk ${app.state.order.indexOf(id) + 1}`;
}

/** What a screen reader says for a tile. */
function summary(id) {
  const parts = [displayName(id)];
  const chromeName = app.chromeNames.get(id);
  if (app.state.desks[id]?.name && chromeName && chromeName !== displayName(id)) parts.push(`${chromeName} in ChromeOS`);
  if (id === app.activeId) parts.push("current");
  const color = findColor(app.state.desks[id]?.color);
  if (color) parts.push(`colour ${color.name}`);
  parts.push(`${app.state.order.indexOf(id) + 1} of ${app.state.order.length}`);
  return parts.join(", ");
}

// ----------------------------------------------------------------------
// Drawing the tiles
// ----------------------------------------------------------------------

function render() {
  const hadFocus = els.grid.contains(document.activeElement);
  const { order } = app.state;
  if (!order.includes(app.focusId)) app.focusId = app.activeId ?? order[0] ?? null;

  // If you're typing a name, keep what you've typed through the redraw.
  const typing = els.grid.querySelector(".name-input");
  const draft = typing && app.renamingId
    ? { value: typing.value, start: typing.selectionStart, end: typing.selectionEnd, focused: document.activeElement === typing }
    : null;

  app.rendering = true;
  els.grid.replaceChildren(...order.map((id, index) => tileFor(id, index)));
  app.rendering = false;

  els.current.textContent = app.activeId ? `You're on: ${displayName(app.activeId)}` : "";
  els.learning.hidden = app.desks?.isDemo ?? true;
  document.title = app.activeId ? `${displayName(app.activeId)} – SpaceKeeper` : "SpaceKeeper";
  els.add.disabled = app.busy;

  if (app.renamingId) {
    const input = els.grid.querySelector(".name-input");
    if (input && draft) {
      input.value = draft.value;
      if (draft.focused) { input.focus(); input.setSelectionRange(draft.start, draft.end); }
    } else if (input) {
      focusNameBox(input);
    }
  } else if (app.confirmingId) {
    els.grid.querySelector(".confirm .cancel")?.focus();
  } else if (hadFocus) {
    focusTile(app.focusId, { scroll: false });
  }
}

function tileFor(id, index) {
  const desk = app.state.desks[id];
  const color = findColor(desk.color);
  const isCurrent = id === app.activeId;

  const li = document.createElement("li");
  const tile = document.createElement("div");
  tile.className = "tile" + (isCurrent ? " current" : "") + (color ? " colored" : "");
  tile.dataset.id = id;
  tile.setAttribute("role", "button");
  tile.tabIndex = id === app.focusId ? 0 : -1;
  tile.setAttribute("aria-label", summary(id));
  tile.setAttribute("aria-describedby", "tile-help");
  if (isCurrent) tile.setAttribute("aria-current", "true");
  tile.draggable = id !== app.renamingId && id !== app.confirmingId;
  if (color) {
    tile.style.setProperty("--fill", color.hex);
    tile.style.setProperty("--ink", color.darkText ? "#000000" : "#ffffff");
  }

  const head = document.createElement("div");
  head.className = "tile-head";
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = String(index + 1);
  head.append(badge);
  if (color) {
    const symbol = document.createElement("span");
    symbol.className = "symbol";
    symbol.textContent = color.symbol; // so colour is never the only cue
    symbol.setAttribute("aria-hidden", "true");
    head.append(symbol);
  }
  tile.append(head);

  if (id === app.renamingId) {
    tile.append(nameInput(id));
  } else {
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = displayName(id);
    tile.append(name);
  }

  const subtitle = [];
  const chromeName = app.chromeNames.get(id);
  if (desk.name && chromeName && chromeName !== desk.name) subtitle.push(chromeName);
  if (isCurrent) subtitle.push("current");
  if (subtitle.length) {
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = subtitle.join(" · ");
    tile.append(sub);
  }

  if (id === app.confirmingId) tile.append(confirmBox(id));
  li.append(tile);
  return li;
}

/**
 * Puts the cursor in the name box with the old name selected, so you can
 * type straight away. Tried again on the next frame in case the click that
 * started renaming moves focus back to the tile.
 */
function focusNameBox(input) {
  input.focus();
  input.select();
  requestAnimationFrame(() => {
    if (input.isConnected && document.activeElement !== input && input.value === app.state.desks[app.renamingId]?.name) {
      input.focus();
      input.select();
    }
  });
}

function nameInput(id) {
  const input = document.createElement("input");
  input.className = "name-input";
  input.type = "text";
  input.maxLength = MAX_NAME_LENGTH;
  input.value = app.state.desks[id].name;
  input.placeholder = app.chromeNames.get(id) || "Desk name";
  input.setAttribute("aria-label", `Name for ${app.chromeNames.get(id) || "this desk"}`);
  input.setAttribute("aria-describedby", "name-help");
  input.autocomplete = "off";
  input.spellcheck = false;
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); finishRename(id, input.value); }
    else if (e.key === "Escape") { e.preventDefault(); finishRename(id, null); }
  });
  // Clicking elsewhere saves the name (but not when the tiles are just being redrawn).
  input.addEventListener("blur", () => {
    if (!app.rendering && app.renamingId === id) finishRename(id, input.value, { keepFocus: false });
  });
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("dblclick", (e) => e.stopPropagation());
  return input;
}

function confirmBox(id) {
  const box = document.createElement("div");
  box.className = "confirm";
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", `Remove ${displayName(id)}?`);
  const text = document.createElement("span");
  text.textContent = `Remove “${displayName(id)}”? Its windows move to the next desk.`;
  const row = document.createElement("div");
  row.className = "row";
  const yes = document.createElement("button");
  yes.type = "button"; yes.className = "danger"; yes.textContent = "Remove";
  yes.addEventListener("click", (e) => { e.stopPropagation(); removeDesk(id); });
  const no = document.createElement("button");
  no.type = "button"; no.className = "cancel"; no.textContent = "Cancel";
  no.addEventListener("click", (e) => { e.stopPropagation(); cancelConfirm(); });
  box.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); cancelConfirm(); }
  });
  for (const ev of ["dblclick", "contextmenu", "pointerdown"]) box.addEventListener(ev, (e) => e.stopPropagation());
  row.append(yes, no);
  box.append(text, row);
  return box;
}

// ----------------------------------------------------------------------
// Actions
// ----------------------------------------------------------------------

function announce(text) {
  // Clear first so the same message is read again if repeated.
  els.status.textContent = "";
  requestAnimationFrame(() => { els.status.textContent = text; });
}

function persist() {
  if (!store.save(app.state, globalThis.localStorage, app.storageKey)) {
    announce("This browser wouldn't save SpaceKeeper's settings, so they'll be lost when you close it.");
  }
}

async function goTo(id) {
  if (!id || id === app.activeId || app.busy) return;
  try {
    await app.desks.switchTo(id);
    app.activeId = id;
    app.focusId = id;
    render();
    announce(`Now on ${displayName(id)}.`);
  } catch (error) {
    if (error.code === "ResourceNotFoundError") {
      store.forgetDesk(app.state, id); persist(); render();
    }
    announce(error.message);
  }
}

function startRename(id) {
  if (!app.state.desks[id]) return;
  closeMenu();
  app.confirmingId = null;
  app.renamingId = id;
  app.focusId = id;
  render(); // render() puts the cursor in the box with the old name selected
}

function finishRename(id, text, { keepFocus = true } = {}) {
  if (app.renamingId !== id) return;
  app.renamingId = null;
  if (text !== null && store.rename(app.state, id, text)) {
    persist();
    announce(app.state.desks[id].name ? `Named ${displayName(id)}.` : "Name cleared.");
  }
  render();
  if (keepFocus) focusTile(id);
}

function setColor(id, colorId) {
  if (store.setColor(app.state, id, colorId)) {
    persist();
    render();
    const color = findColor(colorId);
    announce(color ? `${displayName(id)}: ${color.name}.` : `${displayName(id)}: no colour.`);
  }
}

function moveTile(id, offset) {
  if (store.move(app.state, id, offset)) {
    persist();
    app.focusId = id;
    render();
    focusTile(id);
    announce(`${displayName(id)} moved to position ${app.state.order.indexOf(id) + 1} of ${app.state.order.length}.`);
  }
}

function requestRemove(id) {
  closeMenu();
  if (app.state.settings.confirmRemove) {
    app.renamingId = null;
    app.confirmingId = id;
    render();
  } else {
    removeDesk(id);
  }
}

function cancelConfirm() {
  const id = app.confirmingId;
  app.confirmingId = null;
  render();
  focusTile(id);
}

async function removeDesk(id) {
  const name = displayName(id);
  app.confirmingId = null;
  app.busy = true;
  render();
  try {
    await app.desks.removeDesk(id);
    store.forgetDesk(app.state, id);
    persist();
    announce(`Removed ${name}. Its windows moved to the next desk.`);
  } catch (error) {
    announce(error.message);
  } finally {
    app.busy = false;
    await updateActive();
    render();
    focusTile(app.activeId);
  }
}

async function addDesk() {
  if (app.busy) return;
  app.busy = true;
  render();
  try {
    const id = await app.desks.addDesk();
    store.addDesk(app.state, id);
    persist();
    await fetchName(id);
    app.activeId = id;
    app.focusId = id;
    announce(`Added ${displayName(id)} and went to it. Press F2 to name it.`);
  } catch (error) {
    announce(error.message);
  } finally {
    app.busy = false;
    render();
    focusTile(app.focusId);
  }
}

async function forgetMissing() {
  const count = await refreshNames();
  render();
  announce(count ? `Removed ${count} desk${count === 1 ? " that no longer exists" : "s that no longer exist"}.` : "Every desk in SpaceKeeper still exists.");
}

// ----------------------------------------------------------------------
// Focus and keyboard
// ----------------------------------------------------------------------

function tileEl(id) {
  return id ? els.grid.querySelector(`.tile[data-id="${CSS.escape(id)}"]`) : null;
}

/** Moves keyboard focus to a tile (only one tile is in the Tab order at a time). */
function focusTile(id, { scroll = true, onlyRoving = false } = {}) {
  const el = tileEl(id);
  if (!el) return;
  app.focusId = id;
  for (const t of els.grid.querySelectorAll(".tile")) t.tabIndex = t === el ? 0 : -1;
  if (!onlyRoving) el.focus({ preventScroll: !scroll });
}

function columns() {
  const tiles = [...els.grid.querySelectorAll(".tile")];
  if (!tiles.length) return 1;
  const top = tiles[0].getBoundingClientRect().top;
  return Math.max(1, tiles.filter((t) => Math.abs(t.getBoundingClientRect().top - top) < 2).length);
}

function onTileKey(e, id) {
  const { order } = app.state;
  const i = order.indexOf(id);
  const cols = columns();
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];

  if (step !== undefined) {
    e.preventDefault();
    if (e.altKey && e.shiftKey) return moveTile(id, step);
    const next = order[Math.min(order.length - 1, Math.max(0, i + step))];
    return focusTile(next);
  }
  switch (e.key) {
    case "Enter": case " ":
      e.preventDefault(); return goTo(id);
    case "Home": e.preventDefault(); return focusTile(order[0]);
    case "End": e.preventDefault(); return focusTile(order[order.length - 1]);
    case "F2": case "r": case "R":
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); return startRename(id);
    case "m": case "M": case "ContextMenu":
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); return openMenuForTile(id);
    case "F10":
      if (e.shiftKey) { e.preventDefault(); openMenuForTile(id); }
      return;
    case "Delete": case "Backspace":
      e.preventDefault(); return requestRemove(id);
  }
}

function onDocumentKey(e) {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
  if (e.ctrlKey && e.altKey && (e.key === "n" || e.key === "N")) { e.preventDefault(); addDesk(); return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey || !els.menu.hidden) return;
  if (/^[1-9]$/.test(e.key)) {
    const id = app.state.order[Number(e.key) - 1];
    if (id) { e.preventDefault(); goTo(id); }
  }
}

// ----------------------------------------------------------------------
// Right-click menu
// ----------------------------------------------------------------------

let menuReturnFocus = null;

function openMenuForTile(id) {
  const rect = tileEl(id)?.getBoundingClientRect();
  openMenu(id, rect ? rect.left + 12 : 20, rect ? rect.top + 24 : 20);
}

function openMenu(id, x, y) {
  closeMenu();
  menuReturnFocus = id;
  const items = [];
  const add = (label, action, opts = {}) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", opts.radio ? "menuitemradio" : "menuitem");
    if (opts.radio) b.setAttribute("aria-checked", String(!!opts.checked));
    b.tabIndex = -1;
    if (opts.disabled) b.setAttribute("aria-disabled", "true");
    if (opts.swatch) b.append(opts.swatch);
    const text = document.createElement("span");
    text.textContent = label;
    b.append(text);
    if (opts.radio) {
      const check = document.createElement("span");
      check.className = "check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = opts.checked ? "✓" : "";
      b.prepend(check);
    }
    b.addEventListener("click", () => { if (!opts.disabled) { closeMenu(false); action(); } });
    items.push(b);
    return b;
  };
  const group = (label) => {
    const g = document.createElement("div");
    g.className = "group"; g.setAttribute("role", "presentation"); g.textContent = label;
    items.push(g);
  };
  const sep = () => { const s = document.createElement("div"); s.className = "sep"; s.setAttribute("role", "separator"); items.push(s); };

  const current = app.state.desks[id].color;
  add(id === app.activeId ? "You're on this desk" : "Go to this desk", () => goTo(id), { disabled: id === app.activeId });
  add("Name…", () => startRename(id));
  sep();
  group("Colour");
  add("No colour", () => setColor(id, null), { radio: true, checked: !current });
  for (const c of DESK_COLORS) {
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = c.hex;
    sw.style.color = c.darkText ? "#000" : "#fff";
    sw.textContent = c.symbol;
    sw.setAttribute("aria-hidden", "true");
    add(c.name, () => setColor(id, c.id), { radio: true, checked: current === c.id, swatch: sw });
  }
  sep();
  const i = app.state.order.indexOf(id);
  add("Move earlier", () => moveTile(id, -1), { disabled: i === 0 });
  add("Move later", () => moveTile(id, 1), { disabled: i === app.state.order.length - 1 });
  sep();
  add("Remove desk…", () => requestRemove(id));

  els.menu.replaceChildren(...items);
  els.menu.setAttribute("aria-label", `Actions for ${displayName(id)}`);
  els.menu.hidden = false;
  // Keep it on screen.
  const { innerWidth: w, innerHeight: h } = window;
  const r = els.menu.getBoundingClientRect();
  els.menu.style.left = `${Math.max(4, Math.min(x, w - r.width - 4))}px`;
  els.menu.style.top = `${Math.max(4, Math.min(y, h - r.height - 4))}px`;
  const first = menuItems()[0];
  if (first) { first.tabIndex = 0; first.focus(); }
}

function menuItems() {
  return [...els.menu.querySelectorAll('[role^="menuitem"]')].filter((b) => b.getAttribute("aria-disabled") !== "true");
}

function closeMenu(restoreFocus = true) {
  if (els.menu.hidden) return;
  els.menu.hidden = true;
  els.menu.replaceChildren();
  if (restoreFocus && menuReturnFocus) focusTile(menuReturnFocus);
}

function onMenuKey(e) {
  const items = menuItems();
  const at = items.indexOf(document.activeElement);
  const go = (n) => {
    e.preventDefault();
    const next = items[(n + items.length) % items.length];
    if (!next) return;
    for (const item of items) item.tabIndex = item === next ? 0 : -1; // one item in the Tab order
    next.focus();
  };
  switch (e.key) {
    case "ArrowDown": return go(at + 1);
    case "ArrowUp": return go(at - 1);
    case "Home": return go(0);
    case "End": return go(items.length - 1);
    case "Escape": e.preventDefault(); return closeMenu();
    case "Tab": e.preventDefault(); return closeMenu();
  }
}

// ----------------------------------------------------------------------
// Settings
// ----------------------------------------------------------------------

function applySettings() {
  const s = app.state.settings;
  document.documentElement.dataset.textSize = s.textSize;
  els.allDesks.checked = s.allDesks;
  els.confirm.checked = s.confirmRemove;
  els.textSize.value = s.textSize;
}

// ----------------------------------------------------------------------
// Wiring
// ----------------------------------------------------------------------

function wireUp() {
  // Help text read by screen readers on each tile and in the name box.
  for (const [id, text] of [
    ["tile-help", "Enter to go there. F2 to name it. M for colour, moving and removing. Alt+Shift+arrows to move it."],
    ["name-help", `Up to ${MAX_NAME_LENGTH} characters. Enter saves, Escape cancels.`],
  ]) {
    const p = document.createElement("p");
    p.id = id; p.hidden = true; p.textContent = text;
    document.body.append(p);
  }

  els.add.addEventListener("click", addDesk);
  els.forgetMissing.addEventListener("click", forgetMissing);
  els.allDesks.addEventListener("change", () => {
    app.state.settings.allDesks = els.allDesks.checked;
    persist();
    app.desks.showOnAllDesks(els.allDesks.checked)
      .then(() => announce(els.allDesks.checked ? "SpaceKeeper now shows on every desk." : "SpaceKeeper now stays on one desk."))
      .catch((error) => announce(error.message));
  });
  els.confirm.addEventListener("change", () => { app.state.settings.confirmRemove = els.confirm.checked; persist(); });
  els.textSize.addEventListener("change", () => {
    app.state.settings.textSize = els.textSize.value;
    persist();
    applySettings();
    render();
  });

  // Tiles (one listener for the whole grid).
  const idOf = (e) => e.target.closest(".tile")?.dataset.id;
  els.grid.addEventListener("click", (e) => {
    const id = idOf(e);
    if (!id || id === app.renamingId || app.confirmingId) return;
    focusTile(id);
    clearTimeout(app.pendingClick);
    // Wait briefly: a second click makes it a double-click (rename) instead.
    if (e.detail === 1) app.pendingClick = setTimeout(() => goTo(id), DOUBLE_CLICK_MS);
  });
  els.grid.addEventListener("dblclick", (e) => {
    const id = idOf(e);
    if (!id || app.confirmingId) return;
    clearTimeout(app.pendingClick);
    startRename(id);
  });
  els.grid.addEventListener("contextmenu", (e) => {
    const id = idOf(e);
    if (!id || id === app.renamingId) return;
    e.preventDefault();
    clearTimeout(app.pendingClick);
    focusTile(id);
    openMenu(id, e.clientX, e.clientY);
  });
  els.grid.addEventListener("keydown", (e) => {
    const id = e.target.classList?.contains("tile") ? e.target.dataset.id : null;
    if (id) onTileKey(e, id);
  });
  els.grid.addEventListener("focusin", (e) => {
    if (e.target.classList?.contains("tile")) app.focusId = e.target.dataset.id;
  });

  // Drag and drop to reorder.
  let dragId = null;
  const clearDrop = () => els.grid.querySelectorAll(".drop-before, .dragging").forEach((t) => t.classList.remove("drop-before", "dragging"));
  els.grid.addEventListener("dragstart", (e) => {
    dragId = idOf(e);
    if (!dragId) return;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
    e.target.closest(".tile").classList.add("dragging");
  });
  els.grid.addEventListener("dragover", (e) => {
    if (!dragId) return;
    e.preventDefault();
    const target = e.target.closest(".tile");
    els.grid.querySelectorAll(".drop-before").forEach((t) => t.classList.remove("drop-before"));
    if (target && target.dataset.id !== dragId) target.classList.add("drop-before");
  });
  els.grid.addEventListener("drop", (e) => {
    if (!dragId) return;
    e.preventDefault();
    const before = e.target.closest(".tile")?.dataset.id ?? null;
    if (store.moveBefore(app.state, dragId, before)) {
      persist();
      announce(`${displayName(dragId)} moved to position ${app.state.order.indexOf(dragId) + 1}.`);
    }
    dragId = null;
    render();
  });
  els.grid.addEventListener("dragend", () => { dragId = null; clearDrop(); });

  // Menu.
  els.menu.addEventListener("keydown", onMenuKey);
  document.addEventListener("pointerdown", (e) => { if (!els.menu.hidden && !els.menu.contains(e.target)) closeMenu(false); });
  window.addEventListener("blur", () => closeMenu(false));
  window.addEventListener("resize", () => closeMenu(false));

  document.addEventListener("keydown", onDocumentKey);
}

// Offline support (sw.js). Not available when opened straight from a file.
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

start().catch((error) => {
  announce("SpaceKeeper couldn't start. Reload the page to try again.");
  console.error(error);
});
