import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadPosts } from '../newsletter/content.mjs';
import { buildManifest } from './article-manifest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const blogDir = path.join(here, '..', '..', 'src', 'content', 'blog');

const post = (slug, pubDate, extra = {}) => ({
  slug,
  data: { title: slug, author: 'A', tags: ['gear'], pubDate, updatedDate: null, draft: false, ...extra },
  body: 'SECRET BODY',
});

test('drops drafts and future posts, keeps metadata only, sorted by slug', () => {
  const out = buildManifest([
    post('zeta', '2026-10-01'),
    post('alpha', '2026-10-20'),
    post('future', '2026-10-21'),
    post('draft', '2026-01-01', { draft: true }),
  ], '2026-10-20');
  assert.deepEqual(out.map((a) => a.slug), ['alpha', 'zeta']);
  assert.deepEqual(Object.keys(out[0]).sort(), ['author', 'pubDate', 'slug', 'tags', 'title', 'updatedDate']);
  assert.ok(!JSON.stringify(out).includes('SECRET BODY'));
});

test('rejects a malformed as-of date', () => {
  assert.throws(() => buildManifest([], '10/20/2026'));
});

test('real corpus parses and the CLI emits JSON the scorecard accepts', () => {
  const real = buildManifest(loadPosts(blogDir), '2026-10-20');
  assert.ok(real.length > 10);
  for (const a of real) assert.match(a.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const stdout = execFileSync(process.execPath, [path.join(here, 'article-manifest.mjs'), '--as-of', '2026-10-20'], { encoding: 'utf8' });
  assert.equal(JSON.parse(stdout).articles.length, real.length);
});
