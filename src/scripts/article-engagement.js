// Article engagement tracker for blog posts. Sends at most one of each event
// per page view through analytics-transport.js (send_to G-VYW5FDDX52, no
// config call, so no extra page_view):
//
//   article_active_30s / _60s / _120s
//                            active reading time crossed 30 / 60 / 120 s
//   article_meaningful_read  foreground active time ≥ meaningful threshold AND
//                            body progress ≥ MEANINGFUL_PROGRESS
//   article_read_complete    the end of the article body has been on screen AND
//                            foreground active time ≥ completion threshold
//   article_next_click       click to another published article (slug only)
//   article_directory_click  click into /directory (section only)
//
// "Active" time only accrues while the tab is visible, some of the article
// body is inside the viewport (not while the newsletter CTA or footer fills
// the screen) and the visitor has interacted within IDLE_MS. Body progress is
// only recorded under the same visible + intersecting conditions, so a page
// restored already scrolled past the article does not count as read. It is a
// better reading signal than GA4's userEngagementDuration, but it is still not
// proof of reading.
//
// The body is the element marked [data-article-body] (BlogLayout's prose
// div), so the end-of-post newsletter CTA, tags and footer never count as
// progress. Thresholds scale with the article's word count from build
// metadata, so a short article can still complete.
//
// Params come only from build metadata re-validated here (slug/author/topic
// keys in slug form) and from allowlisted destinations. No URL, query string,
// title, text or anything the visitor typed is ever sent. GA4 attaches the
// page location itself, so pagePath stays the source article. The scorecard
// reads only eventName + pagePath; these params are not registered custom
// dimensions and nothing depends on them.
//
// Analytics is best-effort: every handler is guarded, and a failure stops
// tracking rather than breaking the page.

import { sendEvent } from './analytics-transport.js';

export const TRACKER_VERSION = '1';
export const IDLE_MS = 30_000;
export const TICK_MS = 1000;
export const WORDS_PER_MINUTE = 230;
export const MEANINGFUL_PROGRESS = 0.25;
export const COMPLETE_PROGRESS = 0.98;
export const ACTIVE_MILESTONES = [30, 60, 120];
export const EVENTS = {
  active: Object.fromEntries(ACTIVE_MILESTONES.map((s) => [s, `article_active_${s}s`])),
  meaningful: 'article_meaningful_read',
  complete: 'article_read_complete',
  next: 'article_next_click',
  directory: 'article_directory_click',
};

const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIRECTORY_SECTIONS = ['parks', 'shops', 'groups'];
const ACTIVITY_EVENTS = ['scroll', 'keydown', 'pointerdown', 'pointermove', 'touchstart', 'wheel'];
const MOUNTED = new WeakSet();

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function safeKey(value, max = 60) {
  return typeof value === 'string' && value.length <= max && KEY_RE.test(value) ? value : null;
}

// Seconds of foreground active time required, scaled to expected reading
// time so short articles are not held to long-form thresholds.
export function thresholds(words) {
  const n = Number.isFinite(words) && words > 0 ? words : 600;
  const expected = (n / WORDS_PER_MINUTE) * 60;
  return {
    meaningfulSeconds: Math.round(clamp(expected * 0.2, 10, 30)),
    completeSeconds: Math.round(clamp(expected * 0.35, 15, 90)),
  };
}

// Share of the body whose bottom edge has passed the bottom of the viewport.
export function bodyProgress(rect, viewportHeight) {
  if (!rect || !(rect.height > 0) || !(viewportHeight > 0)) return 0;
  return clamp((viewportHeight - rect.top) / rect.height, 0, 1);
}

// Some of the body is on screen. A body entirely above the viewport (scrolled
// past, or restored deep in the page) or entirely below it does not count.
export function bodyInView(rect, viewportHeight) {
  if (!rect || !(rect.height > 0) || !(viewportHeight > 0)) return false;
  const bottom = Number.isFinite(rect.bottom) ? rect.bottom : rect.top + rect.height;
  return bottom > 0 && rect.top < viewportHeight;
}

// Maps a clicked href to an allowlisted destination, or null. Only same-origin
// links count; the destination is reduced to a published slug or a fixed
// directory section — never the raw URL.
export function classifyDestination(href, { origin, currentSlug, allowlist }) {
  let url;
  try { url = new URL(href, origin); } catch (_error) { return null; }
  if (url.origin !== origin) return null;
  const article = /^\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(url.pathname);
  if (article) {
    const slug = article[1];
    if (slug === currentSlug || !allowlist.has(slug)) return null;
    return { event: EVENTS.next, params: { destination_slug: slug } };
  }
  const dir = /^\/directory(?:\/([a-z]+))?(?:\/.*)?$/.exec(url.pathname);
  if (dir) {
    const section = dir[1] && DIRECTORY_SECTIONS.includes(dir[1]) ? dir[1] : 'index';
    return { event: EVENTS.directory, params: { destination_section: section } };
  }
  return null;
}

function readAllowlist(doc) {
  try {
    const el = doc.getElementById('cc-article-allowlist');
    const list = JSON.parse(el ? el.textContent : '[]');
    return new Set(Array.isArray(list) ? list.filter((s) => safeKey(s, 120)) : []);
  } catch (_error) {
    return new Set();
  }
}

export function createArticleTracker({
  win,
  doc,
  body,
  send = (event, params) => sendEvent(event, params, win),
  now = () => Date.now(),
  setIntervalFn = (fn, ms) => win.setInterval(fn, ms),
  clearIntervalFn = (id) => win.clearInterval(id),
}) {
  const ds = body.dataset || {};
  const slug = safeKey(ds.articleSlug, 120);
  if (!slug) return null;
  const base = {
    article_slug: slug,
    article_author: safeKey(ds.articleAuthor) || 'unknown',
    article_topic: safeKey(ds.articleTopic) || 'unknown',
    tracker_version: TRACKER_VERSION,
  };
  const words = Number.parseInt(ds.articleWords, 10);
  const limits = thresholds(words);
  const allowlist = readAllowlist(doc);
  const origin = win.location.origin;

  const sent = new Set();
  let activeMs = 0;
  let maxProgress = 0;
  let lastActivity = now();
  let lastTick = now();
  let timer = null;
  let disposed = false;
  const listeners = [];

  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    listeners.push(() => target.removeEventListener(type, fn, opts));
  };

  const fire = (event, extra = {}) => {
    if (sent.has(event) || disposed) return;
    sent.add(event);
    try { send(event, { ...base, ...extra }); } catch (_error) {}
  };

  const visible = () => doc.visibilityState === 'visible';

  // Reads layout once. Progress only moves while the tab is visible and the
  // body is on screen; returns whether the body is in view (false on error).
  const measure = () => {
    if (!visible()) return false;
    try {
      const rect = body.getBoundingClientRect();
      if (!bodyInView(rect, win.innerHeight)) return false;
      maxProgress = Math.max(maxProgress, bodyProgress(rect, win.innerHeight));
      return true;
    } catch (_error) {
      return false;
    }
  };

  const terminalEvents = [EVENTS.meaningful, EVENTS.complete, EVENTS.active[ACTIVE_MILESTONES[ACTIVE_MILESTONES.length - 1]]];
  const finished = () => terminalEvents.every((e) => sent.has(e));

  const evaluate = () => {
    const seconds = activeMs / 1000;
    for (const s of ACTIVE_MILESTONES) if (seconds >= s) fire(EVENTS.active[s]);
    if (seconds >= limits.meaningfulSeconds && maxProgress >= MEANINGFUL_PROGRESS) fire(EVENTS.meaningful);
    if (seconds >= limits.completeSeconds && maxProgress >= COMPLETE_PROGRESS) fire(EVENTS.complete);
    if (finished()) stopTimer();
  };

  const tick = () => {
    const t = now();
    const elapsed = Math.max(0, Math.min(t - lastTick, TICK_MS * 2));
    lastTick = t;
    const inView = measure();
    if (inView && t - lastActivity <= IDLE_MS) activeMs += elapsed;
    evaluate();
  };

  function startTimer() {
    if (timer !== null || disposed || finished()) return;
    lastTick = now();
    timer = setIntervalFn(guard(tick), TICK_MS);
  }

  function stopTimer() {
    if (timer === null) return;
    clearIntervalFn(timer);
    timer = null;
  }

  function guard(fn) {
    return (...args) => {
      try { fn(...args); } catch (_error) { dispose(); }
    };
  }

  function dispose() {
    if (disposed) return;
    stopTimer();
    disposed = true;
    for (const off of listeners.splice(0)) {
      try { off(); } catch (_error) {}
    }
  }

  const onActivity = guard(() => {
    lastActivity = now();
    measure();
  });
  for (const type of ACTIVITY_EVENTS) on(win, type, onActivity, { passive: true });

  on(doc, 'visibilitychange', guard(() => {
    if (visible()) {
      lastActivity = now();
      startTimer();
    } else {
      tick();
      stopTimer();
    }
  }));

  on(doc, 'click', guard((event) => {
    const target = event.target;
    const link = target && typeof target.closest === 'function' ? target.closest('a[href]') : null;
    if (!link) return;
    const dest = classifyDestination(link.getAttribute('href'), { origin, currentSlug: slug, allowlist });
    if (!dest) return;
    const region = typeof body.contains === 'function' && body.contains(link) ? 'body' : 'page';
    fire(dest.event, { ...dest.params, link_region: region });
  }), { capture: true });

  // pagehide covers navigation, tab close and bfcache entry. A restored page
  // is a new view in GA4's eyes only if GTM sends one, so stay disposed.
  on(win, 'pagehide', guard(() => dispose()));

  measure();
  if (visible()) startTimer();

  return {
    dispose,
    state: () => ({ activeMs, maxProgress, sent: [...sent], running: timer !== null, disposed, limits }),
    tick: guard(tick),
  };
}

export function initArticleEngagement(win = window, doc = document) {
  try {
    const body = doc.querySelector('[data-article-body]');
    if (!body || MOUNTED.has(body)) return null;
    MOUNTED.add(body);
    return createArticleTracker({ win, doc, body });
  } catch (_error) {
    return null;
  }
}
