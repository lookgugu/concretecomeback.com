import test from 'node:test';
import assert from 'node:assert/strict';
import { DISMISSAL_MS, PENDING_MS, isSignupSuppressed } from './newsletter-signup.js';

function storage(values = {}) {
  return { getItem: (key) => values[key] ?? null };
}

test('pending visitors are suppressed for 24 hours and can then retry', () => {
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
