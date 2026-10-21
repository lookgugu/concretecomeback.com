// Article tracker regressions against a fake window/document/clock. No
// network: events go to a recording `send`, or through the real transport into
// a fake dataLayer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENTS,
  IDLE_MS,
  bodyInView,
  bodyProgress,
  classifyDestination,
  createArticleTracker,
  initArticleEngagement,
  safeKey,
  thresholds,
} from './article-engagement.js';
import { GA4_MEASUREMENT_ID, isAnalyticsSuppressed, sendEvent } from './analytics-transport.js';

const ORIGIN = 'https://concretecomeback.com';

function emitter() {
  const listeners = {};
  return {
    listeners,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    emit: (type, event = {}) => (listeners[type] || []).slice().forEach((fn) => fn({ type, ...event })),
    count: () => Object.values(listeners).reduce((n, l) => n + l.length, 0),
  };
}

function setup({ words = 1200, rect = { top: 600, height: 4000 }, visibility = 'visible', allowlist = ['next-one', 'this-one'], dataset = {}, send } = {}) {
  let clock = 0;
  const intervals = new Map();
  let nextId = 1;
  const win = { ...emitter(), location: { origin: ORIGIN }, innerHeight: 800 };
  const doc = {
    ...emitter(),
    visibilityState: visibility,
    getElementById: (id) => (id === 'cc-article-allowlist' ? { textContent: JSON.stringify(allowlist) } : null),
  };
  const state = { rect: rect && { ...rect } };
  const body = {
    dataset: { articleSlug: 'this-one', articleAuthor: 'ann-lee', articleTopic: 'gear', articleWords: String(words), ...dataset },
    getBoundingClientRect: () => { if (!state.rect) throw new Error('layout'); return state.rect; },
    contains: (el) => el.inBody === true,
  };
  const sent = [];
  const tracker = createArticleTracker({
    win, doc, body,
    send: send || ((event, params) => sent.push({ event, params })),
    now: () => clock,
    setIntervalFn: (fn) => { const id = nextId++; intervals.set(id, fn); return id; },
    clearIntervalFn: (id) => intervals.delete(id),
  });
  const advance = (ms, { activeEvery = 5000 } = {}) => {
    for (let t = 0; t < ms; t += 1000) {
      clock += 1000;
      if (activeEvery && clock % activeEvery === 0) win.emit('scroll');
      for (const fn of [...intervals.values()]) fn();
    }
  };
  const scrollTo = (top) => { state.rect.top = top; win.emit('scroll'); };
  const setVisibility = (v) => { doc.visibilityState = v; doc.emit('visibilitychange'); };
  const link = (href, inBody = true) => ({ inBody, getAttribute: () => href, closest: function closest() { return this; } });
  return { tracker, sent, advance, scrollTo, setVisibility, win, doc, intervals, link, names: () => sent.map((s) => s.event) };
}

test('thresholds scale with length and stay bounded', () => {
  assert.deepEqual(thresholds(200), { meaningfulSeconds: 10, completeSeconds: 18 });
  assert.deepEqual(thresholds(5000), { meaningfulSeconds: 30, completeSeconds: 90 });
  assert.deepEqual(thresholds(NaN), thresholds(600));
});

test('bodyInView requires part of the body inside the viewport', () => {
  assert.equal(bodyInView({ top: -500, height: 1000 }, 800), true);
  assert.equal(bodyInView({ top: -1000, height: 1000 }, 800), false, 'entirely above');
  assert.equal(bodyInView({ top: 800, height: 1000 }, 800), false, 'entirely below');
  assert.equal(bodyInView({ top: -2000, bottom: 10, height: 2010 }, 800), true);
  assert.equal(bodyInView(null, 800), false);
});

test('bodyProgress is the share of the body scrolled past the viewport bottom', () => {
  assert.equal(bodyProgress({ top: 800, height: 1000 }, 800), 0);
  assert.equal(bodyProgress({ top: 300, height: 1000 }, 800), 0.5);
  assert.equal(bodyProgress({ top: -2000, height: 1000 }, 800), 1);
  assert.equal(bodyProgress({ top: 0, height: 0 }, 800), 0);
});

test('meaningful read needs both active time and body progress', () => {
  const t = setup();
  t.advance(60_000);
  assert.ok(!t.names().includes(EVENTS.meaningful), 'time without progress is not a read');
  t.scrollTo(-600); // (800+600)/4000 = 0.35
  t.advance(1000);
  assert.deepEqual(t.names().filter((n) => !n.startsWith('article_active_')), [EVENTS.meaningful]);
});

test('progress without enough active time does not complete', () => {
  const t = setup();
  t.scrollTo(-3200); // body bottom exactly at the viewport bottom
  t.advance(5000);
  assert.deepEqual(t.names(), []);
  t.advance(80_000);
  assert.ok(!t.names().includes(EVENTS.complete));
  t.advance(6000);
  assert.ok(t.names().includes(EVENTS.complete), `complete after ${t.tracker.state().limits.completeSeconds}s active`);
});

test('a short article that fits on screen still completes after its scaled time', () => {
  const t = setup({ words: 150, rect: { top: 200, height: 500 } });
  const { completeSeconds } = t.tracker.state().limits;
  t.advance((completeSeconds - 1) * 1000);
  assert.ok(!t.names().includes(EVENTS.complete));
  t.advance(2000);
  assert.deepEqual(t.names(), [EVENTS.meaningful, EVENTS.complete]);
  t.advance(120_000);
  assert.deepEqual(t.names(), [EVENTS.meaningful, EVENTS.complete, EVENTS.active[30], EVENTS.active[60], EVENTS.active[120]]);
  assert.equal(t.tracker.state().running, false, 'timer stops once every read event is sent');
});

test('active-time milestones fire once each at 30/60/120 s of in-view active time', () => {
  const t = setup();
  t.advance(29_000);
  assert.deepEqual(t.names(), []);
  t.advance(1000);
  assert.deepEqual(t.names(), [EVENTS.active[30]]);
  t.advance(30_000);
  t.advance(60_000);
  t.advance(60_000);
  assert.deepEqual(t.names().filter((n) => n.startsWith('article_active_')), [EVENTS.active[30], EVENTS.active[60], EVENTS.active[120]]);
});

test('hidden tab never moves body progress', () => {
  const t = setup();
  const atLoad = t.tracker.state().maxProgress; // (800-600)/4000 = 0.05
  t.setVisibility('hidden');
  t.scrollTo(-3200);
  t.advance(10_000);
  assert.equal(t.tracker.state().maxProgress, atLoad);
  t.setVisibility('visible');
  t.advance(1000);
  assert.equal(t.tracker.state().maxProgress, 1, 'measured once visible again');
});

test('a page restored scrolled past the article counts no progress and no active time', () => {
  // Body entirely above the viewport (bottom at -1000): newsletter/footer on screen.
  const t = setup({ rect: { top: -5000, height: 4000 } });
  t.advance(200_000);
  assert.equal(t.tracker.state().maxProgress, 0);
  assert.equal(t.tracker.state().activeMs, 0);
  assert.deepEqual(t.names(), []);
});

test('reading the newsletter/footer below the article does not accrue active time', () => {
  const t = setup();
  t.advance(10_000);
  const before = t.tracker.state().activeMs;
  assert.ok(before > 0);
  t.scrollTo(-4100); // body bottom 100px above the viewport
  t.advance(120_000);
  assert.equal(t.tracker.state().activeMs, before);
  assert.ok(!t.names().includes(EVENTS.complete), 'never saw the body end while it was on screen');
});

test('a body entirely below the viewport is not in view', () => {
  const t = setup({ rect: { top: 900, height: 4000 } });
  t.advance(60_000);
  assert.equal(t.tracker.state().activeMs, 0);
  assert.equal(t.tracker.state().maxProgress, 0);
});

test('hidden tab stops accrual and the timer; visible resumes', () => {
  const t = setup();
  t.advance(5000);
  t.setVisibility('hidden');
  const before = t.tracker.state().activeMs;
  assert.equal(t.intervals.size, 0);
  t.advance(120_000);
  assert.equal(t.tracker.state().activeMs, before);
  t.setVisibility('visible');
  t.advance(3000);
  assert.ok(t.tracker.state().activeMs > before);
});

test('idle visitor stops accruing after IDLE_MS', () => {
  const t = setup();
  t.advance(IDLE_MS + 60_000, { activeEvery: 0 });
  assert.equal(t.tracker.state().activeMs, IDLE_MS);
});

test('events are deduplicated per page and carry only safe params', () => {
  const t = setup({ words: 150, rect: { top: 0, height: 300 } });
  t.advance(120_000);
  t.doc.emit('click', { target: t.link('/blog/next-one/') });
  t.doc.emit('click', { target: t.link('/blog/next-one/') });
  assert.deepEqual(t.names().filter((n) => n === EVENTS.next), [EVENTS.next]);
  assert.equal(new Set(t.names()).size, t.names().length, 'no event repeats');
  const params = t.sent.find((s) => s.event === EVENTS.next).params;
  assert.deepEqual(params, {
    article_slug: 'this-one', article_author: 'ann-lee', article_topic: 'gear', tracker_version: '1',
    destination_slug: 'next-one', link_region: 'body',
  });
  assert.ok(!('page_location' in params), 'GA4 keeps the source pagePath');
});

test('destinations are allowlisted and sanitized', () => {
  const ctx = { origin: ORIGIN, currentSlug: 'this-one', allowlist: new Set(['next-one', 'this-one']) };
  assert.deepEqual(classifyDestination('/blog/next-one?utm=x#y', ctx), { event: EVENTS.next, params: { destination_slug: 'next-one' } });
  assert.equal(classifyDestination('/blog/this-one/', ctx), null, 'self link');
  assert.equal(classifyDestination('/blog/unpublished/', ctx), null);
  assert.equal(classifyDestination('/blog?tag=gear', ctx), null);
  assert.equal(classifyDestination('https://evil.example/blog/next-one/', ctx), null);
  assert.equal(classifyDestination('javascript:alert(1)', ctx), null);
  assert.deepEqual(classifyDestination('/directory/parks/us/foo?email=a@b.c', ctx), { event: EVENTS.directory, params: { destination_section: 'parks' } });
  assert.deepEqual(classifyDestination('/directory/', ctx), { event: EVENTS.directory, params: { destination_section: 'index' } });
  assert.deepEqual(classifyDestination('/directory/weird', ctx), { event: EVENTS.directory, params: { destination_section: 'index' } });
});

test('unsafe metadata is replaced, and a missing slug disables tracking', () => {
  const t = setup({ dataset: { articleAuthor: 'Ann <script>', articleTopic: 'a@b.c' }, words: 150, rect: { top: 0, height: 300 } });
  t.advance(60_000);
  assert.equal(t.sent[0].params.article_author, 'unknown');
  assert.equal(t.sent[0].params.article_topic, 'unknown');
  assert.equal(setup({ dataset: { articleSlug: '../x' } }).tracker, null);
  assert.equal(safeKey('ok-key'), 'ok-key');
  assert.equal(safeKey('x'.repeat(61)), null);
});

test('pagehide disposes timer and listeners; nothing fires afterwards', () => {
  const t = setup({ words: 150, rect: { top: 0, height: 300 } });
  t.win.emit('pagehide');
  assert.equal(t.intervals.size, 0);
  assert.equal(t.win.count() + t.doc.count(), 0);
  t.advance(60_000);
  assert.deepEqual(t.names(), []);
});

test('a throwing sink never breaks the page', () => {
  const t = setup({ words: 150, rect: { top: 0, height: 300 }, send: () => { throw new Error('blocked'); } });
  assert.doesNotThrow(() => t.advance(60_000));
  assert.doesNotThrow(() => t.doc.emit('click', { target: t.link('/blog/next-one/') }));
});

test('a throwing layout read never throws into the page', () => {
  const t = setup({ rect: null });
  assert.doesNotThrow(() => t.advance(5000));
  assert.deepEqual(t.names(), []);
});

test('initArticleEngagement mounts once per body and swallows errors', () => {
  const body = { dataset: { articleSlug: 'this-one' }, getBoundingClientRect: () => ({ top: 0, height: 100 }) };
  const win = { ...emitter(), location: { origin: ORIGIN }, innerHeight: 800, setInterval: () => 1, clearInterval: () => {} };
  const doc = { ...emitter(), visibilityState: 'visible', querySelector: () => body, getElementById: () => null };
  assert.ok(initArticleEngagement(win, doc));
  assert.equal(initArticleEngagement(win, doc), null);
  assert.equal(initArticleEngagement(win, { querySelector: () => { throw new Error('x'); } }), null);
});

test('transport routes with send_to, never config, and honours QA suppression', () => {
  const win = { dataLayer: [] };
  assert.equal(sendEvent('article_read_complete', { article_slug: 'a' }, win), true);
  const cmd = win.dataLayer.find((x) => x && x[0] === 'event');
  assert.equal(cmd[2].send_to, GA4_MEASUREMENT_ID);
  assert.ok(!win.dataLayer.some((x) => x && x[0] === 'config'));

  const suppressed = { dataLayer: [], localStorage: { getItem: (k) => (k === 'cc-analytics-suppress' ? '1' : null) } };
  assert.equal(isAnalyticsSuppressed(suppressed), true);
  assert.equal(sendEvent('newsletter_impression', {}, suppressed), false);
  assert.equal(suppressed.dataLayer.length, 0);
  const flagged = { dataLayer: [], __CC_ANALYTICS_SUPPRESS__: true };
  assert.equal(sendEvent('x', {}, flagged), false);
  const throwingStorage = { dataLayer: [], get localStorage() { throw new Error('denied'); } };
  assert.equal(isAnalyticsSuppressed(throwingStorage), false);
  const throwingGtag = { dataLayer: [], gtag: () => { throw new Error('ext'); } };
  assert.doesNotThrow(() => sendEvent('x', {}, throwingGtag));
});
