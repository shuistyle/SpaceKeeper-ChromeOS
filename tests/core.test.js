// Run with: npm test   (or: node --test)
import test from "node:test";
import assert from "node:assert/strict";
import { DESK_COLORS, contrast, findColor } from "../js/colors.js";
import { cleanName, isDeskId, MAX_NAME_LENGTH } from "../js/text.js";
import * as store from "../js/store.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

test("every colour's text has at least 7:1 contrast (WCAG AAA)", () => {
  for (const c of DESK_COLORS) {
    const ratio = contrast(c.hex, c.darkText);
    assert.ok(ratio >= 7, `${c.name} is only ${ratio.toFixed(2)}:1`);
  }
});

test("colours have unique ids, names and symbols", () => {
  for (const key of ["id", "name", "symbol", "hex"]) {
    assert.equal(new Set(DESK_COLORS.map((c) => c[key])).size, DESK_COLORS.length, key);
  }
  assert.equal(findColor("navy").name, "Navy");
  assert.equal(findColor("nope"), null);
  assert.equal(findColor(undefined), null);
});

test("names are tidied and limited", () => {
  assert.equal(cleanName("  Maths   lesson \n"), "Maths lesson");
  assert.equal(cleanName("abc‮def​"), "abcdef");
  assert.equal(cleanName("x".repeat(100)).length, MAX_NAME_LENGTH);
  assert.equal(cleanName("😀".repeat(70)).length, MAX_NAME_LENGTH * 2); // 60 emoji, not 60 halves
  assert.equal(cleanName(42), "");
});

test("only UUIDs are accepted as desk ids", () => {
  assert.ok(isDeskId(A));
  assert.ok(!isDeskId("../../etc"));
  assert.ok(!isDeskId(`${A}x`));
  assert.ok(!isDeskId(null));
});

test("damaged or tampered saves are cleaned up", () => {
  const state = store.sanitize({
    desks: {
      [A]: { name: "<img src=x onerror=alert(1)>  ", color: "navy" },
      [B]: { name: 5, color: "hotpink" },
      "not-a-uuid": { name: "x" },
    },
    order: [B, B, "junk", C],
    settings: { allDesks: "yes", textSize: "huge", confirmRemove: false },
  });
  assert.deepEqual(Object.keys(state.desks).sort(), [A, B]);
  assert.equal(state.desks[A].name, "<img src=x onerror=alert(1)>"); // kept as plain text, shown with textContent
  assert.equal(state.desks[B].color, null);
  assert.equal(state.desks[B].name, "");
  assert.deepEqual(state.order, [B, A]);
  assert.equal(state.settings.allDesks, true);
  assert.equal(state.settings.textSize, "standard");
  assert.equal(state.settings.confirmRemove, false);
  assert.deepEqual(store.sanitize("garbage"), store.defaultState());
});

test("load and save survive broken storage", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); } };
  assert.deepEqual(store.load(broken), store.defaultState());
  assert.equal(store.save(store.defaultState(), broken), false);
  const memory = new Map();
  const ok = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  const s = store.defaultState();
  store.addDesk(s, A);
  store.rename(s, A, "Science");
  assert.ok(store.save(s, ok));
  assert.equal(store.load(ok).desks[A].name, "Science");
  assert.equal(store.load(ok, store.DEMO_KEY).order.length, 0); // demo kept separate
});

test("adding, moving and forgetting desks", () => {
  const s = store.defaultState();
  assert.ok(store.addDesk(s, A));
  assert.ok(!store.addDesk(s, A));
  assert.ok(!store.addDesk(s, "bad"));
  store.addDesk(s, B);
  store.addDesk(s, C);
  assert.ok(store.move(s, C, -2));
  assert.deepEqual(s.order, [C, A, B]);
  assert.ok(!store.move(s, C, -1));
  assert.ok(store.moveBefore(s, C, null));
  assert.deepEqual(s.order, [A, B, C]);
  assert.ok(store.moveBefore(s, C, A));
  assert.deepEqual(s.order, [C, A, B]);
  assert.ok(store.setColor(s, A, "plum"));
  assert.ok(store.setColor(s, A, "bogus"));
  assert.equal(s.desks[A].color, null);
  assert.ok(store.forgetDesk(s, A));
  assert.deepEqual(s.order, [C, B]);
});
