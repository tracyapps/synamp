import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { guestKey, MAX_WAITING_PER_GUEST, newCode, PartyStore, RateLimit, REQUEST_GAP_MS } from "./party.ts";
import { EventLog } from "../session/events.ts";
import { SessionStore } from "../session/session.ts";

const temp = () => mkdtempSync(join(tmpdir(), "synamp-party-"));
const song = (id: string) => ({ id, title: `Song ${id}`, artist: "Band" });

test("codes are 6 easy-to-read characters", () => {
  assert.match(newCode(), /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(newCode(Buffer.from([0, 1, 2, 3, 4, 31])), "ABCDEA");
});

test("guest IDs are checked and only a hash is kept", () => {
  const key = guestKey("phone-abc12345");
  assert.equal(key.length, 16);
  assert.notEqual(key, "phone-abc12345");
  assert.equal(guestKey("phone-abc12345"), key);
  assert.throws(() => guestKey("x"), /Reload/);
  assert.throws(() => guestKey(undefined), /Reload/);
});

test("a party: codes in any case, requests, votes, the host's say, and the end", () => {
  const dir = temp();
  const store = new PartyStore(join(dir, "party.json"));
  const party = store.start();
  assert.throws(() => store.forCode("nope"), /ended, or the code is wrong/);
  assert.equal(store.forCode(party.code.toLowerCase().split("").join(" ")).code, party.code);

  const ana = guestKey("guest-ana-0001"), ben = guestKey("guest-ben-0002");
  const first = store.request(party.code, ana, song("t1"), "  Ana  ", 0);
  assert.equal(first.name, "Ana");
  store.request(party.code, ben, song("t2"), "", 0);
  // Asking for a song that's already waiting is a vote for it.
  const again = store.request(party.code, ben, song("t1"), "Ben", REQUEST_GAP_MS);
  assert.equal(again.id, first.id);
  assert.deepEqual(store.waiting().map((item) => [item.track_id, item.votes.length]), [["t1", 2], ["t2", 1]]);
  // Voting twice takes the vote back.
  store.vote(party.code, ben, first.id);
  assert.deepEqual(store.waiting().map((item) => item.track_id), ["t1", "t2"]);
  assert.equal(store.waiting()[0]!.votes.length, 1);

  const view = store.guestRequests(ana);
  assert.deepEqual(view[0], { id: first.id, title: "Song t1", artist: "Band", name: "Ana", votes: 1, mine: true, voted: true });
  assert.ok(!JSON.stringify(view).includes(ana), "guest IDs never shown");

  store.decide(first.id, "queued");
  assert.deepEqual(store.waiting().map((item) => item.track_id), ["t2"]);
  assert.equal(new PartyStore(join(dir, "party.json")).party?.code, party.code, "survives a restart");
  store.end();
  assert.throws(() => store.forCode(party.code), /ended/);
});

test("one guest can't flood the list", () => {
  const store = new PartyStore(join(temp(), "party.json"));
  const { code } = store.start();
  const guest = guestKey("guest-eager-01");
  store.request(code, guest, song("a"), "", 0);
  assert.throws(() => store.request(code, guest, song("b"), "", 1000), /One song at a time/);
  for (let index = 1; index < MAX_WAITING_PER_GUEST; index++) store.request(code, guest, song(`s${index}`), "", index * REQUEST_GAP_MS);
  assert.throws(() => store.request(code, guest, song("z"), "", 99 * REQUEST_GAP_MS), /songs waiting already/);
});

test("rate limit: so many a minute per key", () => {
  const limit = new RateLimit(2);
  limit.check("ip", 0); limit.check("ip", 1);
  assert.throws(() => limit.check("ip", 2), /Slow down/);
  limit.check("other", 2);
  limit.check("ip", 60_001);
});

test("play next goes right after the current song; party requests line up behind each other", () => {
  const dir = temp();
  const sessions = new SessionStore(join(dir, "session.json"), new EventLog(join(dir, "events.jsonl")));
  sessions.replaceQueue("evt-queue-0001", [song("a"), song("b"), song("c")]);
  sessions.playNext("party-req-0001", [{ ...song("r1"), requested_by: "Ana" }], { afterRequests: true });
  sessions.playNext("party-req-0002", [{ ...song("r2"), requested_by: "Ben" }], { afterRequests: true });
  sessions.playNext("host-next-0001", [song("h")]);
  assert.deepEqual(sessions.get().queue.map((entry) => entry.track_id), ["a", "h", "r1", "r2", "b", "c"]);
  assert.equal(sessions.get().queue[2]!.requested_by, "Ana");
  // Same report again: nothing changes.
  sessions.playNext("party-req-0001", [song("r1")], { afterRequests: true });
  assert.equal(sessions.get().queue.length, 6);
});
