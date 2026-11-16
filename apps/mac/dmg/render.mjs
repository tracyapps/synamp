// Draw background.html as the two pictures the disk image uses (normal and Retina).
//   npm i playwright && node apps/mac/dmg/render.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
for (const [scale, name] of [[1, 'background.png'], [2, 'background@2x.png']]) {
  const page = await (await browser.newContext({ viewport: { width: 660, height: 462 }, deviceScaleFactor: scale })).newPage();
  await page.goto(`file://${join(here, 'background.html')}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(here, name) });
}
await browser.close();
