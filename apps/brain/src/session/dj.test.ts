import assert from "node:assert/strict";
import { test } from "node:test";
import { djOrder, keyDistance, note, tempoGap, transitionCost } from "./dj.ts";
import { mp3Gapless, mp4Gapless } from "./gapless.ts";

test("DJ mode: tempo gaps count half/double time as the same beat; keys by the Camelot wheel", () => {
  assert.ok(Math.abs(tempoGap(120, 126) - 5) < 0.01);
  assert.ok(tempoGap(70, 140) < 0.01, "half time shares the beat");
  assert.equal(keyDistance("8A", "8A"), 0);
  assert.equal(keyDistance("8A", "8B"), 1, "relative major/minor");
  assert.equal(keyDistance("8A", "9A"), 1);
  assert.equal(keyDistance("12A", "1A"), 1, "the wheel wraps");
  assert.equal(keyDistance("8A", "10A"), 2);
  assert.ok(transitionCost({ id: "a", bpm: 124, camelot: "8A" }, { id: "b", bpm: 125, camelot: "9A" }) < transitionCost({ id: "a", bpm: 124, camelot: "8A" }, { id: "c", bpm: 90, camelot: "3B" }));
  assert.equal(note({ id: "a", bpm: 120, camelot: "8A" }, { id: "b", bpm: 122, camelot: "8A" }), "same key · +2 BPM");
});

test("DJ mode: an order where each song flows into the next; the first stays first; nothing is dropped", () => {
  const tracks = [
    { id: "start", bpm: 120, camelot: "8A" },
    { id: "far", bpm: 90, camelot: "2B" },
    { id: "near1", bpm: 121, camelot: "9A" },
    { id: "near2", bpm: 123, camelot: "9A" },
    { id: "mid", bpm: 100, camelot: "2B" },
    { id: "unknown" },
  ];
  const order = djOrder(tracks).map((s) => s.id);
  assert.equal(order[0], "start");
  assert.deepEqual([...order].sort(), tracks.map((t) => t.id).sort());
  assert.deepEqual(order.slice(1, 3), ["near1", "near2"]);
  assert.ok(order.indexOf("mid") === order.indexOf("far") - 1 || order.indexOf("far") === order.indexOf("mid") - 1, "the two 2B songs sit together");
  const steps = djOrder(tracks);
  assert.equal(steps[1]!.note, "neighbouring key · +1 BPM");
  assert.deepEqual(djOrder([{ id: "x" }]), [{ id: "x" }]);
  const big = Array.from({ length: 600 }, (_, i) => ({ id: `t${i}`, bpm: 80 + (i * 37) % 80, camelot: `${(i % 12) + 1}${i % 2 ? "A" : "B"}` }));
  const started = Date.now();
  assert.equal(djOrder(big).length, 600);
  assert.ok(Date.now() - started < 3000, "fast enough for a big playlist");
});

test("gapless: LAME delay/padding from the first frame, and iTunSMPB from an M4A", () => {
  // A minimal MPEG-1 Layer III stereo frame header with an Info tag and a LAME tag.
  const frame = Buffer.alloc(600);
  frame.set([0xff, 0xfb, 0x90, 0x44], 0); // 44.1 kHz, joint stereo
  const xing = 4 + 32;
  frame.write("Info", xing, "latin1");
  frame.writeUInt32BE(0x0f, xing + 4); // frames, bytes, TOC, quality
  frame.writeUInt32BE(100, xing + 8);  // 100 frames
  frame.write("LAME3.100", xing + 120, "latin1");
  frame[xing + 120 + 21] = 0x24; frame[xing + 120 + 22] = 0x01; frame[xing + 120 + 23] = 0x85; // delay 576, padding 389
  assert.deepEqual(mp3Gapless(frame), { delay: 576 + 529, padding: 389 - 529 < 0 ? 0 : 389 - 529, samples: 100 * 1152 - 576 - 389, rate: 44100 });
  assert.equal(mp3Gapless(Buffer.from([0xff, 0xfb, 0x90, 0x44, ...Buffer.alloc(200)])), null, "no Info tag: nothing to go on");
  const moov = Buffer.concat([Buffer.from("....----....meanxxxxcom.apple.iTunes....nameiTunSMPB....data", "latin1"), Buffer.alloc(8), Buffer.from(" 00000000 00000840 000001CC 00000000001F3E80 00000000", "latin1")]);
  assert.deepEqual(mp4Gapless(moov, 44100), { delay: 0x840, padding: 0x1cc, samples: 0x1f3e80, rate: 44100 });
});
