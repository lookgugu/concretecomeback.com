#!/usr/bin/env node
// Local-only QA. Build first, then run with PLAYWRIGHT_MODULE pointing to an
// existing playwright-core installation. No dependencies or browser installs.
// Port 4337 must be free; this runner owns and stops its preview server.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const origin = 'http://127.0.0.1:4337';
const out = process.argv[2] || path.join(homedir(), '.hermes/cache/scratch/cc-newsletter-landing-qa');
const results = [];
const collections = [];
const blocked = new Set();
const consoleErrors = [];
const expectedNetworkErrors = [];
const fontRequests = new Set();
// Exact stylesheet used by SEOHead; permit only its font-file host and families.
const fontStylesheet = 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Oswald:wght@700&display=swap';
const isFont = url => url.href === fontStylesheet || (
  url.origin === 'https://fonts.gstatic.com' && /^\/s\/(inter|oswald)\/[^?]+\.woff2$/.test(url.pathname) && !url.search
);
const email = 'qa-local@example.invalid';
const collect = /\/g\/collect|\/j\/collect|\/collect(?:\?|$)|google-analytics\.com|analytics\.google\.com|doubleclick\.net|\/ccm\/collect/;
const tags = /^https:\/\/www\.googletagmanager\.com\/(gtm\.js|gtag\/js)\?/;
mkdirSync(out, { recursive: true });
function check(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail });
  assert.ok(condition, name);
}
// Overwrite any previous success before setup: interruption leaves an explicit
// incomplete artifact, and setup failures (including imports/port checks) report.
const startedAt = new Date().toISOString();
let completed = false;
let failure = null;
let server;
let browser;
function report() {
  return {
    status: failure ? 'failed' : completed ? 'passed' : 'incomplete',
    completed, startedAt,
    finishedAt: completed || failure ? new Date().toISOString() : null,
    error: failure ? { name: failure.name, message: failure.message } : null,
    failedChecks: results.filter(r => !r.ok).map(r => r.name),
    results, passed: results.filter(r => r.ok).length,
  };
}
writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify(report(), null, 2));
try {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
  // Refuse to reuse someone else's server or let Astro silently change ports.
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(4337, '127.0.0.1', () => probe.close(resolve));
  });
  server = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'preview', '--host', '127.0.0.1', '--port', '4337'], { stdio: 'ignore' });
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(origin + '/newsletter/')).ok) { ready = true; break; } } catch {}
    await sleep(100);
  }
  check('local preview responds on owned port 4337', ready);
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  async function setup(viewport, { js = true, state, hidden = false, liveTags = false } = {}) {
    const context = await browser.newContext({ viewport, javaScriptEnabled: js, serviceWorkers: 'block' });
    const api = [];
    const intentionalFailures = new Set();
    let mode = 'ok';
    let release;
    // Installed before pages exist: all collections and forms are intercepted,
    // only local GETs, exact Google tag-script GETs and allowlisted font GETs
    // can reach the network. Collection/form handling always takes precedence.
    await context.route('**/*', async route => {
      const req = route.request();
      const url = new URL(req.url());
      if (collect.test(url.href)) {
        collections.push({ url: url.href, body: req.postData() || '' });
        return route.fulfill({ status: 204, body: '' });
      }
      if (url.origin === origin && url.pathname === '/api/forms/newsletter' && req.method() === 'POST') {
        const fields = new URLSearchParams(req.postData());
        api.push({ method: req.method(), fields: [...fields.keys()], consent: fields.get('consent'), honeypot: fields.get('_gotcha'), contentType: req.headers()['content-type'], accept: req.headers().accept });
        const chosen = mode;
        if (chosen === 'error') intentionalFailures.add(req.url());
        if (chosen === 'hold') await new Promise(resolve => { release = resolve; });
        if (req.headers().accept.includes('text/html')) return route.fulfill({ status: 303, headers: { location: chosen === 'error' ? '/newsletter/error/' : '/newsletter/pending/' } });
        return route.fulfill({ status: chosen === 'error' ? 502 : 200, contentType: chosen === 'error' ? 'text/html' : 'application/json', body: chosen === 'error' ? '<html>Gateway unavailable</html>' : '{"ok":true,"status":"pending"}' });
      }
      if (req.method() === 'GET' && isFont(url)) {
        fontRequests.add(url.href);
        return route.continue();
      }
      if (req.method() === 'GET' && (url.origin === origin || (liveTags && tags.test(url.href)))) return route.continue();
      intentionalFailures.add(req.url());
      blocked.add(url.origin + url.pathname);
      return route.abort();
    });
    if (js) await context.addInitScript(({ state, hidden }) => {
      if (state) {
        localStorage.setItem('cc-newsletter-status', state);
        localStorage.setItem('cc-newsletter-pending-at', String(Date.now()));
      }
      let visible = !hidden;
      Object.defineProperty(document, 'visibilityState', { get: () => visible ? 'visible' : 'hidden' });
      Object.defineProperty(document, 'hidden', { get: () => !visible });
      window.qaVisible = () => { visible = true; document.dispatchEvent(new Event('visibilitychange')); };
    }, { state, hidden });
    const page = await context.newPage();
    page.on('pageerror', error => consoleErrors.push({ kind: 'pageerror', message: error.message }));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const entry = { kind: 'console', message: message.text(), url: message.location().url };
      // Only known route aborts or the deliberately mocked 502 are expected.
      if (intentionalFailures.has(entry.url) && /Failed to load resource:/.test(entry.message)) expectedNetworkErrors.push(entry);
      else consoleErrors.push(entry);
    });
    return { context, page, api, mode: value => { mode = value; }, release: () => release() };
  }
  async function assertFonts(page, label) {
    const fonts = await page.evaluate(async () => {
      await Promise.all([document.fonts.load('400 16px Inter'), document.fonts.load('700 32px Oswald')]);
      await document.fonts.ready;
      return {
        status: document.fonts.status,
        faces: [...document.fonts].filter(f => f.status === 'loaded').map(f => ({ family: f.family, status: f.status })),
        bodyFamily: getComputedStyle(document.body).fontFamily,
        headingFamily: getComputedStyle(document.querySelector('h1')).fontFamily,
      };
    });
    check(`${label}: real Inter and Oswald fonts loaded`, fonts.status === 'loaded' && ['Inter', 'Oswald'].every(name => fonts.faces.some(f => f.family.replaceAll('"', '') === name)), fonts);
  }
  const form = '.newsletter-inline form';
  const status = '.newsletter-inline [role="status"]';
  const events = page => page.evaluate(() => (window.dataLayer || []).filter(e => e?.[0] === 'event' && e[1].startsWith('newsletter_')).map(e => ({ name: e[1], params: e[2] })));
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const label = `${viewport.width}x${viewport.height}`;
    const t = await setup(viewport, { liveTags: true });
    await t.page.goto(origin + '/newsletter/');
    await t.page.bringToFront();
    await assertFonts(t.page, label);
    await t.page.waitForTimeout(1200);
    const geometry = await t.page.evaluate(() => {
      const controls = [...document.querySelectorAll('.newsletter-inline input[type=email], .newsletter-inline button')].map(e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width }; });
      return { controls, overflow: document.documentElement.scrollWidth > innerWidth, h1: document.querySelectorAll('h1').length, canonical: [...document.querySelectorAll('link[rel=canonical]')].map(e => e.href), robots: document.querySelector('meta[name=robots]')?.content, popup: document.querySelector('#newsletter-signup').hidden };
    });
    check(`${label}: controls in first viewport, no overflow`, !geometry.overflow && geometry.controls.every(r => r.top >= 64 && r.bottom <= viewport.height && r.width > 0), geometry);
    check(`${label}: one h1 and canonical, indexable`, geometry.h1 === 1 && geometry.canonical.length === 1 && geometry.canonical[0] === 'https://concretecomeback.com/newsletter/' && !geometry.robots?.includes('noindex'));
    check(`${label}: accessible email label`, await t.page.getByRole('textbox', { name: 'Email address' }).count() === 1);
    await t.page.getByRole('textbox', { name: 'Email address' }).focus();
    await t.page.keyboard.press('Tab');
    check(`${label}: email tabs to submit`, await t.page.locator(`${form} button`).evaluate(e => e === document.activeElement));
    check(`${label}: footer newsletter link contrasts with background`, await t.page.locator('footer a[href="/newsletter/"]').evaluate(e => getComputedStyle(e).color !== getComputedStyle(e.closest('footer')).backgroundColor));
    await t.page.screenshot({ path: path.join(out, `${label}-real-font-viewport.png`), fullPage: false });
    await t.page.getByRole('textbox', { name: 'Email address' }).fill(email);
    t.mode('hold');
    await t.page.locator(form).evaluate(f => { f.requestSubmit(); f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); });
    await t.page.waitForTimeout(6000);
    check(`${label}: one request while submitting; popup excluded`, t.api.length === 1 && await t.page.locator(`${form} button`).isDisabled() && await t.page.locator('#newsletter-signup').evaluate(e => e.hidden));
    t.release();
    await t.page.waitForFunction(() => document.querySelector('.newsletter-inline form').hidden);
    check(`${label}: pending state`, /Check your inbox/.test(await t.page.locator(status).innerText()));
    check(`${label}: original encoded contract`, t.api[0].contentType.includes('application/x-www-form-urlencoded') && t.api[0].consent === 'yes' && t.api[0].honeypot === '' && t.api[0].accept === 'application/json');
    const commands = await events(t.page);
    check(`${label}: impression once and submitted/pending routing`, commands.filter(e => e.name === 'newsletter_impression').length === 1 && ['newsletter_signup_submitted', 'newsletter_signup_pending'].every(name => commands.some(e => e.name === name)) && commands.every(e => e.params.send_to === 'G-VYW5FDDX52' && e.params.newsletter_source === 'newsletter_landing'), commands);
    await t.page.waitForTimeout(1500);
    await t.context.close();

    const retry = await setup(viewport);
    retry.mode('error');
    await retry.page.goto(origin + '/newsletter/');
    await retry.page.getByRole('textbox', { name: 'Email address' }).fill(email);
    await retry.page.locator(`${form} button`).click();
    await retry.page.waitForFunction(() => document.querySelector('.newsletter-inline [role=status]').textContent.includes('temporarily unavailable'));
    check(`${label}: error allows retry`, await retry.page.locator(`${form} button`).isEnabled());
    retry.mode('ok');
    await retry.page.locator(`${form} button`).click();
    await retry.page.waitForFunction(() => document.querySelector('.newsletter-inline form').hidden);
    check(`${label}: retry succeeds`, retry.api.length === 2 && (await events(retry.page)).some(e => e.name === 'newsletter_signup_error'));
    await retry.context.close();

    for (const state of ['pending', 'subscribed']) {
      const s = await setup(viewport, { state });
      await s.page.goto(origin + '/newsletter/');
      await s.page.waitForTimeout(300);
      check(`${label}: ${state} suppression`, await s.page.locator(form).evaluate(e => e.hidden) && (await events(s.page)).length === 0);
      if (state === 'subscribed') check(`${label}: subscribed copy retains launch status`, (await s.page.locator(status).innerText()).includes('launches'));
      await s.context.close();
    }
    const native = await setup(viewport, { js: false });
    for (const outcome of ['error', 'ok']) {
      native.mode(outcome);
      await native.page.goto(origin + '/newsletter/');
      await native.page.getByRole('textbox', { name: 'Email address' }).fill(email);
      await native.page.locator(`${form} button`).click();
      await native.page.waitForURL(`**/newsletter/${outcome === 'error' ? 'error' : 'pending'}/`);
      check(`${label}: no-JS ${outcome} native redirect`, native.api.at(-1).accept.includes('text/html'));
      if (outcome === 'error') {
        native.mode('ok');
        await native.page.getByRole('textbox', { name: 'Email address' }).fill(email);
        await native.page.locator(`${form} button`).click();
        await native.page.waitForURL('**/newsletter/pending/');
        check(`${label}: no-JS error-page retry`, true);
      }
    }
    await native.context.close();
  }
  const intermediate = await setup({ width: 1024, height: 900 });
  await intermediate.page.goto(origin + '/newsletter/');
  await assertFonts(intermediate.page, '1024x900');
  const navGeometry = await intermediate.page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Main navigation"]');
    const items = [...nav.querySelectorAll('a, summary')].filter(e => {
      const details = e.closest('details');
      return (!details || details.open || e.tagName === 'SUMMARY') && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
    });
    return items.map(e => {
      const r = e.getBoundingClientRect();
      const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      const textRects = [];
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        textRects.push(...[...range.getClientRects()].filter(r => r.width && r.height).map(r => ({ top: r.top, bottom: r.bottom })));
      }
      // Different font sizes (e.g. the dropdown arrow) can share one line;
      // their text boxes overlap vertically. Wrapped lines cannot overlap.
      const oneLine = textRects.length > 0 && Math.max(...textRects.map(r => r.top)) < Math.min(...textRects.map(r => r.bottom));
      return { text: e.textContent.trim(), top: r.top, bottom: r.bottom, left: r.left, right: r.right, oneLine, textRects };
    });
  });
  // Include logo and all visible desktop actions; each must stay inside the
  // header's single 64px row, without wrapping its own label or clipping.
  check('1024x900: desktop navigation stays on one line', navGeometry.some(e => e.text === 'Newsletter') && navGeometry.every(e => e.top >= 0 && e.bottom <= 64 && e.left >= 0 && e.right <= 1024 && e.oneLine), navGeometry);
  await intermediate.page.screenshot({ path: path.join(out, '1024x900-real-font-viewport.png') });
  await intermediate.context.close();

  const hidden = await setup({ width: 390, height: 844 }, { hidden: true });
  await hidden.page.goto(origin + '/newsletter/');
  await hidden.page.waitForTimeout(500);
  check('hidden page has no impression', (await events(hidden.page)).length === 0);
  await hidden.page.evaluate(() => window.qaVisible());
  await hidden.page.waitForTimeout(300);
  check('foreground transition counts once', (await events(hidden.page)).filter(e => e.name === 'newsletter_impression').length === 1);
  await hidden.page.locator('.newsletter-inline [name="_gotcha"]').evaluate(e => { e.value = 'robot'; });
  await hidden.page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await hidden.page.locator(`${form} button`).click();
  await hidden.page.waitForTimeout(300);
  check('honeypot preserved in mocked transport (backend behavior covered by unit tests)', hidden.api[0]?.honeypot === 'robot');
  await hidden.context.close();

  const sitemap = readFileSync('dist/sitemap-0.xml', 'utf8');
  check('generated sitemap includes landing', sitemap.includes('<loc>https://concretecomeback.com/newsletter/</loc>'));
  for (const state of ['pending', 'confirmed', 'error']) {
    const outcome = await setup({ width: 390, height: 844 });
    await outcome.page.goto(`${origin}/newsletter/${state}/`);
    const outcomeText = await outcome.page.locator('main').innerText();
    check(`${state}: rendered launch-stage copy`, /planned weekly/.test(outcomeText) && /Delivery hasn't started; no first-send date is set/.test(outcomeText));
    await outcome.context.close();
    check(`${state}: generated noindex and sitemap exclusion`, /noindex/.test(readFileSync(`dist/newsletter/${state}/index.html`, 'utf8')) && !sitemap.includes(`/newsletter/${state}/`));
  }
  // Immutable pre-implementation fixture; never relative to moving HEAD.
  const trackedConfig = execFileSync('git', ['show', '4c13c2d6d95f69ab2d7549ed282c4372f8d21126:astro.config.mjs'], { encoding: 'utf8' });
  check('immutable baseline 4c13c2d sitemap fixture excluded all newsletter routes', trackedConfig.includes("!page.includes('/newsletter/')"));
  check('working config narrows exclusion; generated output separately verified', readFileSync('astro.config.mjs', 'utf8').includes('(pending|confirmed|error)'));
  const hits = collections.flatMap(({ url, body }) => (body || '').split('\n').map(line => {
    const p = new URLSearchParams(new URL(url).search.slice(1) + '&' + line);
    return { event: p.get('en'), source: p.get('ep.newsletter_source'), destination: p.get('tid') };
  })).filter(h => h.event?.startsWith('newsletter_'));
  check('real Google tag attempted landing collection (intercepted, never sent)', hits.some(h => h.event === 'newsletter_impression' && h.source === 'newsletter_landing' && h.destination === 'G-VYW5FDDX52'), hits);
  check('collection contains no email or confirmation token', !collections.some(c => /qa-local|example(?:\.|%2E)invalid|%40|token=/i.test(c.url + c.body)));
  check('no unexpected browser console errors or uncaught exceptions', consoleErrors.length === 0, consoleErrors);
  // Keep sanitized transport only; raw collection may contain unrelated client IDs.
  writeFileSync(path.join(out, 'transport.json'), JSON.stringify({ hits, intercepted: collections.length, blocked: [...blocked] }, null, 2));
  completed = true;
} catch (error) {
  failure = error;
  process.exitCode = 1;
  console.error(error);
} finally {
  try { if (browser) await browser.close(); }
  catch (error) { failure ||= error; process.exitCode = 1; }
  if (server) server.kill();
  writeFileSync(path.join(out, 'console-errors.json'), JSON.stringify({ unexpected: consoleErrors, expectedNetworkErrors, fontRequests: [...fontRequests] }, null, 2));
  writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify(report(), null, 2));
}
if (!failure && completed) console.log(`${results.length} checks passed; evidence: ${out}`);
else console.error(`QA ${report().status}; see ${path.join(out, 'browser-results.json')}`);
