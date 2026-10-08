import { strict as assert } from "node:assert";
import { test } from "node:test";
import { attachSoundVectors } from "./library.ts";
import type { LibraryTrack } from "./evaluate.ts";

const b64 = (values: number[]) => Buffer.from(Int8Array.from(values).buffer).toString("base64");
const shape = (lead: number[]) => [...lead, ...new Array(128 - lead.length).fill(10)];

test("sound vectors are decoded, centred on the library and made unit length", () => {
  const tracks = [
    { id: "a", title: "A", sound_vector: b64(shape([100, 0])) },
    { id: "b", title: "B", sound_vector: b64(shape([90, 5])) },
    { id: "c", title: "C", sound_vector: b64(shape([0, 100])) },
    { id: "d", title: "D", sound_vector: "not base64 of 128 bytes" },
    { id: "e", title: "E" },
  ] as unknown as LibraryTrack[];
  assert.equal(attachSoundVectors(tracks), 3);
  const [a, b, c, d, e] = tracks;
  const dot = (x: number[], y: number[]) => x.reduce((sum, v, i) => sum + v * y[i]!, 0);
  assert.ok(Math.abs(dot(a!.embedding!, a!.embedding!) - 1) < 1e-3, "unit length");
  assert.ok(dot(a!.embedding!, b!.embedding!) > 0.9, "alike songs point the same way");
  assert.ok(dot(a!.embedding!, c!.embedding!) < 0, "once the shared part (all the 10s) is taken out, unlike songs point apart");
  assert.equal(d!.embedding, undefined);
  assert.equal(e!.embedding, undefined);
});
