import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../pages/submit/error.astro', import.meta.url), 'utf8');

test('submission error page is noindex and contains every recovery path', () => {
  assert.match(source, /noIndex=\{true\}/);
  assert.match(source, /href="\/submit\/"[^>]*>[\s\S]*?Try Again/);
  assert.match(source, /href="\/"[^>]*>[\s\S]*?Return Home/);
  assert.match(source, /href="\/directory\/"[^>]*>[\s\S]*?Browse the Directory/);
  assert.match(source, /href="mailto:hello@concretecomeback\.com"/);
  assert.match(source, /We didn’t receive your listing\./);
});
