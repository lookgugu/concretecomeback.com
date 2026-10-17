// Optional browser regression, separate from the dependency-free draft workflow.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
// PLAYWRIGHT_EXECUTABLE_PATH may point to a browser for playwright-core.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [original, preview] = process.argv.slice(2);
if (!original || !preview) throw Error('Usage: check-preview-offline.mjs original/draft.html preview-local.html');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
    let blocked = 0;
    await context.route(/^https?:/, route => { blocked++; return route.abort(); });
    const page = await context.newPage();
    let expectedCount;
    for (const [path, embedded] of [[original, false], [preview, true]]) {
      const before = blocked;
      await page.goto(pathToFileURL(resolve(path)).href, { waitUntil: 'load' });
      const images = await page.locator('img').evaluateAll(imgs => imgs.map(i => ({ src: i.getAttribute('src'), width: i.naturalWidth, height: i.naturalHeight, complete: i.complete })));
      if (!embedded) expectedCount = images.length;
      assert.equal(images.length, expectedCount);
      for (const image of images) {
        assert.ok(image.complete);
        assert.equal(image.width > 0 && image.height > 0, embedded);
        assert.ok(image.src.startsWith(embedded ? 'data:image/jpeg;base64,' : 'https://'));
      }
      assert.equal(blocked - before, embedded ? 0 : expectedCount);
      console.log(JSON.stringify({ width, file: path, images: images.length, decoded: images.filter(i => i.width > 0).length, blocked: blocked - before }));
    }
    await context.close();
  }
} finally { await browser.close(); }
