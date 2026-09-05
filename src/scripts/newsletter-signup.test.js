import test from 'node:test';
import assert from 'node:assert/strict';
import { DISMISSAL_MS, PENDING_MS, isSignupSuppressed, shouldHideOnEscape } from './newsletter-signup.js';

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
