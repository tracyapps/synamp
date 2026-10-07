async page => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const results = [];
  const containment = async label => {
    const result = await page.evaluate(() => {
      const rect = selector => { const box = document.querySelector(selector)?.getBoundingClientRect(); return box ? { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom } : null; };
      const side = document.querySelector('.app__side');
      return { height: innerHeight, width: innerWidth, bodyHeight: document.body.scrollHeight, documentHeight: document.documentElement.scrollHeight, bodyWidth: document.body.scrollWidth, windowY: scrollY, main: rect('main'), header: rect('.app__bar'), footer: rect('.app__footer'), side: rect('.app__side'), sideOverflow: side ? side.scrollHeight - side.clientHeight : null, canvas: rect('.galaxy__canvas') };
    });
    assert(result.bodyHeight === result.height && result.documentHeight === result.height && result.bodyWidth === result.width && result.windowY === 0, 'body containment ' + label);
    assert(Math.abs(result.footer.bottom - result.height) < 1 && result.main.bottom <= result.footer.y + 1, 'player/content boundary ' + label);
    if (result.canvas) assert(result.canvas.height > 50 && result.canvas.x === 0 && Math.abs(result.canvas.width - result.width) < 1, 'full workspace ' + label);
    results.push({ label, ...result });
    return result;
  };
  const view = () => page.locator('.galaxy__canvas > g').getAttribute('transform').then(value => { const numbers = value.match(/-?[\d.]+/g).map(Number); return { x: numbers[0], y: numbers[1], k: numbers[2] }; });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  for (const route of ['library', 'playlists', 'radio', 'party', 'brain', 'care', 'anywhere', 'settings']) {
    await page.goto('http://127.0.0.1:39822/#/' + route);
    await page.locator('main').waitFor();
    const result = await containment(route + '-desktop');
    assert(result.sideOverflow <= 1, 'no unnecessary sidebar scrollbar ' + route);
    const y = result.side.y;
    await page.locator('main').evaluate(element => element.scrollTop = element.scrollHeight);
    const after = await page.locator('.app__side').boundingBox();
    assert(Math.abs(y - after.y) < 1, 'sidebar fixed while content scrolls ' + route);
  }
  await page.goto('http://127.0.0.1:39822/#/galaxy');
  await page.locator('.galaxy__planet').first().waitFor();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await containment('galaxy-desktop-existing-scratch-queue');
  assert(await page.locator('.app__side').count() === 0, 'Galaxy hides ordinary sidebar');
  const canvas = page.locator('.galaxy__canvas');
  const box = await canvas.boundingBox();
  const point = { x: Math.round(box.x + box.width * .60), y: Math.round(box.y + box.height * .60) };
  const anchor = await canvas.evaluate((svg, point) => { const p = svg.createSVGPoint(); p.x = point.x; p.y = point.y; const a = p.matrixTransform(svg.getScreenCTM().inverse()); return { x: a.x, y: a.y }; }, point);
  const before = await view();
  const browser = await page.evaluate(() => ({ width: innerWidth, scale: visualViewport.scale, dpr: devicePixelRatio }));
  await page.mouse.move(point.x, point.y); await page.mouse.wheel(0, -120);
  await page.waitForFunction(() => document.querySelector('output[aria-label="Zoom level"]')?.textContent !== '100%');
  const after = await view();
  assert(after.k > before.k, 'wheel zoom');
  assert(Math.abs((anchor.x - before.x) / before.k - (anchor.x - after.x) / after.k) < .001 && Math.abs((anchor.y - before.y) / before.k - (anchor.y - after.y) / after.k) < .001, 'wheel cursor anchor');
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -40); await page.keyboard.up('Control');
  await page.waitForFunction(k => Number(document.querySelector('.galaxy__canvas > g')?.getAttribute('transform')?.match(/scale\(([^)]+)\)/)?.[1]) > k, after.k);
  assert(JSON.stringify(await page.evaluate(() => ({ width: innerWidth, scale: visualViewport.scale, dpr: devicePixelRatio }))) === JSON.stringify(browser), 'Ctrl+wheel does not browser zoom');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const midpoint = { x: box.x + box.width * .70, y: box.y + box.height * .65 };
  const touch = delta => [{ x: midpoint.x - delta, y: midpoint.y, id: 1 }, { x: midpoint.x + delta, y: midpoint.y, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(30) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touch(75) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => Number(document.querySelector('.galaxy__canvas > g')?.getAttribute('transform')?.match(/scale\(([^)]+)\)/)?.[1]) > 2);
  assert(await page.getByRole('complementary', { name: 'Selected artist details' }).isVisible() === false, 'pinch does not select artist');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await cdp.detach();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await canvas.focus(); await page.keyboard.press('+');
  assert((await view()).k === 1.25, 'keyboard zoom');
  await page.keyboard.press('ArrowRight'); assert((await view()).x < -60, 'keyboard pan');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.locator('.galaxy__planet').filter({ hasText: '2Pac' }).click();
  await page.locator('.galaxy__details h3').filter({ hasText: '2Pac' }).waitFor();
  await page.locator('.galaxy__album').first().click();
  const card = await page.locator('.galaxy__details').boundingBox();
  assert(card.height < box.height, 'card has bounded content height');
  await page.screenshot({ path: 'output/playwright/workspace-table/galaxy-desktop.png' });
  await page.getByRole('button', { name: 'Play these songs', exact: true }).click();
  await page.getByRole('button', { name: 'Up next', exact: true }).click();
  await containment('galaxy-active-open-queue');
  for (const size of [{ width: 390, height: 844, label: 'portrait' }, { width: 844, height: 390, label: 'landscape' }, { width: 1512, height: 2400, label: 'tall' }]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await containment('galaxy-active-queue-' + size.label);
    const artistCard = await page.locator('.galaxy__details').boundingBox();
    const overlap = await page.locator('.player').evaluate(player => {
      const nodes = [...player.children].filter(node => !['AUDIO','OL'].includes(node.tagName) && getComputedStyle(node).display !== 'none');
      const queue = player.querySelector('.player__queue'); if (queue && getComputedStyle(queue).display !== 'none') nodes.push(queue);
      const rects = nodes.map(node => node.getBoundingClientRect());
      return rects.some((a, i) => rects.slice(i + 1).some(b => Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1));
    });
    assert(!overlap, 'player rows/controls do not overlap ' + size.label);
    assert(artistCard.x >= 0 && artistCard.x + artistCard.width <= size.width && artistCard.y >= 0 && artistCard.y + artistCard.height <= size.height, 'card contained ' + size.label);
    await page.screenshot({ path: 'output/playwright/workspace-table/galaxy-' + size.label + '.png' });
  }
  await page.getByRole('button', { name: 'Hide queue', exact: true }).click();
  await page.getByRole('button', { name: 'Visuals', exact: true }).click();
  await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
  assert(await page.getByRole('dialog').count() === 0 || !await page.getByRole('dialog').isVisible(), 'visuals escape closes');
  await containment('after-visuals-close');
  await page.getByRole('button', { name: 'Close artist details', exact: true }).click();
  await page.locator('.app__workspace-menu summary').click();
  await page.getByRole('navigation', { name: 'Galaxy menu' }).getByRole('link', { name: 'Library', exact: true }).click();
  await page.locator('.app__side').waitFor();
  await containment('menu-back-to-library');
  return { wheel: true, cursorAnchor: true, ctrlWheel: true, syntheticTouchPinch: true, keyboardZoomPan: true, cardDrillDown: true, queue: true, visualsEscape: true, results };
}
