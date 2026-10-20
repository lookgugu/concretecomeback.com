// Exposure, coordination and analytics-routing regressions for the newsletter
// CTAs. Everything runs against a fake DOM, a fake clock and a fake
// IntersectionObserver: no network, no real signup, no analytics delivery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as newsletter from './newsletter-signup.js';

// Namespace import so this file also runs against a module that predates the
// constants, and fails on behaviour rather than on a missing export.
const {
  DISMISSAL_MS,
  GA4_MEASUREMENT_ID,
  INLINE_SOURCES = ['in_post', 'home_inline', 'parks_inline'],
  POPUP_DELAY_MS = 5000,
  bindNewsletterForm,
  initInlineNewsletterSignup,
  initNewsletterSignup,
  isPopupExcludedPath = () => assert.fail('isPopupExcludedPath is not exported'),
} = newsletter;

const EMAIL = 'skater@example.com';

global.FormData = function FormDataStub(form) {
  return [['email', form.email.value], ['consent', 'yes']];
};

function memoryStorage(values = {}) {
  const store = { ...values };
  return {
    store,
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
  };
}

// One page: document, window, clock and observers. Each test builds its own,
// so the per-document placement registry starts empty every time.
function page({ storage = memoryStorage(), visibility = 'visible', io = true, asyncFrames = false } = {}) {
  const docListeners = {};
  const timers = [];
  let now = 0;
  let nextId = 1;
  const observers = [];
  // Animation frames run synchronously by default; with asyncFrames they queue
  // until flushFrames(), the way a browser defers them to the next paint.
  const frames = new Map();
  let nextFrame = 1;

  const doc = {
    visibilityState: visibility,
    activeElement: null,
    addEventListener: (type, fn) => { (docListeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => {
      docListeners[type] = (docListeners[type] || []).filter((f) => f !== fn);
    },
    dispatchEvent: (event) => {
      (docListeners[event.type] || []).slice().forEach((fn) => fn(event));
      return true;
    },
  };
  global.document = doc;
  global.CustomEvent = function CustomEventStub(type, init) {
    return { type, detail: init && init.detail };
  };
  if (asyncFrames) {
    global.requestAnimationFrame = (fn) => { const id = nextFrame++; frames.set(id, fn); return id; };
    global.cancelAnimationFrame = (id) => { frames.delete(id); };
  } else {
    global.requestAnimationFrame = (fn) => { fn(); return 0; };
    global.cancelAnimationFrame = () => {};
  }
  const flushFrames = () => {
    const due = [...frames.values()];
    frames.clear();
    due.forEach((fn) => fn());
  };
  global.sessionStorage = memoryStorage({ 'cc-page-views': '7' });

  const win = {
    dataLayer: [],
    localStorage: storage,
    setTimeout: (fn, ms = 0) => {
      const id = nextId++;
      timers.push({ id, at: now + ms, fn });
      return id;
    },
    clearTimeout: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    // Scroll listeners are recorded so a test can prove none drives the popup.
    scrollListeners: [],
    addEventListener(type, fn) { if (type === 'scroll') this.scrollListeners.push(fn); },
    removeEventListener() {},
  };
  global.window = win;

  if (io) {
    global.IntersectionObserver = class FakeIntersectionObserver {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.targets = [];
        observers.push(this);
      }
      observe(target) { this.targets.push(target); }
      unobserve(target) { this.targets = this.targets.filter((t) => t !== target); }
      disconnect() { this.targets = []; }
    };
  } else {
    delete global.IntersectionObserver;
  }

  const advance = (ms) => {
    const until = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const due = timers[0];
      if (!due || due.at > until) break;
      timers.shift();
      now = due.at;
      due.fn();
    }
    now = until;
  };

  // Deliver an IntersectionObserver entry the way a browser would: to every
  // observer watching the element, with a real ratio, not just a boolean.
  const intersect = (target, ratio, { isIntersecting = ratio > 0 } = {}) => {
    observers
      .filter((o) => o.targets.includes(target))
      .forEach((o) => o.callback([{ target, isIntersecting, intersectionRatio: ratio }], o));
  };

  const fire = (type, detail) => doc.dispatchEvent({ type, detail });
  const focus = (el) => { doc.activeElement = el; fire('focusin'); advance(0); };
  const blur = () => { doc.activeElement = null; fire('focusout'); advance(0); };
  const setVisibility = (state) => { doc.visibilityState = state; fire('visibilitychange'); advance(0); };

  const events = () => win.dataLayer.filter((e) => e && typeof e.event === 'string');
  const named = (name) => events().filter((e) => e.event === name);
  const gtagCommands = () => win.dataLayer.filter((e) => e && !('event' in e) && e[0] !== undefined);

  return {
    doc, win, storage, observers, advance, intersect, fire, focus, blur, setVisibility,
    events, named, gtagCommands, flushFrames, pendingFrames: () => frames.size, now: () => now,
  };
}

function control(tag, extra = {}) {
  return { tagName: tag, value: '', ...extra };
}

// The markup bindNewsletterForm and the controllers read: a form with an email
// field and a submit button, a status line and, for the popup, a close button.
function panelMarkup({ source, popup = false } = {}) {
  const email = control('INPUT', { type: 'email' });
  const button = control('BUTTON', { type: 'submit', disabled: false });
  const listeners = {};
  const form = {
    tagName: 'FORM',
    action: '/api/forms/newsletter',
    hidden: false,
    email,
    button,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    querySelector: (selector) => {
      if (selector === 'button[type="submit"]') return button;
      if (selector === 'input[type="email"]') return email;
      return null;
    },
    contains: (node) => node === form || node === email || node === button,
    submit: () => Promise.all((listeners.submit || []).map((fn) => fn({ preventDefault() {} }))),
  };
  const status = { textContent: '' };
  const announce = { textContent: '' };
  const close = { tagName: 'BUTTON', listeners: [], addEventListener(_t, fn) { this.listeners.push(fn); } };
  const panel = {
    hidden: popup,
    dataset: popup ? { visible: 'false' } : { newsletterSource: source },
    querySelector: (selector) => {
      if (selector === 'form') return form;
      if (selector === '[data-newsletter-status]') return status;
      if (selector === '[data-newsletter-announce]') return popup ? announce : null;
      if (selector === '[data-newsletter-close]') return popup ? close : null;
      return null;
    },
    contains: (node) => form.contains(node) || node === close || node === panel,
  };
  return { panel, form, email, button, status, close };
}

// Helpers take the page only so call sites read in page order; the page()
// call already installed the globals they use.
function mountPopup(_page) {
  const popup = panelMarkup({ popup: true });
  initNewsletterSignup(popup.panel);
  return popup;
}

function mountInline(_page, source) {
  const inline = panelMarkup({ source });
  initInlineNewsletterSignup(inline.panel);
  return inline;
}

const isOpen = (popup) => popup.panel.dataset.visible === 'true' && popup.panel.hidden === false;

// ---------------------------------------------------------------- routing

test('the October 8 routing regression: a submit event names the GA4 destination', async () => {
  const p = page();
  global.fetch = async () => { throw new Error('Network prohibited in this probe'); };
  const inline = panelMarkup({ source: 'in_post' });
  assert.equal(bindNewsletterForm(inline.panel, { storage: null, source: 'in_post' }), true);
  await inline.form.submit();
  const command = p.win.dataLayer.find((item) => item[0] === 'event' && item[1] === 'newsletter_signup_submitted');
  assert.ok(command, 'event command must exist');
  assert.equal(command[2].send_to, 'G-VYW5FDDX52');
});

test('every newsletter gtag event is routed to G-VYW5FDDX52 with a source, and no config is issued', async () => {
  const p = page();
  let respond;
  global.fetch = () => new Promise((resolve) => { respond = resolve; });
  const popup = mountPopup(p);
  const inline = mountInline(p, 'home_inline');
  p.intersect(inline.form, 1);
  p.intersect(inline.form, 0);
  p.advance(POPUP_DELAY_MS);
  assert.ok(isOpen(popup));
  inline.email.value = EMAIL;
  const pending = inline.form.submit();
  respond({ ok: false, json: async () => ({ ok: false, error: 'Please enter a valid email address.' }) });
  await pending;

  assert.equal(GA4_MEASUREMENT_ID, 'G-VYW5FDDX52');
  const commands = p.gtagCommands();
  assert.ok(commands.length >= 5, 'impressions, popup shown, submit and error all issue gtag commands');
  for (const command of commands) {
    assert.equal(command[0], 'event', 'only event commands: never config, never a second page_view');
    assert.notEqual(command[1], 'page_view');
    assert.equal(command[2].send_to, 'G-VYW5FDDX52', `${command[1]} must name its destination`);
    assert.ok(['popup', ...INLINE_SOURCES].includes(command[2].newsletter_source), `${command[1]} carries a source`);
  }
  for (const entry of p.events()) {
    assert.ok(entry.newsletter_source, `${entry.event} dataLayer push carries a source`);
  }
  // Nothing the visitor typed, and no token, is ever sent as an analytics value.
  const serialized = JSON.stringify(p.win.dataLayer.map((e) => ({ ...e })));
  assert.ok(!serialized.includes(EMAIL), 'the address never reaches analytics');
  assert.ok(!/token|@/.test(serialized), 'no token or address-shaped value reaches analytics');
});

test('a throwing analytics sink never blocks the signup request', async () => {
  const p = page();
  const calls = [];
  global.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ ok: true }) }; };
  p.win.gtag = () => { throw new Error('blocked by an extension'); };
  const inline = mountInline(p, 'parks_inline');
  inline.email.value = EMAIL;
  await inline.form.submit();
  assert.equal(calls.length, 1);
  assert.ok(calls[0].init.body instanceof URLSearchParams, 'still the urlencoded shared binding');
  assert.equal(inline.form.hidden, true);
  assert.equal(inline.status.textContent, 'Check your inbox and confirm your subscription.');
  assert.deepEqual(p.named('newsletter_signup_pending').map((e) => e.newsletter_source), ['parks_inline']);
});

// ------------------------------------------------------------ popup timing

test('the popup appears at five seconds, never earlier, regardless of scrolling or page count', () => {
  const p = page();
  const popup = mountPopup(p);
  // The old triggers: 50% scroll and a 1.5s timer on later pages in a session
  // (the fake session already counts seven page views).
  assert.equal(p.win.scrollListeners.length, 0, 'no scroll trigger is installed');
  p.advance(1500);
  assert.equal(isOpen(popup), false, 'the subsequent-page 1.5s trigger is gone');
  p.advance(POPUP_DELAY_MS - 1500 - 1);
  assert.equal(isOpen(popup), false, 'not at 4,999ms');
  p.advance(1);
  assert.equal(isOpen(popup), true, 'shown at 5,000ms');
  assert.equal(POPUP_DELAY_MS, 5000);
  assert.equal(p.named('newsletter_popup_shown').length, 1);
  assert.deepEqual(p.named('newsletter_impression').map((e) => e.newsletter_source), ['popup']);
});

test('a hidden tab defers the popup until the page is visible again', () => {
  const p = page({ visibility: 'hidden' });
  const popup = mountPopup(p);
  p.advance(60_000);
  assert.equal(isOpen(popup), false);
  assert.equal(p.named('newsletter_impression').length, 0, 'no impression while nobody can see it');
  p.setVisibility('visible');
  assert.equal(isOpen(popup), true);
});

test('the popup never interrupts a focused form control elsewhere on the page', () => {
  const p = page();
  const popup = mountPopup(p);
  const search = control('INPUT', { type: 'search' });
  p.focus(search);
  p.advance(30_000);
  assert.equal(isOpen(popup), false, 'waits while the visitor is using another form');
  p.blur();
  assert.equal(isOpen(popup), true, 'eligible again once focus leaves the control');
});

// ---------------------------------------------------------- coordination

test('later eligibility: a visible inline CTA holds the popup until it scrolls away', () => {
  const p = page();
  const popup = mountPopup(p);
  const inline = mountInline(p, 'home_inline');
  p.intersect(inline.form, 1);
  p.advance(20_000);
  assert.equal(isOpen(popup), false, 'never covers or competes with a visible inline form');
  p.intersect(inline.form, 0);
  p.advance(0);
  assert.equal(isOpen(popup), true, 'after five seconds, scrolling the inline away makes the popup eligible');
});

test('scrolling the inline away before five seconds still waits for the full delay', () => {
  const p = page();
  const popup = mountPopup(p);
  const inline = mountInline(p, 'parks_inline');
  p.intersect(inline.form, 1);
  p.advance(1000);
  p.intersect(inline.form, 0);
  p.advance(0);
  assert.equal(isOpen(popup), false);
  p.advance(POPUP_DELAY_MS - 1001);
  assert.equal(isOpen(popup), false);
  p.advance(1);
  assert.equal(isOpen(popup), true);
});

test('an inline form that was typed into holds the popup even off screen', () => {
  const p = page();
  const popup = mountPopup(p);
  const inline = mountInline(p, 'home_inline');
  p.intersect(inline.form, 1);
  p.focus(inline.email);
  inline.email.value = 'ska';
  p.fire('input');
  p.blur();
  p.intersect(inline.form, 0);
  p.advance(60_000);
  assert.equal(isOpen(popup), false, 'an edited inline form is in use');
});

test('an in-flight inline submission holds the popup', async () => {
  const p = page();
  let respond;
  global.fetch = () => new Promise((resolve) => { respond = resolve; });
  const popup = mountPopup(p);
  const inline = mountInline(p, 'home_inline');
  inline.email.value = EMAIL;
  const pending = inline.form.submit();
  inline.email.value = ''; // isolate the busy flag from the dirty check
  p.intersect(inline.form, 0);
  p.advance(60_000);
  assert.equal(isOpen(popup), false, 'never interrupts a request in flight');
  respond({ ok: true, json: async () => ({ ok: true }) });
  await pending;
  p.advance(60_000);
  assert.equal(isOpen(popup), false, 'and a successful inline signup stands it down for good');
});

test('an open popup stands down when the inline CTA becomes visible, and never reopens', () => {
  const p = page();
  const popup = mountPopup(p);
  const inline = mountInline(p, 'home_inline');
  p.intersect(inline.form, 0); // the browser's initial entry: off screen
  p.advance(POPUP_DELAY_MS);
  assert.equal(isOpen(popup), true);
  p.intersect(inline.form, 0.3);
  p.advance(200);
  assert.equal(popup.panel.dataset.visible, 'false');
  assert.equal(popup.panel.hidden, true);
  const stood = p.named('newsletter_popup_stood_down');
  assert.equal(stood.length, 1);
  assert.equal(stood[0].newsletter_reason, 'inline_visible');
  assert.equal(p.named('newsletter_popup_dismissed').length, 0, 'a retreat is not a dismissal');
  assert.equal(p.storage.getItem('cc-newsletter-dismissed-at'), null, 'and records no 30-day suppression');

  p.intersect(inline.form, 0);
  p.advance(60_000);
  p.intersect(inline.form, 1);
  p.intersect(inline.form, 0);
  p.advance(60_000);
  assert.equal(isOpen(popup), false, 'no repeated reopening on this page');
  assert.equal(p.named('newsletter_popup_shown').length, 1);
});

test('an open popup that is being used is not pulled away by the inline CTA', () => {
  const p = page();
  const popup = mountPopup(p);
  const inline = mountInline(p, 'home_inline');
  p.intersect(inline.form, 0); // the browser's initial entry: off screen
  p.advance(POPUP_DELAY_MS);
  assert.equal(isOpen(popup), true);
  p.focus(popup.email);
  popup.email.value = 'ska';
  p.intersect(inline.form, 1);
  p.advance(1000);
  assert.equal(isOpen(popup), true, 'a half-typed popup address is never yanked away');
  assert.equal(p.named('newsletter_popup_stood_down').length, 0);
});

test('a signup through the inline CTA before five seconds means the popup never appears', async () => {
  const p = page();
  global.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
  const popup = mountPopup(p);
  const inline = mountInline(p, 'parks_inline');
  inline.email.value = EMAIL;
  await inline.form.submit();
  inline.email.value = '';
  p.intersect(inline.form, 0);
  p.advance(60_000);
  assert.equal(isOpen(popup), false);
  assert.equal(p.named('newsletter_popup_shown').length, 0);
  assert.equal(p.storage.getItem('cc-newsletter-status'), 'pending');
});

// ------------------------------------------------------------ suppression

test('excluded routes keep the popup off; everything else is eligible', () => {
  for (const path of ['/submit', '/submit/thanks/', '/newsletter/pending/', '/newsletter/error/', '/privacy']) {
    assert.equal(isPopupExcludedPath(path), true, path);
  }
  for (const path of ['/', '/directory/parks', '/blog/getting-back-on-board/']) {
    assert.equal(isPopupExcludedPath(path), false, path);
  }
});

test('a dismissal suppresses the popup only: the inline CTA still shows and counts', () => {
  const storage = memoryStorage({ 'cc-newsletter-dismissed-at': String(Date.now() - DISMISSAL_MS + 60_000) });
  const p = page({ storage });
  const popup = mountPopup(p);
  const inline = mountInline(p, 'home_inline');
  p.advance(60_000);
  assert.equal(isOpen(popup), false);
  assert.equal(inline.form.hidden, false, 'the inline form is still offered');
  p.intersect(inline.form, 1);
  assert.deepEqual(p.named('newsletter_impression').map((e) => e.newsletter_source), ['home_inline']);
});

test('pending and subscribed visitors see neither the popup nor an inline form or impression', () => {
  for (const values of [
    { 'cc-newsletter-status': 'subscribed' },
    { 'cc-newsletter-status': 'pending', 'cc-newsletter-pending-at': String(Date.now() - 1000) },
  ]) {
    const p = page({ storage: memoryStorage(values) });
    const popup = mountPopup(p);
    const inline = mountInline(p, 'parks_inline');
    p.intersect(inline.form, 1);
    p.advance(60_000);
    assert.equal(isOpen(popup), false);
    assert.equal(inline.form.hidden, true);
    assert.equal(p.named('newsletter_impression').length, 0, 'a completed state is not a form impression');
  }
});

test('Escape closes the popup for this page without a 30-day dismissal, and it does not return', () => {
  const p = page();
  const popup = mountPopup(p);
  p.advance(POPUP_DELAY_MS);
  p.doc.activeElement = popup.close;
  p.doc.dispatchEvent({ type: 'keydown', key: 'Escape', defaultPrevented: false });
  p.advance(200);
  assert.equal(isOpen(popup), false);
  assert.equal(p.storage.getItem('cc-newsletter-dismissed-at'), null);
  p.doc.activeElement = null;
  p.fire('focusout');
  p.advance(60_000);
  assert.equal(isOpen(popup), false);
});

test('the close button records the 30-day dismissal with a popup source', () => {
  const p = page();
  const popup = mountPopup(p);
  p.advance(POPUP_DELAY_MS);
  popup.close.listeners.forEach((fn) => fn());
  assert.ok(Number(p.storage.getItem('cc-newsletter-dismissed-at')) > 0);
  assert.deepEqual(p.named('newsletter_popup_dismissed').map((e) => e.newsletter_source), ['popup']);
});

// ------------------------------------------------------------ impressions

test('an inline impression needs half the form actually on screen', () => {
  const p = page();
  const inline = mountInline(p, 'home_inline');
  const observer = p.observers.find((o) => o.targets.includes(inline.form));
  assert.ok(observer, 'the form itself is observed, not the page');
  assert.ok([].concat(observer.options.threshold).includes(0.5));
  // Browsers deliver an initial entry for a barely visible target; that must not count.
  p.intersect(inline.form, 0.01);
  p.intersect(inline.form, 0, { isIntersecting: true }); // edge-adjacent, zero area
  p.intersect(inline.form, 0.49);
  assert.equal(p.named('newsletter_impression').length, 0);
  // An entry for some other element is not this form's impression.
  p.observers.forEach((o) => o.callback([{ target: {}, isIntersecting: true, intersectionRatio: 1 }], o));
  assert.equal(p.named('newsletter_impression').length, 0);
  p.intersect(inline.form, 0.5);
  assert.deepEqual(p.named('newsletter_impression').map((e) => e.newsletter_source), ['home_inline']);
});

test('inline impressions are deduped per mounted placement across repeated scrolling', () => {
  const p = page();
  const inline = mountInline(p, 'parks_inline');
  for (let i = 0; i < 5; i++) {
    p.intersect(inline.form, 1);
    p.intersect(inline.form, 0);
  }
  assert.equal(p.named('newsletter_impression').length, 1);
});

test('two placements on one page each count once under their own source', () => {
  const p = page();
  const home = mountInline(p, 'home_inline');
  const post = mountInline(p, 'in_post');
  p.intersect(home.form, 1);
  p.intersect(post.form, 1);
  p.intersect(home.form, 1);
  assert.deepEqual(p.named('newsletter_impression').map((e) => e.newsletter_source).sort(), ['home_inline', 'in_post']);
});

test('a form on screen in a background tab is counted only once the tab is visible', () => {
  const p = page({ visibility: 'hidden' });
  const inline = mountInline(p, 'home_inline');
  p.intersect(inline.form, 1);
  assert.equal(p.named('newsletter_impression').length, 0, 'DOM presence in a hidden tab is not an impression');
  p.setVisibility('visible');
  assert.equal(p.named('newsletter_impression').length, 1);

  const q = page({ visibility: 'hidden' });
  const offscreen = mountInline(q, 'parks_inline');
  offscreen.form.hidden = false;
  q.intersect(offscreen.form, 1);
  q.intersect(offscreen.form, 0);
  q.setVisibility('visible');
  assert.equal(q.named('newsletter_impression').length, 0, 'scrolled away before anyone could see it');
});

test('a form that has been replaced by its outcome is never counted', async () => {
  const p = page();
  global.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
  const popup = panelMarkup({ popup: true });
  initNewsletterSignup(popup.panel);
  const inline = mountInline(p, 'home_inline');
  p.advance(POPUP_DELAY_MS);
  popup.email.value = EMAIL;
  await popup.form.submit();
  assert.equal(inline.form.hidden, true, 'the popup signup stood the inline form down');
  p.intersect(inline.form, 1);
  assert.equal(p.named('newsletter_impression').filter((e) => e.newsletter_source === 'home_inline').length, 0);
});

test('an unknown placement source falls back to in_post rather than inventing a value', () => {
  const p = page();
  const inline = mountInline(p, 'someone@example.com');
  p.intersect(inline.form, 1);
  assert.deepEqual(p.named('newsletter_impression').map((e) => e.newsletter_source), ['in_post']);
});

test('without IntersectionObserver an inline form fails closed: no popup over it, no impression guess', () => {
  const p = page({ io: false });
  const popup = mountPopup(p);
  const inline = mountInline(p, 'home_inline');
  p.advance(60_000);
  // Its visibility is unknown, so it may be on screen: never cover it.
  assert.equal(isOpen(popup), false, 'unknown inline visibility blocks the popup');
  assert.equal(p.named('newsletter_popup_shown').length, 0);
  assert.equal(p.named('newsletter_impression').length, 0, 'no impression is invented either');
  assert.equal(inline.form.hidden, false, 'the inline form itself still works');
});

test('without IntersectionObserver a popup-only page still gets the popup at five seconds', () => {
  const p = page({ io: false });
  const popup = mountPopup(p);
  p.advance(POPUP_DELAY_MS - 1);
  assert.equal(isOpen(popup), false);
  p.advance(1);
  assert.equal(isOpen(popup), true);
});

test('an inline form whose first observer entry has not arrived yet also holds the popup', () => {
  const p = page();
  const popup = mountPopup(p);
  const inline = mountInline(p, 'parks_inline');
  p.advance(POPUP_DELAY_MS);
  assert.equal(isOpen(popup), false, 'not yet known to be off screen');
  p.intersect(inline.form, 0);
  p.advance(0);
  assert.equal(isOpen(popup), true);
});

// ------------------------------------------------- paint-frame race

test('a popup stood down before its first frame stays hidden and reports nothing', () => {
  const p = page({ asyncFrames: true });
  const popup = mountPopup(p);
  const inline = mountInline(p, 'home_inline');
  p.intersect(inline.form, 0);
  p.advance(POPUP_DELAY_MS);
  assert.equal(popup.panel.hidden, false, 'show() has started');
  assert.equal(popup.panel.dataset.visible, 'false', 'but nothing is painted yet');
  assert.equal(p.named('newsletter_impression').filter((e) => e.newsletter_source === 'popup').length, 0,
    'an unpainted popup is not an impression');

  p.intersect(inline.form, 0.3); // the inline scrolls in before the frame runs
  p.advance(0);
  assert.equal(popup.panel.hidden, true, 'hide() hides even before paint');
  p.flushFrames();
  p.advance(60_000);
  assert.equal(popup.panel.hidden, true, 'the late frame does not resurrect it');
  assert.notEqual(popup.panel.dataset.visible, 'true');
  for (const name of ['newsletter_popup_shown', 'newsletter_popup_stood_down', 'newsletter_popup_dismissed']) {
    assert.equal(p.named(name).length, 0, `${name} is not reported for a popup nobody saw`);
  }
  assert.equal(p.named('newsletter_impression').filter((e) => e.newsletter_source === 'popup').length, 0);
});

test('a signup elsewhere before the popup paints cancels it the same way', async () => {
  const p = page({ asyncFrames: true });
  global.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
  const popup = mountPopup(p);
  const inline = mountInline(p, 'home_inline');
  p.intersect(inline.form, 0);
  p.advance(POPUP_DELAY_MS);
  inline.email.value = EMAIL;
  await inline.form.submit();
  p.flushFrames();
  p.advance(1000);
  assert.equal(popup.panel.hidden, true);
  assert.notEqual(popup.panel.dataset.visible, 'true');
  assert.equal(p.named('newsletter_popup_shown').length, 0);
});

test('a painted popup reports shown and impression exactly once', () => {
  const p = page({ asyncFrames: true });
  const popup = mountPopup(p);
  p.advance(POPUP_DELAY_MS);
  p.flushFrames();
  p.flushFrames();
  p.fire('focusin');
  p.advance(1000);
  p.flushFrames();
  assert.equal(isOpen(popup), true);
  assert.equal(p.named('newsletter_popup_shown').length, 1);
  assert.deepEqual(p.named('newsletter_impression').map((e) => e.newsletter_source), ['popup']);
  assert.equal(p.pendingFrames(), 0);
});

// ------------------------------------------------------- markup contract

test('every rendered placement uses an allow-listed source, and the component accepts exactly those', () => {
  const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const component = read('../components/marketing/NewsletterInline.astro');
  const union = component.match(/source\?:\s*([^;]+);/)[1].match(/'([a-z_]+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(union.sort(), [...INLINE_SOURCES].sort(), 'Props union and INLINE_SOURCES must match');
  assert.match(component, /data-newsletter-source=\{source\}/);
  assert.match(read('../pages/index.astro'), /<NewsletterInline source="home_inline" compact \/>/);
  assert.match(read('../pages/directory/parks/index.astro'), /<NewsletterInline slot="intro" source="parks_inline" compact \/>/);
  assert.match(read('../layouts/BlogLayout.astro'), /<NewsletterInline \/>/, 'blog posts keep the default in_post placement');
  // The intro slot renders outside #directory-grid, which the filter script owns.
  const layout = read('../layouts/DirectoryLayout.astro');
  assert.ok(layout.indexOf('name="intro"') < layout.indexOf('id="directory-grid"'));
});

// ---------------------------------------- submitted / pending / error (mocked)

test('submitted, pending and error are separate events from the impression, tagged by placement', async () => {
  const p = page();
  const responses = [
    { ok: false, json: async () => { throw new Error('Unexpected token <'); } },
    { ok: true, json: async () => ({ ok: true }) },
  ];
  const calls = [];
  global.fetch = async (url, init) => { calls.push({ url, init }); return responses.shift(); };
  const inline = mountInline(p, 'home_inline');
  p.intersect(inline.form, 1);
  inline.email.value = EMAIL;

  await inline.form.submit();
  assert.equal(inline.status.textContent, 'Signup is temporarily unavailable. Please try again.');
  assert.equal(inline.button.disabled, false);
  assert.equal(inline.form.hidden, false);

  await inline.form.submit();
  assert.equal(inline.form.hidden, true);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.url === '/api/forms/newsletter' && c.init.headers.Accept === 'application/json'));

  assert.deepEqual(
    p.events().map((e) => `${e.event}:${e.newsletter_source}`),
    [
      'newsletter_impression:home_inline',
      'newsletter_signup_submitted:home_inline',
      'newsletter_signup_error:home_inline',
      'newsletter_signup_submitted:home_inline',
      'newsletter_signup_pending:home_inline',
    ],
  );
});

test('newsletter landing is an explicit allowed placement and excluded from popups', () => {
  assert.ok(INLINE_SOURCES.includes('newsletter_landing'));
  assert.equal(isPopupExcludedPath('/newsletter/'), true);
});

for (const state of ['focused', 'edited', 'submitting']) {
  test(`newsletter landing ${state} form suppresses popup even off screen`, async () => {
    const p = page();
    const popup = mountPopup(p);
    const inline = mountInline(p, 'newsletter_landing');
    p.intersect(inline.form, 0);
    let pending;
    let respond;
    if (state === 'focused') p.focus(inline.email);
    if (state === 'edited') { inline.email.value = 'skater'; p.fire('input'); }
    if (state === 'submitting') {
      global.fetch = () => new Promise(resolve => { respond = resolve; });
      pending = inline.form.submit();
    }
    p.advance(60_000);
    assert.equal(isOpen(popup), false);
    if (respond) { respond({ ok: true, json: async () => ({ ok: true }) }); await pending; }
  });
}
