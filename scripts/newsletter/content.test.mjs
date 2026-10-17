import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  parseFrontmatter, loadPosts, canonicalUrl, normalizeCanonical, selectCandidates, newnessWindow,
  MAX_LOOKBACK_DAYS,
} from './content.mjs';
import { postSource, writeBlog } from './test-helpers.mjs';

const REAL_BLOG = fileURLToPath(new URL('../../src/content/blog', import.meta.url));

test('the real blog corpus parses under the strict frontmatter reader', () => {
  const posts = loadPosts(REAL_BLOG);
  assert.ok(posts.length > 100);
  for (const p of posts) {
    assert.match(p.data.pubDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof p.data.draft, 'boolean');
    assert.match(p.sha256, /^[0-9a-f]{64}$/);
  }
});

test('frontmatter scalars, quoted strings and inline arrays parse exactly', () => {
  const { data, body } = parseFrontmatter(
    '---\ntitle: "He said \\"go\\" — at 65"\npubDate: 2026-10-11\nfeatured: true\nauthorAge: 44\ntags: ["a", "b-c"]\nheroImage: \'/img/x.jpg\'\n---\n\nBody\n',
    'x.md',
  );
  assert.deepEqual(data, { title: 'He said "go" — at 65', pubDate: '2026-10-11', featured: true, authorAge: 44, tags: ['a', 'b-c'], heroImage: '/img/x.jpg' });
  assert.equal(body.trim(), 'Body');
});

test('malformed frontmatter fails closed and names the file', () => {
  const cases = {
    'no-fence.md': 'title: "x"\n',
    'unterminated.md': '---\ntitle: "x"\n',
    'block-list.md': '---\ntitle: "x"\ntags:\n  - a\n---\n',
    'bad-quote.md': '---\ntitle: "x\n---\n',
    'duplicate-key.md': '---\ntitle: "x"\ntitle: "y"\n---\n',
  };
  for (const [file, source] of Object.entries(cases)) {
    assert.throws(() => parseFrontmatter(source, file), new RegExp(file.replace('.', '\\.')), file);
  }
});

test('schema violations in any post fail the whole load', () => {
  const bad = {
    'bad-date.md': postSource({ pubDate: '2026-02-30' }),
    'no-tags.md': postSource({ tags: [] }),
    'short-desc.md': postSource({ description: 'too short' }),
    'draft-string.md': postSource({ extra: 'draft: "false"' }),
  };
  for (const [name, source] of Object.entries(bad)) {
    const { blogDir } = writeBlog({ 'fine-post.md': postSource(), [name]: source });
    assert.throws(() => loadPosts(blogDir), new RegExp(name.replace('.', '\\.')), name);
  }
});

test('a filename that is not a safe slug fails closed instead of becoming a URL', () => {
  for (const name of ['Upper-Case.md', 'has space.md', '..evil.md', 'semi;colon.md']) {
    const { blogDir } = writeBlog({ [name]: postSource() });
    assert.throws(() => loadPosts(blogDir), /slug/i, name);
  }
});

test('canonical URLs are built from the fixed origin and normalized strictly', () => {
  assert.equal(canonicalUrl('lloyd-kahn'), 'https://concretecomeback.com/blog/lloyd-kahn/');
  assert.throws(() => canonicalUrl('../admin'), /slug/i);
  assert.equal(normalizeCanonical('https://ConcreteComeback.com/blog/lloyd-kahn'), 'https://concretecomeback.com/blog/lloyd-kahn/');
  for (const bad of [
    'http://concretecomeback.com/blog/x/',
    'https://evil.example/blog/x/',
    'https://concretecomeback.com.evil.example/blog/x/',
    'https://user@concretecomeback.com/blog/x/',
    'https://concretecomeback.com:8443/blog/x/',
    'https://concretecomeback.com/blog/x/?utm=1',
    'https://concretecomeback.com/blog/x/#top',
    'https://concretecomeback.com/directory/parks/x/',
    'https://concretecomeback.com/blog/a/b/',
    'javascript:alert(1)',
  ]) assert.throws(() => normalizeCanonical(bad), /canonical/i, bad);
});

test('newness window: bootstrap is the seven days ending on the run date', () => {
  const w = newnessWindow({ runDate: '2026-10-17', lastSent: null });
  assert.deepEqual(w, { start: '2026-10-11', end: '2026-10-17', policy: 'bootstrap-rolling-7-days', staleSkipped: null });
});

test('newness window: since the last sent issue, without overlap', () => {
  const w = newnessWindow({ runDate: '2026-10-21', lastSent: { issueId: '2026-10-15', window: { end: '2026-10-14' } } });
  assert.deepEqual(w, { start: '2026-10-15', end: '2026-10-21', policy: 'since-last-sent', staleSkipped: null });
});

test('newness window: a long gap is capped and the skipped range is reported, not silently filled', () => {
  const w = newnessWindow({ runDate: '2026-10-21', lastSent: { issueId: '2026-09-03', window: { end: '2026-09-02' } } });
  assert.equal(MAX_LOOKBACK_DAYS, 14);
  assert.equal(w.start, '2026-10-08');
  assert.deepEqual(w.staleSkipped, { start: '2026-09-03', end: '2026-10-07' });
});

test('newness window: a sent issue that already covers the run date leaves an empty window', () => {
  const w = newnessWindow({ runDate: '2026-10-21', lastSent: { issueId: '2026-10-22', window: { end: '2026-10-21' } } });
  assert.equal(w.empty, true);
});

test('candidate selection excludes drafts, future posts, stale posts and already-sent URLs, with reasons', () => {
  const { blogDir } = writeBlog({
    'fresh.md': postSource({ pubDate: '2026-10-15' }),
    'draft-one.md': postSource({ pubDate: '2026-10-15', draft: true }),
    'tomorrow.md': postSource({ pubDate: '2026-10-22' }),
    'stale.md': postSource({ pubDate: '2026-10-01' }),
    'already-sent.md': postSource({ pubDate: '2026-10-16' }),
  });
  const posts = loadPosts(blogDir);
  const { eligible, excluded } = selectCandidates(posts, {
    window: { start: '2026-10-15', end: '2026-10-21' },
    runDate: '2026-10-21',
    sentCanonicals: new Set(['https://concretecomeback.com/blog/already-sent/']),
  });
  assert.deepEqual(eligible.map((p) => p.slug), ['fresh']);
  assert.deepEqual(Object.fromEntries(excluded.map((e) => [e.slug, e.reason])), {
    'already-sent': 'already-sent',
    'draft-one': 'draft',
    stale: 'outside-window',
    tomorrow: 'future',
  });
});

test('a post dated after the run date is future even when it is inside the window end', () => {
  const { blogDir } = writeBlog({ 'later.md': postSource({ pubDate: '2026-10-20' }) });
  const { eligible, excluded } = selectCandidates(loadPosts(blogDir), {
    window: { start: '2026-10-15', end: '2026-10-21' }, runDate: '2026-10-19', sentCanonicals: new Set(),
  });
  assert.equal(eligible.length, 0);
  assert.equal(excluded[0].reason, 'future');
});

test('two sources resolving to one canonical URL fail closed', () => {
  const { blogDir } = writeBlog({ 'same.md': postSource(), 'same.mdx': postSource() });
  assert.throws(() => loadPosts(blogDir), /same canonical URL/i);
});
