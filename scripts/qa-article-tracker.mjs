#!/usr/bin/env node
// Browser QA for the article engagement tracker (src/scripts/article-engagement.js).
//
// Local only, rerunnable. Serves the built `dist/` on 127.0.0.1:4397 and,
// BEFORE the first navigation, routes every request in the browser context:
//   - 127.0.0.1:4397 pages and assets  → served normally
//   - /api/forms/*                      → answered by a local mock, never forwarded
//   - everything else                   → aborted and recorded, including GTM,
//                                         gtag.js and every collection endpoint
//                                         (google.com/g/collect, google-analytics.com, …)
// navigator.sendBeacon and fetch are also wrapped before page scripts run so a
// non-local request cannot leave the page even if a route were missed. With the
// tag scripts aborted, the site's own gtag wrapper only pushes to dataLayer —
// that array is the intercepted transport the checks read.
//
// No production URL is requested, no real signup, no analytics delivered.
//
// Usage:
//   npm run build
//   node scripts/qa-article-tracker.mjs [--out DIR] [--no-server]
// Requires `playwright` or `playwright-core` (not a project dependency:
// `npm install --no-save playwright-core`) and Chromium (or CHROMIUM_PATH).
// Exit 0 when every check passes, 1 otherwise.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4397;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const GA4 = 'G-VYW5FDDX52';
const QA_EMAIL = 'qa-local-mock@example.invalid';
const COLLECT = /\/g\/collect|\/j\/collect|\/collect\?|google-analytics\.com|analytics\.google\.com|doubleclick\.net|\/ccm\/collect|googletagmanager\.com/;
const args = process.argv.slice(2);
const startServer = !args.includes('--no-server');
const outIndex = args.indexOf('--out');
const outDir = outIndex >= 0 ? args[outIndex + 1] : path.join(tmpdir(), 'cc-article-tracker-qa');
mkdirSync(outDir, { recursive: true });

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

// Two built articles: the shortest (short-article path) and the longest.
function pickArticles() {
  const dir = path.join('dist', 'blog');
  if (!existsSync(dir)) throw new Error('dist/blog is missing — run `npm run build` first');
  const found = [];
  for (const slug of readdirSync(dir)) {
    const file = path.join(dir, slug, 'index.html');
    if (!/^[a-z0-9-]+$/.test(slug) || /^\d+$/.test(slug) || !existsSync(file)) continue;
    const m = /data-article-words="(\d+)"/.exec(readFileSync(file, 'utf8'));
    if (m) found.push({ slug, words: Number(m[1]) });
  }
  if (found.length < 2) throw new Error('fewer than two built articles carry data-article-body');
  found.sort((a, b) => a.words - b.words || a.slug.localeCompare(b.slug));
  return { short: found[0], long: found[found.length - 1], other: found[1] };
}

const results = [];
function check(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), ...detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail.note ? ` — ${detail.note}` : ''}`);
}

const INIT_SCRIPT = `(() => {
  if (location.origin !== '${ORIGIN}') return;
  window.__qaBlocked = [];
  const local = (u) => { try { return new URL(String(u), location.href).origin === location.origin; } catch (_) { return false; } };
  const beacon = navigator.sendBeacon ? navigator.sendBeacon.bind(navigator) : null;
  navigator.sendBeacon = (url, data) => {
    if (!local(url)) { window.__qaBlocked.push(String(url)); return true; }
    return beacon ? beacon(url, data) : false;
  };
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    if (!local(url)) { window.__qaBlocked.push(String(url)); return Promise.resolve(new Response(null, { status: 204 })); }
    return realFetch(input, init);
  };
  let visibility = 'visible';
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => visibility });
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => visibility !== 'visible' });
  window.__qaSetVisibility = (state) => { visibility = state; document.dispatchEvent(new Event('visibilitychange')); };
  document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.scrollBehavior = 'auto'; });
})();`;

async function newContext(browser, { storage = {} } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const network = { aborted: [], collect: [], api: [], external_continued: [] };
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.startsWith(`${ORIGIN}/api/forms/`)) {
      network.api.push({ method: request.method(), accept: request.headers()['accept'] || '' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: 'pending' }) });
    }
    if (url.startsWith(`${ORIGIN}/`)) return route.continue();
    if (COLLECT.test(url)) network.collect.push(url);
    network.aborted.push(url);
    return route.abort();
  });
  await context.addInitScript((values) => {
    if (location.origin !== 'http://127.0.0.1:4397') return;
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
  }, storage);
  await context.addInitScript(INIT_SCRIPT);
  return { context, network };
}

async function openArticle(context, slug) {
  const page = await context.newPage();
  const start = new Date('2026-10-16T12:00:00Z').getTime();
  await page.clock.install({ time: start });
  await page.clock.pauseAt(start + 1000);
  await page.goto(`${ORIGIN}/blog/${slug}/`, { waitUntil: 'load' });
  return page;
}

const events = (page, prefix) => page.evaluate((p) => (window.dataLayer || [])
  .filter((x) => x && x[0] === 'event' && String(x[1]).startsWith(p))
  .map((x) => ({ name: x[1], params: { ...x[2] } })), prefix);

async function scrollBody(page, fraction) {
  await page.evaluate((f) => {
    const body = document.querySelector('[data-article-body]');
    const r = body.getBoundingClientRect();
    const target = window.scrollY + r.top + r.height * f - window.innerHeight;
    window.scrollTo(0, Math.max(0, target));
    window.dispatchEvent(new Event('scroll'));
  }, fraction);
}

// Advance page time in 5s steps with a scroll ping each step (an active visitor).
async function readFor(page, ms, { active = true } = {}) {
  for (let t = 0; t < ms; t += 5000) {
    if (active) await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
    await page.clock.runFor(5000);
  }
}

async function run(chromium) {
  const { short, long, other } = pickArticles();
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const networks = [];
  try {
    // 1. Long article: meaningful read, then completion, each once.
    {
      const { context, network } = await newContext(browser);
      networks.push(network);
      const page = await openArticle(context, long.slug);
      check('no article events on load', (await events(page, 'article_')).length === 0);
      await scrollBody(page, 0.4);
      await readFor(page, 35_000);
      let ev = await events(page, 'article_');
      const reads = (list) => list.filter((e) => !e.name.startsWith('article_active_')).map((e) => e.name);
      check('meaningful read after time + progress', JSON.stringify(reads(ev)) === '["article_meaningful_read"]', { note: JSON.stringify(ev.map((e) => e.name)) });
      check('active 30s milestone once', ev.filter((e) => e.name === 'article_active_30s').length === 1);
      check('article events name send_to', ev.every((e) => e.params.send_to === GA4));
      check('params are allowlisted keys only', ev.every((e) => Object.keys(e.params).every((k) => ['send_to', 'article_slug', 'article_author', 'article_topic', 'tracker_version'].includes(k))));
      await scrollBody(page, 1);
      await readFor(page, 95_000);
      await readFor(page, 30_000);
      ev = await events(page, 'article_');
      check('completion once after body end + time', JSON.stringify(reads(ev)) === '["article_meaningful_read","article_read_complete"]', { note: JSON.stringify(ev.map((e) => e.name)) });
      check('active milestones 30/60/120 once each', ['30', '60', '120'].every((s) => ev.filter((e) => e.name === `article_active_${s}s`).length === 1));
      check('no event repeats', new Set(ev.map((e) => e.name)).size === ev.length);
      const configs = await page.evaluate(() => (window.dataLayer || []).filter((x) => x && x[0] === 'config').length);
      check('no gtag config (no extra page_view)', configs === 0);
      await context.close();
    }
    // 2. Short article completes on its scaled threshold.
    {
      const { context, network } = await newContext(browser);
      networks.push(network);
      const page = await openArticle(context, short.slug);
      await scrollBody(page, 1);
      await readFor(page, 95_000);
      const ev = await events(page, 'article_');
      check(`short article (${short.words} words) completes`, ev.some((e) => e.name === 'article_read_complete'), { note: JSON.stringify(ev.map((e) => e.name)) });
      await context.close();
    }
    // 3. Hidden tab accrues nothing.
    {
      const { context, network } = await newContext(browser);
      networks.push(network);
      const page = await openArticle(context, long.slug);
      await page.evaluate(() => window.__qaSetVisibility('hidden'));
      await scrollBody(page, 1);
      await readFor(page, 180_000);
      check('hidden tab sends no read events', (await events(page, 'article_')).length === 0);
      await context.close();
    }
    // 3b. Restored deep in the page (body above the viewport): nothing accrues.
    {
      const { context, network } = await newContext(browser);
      networks.push(network);
      const page = await openArticle(context, long.slug);
      const bottom = await page.evaluate(() => {
        const r = document.querySelector('[data-article-body]').getBoundingClientRect();
        window.scrollTo(0, window.scrollY + r.bottom + 50);
        return document.querySelector('[data-article-body]').getBoundingClientRect().bottom;
      });
      if (bottom > 0) {
        console.log(`INFO skipped scrolled-past check: page cannot scroll the body out of view (bottom ${bottom}px)`);
      } else {
        await readFor(page, 180_000);
        check('scrolled past the article (newsletter/footer) sends no read events', (await events(page, 'article_')).length === 0);
      }
      await context.close();
    }
    // 4. Clicks: next article + directory, sanitized, navigation prevented.
    {
      const { context, network } = await newContext(browser);
      networks.push(network);
      const page = await openArticle(context, long.slug);
      await page.evaluate((slug) => {
        window.addEventListener('click', (e) => e.preventDefault());
        const body = document.querySelector('[data-article-body]');
        for (const [id, href] of [['qa-next', `/blog/${slug}/?utm_source=x#frag`], ['qa-dir', '/directory/parks/?q=a@b.c'], ['qa-off', 'https://example.invalid/blog/x/']]) {
          const a = document.createElement('a');
          a.id = id; a.href = href; a.textContent = id;
          body.appendChild(a);
        }
      }, other.slug);
      await page.click('#qa-next');
      await page.click('#qa-next');
      await page.click('#qa-dir');
      await page.click('#qa-off');
      const ev = await events(page, 'article_');
      const next = ev.filter((e) => e.name === 'article_next_click');
      const dir = ev.filter((e) => e.name === 'article_directory_click');
      check('next-article click once with slug only', next.length === 1 && next[0].params.destination_slug === other.slug && next[0].params.link_region === 'body');
      check('directory click with section only', dir.length === 1 && dir[0].params.destination_section === 'parks');
      check('no raw URL/query in params', !JSON.stringify(ev).match(/utm_source|a@b\.c|example\.invalid|frag/));
      await context.close();
    }
    // 5. QA suppression: no article_* or newsletter_* events; mocked newsletter submit.
    {
      const { context, network } = await newContext(browser, { storage: { 'cc-analytics-suppress': '1' } });
      networks.push(network);
      const page = await openArticle(context, short.slug);
      await scrollBody(page, 1);
      await readFor(page, 60_000);
      const form = page.locator('#newsletter-inline-form, .newsletter-inline form').first();
      if (await form.count()) {
        await form.locator('input[type="email"]').fill(QA_EMAIL);
        const consent = form.locator('input[type="checkbox"]');
        if (await consent.count()) await consent.first().check();
        await form.locator('button[type="submit"]').click();
        await page.clock.runFor(1000);
        await page.waitForTimeout(300);
      }
      check('suppressed: no article events', (await events(page, 'article_')).length === 0);
      check('suppressed: no newsletter events', (await events(page, 'newsletter_')).length === 0);
      check('newsletter submit hit only the local mock', network.api.every((r) => r.method === 'POST'), { note: `${network.api.length} mock request(s)` });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const all = networks.reduce((acc, n) => ({
    aborted: acc.aborted.concat(n.aborted), collect: acc.collect.concat(n.collect),
  }), { aborted: [], collect: [] });
  // Every non-local request was aborted by construction (the route has no
  // other branch); this records what tried to leave.
  console.log(`INFO ${all.aborted.length} external request(s) aborted, ${all.collect.length} of them tag/collection URLs`);
  writeFileSync(path.join(outDir, 'qa-article-tracker.json'), `${JSON.stringify({ origin: ORIGIN, results, blocked: all }, null, 2)}\n`);
}

let server;
let exitCode = 0;
try {
  const chromium = await loadPlaywright();
  if (startServer) {
    server = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'preview', '--host', '127.0.0.1', '--port', String(PORT)], { stdio: ['ignore', 'ignore', 'inherit'] });
  }
  await waitForServer();
  await run(chromium);
  exitCode = results.every((r) => r.ok) ? 0 : 1;
  console.log(`${results.filter((r) => r.ok).length}/${results.length} checks passed — ${path.join(outDir, 'qa-article-tracker.json')}`);
} catch (error) {
  console.error(`qa-article-tracker: ${error instanceof Error ? error.message : error}`);
  exitCode = 1;
} finally {
  if (server) server.kill();
}
process.exit(exitCode);
