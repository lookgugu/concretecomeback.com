import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSentHistory, buildSentRecord, writeSentRecord, validateSentRecord } from './ledger.mjs';
import { sentRecord, tempDir, writeLedger } from './test-helpers.mjs';

const NOW = new Date('2026-10-21T13:00:00Z');
const REPO_LEDGER = fileURLToPath(new URL('../../newsletter/issues', import.meta.url));

function draftManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'concretecomeback-weekly-issue',
    status: 'draft',
    issueId: '2026-10-22',
    cadence: 'weekly',
    generatedAt: '2026-10-21T13:01:00.000Z',
    window: { start: '2026-10-15', end: '2026-10-21', timeZone: 'America/New_York', policy: 'since-last-sent' },
    items: [
      { role: 'lead', slug: 'new-lead', canonicalUrl: 'https://concretecomeback.com/blog/new-lead/', title: 'T', pubDate: '2026-10-20', sha256: 'a'.repeat(64) },
      { role: 'read', slug: 'new-read', canonicalUrl: 'https://concretecomeback.com/blog/new-read/', title: 'R', pubDate: '2026-10-19', sha256: 'b'.repeat(64) },
    ],
    sendBlockers: [{ code: 'operator-approval' }],
    ...overrides,
  };
}

test('the committed repo ledger exists and validates', () => {
  const history = loadSentHistory(REPO_LEDGER, { now: NOW });
  assert.ok(Array.isArray(history.issues));
});

test('an empty ledger is a bootstrap, not an error', () => {
  const dir = writeLedger(tempDir(), { 'README.md': '# ledger' });
  const history = loadSentHistory(dir, { now: NOW });
  assert.equal(history.lastSent, null);
  assert.equal(history.sentCanonicals.size, 0);
});

test('a missing ledger directory fails closed', () => {
  assert.throws(() => loadSentHistory(join(tempDir(), 'nope'), { now: NOW }), /ledger/i);
});

test('sent history yields the latest issue and every sent canonical URL', () => {
  const dir = writeLedger(tempDir(), {
    '2026-10-08.json': sentRecord({ issueId: '2026-10-08', window: { start: '2026-10-01', end: '2026-10-07', timeZone: 'America/New_York' },
      items: [{ role: 'lead', slug: 'a', canonicalUrl: 'https://concretecomeback.com/blog/a/' }],
      sent: { ...sentRecord().sent, sentAt: '2026-10-08T14:00:00.000Z' } }),
    '2026-10-15.json': sentRecord(),
  });
  const history = loadSentHistory(dir, { now: NOW });
  assert.equal(history.lastSent.issueId, '2026-10-15');
  assert.deepEqual([...history.sentCanonicals].sort(), [
    'https://concretecomeback.com/blog/a/', 'https://concretecomeback.com/blog/old-lead/',
  ]);
});

test('malformed or untrustworthy history fails closed', () => {
  const base = sentRecord();
  const cases = {
    'not json': '{oops',
    'status draft': { ...base, status: 'draft' },
    'status approved': { ...base, status: 'approved' },
    'wrong schema': { ...base, schemaVersion: 2 },
    'unknown key': { ...base, staus: 'sent' },
    'bad issue date': { ...base, issueId: '2026-02-30' },
    'window after issue': { ...base, window: { ...base.window, end: '2026-10-16' } },
    'window reversed': { ...base, window: { ...base.window, start: '2026-10-14', end: '2026-10-08' } },
    'no items': { ...base, items: [] },
    'off-site item': { ...base, items: [{ role: 'lead', slug: 'x', canonicalUrl: 'https://evil.example/blog/x/' }] },
    'slug mismatch': { ...base, items: [{ role: 'lead', slug: 'y', canonicalUrl: 'https://concretecomeback.com/blog/x/' }] },
    'bad role': { ...base, items: [{ role: 'ad', slug: 'x', canonicalUrl: 'https://concretecomeback.com/blog/x/' }] },
    'sent in future': { ...base, sent: { ...base.sent, sentAt: '2026-12-01T00:00:00.000Z' } },
    'sent unparseable': { ...base, sent: { ...base.sent, sentAt: 'Thursday' } },
    'no provider ref': { ...base, sent: { ...base.sent, providerReference: '' } },
    'provider ref injection': { ...base, sent: { ...base.sent, providerReference: 'x; rm -rf /' } },
    'no approver': { ...base, sent: { ...base.sent, approvedBy: '' } },
  };
  for (const [label, record] of Object.entries(cases)) {
    const dir = writeLedger(tempDir(), { '2026-10-15.json': record });
    assert.throws(() => loadSentHistory(dir, { now: NOW }), Error, label);
  }
});

test('a weekend source is part of sent history like any featured post', () => {
  const dir = writeLedger(tempDir(), { '2026-10-15.json': sentRecord({ items: [
    { role: 'lead', slug: 'old-lead', canonicalUrl: 'https://concretecomeback.com/blog/old-lead/' },
    { role: 'weekend', slug: 'old-weekend', canonicalUrl: 'https://concretecomeback.com/blog/old-weekend/' },
  ] }) });
  assert.ok(loadSentHistory(dir, { now: NOW }).sentCanonicals.has('https://concretecomeback.com/blog/old-weekend/'));
});

test('ledger filenames must match their issue and nothing unexpected may sit beside them', () => {
  assert.throws(() => loadSentHistory(writeLedger(tempDir(), { '2026-10-14.json': sentRecord() }), { now: NOW }), /filename/i);
  assert.throws(() => loadSentHistory(writeLedger(tempDir(), { 'draft.json': sentRecord() }), { now: NOW }), /unexpected/i);
  assert.throws(() => loadSentHistory(writeLedger(tempDir(), { 'notes.txt': 'x' }), { now: NOW }), /unexpected/i);
});

test('a canonical URL recorded as sent in two issues fails closed', () => {
  const dir = writeLedger(tempDir(), {
    '2026-10-08.json': sentRecord({ issueId: '2026-10-08', window: { start: '2026-10-01', end: '2026-10-07', timeZone: 'America/New_York' },
      sent: { ...sentRecord().sent, sentAt: '2026-10-08T14:00:00.000Z' } }),
    '2026-10-15.json': sentRecord(),
  });
  assert.throws(() => loadSentHistory(dir, { now: NOW }), /already recorded/i);
});

test('buildSentRecord turns a draft into a sent record only with provider evidence', () => {
  const record = buildSentRecord(draftManifest(), {
    providerReference: 'bc_42', sentAt: '2026-10-22T14:00:05Z', approvedBy: 'Beno Chapman', recordedBy: 'Beno Chapman', now: new Date('2026-10-22T15:00:00Z'),
  });
  assert.equal(record.status, 'sent');
  assert.equal(record.sent.sentAt, '2026-10-22T14:00:05.000Z');
  assert.deepEqual(record.items.map((i) => i.canonicalUrl), [
    'https://concretecomeback.com/blog/new-lead/', 'https://concretecomeback.com/blog/new-read/',
  ]);
  validateSentRecord(record, '2026-10-22.json', { now: new Date('2026-10-22T15:00:00Z') });
});

test('buildSentRecord refuses anything that is not a pristine draft or lacks evidence', () => {
  const ok = { providerReference: 'bc_42', sentAt: '2026-10-22T14:00:05Z', approvedBy: 'B', recordedBy: 'B', now: new Date('2026-10-22T15:00:00Z') };
  assert.throws(() => buildSentRecord(draftManifest({ status: 'sent' }), ok), /draft/);
  assert.throws(() => buildSentRecord(draftManifest({ status: 'no-eligible-posts', items: [] }), ok), /draft/);
  assert.throws(() => buildSentRecord(draftManifest(), { ...ok, providerReference: undefined }), /provider/i);
  assert.throws(() => buildSentRecord(draftManifest(), { ...ok, approvedBy: '' }), /approv/i);
  assert.throws(() => buildSentRecord(draftManifest(), { ...ok, sentAt: '2026-10-21T12:00:00Z' }), /before the draft/i);
  assert.throws(() => buildSentRecord(draftManifest(), { ...ok, sentAt: '2026-10-23T12:00:00Z' }), /future/i);
});

test('writeSentRecord never overwrites an existing record', () => {
  const dir = writeLedger(tempDir(), {});
  const record = buildSentRecord(draftManifest(), {
    providerReference: 'bc_42', sentAt: '2026-10-22T14:00:05Z', approvedBy: 'B', recordedBy: 'B', now: new Date('2026-10-22T15:00:00Z'),
  });
  const now = new Date('2026-10-22T15:00:00Z');
  writeSentRecord(dir, record, { now });
  assert.deepEqual(readdirSync(dir), ['2026-10-22.json']);
  assert.throws(() => writeSentRecord(dir, record, { now }), /already exists/i);
  assert.equal(loadSentHistory(dir, { now }).lastSent.issueId, '2026-10-22');
});

test('the record-sent CLI demands explicit confirmation of provider delivery and makes no network call', () => {
  const root = tempDir();
  const dir = writeLedger(root, {});
  const draftPath = join(root, 'manifest.json');
  writeFileSync(draftPath, JSON.stringify(draftManifest()));
  const cli = fileURLToPath(new URL('./record-sent.mjs', import.meta.url));
  const args = ['--draft', draftPath, '--ledger', dir, '--provider-reference', 'bc_42', '--sent-at', '2026-10-15T14:00:05Z',
    '--approved-by', 'Beno Chapman', '--now', '2026-10-15T15:00:00Z'];
  // Without the confirmation flag nothing is written.
  assert.throws(() => execFileSync(process.execPath, [cli, ...args], { stdio: 'pipe' }));
  assert.deepEqual(readdirSync(dir), []);
  // The draft's own generatedAt is after this sentAt, so this also proves ordering is checked.
  assert.throws(() => execFileSync(process.execPath, [cli, ...args, '--confirmed-delivered-in-provider'], { stdio: 'pipe' }));
  assert.deepEqual(readdirSync(dir), []);
  const good = ['--draft', draftPath, '--ledger', dir, '--provider-reference', 'bc_42', '--sent-at', '2026-10-22T14:00:05Z',
    '--approved-by', 'Beno Chapman', '--now', '2026-10-22T15:00:00Z', '--confirmed-delivered-in-provider'];
  // Any fetch attempt would throw inside the child.
  execFileSync(process.execPath, ['--import', fileURLToPath(new URL('./no-network.mjs', import.meta.url)), cli, ...good], { stdio: 'pipe' });
  const written = JSON.parse(readFileSync(join(dir, '2026-10-22.json'), 'utf8'));
  assert.equal(written.status, 'sent');
  assert.equal(written.sent.providerReference, 'bc_42');
});
