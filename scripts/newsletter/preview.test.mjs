import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PHOTO_ROOT, loadPhotos, previewJpeg } from './photos.mjs';
import { renderLocalPreview } from './preview.mjs';
import { renderHtml, renderMarkdown, escapeHtml, escapeMarkdown } from './render.mjs';
import { tempDir } from './test-helpers.mjs';
const now = new Date();
const photos = () => {
  const configured = JSON.parse(readFileSync(join(PHOTO_ROOT, 'newsletter/photos/manifest.json'), 'utf8')).photos;
  const local = loadPhotos({ now });
  assert.deepEqual(local.diagnostics, []);
  assert.deepEqual(local.photos.map(p => p.id), configured.map(p => p.id));
  const eligible = local.photos.filter(p => p.type === 'image/jpeg');
  assert.ok(eligible.length > 0, 'preview regressions require a reviewed JPEG');
  return eligible.map(p => ({ ...p, displayWidth: 280 }));
};
const issueFor = ps => ({ issueId: '2026-10-22', plannedSendUtc: '2026-10-22T14:00:00Z', lead: { title: 'Lead', url: 'https://example.org/lead', description: 'Description', author: 'Author', photo: ps[0] }, reads: ps.slice(1).map(photo => ({ title: 'Read', url: 'https://example.org/read', description: 'Description', photo })), blockers: [{ code: 'operator-approval', message: 'Approval required' }] });
const sources = html => [...html.matchAll(/<img src="([^"]+)"/g)].map(m => m[1]);

test('standalone preview embeds exact verified JPEGs without fetching and preserves blockers/alt', t => {
  t.mock.method(globalThis, 'fetch', () => { throw Error('network blocked'); });
  const ps = photos(), issue = issueFor(ps);
  const hosted = renderHtml(issue), preview = renderLocalPreview(issue, { now });
  assert.equal(sources(hosted).length, ps.length);
  assert.ok(sources(hosted).every(s => s.startsWith('https://concretecomeback.com/')));
  const embedded = sources(preview.html);
  assert.equal(embedded.length, ps.length);
  embedded.forEach((src, i) => {
    assert.ok(src.startsWith('data:image/jpeg;base64,'));
    const bytes = Buffer.from(src.split(',')[1], 'base64');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), ps[i].derivative.sha256);
    assert.deepEqual(bytes, readFileSync(join(PHOTO_ROOT, ps[i].derivative.file)));
    assert.ok(preview.html.includes(escapeHtml(ps[i].alt)));
  });
  assert.equal(globalThis.fetch.mock.callCount(), 0);
  assert.match(preview.html, /LOCAL PREVIEW/);
  assert.match(preview.html, /operator-approval/);
  assert.match(preview.html, /img-src data:/);
  assert.doesNotMatch(preview.html, /<img src="https:/);
  assert.equal(renderHtml(issue), hosted, 'preview must not mutate production issue');
});

for (const [name, mutate] of Object.entries({
  traversal: p => p.derivative.file = 'public/images/newsletter/../../secret.jpg',
  remote: p => p.derivative.file = 'https://example.org/image.jpg',
  hash: p => p.derivative.sha256 = '0'.repeat(64),
  dimensions: p => p.derivative.width++,
  bytes: p => p.derivative.bytes++,
  license: p => p.license = 'CC-BY-NC-4.0',
  evidence: p => p.evidence.sha256 = '0'.repeat(64),
  mime: p => p.type = 'image/png',
  url: p => p.url = 'https://example.org/image.jpg',
})) test(`preview fails closed on ${name} with text retained`, () => {
  const p = photos()[0]; mutate(p);
  assert.throws(() => previewJpeg(p, { now }));
  const result = renderLocalPreview(issueFor([p]), { now });
  assert.equal(sources(result.html).length, 0);
  assert.equal(result.diagnostics[0].status, 'omitted');
  assert.match(result.html, /Description/);
  assert.match(result.html, /operator-approval/);
});

for (const kind of ['symlink', 'missing', 'oversized', 'corrupt', 'truncated']) test(`local preview rejects ${kind} derivative`, () => {
  const root = tempDir();
  cpSync(join(PHOTO_ROOT, 'newsletter'), join(root, 'newsletter'), { recursive: true });
  cpSync(join(PHOTO_ROOT, 'public/images/newsletter'), join(root, 'public/images/newsletter'), { recursive: true });
  const p = photos()[0], path = join(root, p.derivative.file);
  if (kind === 'symlink') { unlinkSync(path); symlinkSync(join(PHOTO_ROOT, p.derivative.file), path); }
  if (kind === 'missing') unlinkSync(path);
  if (kind === 'oversized') writeFileSync(path, Buffer.alloc(2_000_001));
  if (kind === 'corrupt') writeFileSync(path, Buffer.from('not a JPEG'));
  if (kind === 'truncated') {
    const bytes = readFileSync(path).subarray(0, -2);
    writeFileSync(path, bytes);
    p.derivative.sha256 = createHash('sha256').update(bytes).digest('hex');
    p.derivative.bytes = bytes.length;
  }
  assert.throws(() => previewJpeg(p, { root, now }));
});

test('CC0 captions are compact with explicit context and full provenance stays in photo metadata', () => {
  const ps = photos().filter(p => p.license === 'CC0-1.0'), issue = issueFor(ps);
  assert.match(ps.find(p => p.id === 'crabtree').caption, /Illustrative.*not Grandma Liu or the location in her story/);
  assert.match(ps.find(p => p.id === 'miniramp').caption, /Illustrative.*not a build from the article/);
  for (const p of ps) {
    assert.ok(p.caption.length <= 75);
    assert.ok(p.attribution && p.modifications && p.identity.context);
  }
  for (const [output, escape] of [[renderHtml(issue), escapeHtml], [renderMarkdown(issue), escapeMarkdown]]) {
    assert.doesNotMatch(output, /metadata removed|JPEG quality|Resized to/);
    for (const p of ps) assert.ok(output.includes(escape(p.author)));
    assert.match(output, /Commons/);
    assert.match(output, /CC0/);
  }
});

test('compact CC0 credit and captions retain escaping in both formats', () => {
  const p = photos()[0];
  p.caption = '<script>alert("caption")</script> & [caption]';
  p.author = '<img onerror="author">';
  const issue = issueFor([p]);
  for (const output of [renderHtml(issue), renderMarkdown(issue)]) {
    assert.doesNotMatch(output, /<script>|<img onerror/);
    assert.match(output, /&lt;script&gt;/);
    assert.match(output, /&lt;img onerror/);
  }
});
