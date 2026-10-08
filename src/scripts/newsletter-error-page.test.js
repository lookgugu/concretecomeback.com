import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../pages/newsletter/error.astro', import.meta.url), 'utf8');

test('the newsletter retry page attributes its form to retry, not to a blog post', () => {
  // A visitor here came from a failed signup or a dead confirmation link; their
  // retry is not an end-of-article conversion and must not be counted as one.
  assert.equal(source.match(/<NewsletterInline\b[^>]*\/>/g)?.length, 1, 'exactly one retry form');
  assert.match(source, /<NewsletterInline\b[^>]*\bsource="retry"[^>]*\/>/);
});

test('the newsletter retry page still clears the pending state in its inline script', () => {
  assert.match(source, /noIndex=\{true\}/);
  assert.match(source, /<script is:inline>/);
  assert.match(source, /if \(localStorage\.getItem\('cc-newsletter-status'\) === 'pending'\) localStorage\.removeItem\('cc-newsletter-status'\);/);
  assert.match(source, /localStorage\.removeItem\('cc-newsletter-pending-at'\);/);
  assert.match(source, /localStorage\.removeItem\('cc-newsletter-dismissed-at'\);/);
  assert.match(source, /sessionStorage\.setItem\('cc-page-views', '1'\);/);
});
