import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISMISSAL_MS,
  PENDING_MS,
  bindNewsletterForm,
  initInlineNewsletterSignup,
  initNewsletterSignup,
  isSignupSuppressed,
  shouldHideOnEscape,
  showCompletedState,
  signupCompletionState,
} from './newsletter-signup.js';

// Minimal stand-ins for the two DOM pieces bindNewsletterForm touches. The real
// coverage this buys is the request shape: a browser FormData body would fail
// silently in production, and only inspecting the fetch init catches it.
function fakeDocument() {
  const listeners = {};
  global.document = {
    listeners,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] || []).filter((other) => other !== fn);
    },
    // Like the DOM, a listener removed mid-dispatch doesn't skip the others.
    dispatchEvent: (event) => { [...(listeners[event.type] || [])].forEach((fn) => fn(event)); },
  };
  global.CustomEvent = function CustomEventStub(type, init) {
    return { type, detail: init && init.detail };
  };
}

function fakePanel(fields) {
  fakeDocument();
  global.window = global.window || {};
  global.window.dataLayer = [];
  const button = { type: 'submit', disabled: false };
  const status = { textContent: '' };
  let handler;
  const form = {
    action: '/api/forms/newsletter',
    hidden: false,
    fields,
    addEventListener: (_event, fn) => { handler = fn; },
    querySelector: (selector) => (selector === 'button[type="submit"]' ? button : null),
  };
  const panel = {
    querySelector: (selector) => {
      if (selector === 'form') return form;
      if (selector === '[data-newsletter-status]') return status;
      return null;
    },
  };
  // URLSearchParams accepts any iterable of pairs, which is what FormData is.
  const submitted = () => handler({ preventDefault() {} });
  return { panel, form, status, button, submitted };
}

// new URLSearchParams(new FormData(form)) in the module under test: give the
// fake form the same entries iteration the constructor consumes.
const RealFormData = global.FormData;
global.FormData = function FormDataStub(form) {
  return Object.entries(form.fields ?? {});
};
global.FormData.Real = RealFormData;

function storage(values = {}) {
  return { getItem: (key) => values[key] ?? null };
}

test('pending visitors are suppressed until the confirmation link expires and can then retry', () => {
  const now = 100_000_000_000;
  assert.equal(isSignupSuppressed(storage({
    'cc-newsletter-status': 'pending',
    'cc-newsletter-pending-at': String(now - PENDING_MS + 1),
  }), now), true);
  assert.equal(isSignupSuppressed(storage({
    'cc-newsletter-status': 'pending',
    'cc-newsletter-pending-at': String(now - PENDING_MS),
  }), now), false);
  assert.equal(isSignupSuppressed(storage({ 'cc-newsletter-status': 'pending' }), now), false);
});

test('subscribed visitors remain suppressed', () => {
  assert.equal(isSignupSuppressed(storage({ 'cc-newsletter-status': 'subscribed' })), true);
});

test('dismissal suppresses for 30 days and then expires', () => {
  const now = 100_000_000_000;
  assert.equal(isSignupSuppressed(storage({ 'cc-newsletter-dismissed-at': String(now - DISMISSAL_MS + 1) }), now), true);
  assert.equal(isSignupSuppressed(storage({ 'cc-newsletter-dismissed-at': String(now - DISMISSAL_MS) }), now), false);
});

test('a browser that blocks site data is treated as never suppressed', () => {
  assert.equal(isSignupSuppressed(null), false);
  assert.equal(isSignupSuppressed({ getItem() { throw new Error('SecurityError'); } }), false);
});

test('Escape hides the panel only from inside it, and never mid-typing', () => {
  const inside = { value: '' };
  const typing = { value: 'ska' };
  const outside = {};
  const panel = { contains: (node) => node === inside || node === typing };
  const escape = { key: 'Escape', defaultPrevented: false };

  assert.equal(shouldHideOnEscape(escape, inside, panel), true);
  assert.equal(shouldHideOnEscape(escape, typing, panel), false);
  assert.equal(shouldHideOnEscape(escape, outside, panel), false);
  assert.equal(shouldHideOnEscape(escape, null, panel), false);
  assert.equal(shouldHideOnEscape({ key: 'Escape', defaultPrevented: true }, inside, panel), false);
  assert.equal(shouldHideOnEscape({ key: 'Enter', defaultPrevented: false }, inside, panel), false);
});

test('completion state ignores a popup dismissal, so the in-post CTA still shows a form', () => {
  const now = 100_000_000_000;
  const dismissed = storage({ 'cc-newsletter-dismissed-at': String(now - 1) });
  assert.equal(isSignupSuppressed(dismissed, now), true);
  assert.equal(signupCompletionState(dismissed, now), null);
  assert.equal(signupCompletionState(storage({ 'cc-newsletter-status': 'subscribed' }), now), 'subscribed');
  assert.equal(signupCompletionState(storage({
    'cc-newsletter-status': 'pending',
    'cc-newsletter-pending-at': String(now - 1),
  }), now), 'pending');
  assert.equal(signupCompletionState(null), null);
});

test('the shared submit handler posts urlencoded fields, not a multipart FormData body', async () => {
  const { panel, form, status, submitted } = fakePanel({ email: 'skater@example.com', consent: 'yes' });
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  const store = {};
  const written = { setItem: (k, v) => { store[k] = v; }, getItem: (k) => store[k] ?? null };

  assert.equal(bindNewsletterForm(panel, { storage: written, source: 'in_post' }), true);
  await submitted();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/forms/newsletter');
  assert.equal(calls[0].init.method, 'POST');
  // A URLSearchParams body makes the browser send form-urlencoded, which is the
  // only shape besides JSON that DO Functions parses into the action's args.
  assert.ok(calls[0].init.body instanceof URLSearchParams);
  assert.equal(calls[0].init.body.get('email'), 'skater@example.com');
  assert.equal(calls[0].init.body.get('consent'), 'yes');
  assert.equal(form.hidden, true);
  assert.equal(status.textContent, 'Check your inbox and confirm your subscription.');
  assert.equal(store['cc-newsletter-status'], 'pending');
  assert.equal(
    global.window.dataLayer.filter((e) => e.newsletter_source === 'in_post').length,
    2,
  );
});

test('a failed signup keeps the form usable and never leaks a parser error', async () => {
  const { panel, form, status, submitted } = fakePanel({ email: 'skater@example.com' });
  global.fetch = async () => ({ ok: false, json: async () => { throw new Error('Unexpected token <'); } });

  bindNewsletterForm(panel, { storage: null, source: 'popup' });
  await submitted();

  assert.equal(form.hidden, false);
  assert.equal(status.textContent, 'Signup is temporarily unavailable. Please try again.');
  assert.equal(form.querySelector('button[type="submit"]').disabled, false);
});

test('a signup through one CTA stands the other one down', async () => {
  const submitter = fakePanel({ email: 'skater@example.com' });
  const other = fakePanel({ email: '' });
  let stoodDown = 0;
  let selfReacted = 0;
  global.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });

  bindNewsletterForm(other.panel, {
    storage: null,
    source: 'popup',
    onOtherSignup: () => { stoodDown++; showCompletedState(other.panel, 'pending'); },
  });
  bindNewsletterForm(submitter.panel, {
    storage: null,
    source: 'in_post',
    onOtherSignup: () => { selfReacted++; },
  });

  await submitter.submitted();

  assert.equal(stoodDown, 1);
  // The submitting CTA has already handled itself; reacting again would blank
  // the confirmation it just rendered.
  assert.equal(selfReacted, 0);
  assert.equal(other.form.hidden, true);
  assert.equal(other.status.textContent, 'Check your inbox and confirm your subscription.');
});

// A fuller stub than fakePanel: initNewsletterSignup drives the popup's own
// show/hide machinery, which is where the dismissal event is emitted.
function fakePopup() {
  const { panel, form, status } = fakePanel({ email: 'skater@example.com' });
  const closeButton = { listeners: [], addEventListener: (_t, fn) => closeButton.listeners.push(fn) };
  panel.dataset = { visible: 'false' };
  panel.hidden = true;
  const inner = panel.querySelector;
  panel.querySelector = (selector) => (selector === '[data-newsletter-close]' ? closeButton : inner(selector));
  global.window.setTimeout = (fn) => { fn(); return 0; };
  global.window.clearTimeout = () => {};
  global.window.addEventListener = () => {};
  global.window.removeEventListener = () => {};
  global.requestAnimationFrame = (fn) => fn();
  global.sessionStorage = { getItem: () => '2', setItem: () => {} };
  initNewsletterSignup(panel);
  return { panel, form, status, closeButton };
}

test('a popup that retreats after an inline signup is not counted as a dismissal', () => {
  const popup = fakePopup();
  assert.equal(popup.panel.dataset.visible, 'true', 'the second page view shows it immediately');

  global.document.dispatchEvent({ type: 'cc:newsletter-pending', detail: { panel: {} } });

  const events = global.window.dataLayer.map((entry) => entry.event);
  assert.ok(events.includes('newsletter_popup_stood_down'));
  assert.ok(
    !events.includes('newsletter_popup_dismissed'),
    'a coordinated retreat must not pollute the dismissal funnel',
  );
  assert.equal(popup.panel.dataset.visible, 'false');
});

test('signup events reach GA4 through gtag, not only the dataLayer', () => {
  const calls = [];
  const popup = fakePopup();
  // fakePopup() runs initNewsletterSignup, so install the spy and re-fire the
  // event the visitor triggers next. The GTM container has no custom-event
  // trigger for these names: without this call they never reach GA4.
  global.window.gtag = (...args) => calls.push(args);
  popup.closeButton.listeners.forEach((fn) => fn());

  assert.deepEqual(
    calls.map(([kind, event]) => `${kind}:${event}`),
    ['event:newsletter_popup_dismissed'],
  );
  delete global.window.gtag;
});

test('every gtag event is routed explicitly to the GA4 stream, once, with its source kept', async () => {
  const calls = [];
  const { panel, submitted } = fakePanel({ email: 'skater@example.com' });
  global.window.gtag = (...args) => calls.push(args);
  global.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });

  try {
    bindNewsletterForm(panel, { storage: null, source: 'in_post' });
    await submitted();

    // Reproduced on production: an event with no `send_to` creates no collect
    // request, because the only Google tag on the page is GTM's GA4 tag and it
    // never ran a page-level `gtag('config', …)` for events to default to.
    assert.deepEqual(calls, [
      ['event', 'newsletter_signup_submitted', { newsletter_source: 'in_post', send_to: 'G-VYW5FDDX52' }],
      ['event', 'newsletter_signup_pending', { newsletter_source: 'in_post', send_to: 'G-VYW5FDDX52' }],
    ]);
    // The address is the visitor's, not an analytics parameter.
    assert.ok(!JSON.stringify(calls).includes('skater@example.com'));
  } finally {
    delete global.window.gtag;
  }
});

test('a sourceless popup event is still routed to the GA4 stream', () => {
  const calls = [];
  const popup = fakePopup();
  global.window.gtag = (...args) => calls.push(args);
  try {
    popup.closeButton.listeners.forEach((fn) => fn());
    assert.deepEqual(calls, [['event', 'newsletter_popup_dismissed', { send_to: 'G-VYW5FDDX52' }]]);
  } finally {
    delete global.window.gtag;
  }
});

test('a page with no gtag gets the canonical wrapper, queued for the Google tag', () => {
  const popup = fakePopup();
  delete global.window.gtag;
  popup.closeButton.listeners.forEach((fn) => fn());

  assert.equal(typeof global.window.gtag, 'function', 'the wrapper is defined, not skipped');
  // gtag.js reads commands as Arguments objects; an array is ignored, so the
  // queued entry must not be one.
  const queued = global.window.dataLayer[global.window.dataLayer.length - 1];
  assert.ok(!Array.isArray(queued), 'commands queue as Arguments, never as an array');
  assert.deepEqual(
    [queued[0], queued[1]],
    ['event', 'newsletter_popup_dismissed'],
  );
  delete global.window.gtag;
});

test('the close button still records a real dismissal', () => {
  const popup = fakePopup();
  popup.closeButton.listeners.forEach((fn) => fn());

  const events = global.window.dataLayer.map((entry) => entry.event);
  assert.ok(events.includes('newsletter_popup_dismissed'));
  assert.ok(!events.includes('newsletter_popup_stood_down'));
});

// Stand-in for the browser's IntersectionObserver: records what was observed
// and lets a test deliver the entries a scroll would.
function fakeIntersectionObserver() {
  const observers = [];
  global.IntersectionObserver = function IntersectionObserverStub(callback, options) {
    const observer = {
      callback,
      options,
      targets: [],
      disconnected: false,
      observe: (target) => observer.targets.push(target),
      disconnect: () => { observer.disconnected = true; },
    };
    observers.push(observer);
    return observer;
  };
  // A browser reports how much of the target is visible, not just whether it
  // touches the viewport: the initial callback fires even below the threshold,
  // and an edge-adjacent target intersects with a ratio of 0.
  const deliver = (intersectionRatio, isIntersecting = intersectionRatio > 0) => observers.forEach((observer) => {
    if (!observer.disconnected) {
      observer.callback(
        observer.targets.map((target) => ({ target, isIntersecting, intersectionRatio })),
        observer,
      );
    }
  });
  return { observers, deliver };
}

function inlineImpressions() {
  return global.window.dataLayer.filter((entry) => entry.event === 'newsletter_inline_shown');
}

test('the inline CTA counts one impression, only once its form is actually on screen', () => {
  const { panel, form } = fakePanel({ email: '' });
  global.window.localStorage = storage();
  const io = fakeIntersectionObserver();
  const calls = [];
  global.window.gtag = (...args) => calls.push(args);
  try {
    initInlineNewsletterSignup(panel);
    const signupListeners = global.document.listeners['cc:newsletter-pending'].length;

    // Rendering the HTML is not an impression; the form is below the fold.
    assert.equal(inlineImpressions().length, 0);
    assert.deepEqual(io.observers[0].targets, [form]);
    io.deliver(0);
    assert.equal(inlineImpressions().length, 0);

    io.deliver(0.5);
    io.deliver(1);
    assert.deepEqual(inlineImpressions(), [{ event: 'newsletter_inline_shown', newsletter_source: 'in_post' }]);
    assert.deepEqual(calls, [['event', 'newsletter_inline_shown', { newsletter_source: 'in_post', send_to: 'G-VYW5FDDX52' }]]);
    assert.equal(io.observers[0].disconnected, true, 'the observer is released once it has counted');
    assert.equal(
      global.document.listeners['cc:newsletter-pending'].length,
      signupListeners - 1,
      'and so is its signup listener; the stand-down listener stays',
    );
  } finally {
    delete global.window.gtag;
    delete global.IntersectionObserver;
  }
});

test('a form less than half on screen is not an impression, even when the observer calls back', () => {
  const { panel, form } = fakePanel({ email: '' });
  global.window.localStorage = storage();
  const io = fakeIntersectionObserver();
  try {
    initInlineNewsletterSignup(panel);
    assert.deepEqual(io.observers[0].options, { threshold: 0.5 });

    // The threshold only decides when the browser calls back; the first
    // callback arrives regardless, and isIntersecting is true for any overlap.
    io.deliver(0, true);
    io.deliver(0.01);
    io.deliver(0.49);
    assert.equal(inlineImpressions().length, 0);
    assert.equal(io.observers[0].disconnected, false, 'still waiting for a real impression');

    // Another element's entry says nothing about this form.
    io.observers[0].callback(
      [{ target: {}, isIntersecting: true, intersectionRatio: 1 }],
      io.observers[0],
    );
    assert.equal(inlineImpressions().length, 0);

    io.deliver(0.5);
    assert.deepEqual(inlineImpressions(), [{ event: 'newsletter_inline_shown', newsletter_source: 'in_post' }]);
    assert.deepEqual(io.observers[0].targets, [form]);
    assert.equal(io.observers[0].disconnected, true);
  } finally {
    delete global.IntersectionObserver;
  }
});

test('a visitor who already signed up sees the outcome and is never counted as an impression', () => {
  const { panel, form, status } = fakePanel({ email: '' });
  global.window.localStorage = storage({ 'cc-newsletter-status': 'subscribed' });
  const io = fakeIntersectionObserver();
  try {
    initInlineNewsletterSignup(panel);
    io.deliver(1);

    assert.equal(io.observers.length, 0);
    assert.equal(form.hidden, true);
    assert.equal(status.textContent, "You're subscribed to the monthly roundup.");
    assert.equal(inlineImpressions().length, 0);
  } finally {
    delete global.IntersectionObserver;
  }
});

test('a signup through another CTA stops the inline CTA counting impressions', () => {
  const inline = fakePanel({ email: '' });
  global.window.localStorage = storage();
  const io = fakeIntersectionObserver();
  try {
    initInlineNewsletterSignup(inline.panel);
    // The popup on the same page takes the signup.
    global.document.dispatchEvent({ type: 'cc:newsletter-pending', detail: { panel: {} } });

    assert.equal(inline.form.hidden, true);
    assert.equal(io.observers[0].disconnected, true);
    // A callback already queued before the disconnect must still not count.
    io.observers[0].callback(
      [{ target: inline.form, isIntersecting: true, intersectionRatio: 1 }],
      io.observers[0],
    );
    assert.equal(inlineImpressions().length, 0, 'a stood-down form is not an impression');
  } finally {
    delete global.IntersectionObserver;
  }
});

test('submitting the inline form itself also releases the observer', async () => {
  const inline = fakePanel({ email: 'skater@example.com' });
  global.window.localStorage = storage();
  global.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
  const io = fakeIntersectionObserver();
  try {
    initInlineNewsletterSignup(inline.panel);
    await inline.submitted();

    assert.equal(inline.form.hidden, true);
    assert.equal(io.observers[0].disconnected, true);
    assert.equal(inlineImpressions().length, 0);
  } finally {
    delete global.IntersectionObserver;
  }
});

test('a hidden form never counts, even if the observer reports it intersecting', () => {
  const inline = fakePanel({ email: '' });
  global.window.localStorage = storage();
  const io = fakeIntersectionObserver();
  try {
    initInlineNewsletterSignup(inline.panel);
    inline.form.hidden = true;
    io.deliver(1);
    assert.equal(inlineImpressions().length, 0);
  } finally {
    delete global.IntersectionObserver;
  }
});

test('without IntersectionObserver the form still submits and no impression is invented', async () => {
  const inline = fakePanel({ email: 'skater@example.com' });
  global.window.localStorage = storage();
  delete global.IntersectionObserver;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ ok: true }) };
  };

  initInlineNewsletterSignup(inline.panel);
  await inline.submitted();

  assert.equal(calls.length, 1);
  assert.equal(inline.status.textContent, 'Check your inbox and confirm your subscription.');
  assert.equal(inlineImpressions().length, 0);
});
