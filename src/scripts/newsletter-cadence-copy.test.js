import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The roundup moved from monthly to weekly. Every place a visitor is told what
// they are signing up for must name the cadence they will actually receive —
// the signup forms, the screen-reader announcement, the success copy and the
// privacy page. The confirmation email is covered in newsletter.test.js.
const ACTIVE_COPY = [
  '../components/marketing/NewsletterSignup.astro',
  '../components/marketing/NewsletterInline.astro',
  './newsletter-signup.js',
  '../pages/privacy.astro',
  '../pages/newsletter/confirmed.astro',
];

for (const path of ACTIVE_COPY) {
  test(`${path} describes the roundup as weekly, never monthly`, async () => {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /monthly|each month|every month|per month/i);
    assert.match(source, /weekly/i);
  });
}

test('both signup forms carry the same weekly eyebrow and consent line', async () => {
  for (const path of ACTIVE_COPY.slice(0, 2)) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(source, />Weekly roundup</);
    assert.match(source, /you agree to receive the weekly Concrete Comeback email\. Unsubscribe anytime\./);
    // The weekly issue is built from new blog posts only (scripts/newsletter/),
    // so the promise must not still offer the monthly issue's spots and groups.
    assert.match(source, /The week's best new reads and, when available, one practical idea for your weekend session\./);
  }
});

// Health-only issues and issues without practical headings omit the weekend
// section. Every surface describing that section must qualify its availability.
for (const path of [...ACTIVE_COPY.slice(0, 2), '../pages/newsletter/confirmed.astro']) {
  test(`${path} promises a practical idea only when available`, async () => {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /when available, one practical idea for your weekend session/);
    assert.doesNotMatch(source, /new skate spots|and one practical idea|practical advice/i);
  });
}

test('the signup script announces and confirms the weekly roundup', async () => {
  const source = await readFile(new URL('./newsletter-signup.js', import.meta.url), 'utf8');
  assert.match(source, /get the weekly Concrete Comeback roundup\./);
  assert.match(source, /You're subscribed to the weekly roundup\./);
});
