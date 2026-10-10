import assert from "node:assert/strict";
import { test } from "node:test";
import { allState, emptySelection, groupState, isEmpty, itemChecked, SEP, selectionSpec, toggleAll, toggleGroup, toggleItem } from "../apps/web/src/library-selection.ts";

const nineties = "1990s", ani = `1990s${SEP}Ani DiFranco`, bjork = `1990s${SEP}Björk`;

test("ticking a group ticks everything in it, including sub-groups never loaded", () => {
  let sel = toggleGroup(emptySelection(), nineties);
  assert.equal(groupState(sel, nineties), "all");
  assert.equal(groupState(sel, ani), "all");
  assert.equal(itemChecked(sel, "song:a1", ani), true);
  assert.equal(itemChecked(sel, "song:e1", `1970s${SEP}Brian Eno`), false);
  sel = toggleItem(sel, "song:a1", ani); // untick one inside
  assert.equal(itemChecked(sel, "song:a1", ani), false);
  assert.equal(groupState(sel, ani), "some");
  assert.equal(groupState(sel, nineties), "some");
  assert.equal(groupState(sel, bjork), "all");
  sel = toggleGroup(sel, nineties); // a mixed group becomes fully ticked again
  assert.equal(groupState(sel, nineties), "all");
  assert.equal(itemChecked(sel, "song:a1", ani), true);
  sel = toggleGroup(sel, nineties);
  assert.ok(isEmpty(sel));
});

test("unticking a sub-group inside a ticked group, and single rows outside any group", () => {
  let sel = toggleGroup(emptySelection(), nineties);
  sel = toggleGroup(sel, bjork);
  assert.equal(groupState(sel, bjork), "none");
  assert.equal(groupState(sel, nineties), "some");
  assert.deepEqual(selectionSpec(sel).excluded, [`${bjork}\u0001*`]);
  sel = toggleGroup(sel, bjork); // tick it again: no leftover exclusion
  assert.deepEqual(selectionSpec(sel), { all: false, groups: [nineties], items: [], excluded: [] });

  let single = toggleItem(emptySelection(), "album:x", `1970s${SEP}Brian Eno`);
  assert.equal(groupState(single, "1970s"), "some");
  assert.equal(groupState(single, `1970s${SEP}Brian Eno`), "some");
  single = toggleGroup(single, `1970s${SEP}Brian Eno`); // the row is folded into the whole group
  assert.deepEqual(selectionSpec(single), { all: false, groups: [`1970s${SEP}Brian Eno`], items: [], excluded: [] });
});

test("select everything, untick a few, and the header shows it", () => {
  let sel = toggleAll(emptySelection());
  assert.equal(allState(sel), "all");
  assert.equal(itemChecked(sel, "song:z", ""), true, "ungrouped rows too");
  sel = toggleItem(sel, "song:z", "");
  assert.equal(itemChecked(sel, "song:z", ""), false);
  assert.equal(allState(sel), "some");
  sel = toggleGroup(sel, "1970s");
  assert.equal(groupState(sel, "1970s"), "none");
  assert.equal(toggleAll(sel).excluded.size, 0, "from mixed, the header ticks everything again");
  assert.ok(isEmpty(toggleAll(toggleAll(emptySelection()))));
});
