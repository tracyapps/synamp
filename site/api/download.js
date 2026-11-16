// GET /download/apple-silicon and /download/intel — straight to the newest
// disk image, so the website's buttons never go out of date. If the file can't
// be found, the visitor lands on the release page, where everything is listed.
import { RELEASES_PAGE, latestRelease } from "./_lib/release.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.statusCode = 405; res.setHeader("allow", "GET"); return res.end(); }
  const chip = new URL(req.url, "https://synamp.app").searchParams.get("chip");
  const release = await latestRelease();
  const file = chip === "apple-silicon" ? release?.apple_silicon : chip === "intel" ? release?.intel : null;
  res.statusCode = 302;
  res.setHeader("location", file || release?.page || RELEASES_PAGE);
  res.setHeader("cache-control", file ? "public, s-maxage=300" : "no-store");
  res.end();
}
