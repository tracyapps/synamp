// B5 screenshots: Describe (interpretation) + The Brain (This session panel).
// Run with: node screenshots.mjs   (puppeteer resolves from the repo's root node_modules)
import { createRequire } from "node:module";

const require = createRequire("/Users/tapps/_dev/web-apps/SynAmp/");
const puppeteer = require("puppeteer");

const OUT = "/Users/tapps/.openclaw-autoclaw/agents/algorithm-scientist/workspace/.cluster/synamp-fast-brain/evidence/b5";

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

  // --- Describe: run the flagship prompt through the example chip ---
  await page.goto("http://localhost:5199/#playlists", { waitUntil: "networkidle0", timeout: 45000 });
  await page.waitForSelector(".describe .chip", { timeout: 20000 });
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll(".describe .chip")].find((el) => el.textContent.trim().startsWith("I need to focus"));
    chip?.click();
  });
  await page.waitForSelector(".describe__interpretation", { timeout: 30000 });
  await page.waitForSelector(".smart-result__summary", { timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 600));
  await page.screenshot({ path: `${OUT}/shot-describe.png`, fullPage: true });
  console.log("saved shot-describe.png");

  // --- The Brain: the "This session" panel (epoch readout + suggestions) ---
  await page.goto("http://localhost:5199/#brain", { waitUntil: "networkidle0", timeout: 45000 });
  await page.waitForSelector(".panel.brain", { timeout: 20000 });
  await page.waitForSelector(".brain__adjustments li, .brain__epoch", { timeout: 30000 });
  await page.waitForSelector(".brain__proposals li", { timeout: 30000 }).catch(() => console.log("no proposal list rendered"));
  await new Promise((resolve) => setTimeout(resolve, 600));
  await page.screenshot({ path: `${OUT}/shot-brain.png`, fullPage: true });
  console.log("saved shot-brain.png");
} finally {
  await browser.close();
}
