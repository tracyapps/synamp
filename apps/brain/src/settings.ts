/**
 * Settings you change in the web app instead of in deploy/.env.
 *
 * The server file still provides the starting values (and keeps everything
 * about the install itself: folders, passwords, the access token, PUID/PGID).
 * What's saved here wins over it. Clearing a field in the app goes back to
 * the server file's value. Stored beside the other app data, readable only by
 * the brain; secrets are never sent back to the browser, only "set" or not.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

export class SettingsError extends Error {
  status = 400;
}

export type Defaults = {
  musicbrainzContact: string;
  lastfmApiKey: string;
  lastfmApiSecret: string;
  publicUrl: string;
  uploadMaxMb: number;
};
type Saved = Partial<{
  musicbrainz_contact: string;
  lastfm_api_key: string;
  lastfm_api_secret: string;
  public_url: string;
  upload_max_mb: number;
}>;
export type Field = keyof Required<Saved>;
export type Origin = "app" | "server" | "unset";

const LASTFM_KEY = /^[0-9a-f]{32}$/i;

export class RuntimeSettings {
  private path: string;
  private defaults: Defaults;
  private saved: Saved;
  /** Called after a save, so services can pick up new values without a restart. */
  onChange?: (changed: Field[]) => void;

  constructor(path: string, defaults: Defaults) {
    this.path = path;
    this.defaults = defaults;
    try { this.saved = (JSON.parse(readFileSync(path, "utf8")) as { settings?: Saved }).settings ?? {}; } catch { this.saved = {}; }
  }

  get musicbrainzContact(): string { return this.saved.musicbrainz_contact ?? this.defaults.musicbrainzContact; }
  get lastfmApiKey(): string { return this.saved.lastfm_api_key ?? this.defaults.lastfmApiKey; }
  get lastfmApiSecret(): string { return this.saved.lastfm_api_secret ?? this.defaults.lastfmApiSecret; }
  get publicUrl(): string { return this.saved.public_url ?? this.defaults.publicUrl; }
  get uploadMaxMb(): number { return this.saved.upload_max_mb ?? this.defaults.uploadMaxMb; }
  get uploadMaxBytes(): number { return this.uploadMaxMb * 1024 * 1024; }

  private origin(field: Field, fallback: string | number): Origin {
    if (this.saved[field] !== undefined) return "app";
    return fallback !== "" && fallback !== 0 ? "server" : "unset";
  }

  /** What the browser may see: plain values, except secrets, which are only "set" or not. */
  view() {
    const hint = (value: string) => (value ? `…${value.slice(-4)}` : "");
    return {
      musicbrainz_contact: this.musicbrainzContact,
      lastfm_api_key: hint(this.lastfmApiKey),
      lastfm_api_secret: this.lastfmApiSecret ? "set" : "",
      public_url: this.publicUrl,
      upload_max_mb: this.uploadMaxMb,
      origins: {
        musicbrainz_contact: this.origin("musicbrainz_contact", this.defaults.musicbrainzContact),
        lastfm_api_key: this.origin("lastfm_api_key", this.defaults.lastfmApiKey),
        lastfm_api_secret: this.origin("lastfm_api_secret", this.defaults.lastfmApiSecret),
        public_url: this.origin("public_url", this.defaults.publicUrl),
        upload_max_mb: this.origin("upload_max_mb", this.defaults.uploadMaxMb),
      },
    };
  }

  /**
   * Change some settings. A field left out is untouched; an empty string goes
   * back to the server file's value. Everything is checked before anything is saved.
   */
  update(input: Record<string, unknown>): Field[] {
    const next: Saved = { ...this.saved };
    const changed: Field[] = [];
    const set = <K extends Field>(field: K, value: Saved[K] | undefined) => {
      if (value === undefined) delete next[field]; else next[field] = value;
      changed.push(field);
    };
    const textOf = (field: Field): string | undefined => {
      const value = input[field];
      if (value === undefined) return undefined;
      if (typeof value !== "string") throw new SettingsError(`${field} must be text`);
      return value.trim();
    };

    const contact = textOf("musicbrainz_contact");
    if (contact !== undefined) {
      if (contact && !(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) || /^https?:\/\/\S+$/.test(contact))) {
        throw new SettingsError("The MusicBrainz contact should be an email address or a web address");
      }
      set("musicbrainz_contact", contact || undefined);
    }
    for (const field of ["lastfm_api_key", "lastfm_api_secret"] as const) {
      const value = textOf(field);
      if (value === undefined) continue;
      if (value && !LASTFM_KEY.test(value)) {
        throw new SettingsError(`The Last.fm ${field === "lastfm_api_key" ? "API key" : "shared secret"} is 32 letters and numbers (0–9, a–f) — copy it again from last.fm/api/accounts`);
      }
      set(field, value ? value.toLowerCase() : undefined);
    }
    const url = textOf("public_url");
    if (url !== undefined) {
      if (url) {
        let parsed: URL;
        try { parsed = new URL(url); } catch { throw new SettingsError("The address should look like http://syd.local:8080"); }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new SettingsError("The address should start with http:// or https://");
      }
      set("public_url", url ? url.replace(/\/+$/, "") : undefined);
    }
    if (input.upload_max_mb !== undefined) {
      if (input.upload_max_mb === "" || input.upload_max_mb === null) set("upload_max_mb", undefined);
      else {
        const mb = Number(input.upload_max_mb);
        if (!Number.isInteger(mb) || mb < 1 || mb > 20_480) throw new SettingsError("The upload limit should be a whole number of MB between 1 and 20480");
        set("upload_max_mb", mb);
      }
    }
    if (!changed.length) return [];
    this.saved = next;
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temp, JSON.stringify({ format: "synamp.settings/1", settings: this.saved }) + "\n", { mode: 0o600 });
    renameSync(temp, this.path);
    this.onChange?.(changed);
    return changed;
  }
}
