import assert from "node:assert/strict";
import { test } from "node:test";
import { albumHref, artistHref, routeFromHash } from "../apps/web/src/library-route.ts";

test("library pages: links and their routes round-trip, the list is the default", () => {
  assert.deepEqual(routeFromHash(artistHref("Björk")), { kind: "artist", name: "Björk" });
  assert.deepEqual(routeFromHash(artistHref("AC/DC")), { kind: "artist", name: "AC/DC" }, "a slash in a name stays in the name");
  assert.deepEqual(routeFromHash(albumHref("Ani DiFranco/Little Plastic Castle (1998)")), { kind: "album", key: "Ani DiFranco/Little Plastic Castle (1998)" });
  assert.deepEqual(routeFromHash("#/library"), { kind: "list" });
  assert.deepEqual(routeFromHash("#/library?library_view=%7B%7D"), { kind: "list" });
  assert.deepEqual(routeFromHash("#/library/artist/"), { kind: "list" });
  assert.deepEqual(routeFromHash("#/library/artist/%E0%A4%A"), { kind: "list" }, "a broken link falls back to the list");
  assert.deepEqual(routeFromHash("#/playlists"), { kind: "list" });
});
