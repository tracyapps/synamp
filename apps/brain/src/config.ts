/**
 * Environment-driven configuration for the SynAmp brain service.
 *
 * Runs dependency-light on purpose: the brain is the long-lived service on the
 * NAS, so it should start fast and have a small attack surface.
 */

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

export const config = {
  /** Port the HTTP API listens on. */
  port: Number(env("BRAIN_PORT", "3001")),
  /** Local dev stays on loopback; Compose sets 0.0.0.0 inside its network. */
  host: env("BRAIN_HOST", "127.0.0.1"),
  /** Postgres + pgvector connection string (playlists, session, embeddings). */
  databaseUrl: env("DATABASE_URL", "postgres://synamp:synamp@localhost:5432/synamp"),
  /** Read-only mount of the music share. */
  libraryPath: env("LIBRARY_PATH", "/music"),
  /** Base URL of the library core (Navidrome), used for Subsonic passthrough. */
  coreUrl: env("CORE_URL", "http://core:4533"),
  /** Small local playlist store until the Brain DB migrations are in place. */
  playlistDataPath: env("PLAYLIST_DATA_PATH", "./data/playlists.json"),
  /**
   * Per-track analysis signals for smart playlists (interim JSON until the
   * analyzer → brain export exists). Defaults to the synthetic sample.
   */
  librarySignalsPath: env("LIBRARY_SIGNALS_PATH", "./fixtures/library.sample.json"),
  /** Append-only listening events (JSON Lines). Defaults beside the playlist store. */
  eventsPath: env("EVENTS_PATH", ""),
  /** The server-owned playback session. Defaults beside the playlist store. */
  sessionPath: env("SESSION_PATH", ""),
  /** Where the library core sees the music (its real-path prefix), to map its paths to ours. */
  coreMusicPath: env("CORE_MUSIC_PATH", "/music"),
  /** Optional Last.fm scrobbling. Both empty = the feature is hidden. */
  lastfmApiKey: env("LASTFM_API_KEY", ""),
  lastfmApiSecret: env("LASTFM_API_SECRET", ""),
  /** Session key and delivery state. Defaults beside the playlist store; keep it private. */
  lastfmStatePath: env("LASTFM_STATE_PATH", ""),
  /** Public base URL (e.g. https://music.example.net) for the Last.fm sign-in callback. Derived from the request if empty. */
  publicUrl: env("PUBLIC_URL", ""),
  /**
   * Contact (email or URL) sent to MusicBrainz in the User-Agent, as its API
   * terms ask. Needed to match albums for the missing-tracks list.
   */
  musicbrainzContact: env("MUSICBRAINZ_CONTACT", ""),
  /** Required by the deployed app profile; optional for localhost development. */
  playlistApiToken: env("PLAYLIST_API_TOKEN", ""),
} as const;

export type Config = typeof config;
