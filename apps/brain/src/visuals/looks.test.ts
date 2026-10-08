import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LooksError, LooksStore } from "./looks.ts";

const file = () => join(mkdtempSync(join(tmpdir(), "synamp-looks-")), "visual-looks.json");

test("favourite, hide and choose the pool; it all survives a restart", () => {
  const path = file();
  const store = new LooksStore(path);
  assert.deepEqual(store.view(), { favourites: [], hidden: [], pool: "all" });
  store.update({ name: "Geiss - Spiral", favourite: true });
  store.update({ name: "Flexi - strobe", hidden: true });
  store.update({ pool: "favourites" });
  const again = new LooksStore(path);
  assert.deepEqual(again.view(), { favourites: ["Geiss - Spiral"], hidden: ["Flexi - strobe"], pool: "favourites" });
  again.update({ name: "Geiss - Spiral", favourite: false });
  assert.deepEqual(again.view().favourites, []);
});

test("a look is a favourite or hidden, never both", () => {
  const store = new LooksStore(file());
  store.update({ name: "A", favourite: true });
  store.update({ name: "A", hidden: true });
  assert.deepEqual(store.view(), { favourites: [], hidden: ["A"], pool: "all" });
  store.update({ name: "A", favourite: true });
  assert.deepEqual(store.view(), { favourites: ["A"], hidden: [], pool: "all" });
  store.update({ name: "A", favourite: true }); // twice is still once
  assert.deepEqual(store.view().favourites, ["A"]);
});

test("bad input is refused and a damaged file is cleaned up on load", () => {
  const store = new LooksStore(file());
  assert.throws(() => store.update({ pool: "some" }), LooksError);
  assert.throws(() => store.update({ name: "", favourite: true }), LooksError);
  assert.throws(() => store.update({ name: "A", favourite: "yes" }), LooksError);
  assert.throws(() => store.update({ name: "x".repeat(301), hidden: true }), LooksError);
  const path = file();
  writeFileSync(path, JSON.stringify({ favourites: ["A", "A", 3, "B"], hidden: ["B", "C"], pool: "nonsense" }));
  assert.deepEqual(new LooksStore(path).view(), { favourites: ["A", "B"], hidden: ["C"], pool: "all" });
  writeFileSync(path, "{not json");
  assert.deepEqual(new LooksStore(path).view(), { favourites: [], hidden: [], pool: "all" });
  assert.ok(readFileSync(path, "utf8").startsWith("{not")); // untouched until the next change
});
