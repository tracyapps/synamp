// The newest published SynAmp release, from GitHub's public list of releases.
// The website asks here (not the visitor's browser), so a visitor's browser
// only ever talks to synamp.app until they press a download button.

const REPO = "tracyapps/synamp";
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

/** A release as the site needs it; a file's link is null when that release doesn't have it. */
export function shape(release) {
  const version = String(release?.tag_name || "").replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+/.test(version)) return null;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const file = (ending) => assets.find((asset) => typeof asset?.name === "string" && asset.name.endsWith(ending))?.browser_download_url || null;
  return {
    version,
    published: release.published_at || null,
    page: release.html_url || RELEASES_PAGE,
    apple_silicon: file("-apple-silicon.dmg"),
    intel: file("-intel.dmg"),
  };
}

/** Ask GitHub. Null when it can't be reached or there's no release yet: every caller has a plain fallback. */
export async function latestRelease(fetcher = fetch) {
  try {
    const headers = { accept: "application/vnd.github+json", "user-agent": "synamp.app" };
    if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`; // optional: only raises GitHub's hourly limit
    const response = await fetcher(`https://api.github.com/repos/${REPO}/releases/latest`, { headers, signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    return shape(await response.json());
  } catch {
    return null;
  }
}

/** Vercel keeps the answer for five minutes, and may hand out an older one for a day while it fetches a new one. */
export const CACHE = "public, s-maxage=300, stale-while-revalidate=86400";
