#!/usr/bin/env node
// Browser QA for the newsletter exposure work: inline placements, the popup's
// five-second / coordination policy, impressions, routing and the no-JS path.
//
// Local only. It serves the built `dist/` on 127.0.0.1:4387 and, before any
// navigation, routes every request in the browser context:
//   - 127.0.0.1:4387 pages and assets       → served normally
//   - /api/forms/*                           → answered by a local mock, never forwarded
//   - Google tag scripts (gtm.js, gtag/js)   → fetched, unless --no-tags, so the real
//                                              tag can show what it would transmit
//   - any analytics collection URL           → recorded and answered 204 locally
//   - anything else external                 → aborted and recorded
// navigator.sendBeacon and fetch are also wrapped before page scripts run, so a
// collection hit cannot leave the page even if a route were missed.
//
// No real signup, email, or analytics event is ever sent. The only address used
// is in the reserved .invalid TLD and only ever reaches the local mock.
//
// Usage:
//   npm run build
//   node scripts/qa-newsletter-exposure.mjs [--no-tags] [--out DIR] [--no-server]
// Requires the `playwright` or `playwright-core` package (not a project
// dependency: `npm install --no-save playwright-core`) and a Chromium build:
// either the one that package version downloads, or CHROMIUM_PATH=/path/to/chrome.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4387;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const GA4 = 'G-VYW5FDDX52';
const QA_EMAIL = 'qa-local-mock@example.invalid';
const args = process.argv.slice(2);
const withTags = !args.includes('--no-tags');
const startServer = !args.includes('--no-server');
const outIndex = args.indexOf('--out');
const outDir = outIndex >= 0 ? args[outIndex + 1] : path.join(tmpdir(), 'cc-newsletter-exposure-qa');
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
};
const COLLECT = /\/g\/collect|\/j\/collect|\/collect\?|google-analytics\.com|analytics\.google\.com|doubleclick\.net|\/ccm\/collect/;
const TAG_SCRIPT = /^https:\/\/www\.googletagmanager\.com\/(gtm\.js|gtag\/js)\?/;

async function loadPlaywright() {
  for (const name of ['playwright', 'playwright-core']) {
    try { return (await import(name)).chromium; } catch (_error) {}
  }
  throw new Error('Neither playwright nor playwright-core is installed. Run: npm install --no-save playwright-core');
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`${ORIGIN}/`);
      if (response.ok) return;
    } catch (_error) {}
    await sleep(200);
  }
  throw new Error(`Preview server did not answer on ${ORIGIN}`);
}

const results = [];
function check(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), ...detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail.note ? ` — ${detail.note}` : ''}`);
}

// Runs before any page script: no collection hit can leave via beacon/fetch,
// smooth scrolling is off so scroll positions are deterministic, and the tab's
// visibility can be driven from the test.
const INIT_SCRIPT = `(() => {
  const blocked = ${COLLECT.toString()};
  window.__qaBlockedBeacons = [];
  const beacon = navigator.sendBeacon ? navigator.sendBeacon.bind(navigator) : null;
  navigator.sendBeacon = (url, data) => {
    if (blocked.test(String(url))) { window.__qaBlockedBeacons.push(String(url)); return true; }
    return beacon ? beacon(url, data) : false;
  };
  let visibility = 'visible';
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => visibility });
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => visibility !== 'visible' });
  window.__qaSetVisibility = (state) => { visibility = state; document.dispatchEvent(new Event('visibilitychange')); };
  if (window.__qaStartHidden) visibility = 'hidden';
  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.style.scrollBehavior = 'auto';
  });
})();`;

async function newContext(browser, viewportName, { javaScriptEnabled = true, mock = 'ok', storage = {}, startHidden = false } = {}) {
  const context = await browser.newContext({ ...VIEWPORTS[viewportName], javaScriptEnabled });
  const network = { collect: [], aborted: [], tagScripts: [], api: [] };
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.startsWith(`${ORIGIN}/api/forms/`)) {
      const accept = request.headers()['accept'] || '';
      network.api.push({
        url, method: request.method(), accept,
        contentType: request.headers()['content-type'] || '',
        body: request.postData() || '',
      });
      const ok = mock === 'ok';
      if (accept.includes('text/html')) {
        return route.fulfill({ status: 303, headers: { location: ok ? '/newsletter/pending/' : '/newsletter/error/' } });
      }
      return route.fulfill({
        status: ok ? 200 : 502,
        contentType: ok ? 'application/json' : 'text/html',
        body: ok ? JSON.stringify({ ok: true, status: 'pending' }) : '<html>gateway error</html>',
      });
    }
    if (url.startsWith(ORIGIN)) return route.continue();
    if (COLLECT.test(url)) {
      network.collect.push({ url, body: request.postData() || '' });
      return route.fulfill({ status: 204, body: '' });
    }
    if (withTags && TAG_SCRIPT.test(url) && request.method() === 'GET') {
      network.tagScripts.push(url);
      return route.continue();
    }
    network.aborted.push(url);
    return route.abort();
  });
  if (javaScriptEnabled) {
    const seed = { storage, startHidden };
    await context.addInitScript(({ storage: values, startHidden: hidden }) => {
      if (location.origin !== 'http://127.0.0.1:4387') return;
      if (hidden) window.__qaStartHidden = true;
      if (!sessionStorage.getItem('__qaSeeded')) {
        sessionStorage.setItem('__qaSeeded', '1');
        for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
      }
    }, seed);
    await context.addInitScript(INIT_SCRIPT);
  }
  return { context, network };
}

// Every newsletter event, from both sinks. dataLayer is not delivery — the
// collect hits recorded by the route are.
async function newsletterEvents(page) {
  return page.evaluate(() => {
    const out = { pushes: [], commands: [] };
    for (const item of window.dataLayer || []) {
      if (item && typeof item.event === 'string' && item.event.startsWith('newsletter_')) {
        out.pushes.push({ ...item });
      } else if (item && item[0] === 'event' && String(item[1]).startsWith('newsletter_')) {
        out.commands.push({ name: item[1], params: { ...item[2] } });
      } else if (item && item[0] === 'config') {
        out.commands.push({ name: 'config', params: { id: item[1] } });
      }
    }
    return out;
  });
}

// A plain clock.install() keeps fake time flowing with real time, so page load
// and the real waits for IntersectionObserver would leak into the popup timer.
// Paused, page time moves only through runFor(), making the 5s edge exact.
async function freezeClock(page) {
  const start = new Date('2026-10-16T12:00:00Z').getTime();
  await page.clock.install({ time: start });
  await page.clock.pauseAt(start + 1000);
}

const popupOpen = (page) => page.evaluate(() => {
  const el = document.getElementById('newsletter-signup');
  return Boolean(el && !el.hidden && el.dataset.visible === 'true');
});

async function scrollToY(page, y) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  // IntersectionObserver is driven by rendering, not timers: give it real frames.
  await page.waitForTimeout(250);
}

async function scrollFormIntoView(page, selector) {
  await page.evaluate((sel) => {
    const form = document.querySelector(sel);
    const rect = form.getBoundingClientRect();
    window.scrollTo(0, Math.max(0, window.scrollY + rect.top - 100));
  }, selector);
  await page.waitForTimeout(250);
}

async function scrollFormAway(page, selector) {
  await page.evaluate((sel) => {
    const form = document.querySelector(sel);
    const rect = form.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + rect.bottom + window.innerHeight);
  }, selector);
  await page.waitForTimeout(250);
}

const sources = (list, name) => list.filter((e) => e.event === name).map((e) => e.newsletter_source);

async function scenarioPlacement(browser, vp) {
  const { context } = await newContext(browser, vp);
  const page = await context.newPage();
  for (const [route, source, prefix] of [['/', 'home_inline', 'newsletter-home-inline'], ['/directory/parks/', 'parks_inline', 'newsletter-parks-inline']]) {
    await page.goto(`${ORIGIN}${route}`);
    const info = await page.evaluate(({ source: src }) => {
      const asides = [...document.querySelectorAll('.newsletter-inline')];
      const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
      const aside = asides[0];
      const form = aside && aside.querySelector('form');
      const rect = aside && aside.getBoundingClientRect();
      const grid = document.getElementById('directory-grid');
      return {
        count: asides.length,
        source: aside && aside.dataset.newsletterSource,
        expected: src,
        duplicateIds: ids.filter((id, i) => ids.indexOf(id) !== i),
        top: rect ? Math.round(rect.top + window.scrollY) : null,
        viewportHeight: window.innerHeight,
        action: form && form.getAttribute('action'),
        method: form && form.getAttribute('method'),
        insideGrid: Boolean(grid && aside && grid.contains(aside)),
        gridBelow: grid ? grid.getBoundingClientRect().top > rect.top : null,
        copy: aside && aside.querySelector('h2').textContent.trim(),
        button: form && form.querySelector('button[type="submit"]').textContent.trim(),
        emailId: form && form.querySelector('input[type="email"]').id,
      };
    }, { source });
    check(`${vp} ${route}: one inline CTA tagged ${source}`, info.count === 1 && info.source === source, { info });
    check(`${vp} ${route}: no duplicate element ids`, info.duplicateIds.length === 0, { duplicates: info.duplicateIds });
    check(`${vp} ${route}: namespaced ids`, info.emailId === `${prefix}-email`, { emailId: info.emailId });
    check(`${vp} ${route}: near the top (within 1.5 viewports)`, info.top !== null && info.top < info.viewportHeight * 1.5, { top: info.top, viewportHeight: info.viewportHeight });
    check(`${vp} ${route}: offer unchanged`, info.copy === 'Keep your comeback rolling' && info.button === 'Send me the roundup');
    check(`${vp} ${route}: posts to the newsletter function`, info.action === '/api/forms/newsletter' && info.method === 'post');
    if (route.startsWith('/directory')) {
      check(`${vp} ${route}: CTA sits outside and above #directory-grid`, !info.insideGrid && info.gridBelow === true);
      const filtered = await page.evaluate(async () => {
        const input = document.getElementById('filter-search');
        if (!input) return { skipped: true };
        input.value = 'zzzz-no-such-park';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 600));
        return { noResults: !document.getElementById('no-results').hidden };
      });
      check(`${vp} ${route}: directory filtering still works`, filtered.skipped || filtered.noResults, filtered);
    }
    await page.screenshot({ path: path.join(outDir, `${vp}-${source}.png`) });
  }
  await context.close();
}

async function scenarioPopupTiming(browser, vp) {
  // /directory/shops has no inline CTA, so only the timer governs the popup.
  const { context } = await newContext(browser, vp);
  const page = await context.newPage();
  await freezeClock(page);
  await page.goto(`${ORIGIN}/directory/shops/`);
  await page.evaluate(() => sessionStorage.setItem('cc-page-views', '9'));
  await page.clock.runFor(1600);
  check(`${vp} popup: not shown at 1.6s on a "later" page`, !(await popupOpen(page)));
  await scrollToY(page, 1e6);
  await page.clock.runFor(100);
  check(`${vp} popup: scrolling to the bottom does not trigger it`, !(await popupOpen(page)));
  await page.clock.runFor(4999 - 1700);
  check(`${vp} popup: not shown at 4,999ms`, !(await popupOpen(page)));
  await page.clock.runFor(100);
  check(`${vp} popup: shown just after 5s`, await popupOpen(page));
  const events = await newsletterEvents(page);
  check(`${vp} popup: one popup impression`, sources(events.pushes, 'newsletter_impression').join() === 'popup', { events: events.pushes });
  await page.screenshot({ path: path.join(outDir, `${vp}-popup-open.png`) });
  await context.close();
}

async function scenarioCoordination(browser, vp, network) {
  const { context, network: net } = await newContext(browser, vp);
  const page = await context.newPage();
  await freezeClock(page);
  await page.goto(`${ORIGIN}/`);
  const form = '.newsletter-inline form';
  await scrollFormIntoView(page, form);
  await page.clock.runFor(8000);
  check(`${vp} coordination: popup held while the home inline form is on screen`, !(await popupOpen(page)));
  await scrollFormAway(page, form);
  await page.clock.runFor(100);
  check(`${vp} coordination: popup appears once the inline scrolls away (later eligibility)`, await popupOpen(page));
  await scrollFormIntoView(page, form);
  await page.clock.runFor(400);
  check(`${vp} coordination: open popup stands down when the inline returns`, !(await popupOpen(page)));
  await scrollFormAway(page, form);
  await page.clock.runFor(15000);
  check(`${vp} coordination: popup does not reopen on this page`, !(await popupOpen(page)));
  const dismissedAt = await page.evaluate(() => localStorage.getItem('cc-newsletter-dismissed-at'));
  check(`${vp} coordination: a stand-down records no dismissal`, dismissedAt === null);

  for (let i = 0; i < 3; i++) {
    await scrollFormIntoView(page, form);
    await scrollFormAway(page, form);
  }
  await page.clock.runFor(5000); // flush any gtag batching timers
  const events = await newsletterEvents(page);
  check(`${vp} impressions: home_inline counted once despite repeated scrolling`, sources(events.pushes, 'newsletter_impression').filter((s) => s === 'home_inline').length === 1, { events: events.pushes });
  const stood = events.pushes.filter((e) => e.event === 'newsletter_popup_stood_down');
  check(`${vp} coordination: stood_down tagged inline_visible`, stood.length === 1 && stood[0].newsletter_reason === 'inline_visible');
  check(`${vp} routing: every gtag newsletter command names ${GA4}`, events.commands.length > 0 && events.commands.every((c) => c.name !== 'config' && c.params.send_to === GA4), { commands: events.commands });
  network.collect.push(...net.collect);
  network.aborted.push(...net.aborted);
  network.tagScripts.push(...net.tagScripts);

  // A focused form control holds the popup (fresh page, inline far away).
  const page2 = await context.newPage();
  await freezeClock(page2);
  await page2.goto(`${ORIGIN}/directory/parks/`);
  await page2.focus('#filter-search');
  // Focusing scrolls the search into view; move the inline CTA off screen again
  // so focus is the only thing holding the popup.
  await scrollFormAway(page2, form);
  await page2.clock.runFor(8000);
  const focused = await page2.evaluate(() => document.activeElement && document.activeElement.id);
  check(`${vp} coordination: popup waits while a filter control has focus`, focused === 'filter-search' && !(await popupOpen(page2)), { focused });
  await page2.evaluate(() => document.activeElement.blur());
  await page2.clock.runFor(100);
  check(`${vp} coordination: popup appears once that focus leaves`, await popupOpen(page2));
  await context.close();
}

async function scenarioVisibility(browser, vp) {
  const { context } = await newContext(browser, vp, { startHidden: true });
  const page = await context.newPage();
  await freezeClock(page);
  await page.goto(`${ORIGIN}/directory/parks/`);
  await scrollFormIntoView(page, '.newsletter-inline form');
  await page.clock.runFor(10000);
  let events = await newsletterEvents(page);
  check(`${vp} visibility: no impression and no popup in a hidden tab`, events.pushes.length === 0 && !(await popupOpen(page)), { events: events.pushes });
  await page.evaluate(() => window.__qaSetVisibility('visible'));
  await page.clock.runFor(100);
  events = await newsletterEvents(page);
  check(`${vp} visibility: parks_inline counted when the tab becomes visible`, sources(events.pushes, 'newsletter_impression').join() === 'parks_inline', { events: events.pushes });
  check(`${vp} visibility: popup still held (inline on screen)`, !(await popupOpen(page)));
  await context.close();
}

async function scenarioSuppression(browser, vp) {
  const dismissed = { 'cc-newsletter-dismissed-at': String(Date.now()) };
  let { context } = await newContext(browser, vp, { storage: dismissed });
  let page = await context.newPage();
  await freezeClock(page);
  await page.goto(`${ORIGIN}/`);
  await scrollToY(page, 1e6);
  await page.clock.runFor(10000);
  const inlineForm = await page.evaluate(() => !document.querySelector('.newsletter-inline form').hidden);
  check(`${vp} suppression: dismissal hides the popup only`, !(await popupOpen(page)) && inlineForm);
  await context.close();

  ({ context } = await newContext(browser, vp, { storage: { 'cc-newsletter-status': 'pending', 'cc-newsletter-pending-at': String(Date.now()) } }));
  page = await context.newPage();
  await freezeClock(page);
  await page.goto(`${ORIGIN}/directory/parks/`);
  await scrollFormIntoView(page, '.newsletter-inline');
  await page.clock.runFor(10000);
  const state = await page.evaluate(() => ({
    formHidden: document.querySelector('.newsletter-inline form').hidden,
    status: document.querySelector('.newsletter-inline [data-newsletter-status]').textContent,
  }));
  const events = await newsletterEvents(page);
  check(`${vp} suppression: pending shows the outcome, no form, no impression, no popup`,
    state.formHidden && /Check your inbox/.test(state.status) && events.pushes.length === 0 && !(await popupOpen(page)), { state });
  await context.close();

  ({ context } = await newContext(browser, vp));
  page = await context.newPage();
  await freezeClock(page);
  for (const route of ['/privacy/', '/submit/', '/newsletter/error/']) {
    await page.goto(`${ORIGIN}${route}`);
    await page.clock.runFor(10000);
    check(`${vp} suppression: popup never initialises on ${route}`, !(await popupOpen(page)));
  }
  await context.close();
}

async function scenarioSubmit(browser, vp, mock) {
  const { context, network } = await newContext(browser, vp, { mock });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/`);
  await scrollFormIntoView(page, '.newsletter-inline form');
  await page.fill('#newsletter-home-inline-email', QA_EMAIL);
  await page.click('.newsletter-inline button[type="submit"]');
  await page.waitForFunction(() => {
    const t = document.querySelector('.newsletter-inline [data-newsletter-status]').textContent;
    return t && !t.startsWith('Sending');
  });
  const state = await page.evaluate(() => ({
    formHidden: document.querySelector('.newsletter-inline form').hidden,
    status: document.querySelector('.newsletter-inline [data-newsletter-status]').textContent,
    button: document.querySelector('.newsletter-inline button[type="submit"]').disabled,
    stored: localStorage.getItem('cc-newsletter-status'),
  }));
  const events = await newsletterEvents(page);
  const api = network.api[0] || {};
  check(`${vp} submit(${mock}): one mocked POST, urlencoded, asking for JSON`,
    network.api.length === 1 && api.method === 'POST' && api.contentType.startsWith('application/x-www-form-urlencoded') && api.accept.includes('application/json'),
    { api: network.api.map(({ body, ...rest }) => ({ ...rest, fields: [...new URLSearchParams(body).keys()] })) });
  const flow = events.pushes.filter((e) => e.event.startsWith('newsletter_signup_')).map((e) => `${e.event}:${e.newsletter_source}`);
  if (mock === 'ok') {
    check(`${vp} submit(ok): pending state recorded and shown`, state.formHidden && state.stored === 'pending' && /Check your inbox/.test(state.status), { state });
    check(`${vp} submit(ok): submitted → pending, tagged home_inline`, flow.join() === 'newsletter_signup_submitted:home_inline,newsletter_signup_pending:home_inline', { flow });
  } else {
    check(`${vp} submit(error): form stays usable with readable copy`, !state.formHidden && !state.button && state.stored === null && /temporarily unavailable/.test(state.status), { state });
    check(`${vp} submit(error): submitted → error, tagged home_inline`, flow.join() === 'newsletter_signup_submitted:home_inline,newsletter_signup_error:home_inline', { flow });
  }
  const leaked = JSON.stringify(events).includes(QA_EMAIL) || network.collect.some((c) => (c.url + c.body).includes(encodeURIComponent(QA_EMAIL)) || (c.url + c.body).includes(QA_EMAIL));
  check(`${vp} submit(${mock}): the address never reaches analytics`, !leaked);
  await context.close();
}

async function scenarioNoJs(browser, vp) {
  const { context, network } = await newContext(browser, vp, { javaScriptEnabled: false });
  const page = await context.newPage();
  for (const [route, email] of [['/', '#newsletter-home-inline-email'], ['/directory/parks/', '#newsletter-parks-inline-email']]) {
    await page.goto(`${ORIGIN}${route}`);
    const info = await page.evaluate(() => {
      const form = document.querySelector('.newsletter-inline form');
      const r = form.getBoundingClientRect();
      return {
        visible: r.width > 0 && r.height > 0 && !form.hidden,
        popupHidden: document.getElementById('newsletter-signup').hidden,
      };
    });
    check(`${vp} no-JS ${route}: inline form rendered and visible, popup hidden`, info.visible && info.popupHidden, info);
    await page.fill(email, QA_EMAIL);
    await Promise.all([page.waitForURL('**/newsletter/pending/'), page.click('.newsletter-inline button[type="submit"]')]);
    check(`${vp} no-JS ${route}: native POST lands on /newsletter/pending/ (mocked 303)`, page.url().endsWith('/newsletter/pending/'));
  }
  check(`${vp} no-JS: both posts went to the local mock as text/html form posts`,
    network.api.length === 2 && network.api.every((a) => a.accept.includes('text/html') && a.contentType.startsWith('application/x-www-form-urlencoded')));
  await context.close();
}

async function main() {
  const chromium = await loadPlaywright();
  let server;
  if (startServer) {
    server = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'preview', '--host', '127.0.0.1', '--port', String(PORT)], { stdio: ['ignore', 'ignore', 'inherit'] });
  }
  try {
    await waitForServer();
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const network = { collect: [], aborted: [], tagScripts: [] };
    try {
      for (const vp of Object.keys(VIEWPORTS)) {
        await scenarioPlacement(browser, vp);
        await scenarioPopupTiming(browser, vp);
        await scenarioCoordination(browser, vp, network);
        await scenarioVisibility(browser, vp);
        await scenarioSuppression(browser, vp);
        await scenarioSubmit(browser, vp, 'ok');
        await scenarioSubmit(browser, vp, 'error');
        await scenarioNoJs(browser, vp);
      }
    } finally {
      await browser.close();
    }

    // Transport: what the real Google tag would have sent, intercepted locally.
    const hits = network.collect.flatMap(({ url, body }) => {
      const lines = body ? body.split(/\r?\n/) : [''];
      return lines.map((line) => {
        const params = new URLSearchParams(`${new URL(url).search.slice(1)}&${line}`);
        return { tid: params.get('tid'), en: params.get('en'), source: params.get('ep.newsletter_source') };
      });
    });
    const newsletterHits = hits.filter((h) => h.en && h.en.startsWith('newsletter_'));
    const transport = {
      tagScriptsFetched: network.tagScripts.length,
      collectRequestsIntercepted: network.collect.length,
      newsletterHits,
      pageViewHits: hits.filter((h) => h.en === 'page_view').length,
    };
    if (withTags && network.tagScripts.length) {
      check('transport: newsletter events reach the intercepted GA4 collect endpoint', newsletterHits.length > 0 && newsletterHits.every((h) => h.tid === GA4), { transport });
    } else {
      check('transport: skipped (tag scripts not loaded)', true, { note: 'dataLayer/gtag assertions above are routing evidence only, not delivery', transport });
    }
    const externalAborted = [...new Set(network.aborted.map((u) => new URL(u).host))];
    writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ when: new Date().toISOString(), withTags, results, transport, externalAborted }, null, 2));
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed. Evidence: ${outDir}`);
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    if (server) server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
