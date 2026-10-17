import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { generateDraft } from './draft.mjs';
import { fakeResponse, livePage, postSource, sentRecord, tempDir, writeBlog, writeLedger } from './test-helpers.mjs';

const require = createRequire(import.meta.url);
const { DEFAULT_SEGMENT_ID } = require('../../functions/packages/forms/newsletter/newsletter.js');
const NOW = new Date('2026-10-21T13:05:00Z'); // Wednesday 09:05 New York (EDT)

function requirements(root, overrides = {}) {
  const path = join(root, 'send-requirements.json');
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, physicalPostalAddress: null, preferenceCenterUrl: null, ...overrides }));
  return path;
}

function liveFetch(titles, { fail = new Set() } = {}) {
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url: String(url), method: options?.method });
    const slug = /\/blog\/([^/]+)\/$/.exec(String(url))?.[1];
    if (fail.has(slug) || !titles[slug]) return fakeResponse({ status: 404 });
    return fakeResponse({ body: livePage({ slug, title: titles[slug] }) });
  };
  fn.calls = calls;
  return fn;
}

function fixture({ posts, ledger = {} }) {
  const { root, blogDir } = writeBlog(posts);
  const ledgerDir = writeLedger(root, ledger);
  const outDir = join(root, 'out');
  return { root, blogDir, ledgerDir, outDir, sendRequirementsPath: requirements(root) };
}

function hashTree(dir) {
  const h = createHash('sha256');
  for (const f of readdirSync(dir).sort()) h.update(f).update(readFileSync(join(dir, f)));
  return h.digest('hex');
}

const POSTS = {
  'plateau-breaker.md': postSource({ title: 'Breaking the Plateau', pubDate: '2026-10-20', featured: true, tags: ['training', 'mindset'],
    body: 'Plateaus are normal. See [the study](https://example.org/study).\n\n## What actually breaks it\n\nPick one trick and give it three sessions.\n' }),
  'mini-ramp.md': postSource({ title: 'Building a Mini Ramp', pubDate: '2026-10-19', tags: ['gear'] }),
  'kahn-story.md': postSource({ title: 'Lloyd at 91', pubDate: '2026-10-18', tags: ['motivation'] }),
  'group-guide.md': postSource({ title: 'Start a Group', pubDate: '2026-10-16', tags: ['community'] }),
  'too-many.md': postSource({ title: 'One Too Many', pubDate: '2026-10-15', tags: ['training', 'mindset'] }),
  'secret-draft.md': postSource({ title: 'Secret Draft', pubDate: '2026-10-20', draft: true }),
  'next-week.md': postSource({ title: 'Next Week', pubDate: '2026-10-23' }),
  'old-post.md': postSource({ title: 'Old Post', pubDate: '2026-09-01' }),
};
const TITLES = { 'plateau-breaker': 'Breaking the Plateau', 'mini-ramp': 'Building a Mini Ramp', 'kahn-story': 'Lloyd at 91', 'group-guide': 'Start a Group', 'too-many': 'One Too Many' };

test('a bootstrap run produces markdown, HTML and a draft manifest from live new posts only', async () => {
  const f = fixture({ posts: POSTS });
  const fetchImpl = liveFetch(TITLES);
  const result = await generateDraft({ ...f, now: NOW, fetchImpl, sourceCommit: 'abc123' });
  assert.equal(result.status, 'draft');
  assert.deepEqual(readdirSync(f.outDir).sort(), ['draft.html', 'draft.md', 'manifest.json']);
  const manifest = JSON.parse(readFileSync(join(f.outDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'draft');
  assert.equal(manifest.sendable, false);
  assert.equal(manifest.issueId, '2026-10-22');
  assert.deepEqual(manifest.window, { start: '2026-10-15', end: '2026-10-21', timeZone: 'America/New_York', policy: 'bootstrap-rolling-7-days', staleSkipped: null });
  assert.equal(manifest.plannedSend.utc, '2026-10-22T14:00:00.000Z');
  assert.match(manifest.plannedSend.policy, /approval/i);
  assert.equal(manifest.audience.segmentId, DEFAULT_SEGMENT_ID);
  assert.equal(manifest.audience.doubleOptIn, true);
  assert.equal(manifest.items[0].role, 'lead');
  assert.equal(manifest.items[0].slug, 'plateau-breaker');
  assert.equal(manifest.items.filter((i) => i.role === 'read').length, 3);
  assert.equal(manifest.weekend.sourceSlug, 'plateau-breaker');
  assert.equal(manifest.source.commit, 'abc123');
  const codes = manifest.sendBlockers.map((b) => b.code);
  for (const code of ['operator-approval', 'physical-address', 'unsubscribe-verification', 'preference-center', 'subscriber-transition']) {
    assert.ok(codes.includes(code), code);
  }
  const md = readFileSync(join(f.outDir, 'draft.md'), 'utf8');
  assert.match(md, /Breaking the Plateau/);
  assert.match(md, /\[the study\]\(https:\/\/example\.org\/study\)/);
  assert.match(md, /used to arrive monthly/);
  assert.doesNotMatch(md, /Secret Draft|Next Week|Old Post/);
});

test('draft and future posts are never fetched, and every fetch is a GET to the site', async () => {
  const f = fixture({ posts: POSTS });
  const fetchImpl = liveFetch(TITLES);
  await generateDraft({ ...f, now: NOW, fetchImpl });
  const urls = fetchImpl.calls.map((c) => c.url);
  assert.ok(urls.every((u) => /^https:\/\/concretecomeback\.com\/blog\/[a-z0-9-]+\/$/.test(u)));
  assert.ok(fetchImpl.calls.every((c) => c.method === 'GET'));
  for (const slug of ['secret-draft', 'next-week', 'old-post']) assert.ok(!urls.some((u) => u.includes(slug)), slug);
  assert.ok(!urls.some((u) => /resend/i.test(u)));
});

test('the run never writes to the ledger or the blog, even on success', async () => {
  const f = fixture({ posts: POSTS });
  const before = [hashTree(f.ledgerDir), hashTree(f.blogDir)];
  await generateDraft({ ...f, now: NOW, fetchImpl: liveFetch(TITLES) });
  assert.deepEqual([hashTree(f.ledgerDir), hashTree(f.blogDir)], before);
});

test('an output directory inside the ledger is refused', async () => {
  const f = fixture({ posts: POSTS });
  await assert.rejects(generateDraft({ ...f, outDir: f.ledgerDir, now: NOW, fetchImpl: liveFetch(TITLES) }), /ledger/i);
  await assert.rejects(generateDraft({ ...f, outDir: join(f.ledgerDir, 'sub'), now: NOW, fetchImpl: liveFetch(TITLES) }), /ledger/i);
  assert.deepEqual(readdirSync(f.ledgerDir), []);
});

test('a live failure for any new post fails the whole run and writes no draft', async () => {
  const f = fixture({ posts: POSTS });
  await assert.rejects(
    generateDraft({ ...f, now: NOW, fetchImpl: liveFetch(TITLES, { fail: new Set(['mini-ramp']) }) }),
    /mini-ramp/,
  );
  assert.ok(!existsSync(join(f.outDir, 'manifest.json')));
  assert.ok(!existsSync(join(f.outDir, 'draft.md')));
});

test('sent history moves the window and prevents repeats by canonical URL', async () => {
  // mini-ramp (published 10-19) was already featured — e.g. sent early by hand —
  // so it must not repeat even though it falls inside the new window.
  const f = fixture({
    posts: POSTS,
    ledger: {
      '2026-10-15.json': sentRecord({
        items: [{ role: 'lead', slug: 'mini-ramp', canonicalUrl: 'https://concretecomeback.com/blog/mini-ramp/' }],
      }),
    },
  });
  const fetchImpl = liveFetch(TITLES);
  await generateDraft({ ...f, now: NOW, fetchImpl });
  const manifest = JSON.parse(readFileSync(join(f.outDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.window.policy, 'since-last-sent');
  assert.equal(manifest.window.start, '2026-10-15');
  assert.ok(!manifest.items.some((i) => i.slug === 'mini-ramp'));
  assert.equal(manifest.excluded.find((e) => e.slug === 'mini-ramp').reason, 'already-sent');
  assert.ok(!fetchImpl.calls.some((c) => c.url.includes('mini-ramp')), 'already-sent posts are not fetched');
  assert.ok(!manifest.sendBlockers.some((b) => b.code === 'subscriber-transition'), 'a weekly issue has already gone out');
});

test('no eligible posts produces an honest no-issue report and no draft', async () => {
  const f = fixture({ posts: { 'old-post.md': postSource({ pubDate: '2026-09-01' }), 'secret.md': postSource({ pubDate: '2026-10-20', draft: true }) } });
  const fetchImpl = liveFetch({});
  const result = await generateDraft({ ...f, now: NOW, fetchImpl });
  assert.equal(result.status, 'no-eligible-posts');
  assert.equal(fetchImpl.calls.length, 0);
  assert.deepEqual(readdirSync(f.outDir).sort(), ['manifest.json', 'report.html', 'report.md']);
  const manifest = JSON.parse(readFileSync(join(f.outDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'no-eligible-posts');
  assert.deepEqual(manifest.items, []);
  assert.match(readFileSync(join(f.outDir, 'report.md'), 'utf8'), /No issue this week/);
});

test('malformed history, metadata or send requirements fail closed before any fetch', async () => {
  const cases = [
    (f) => writeFileSync(join(f.ledgerDir, '2026-10-15.json'), JSON.stringify({ ...sentRecord(), status: 'draft' })),
    (f) => writeFileSync(join(f.blogDir, 'broken.md'), '---\ntitle: "x\n---\n'),
    (f) => writeFileSync(f.sendRequirementsPath, JSON.stringify({ schemaVersion: 1, physicalPostalAddress: 42, preferenceCenterUrl: null })),
    (f) => writeFileSync(f.sendRequirementsPath, JSON.stringify({ schemaVersion: 1, physicalPostalAddress: null, preferenceCenterUrl: 'javascript:alert(1)' })),
    (f) => writeFileSync(f.sendRequirementsPath, '{'),
  ];
  for (const [i, mutate] of cases.entries()) {
    const f = fixture({ posts: POSTS });
    mutate(f);
    const fetchImpl = liveFetch(TITLES);
    await assert.rejects(generateDraft({ ...f, now: NOW, fetchImpl }), Error, `case ${i}`);
    assert.equal(fetchImpl.calls.length, 0, `case ${i} fetched`);
    assert.ok(!existsSync(join(f.outDir, 'manifest.json')), `case ${i} wrote a manifest`);
  }
});

test('configured address and preference centre clear their blockers but never approval', async () => {
  const f = fixture({ posts: POSTS });
  writeFileSync(f.sendRequirementsPath, JSON.stringify({
    schemaVersion: 1, physicalPostalAddress: '1 Example St, Portland, OR 97201', preferenceCenterUrl: 'https://concretecomeback.com/newsletter/preferences/',
  }));
  await generateDraft({ ...f, now: NOW, fetchImpl: liveFetch(TITLES) });
  const manifest = JSON.parse(readFileSync(join(f.outDir, 'manifest.json'), 'utf8'));
  const codes = manifest.sendBlockers.map((b) => b.code);
  assert.ok(!codes.includes('physical-address'));
  assert.ok(!codes.includes('preference-center'));
  assert.ok(codes.includes('operator-approval'));
  assert.ok(codes.includes('unsubscribe-verification'));
  assert.equal(manifest.sendable, false);
});

test('a weekend section from a new post outside the lead and reads is recorded as a weekend item', async () => {
  const f = fixture({ posts: {
    'lead-story.md': postSource({ title: 'Lead Story', pubDate: '2026-10-20', featured: true, tags: ['culture'], body: 'Story.\n' }),
    'gear-read.md': postSource({ title: 'Gear Read', pubDate: '2026-10-19', tags: ['gear'], body: 'Gear.\n' }),
    'dose-guide.md': postSource({ title: 'Dose Guide', pubDate: '2026-10-19', tags: ['supplements'], body: '## The practical basics\n\nTake 5 grams.\n' }),
    'group-read.md': postSource({ title: 'Group Read', pubDate: '2026-10-18', tags: ['community'], body: 'Group.\n' }),
    'plateau.md': postSource({ title: 'Plateau', pubDate: '2026-10-15', tags: ['culture', 'gear', 'community'],
      body: '## What actually breaks it\n\nIsolate the failing piece.\n' }),
  } });
  const fetchImpl = liveFetch({ 'lead-story': 'Lead Story', 'gear-read': 'Gear Read', 'dose-guide': 'Dose Guide', 'group-read': 'Group Read', plateau: 'Plateau' });
  await generateDraft({ ...f, now: NOW, fetchImpl });
  const manifest = JSON.parse(readFileSync(join(f.outDir, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.items.map((i) => [i.role, i.slug]), [
    ['lead', 'lead-story'], ['read', 'dose-guide'], ['read', 'gear-read'], ['read', 'group-read'], ['weekend', 'plateau'],
  ]);
  assert.equal(manifest.weekend.sourceSlug, 'plateau');
  const md = readFileSync(join(f.outDir, 'draft.md'), 'utf8');
  assert.match(md, /Isolate the failing piece\./);
  assert.doesNotMatch(md, /Take 5 grams/);
});

test('the draft run is deterministic for the same inputs apart from timestamps', async () => {
  const f = fixture({ posts: POSTS });
  await generateDraft({ ...f, now: NOW, fetchImpl: liveFetch(TITLES) });
  const first = readFileSync(join(f.outDir, 'draft.md'), 'utf8');
  mkdirSync(join(f.root, 'out2'));
  await generateDraft({ ...f, outDir: join(f.root, 'out2'), now: NOW, fetchImpl: liveFetch(TITLES) });
  assert.equal(readFileSync(join(f.root, 'out2', 'draft.md'), 'utf8'), first);
});
