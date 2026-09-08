import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISMISSAL_MS,
  PENDING_MS,
  bindNewsletterForm,
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
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    dispatchEvent: (event) => { (listeners[event.type] || []).forEach((fn) => fn(event)); },
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
