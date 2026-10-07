// Screenshot a local HTML file (or URL) with the repo's puppeteer.
// Usage: node shot.mjs <path-or-url> <out.png> [anchor] [width] [height]
//   anchor: optional fragment like ch2 (navigates to ...#ch2 first)
import { createRequire } from "node:module";
const require = createRequire("/Users/tapps/_dev/web-apps/SynAmp/");
const puppeteer = require("puppeteer");

const [, , input, out, anchor, w, h] = process.argv;
if (!input || !out) { console.error("usage: node shot.mjs <path-or-url> <out.png> [anchor] [width] [height]"); process.exit(2); }
const base = input.startsWith("http") ? input : "file://" + input;
const url = anchor ? base.split("#")[0] + "#" + anchor : base;
const width = w ? parseInt(w, 10) : 1440;
const height = h ? parseInt(h, 10) : 1400;

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--allow-file-access-from-files"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: out });
  console.log("saved", out);
} finally {
  await browser.close();
}
