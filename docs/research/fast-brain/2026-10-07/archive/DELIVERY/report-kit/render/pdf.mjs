// Render the dossier HTML to PDF with the repo's puppeteer.
// Usage: node pdf.mjs <input.html> <out.pdf>
import { createRequire } from "node:module";
const require = createRequire("/Users/tapps/_dev/web-apps/SynAmp/");
const puppeteer = require("puppeteer");

const [, , input, out] = process.argv;
if (!input || !out) { console.error("usage: node pdf.mjs <input.html> <out.pdf>"); process.exit(2); }
const url = input.startsWith("http") ? input : "file://" + input;

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--allow-file-access-from-files"] });
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0", timeout: 90000 });
  await new Promise((r) => setTimeout(r, 800));
  await page.pdf({
    path: out, format: "A4", printBackground: true,
    margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" },
  });
  console.log("saved", out);
} finally {
  await browser.close();
}
