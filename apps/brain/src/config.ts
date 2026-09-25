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
  /** Bind address. 0.0.0.0 because the NAS is reached over the LAN / Tailscale. */
  host: env("BRAIN_HOST", "0.0.0.0"),
  /** Postgres + pgvector connection string (playlists, session, embeddings). */
  databaseUrl: env("DATABASE_URL", "postgres://synamp:synamp@localhost:5432/synamp"),
  /** Read-only mount of the music share. */
  libraryPath: env("LIBRARY_PATH", "/music"),
  /** Base URL of the library core (Navidrome), used for Subsonic passthrough. */
  coreUrl: env("CORE_URL", "http://core:4533"),
} as const;

export type Config = typeof config;
