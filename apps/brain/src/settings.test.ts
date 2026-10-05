/** Settings changed in the web app, on top of deploy/.env. */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { RuntimeSettings } from "./settings.ts";

const KEY = "0123456789abcdef0123456789abcdef";
const SECRET = "fedcba9876543210fedcba9876543210";

test("saved values win over the server file; clearing goes back to it; secrets never leave", () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-settings-"));
  try {
    const path = join(dir, "settings.json");
    const defaults = { musicbrainzContact: "me@example.org", lastfmApiKey: "", lastfmApiSecret: "", publicUrl: "", uploadMaxMb: 2048 };
    const settings = new RuntimeSettings(path, defaults);
    const seen: string[][] = [];
    settings.onChange = (changed) => seen.push(changed);
    assert.equal(settings.view().origins.musicbrainz_contact, "server");
    assert.equal(settings.view().origins.lastfm_api_key, "unset");

    settings.update({ lastfm_api_key: KEY.toUpperCase(), lastfm_api_secret: SECRET, public_url: "http://syd.local:8080/", upload_max_mb: "500" });
    assert.equal(settings.lastfmApiKey, KEY, "stored lower-case");
    assert.equal(settings.publicUrl, "http://syd.local:8080", "trailing slash dropped");
    assert.equal(settings.uploadMaxBytes, 500 * 1024 * 1024);
    const view = settings.view();
    assert.equal(view.lastfm_api_key, "…cdef");
    assert.equal(view.lastfm_api_secret, "set");
    assert.ok(!JSON.stringify(view).includes(SECRET) && !JSON.stringify(view).includes(KEY));
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.deepEqual(seen, [["lastfm_api_key", "lastfm_api_secret", "public_url", "upload_max_mb"]]);

    // A bad value changes nothing at all.
    assert.throws(() => settings.update({ upload_max_mb: 100, lastfm_api_key: "nope" }), /32 letters/);
    assert.equal(settings.uploadMaxMb, 500);
    assert.throws(() => settings.update({ musicbrainz_contact: "not a contact" }), /email address or a web address/);
    assert.throws(() => settings.update({ public_url: "ftp://x" }), /http/);
    assert.throws(() => settings.update({ upload_max_mb: 0 }), /between 1 and 20480/);

    settings.update({ upload_max_mb: "" , public_url: "" });
    assert.equal(settings.uploadMaxMb, 2048, "cleared: back to the server file");
    assert.equal(settings.view().origins.public_url, "unset");
    assert.deepEqual(settings.update({}), [], "nothing sent, nothing saved");

    const reloaded = new RuntimeSettings(path, defaults);
    assert.equal(reloaded.lastfmApiSecret, SECRET);
    assert.equal(JSON.parse(readFileSync(path, "utf8")).format, "synamp.settings/1");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
