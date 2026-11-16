// GET /api/release — which version is the newest, for the "Try SynAmp 0.2.1" buttons.
import { CACHE, RELEASES_PAGE, latestRelease } from "./_lib/release.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.statusCode = 405; res.setHeader("allow", "GET"); return res.end(); }
  const release = await latestRelease();
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", release ? CACHE : "no-store");
  res.end(JSON.stringify(release ? { version: release.version, published: release.published, page: release.page } : { version: null, page: RELEASES_PAGE }));
}
