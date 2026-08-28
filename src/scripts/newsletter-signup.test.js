import test from 'node:test';
import assert from 'node:assert/strict';
import { DISMISSAL_MS, isSignupSuppressed } from './newsletter-signup.js';

function storage(values = {}) {
  return { getItem: (key) => values[key] ?? null };
}

test('pending and subscribed visitors are suppressed', () => {
  assert.equal(isSignupSuppressed(storage({ 'cc-newsletter-status': 'pending' })), true);
  assert.equal(isSignupSuppressed(storage({ 'cc-newsletter-status': 'subscribed' })), true);
});

test('dismissal suppresses for 30 days and then expires', () => {
  const now = 100_000_000_000;
  assert.equal(isSignupSuppressed(storage({ 'cc-newsletter-dismissed-at': String(now - DISMISSAL_MS + 1) }), now), true);
  assert.equal(isSignupSuppressed(storage({ 'cc-newsletter-dismissed-at': String(now - DISMISSAL_MS) }), now), false);
});
