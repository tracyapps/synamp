// B5 legible close-ups of the describe interpretation block and the brain panel.
import { createRequire } from "node:module";
const require = createRequire("/Users/tapps/_dev/web-apps/SynAmp/");
const puppeteer = require("puppeteer");

const OUT = "/Users/tapps/.openclaw-autoclaw/agents/algorithm-scientist/workspace/.cluster/synamp-fast-brain/evidence/b5";

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });

  await page.goto("http://localhost:5199/#playlists", { waitUntil: "networkidle0", timeout: 45000 });
  await page.waitForSelector(".describe .chip", { timeout: 20000 });
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll(".describe .chip")].find((el) => el.textContent.trim().startsWith("I need to focus"));
    chip?.click();
  });
  await page.waitForSelector(".describe__interpretation", { timeout: 30000 });
  await page.waitForSelector(".smart-result__summary", { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 500));
  const understood = await page.$(".describe__understood");
  await understood.screenshot({ path: `${OUT}/shot-describe-interpretation.png` });
  console.log("saved shot-describe-interpretation.png");
  const result = await page.$(".describe .smart-result");
  await result.screenshot({ path: `${OUT}/shot-describe-result.png` });
  console.log("saved shot-describe-result.png");

  await page.goto("http://localhost:5199/#brain", { waitUntil: "networkidle0", timeout: 45000 });
  await page.waitForSelector(".panel.brain", { timeout: 20000 });
  await page.waitForSelector(".brain__proposals li", { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 500));
  const panel = await page.$(".panel.brain");
  await panel.screenshot({ path: `${OUT}/shot-brain-panel.png` });
  console.log("saved shot-brain-panel.png");
} finally {
  await browser.close();
}
