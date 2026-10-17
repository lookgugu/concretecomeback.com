// The committed record of newsletter issues that were actually sent.
//
// newsletter/issues/<issueId>.json is the only memory the weekly draft has
// between runs: it decides where the next newness window starts and which
// canonical URLs may never be featured again. It lives in git, not in a
// workflow artifact, because artifacts expire and a forgotten send would let
// the same posts go out twice.
//
// Only `status: "sent"` records belong here, and only record-sent.mjs writes
// them — after the operator has separately confirmed delivery in the email
// provider. The draft generator reads this directory and never writes to it.

import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalUrl, normalizeCanonical, SLUG_RE } from './content.mjs';
import { daysBetween, parseIsoDate, TIME_ZONE } from './schedule.mjs';

export const SCHEMA_VERSION = 1;
export const ITEM_ROLES = new Set(['lead', 'read', 'weekend']);
const TOP_KEYS = new Set(['schemaVersion', 'issueId', 'status', 'cadence', 'window', 'items', 'sent', 'provenance']);
const SENT_KEYS = new Set(['sentAt', 'provider', 'providerReference', 'approvedBy', 'approvalReference', 'recordedBy']);
const PROVIDERS = new Set(['resend']);
const PROVIDER_REF = /^[A-Za-z0-9._:-]{1,128}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const IGNORED_FILES = new Set(['README.md', '.gitkeep']);

function instant(value, label) {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO-8601 UTC instant (e.g. 2026-10-22T14:00:05Z)`);
  }
  return new Date(value);
}

function person(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 100 || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`${label} must name a person (1–100 printable characters)`);
  }
  return value.trim();
}

export function validateSentRecord(record, file, { now }) {
  const fail = (msg) => { throw new Error(`${file}: ${msg}`); };
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail('not a JSON object');
  for (const k of Object.keys(record)) if (!TOP_KEYS.has(k)) fail(`unexpected key "${k}"`);
  if (record.schemaVersion !== SCHEMA_VERSION) fail(`schemaVersion must be ${SCHEMA_VERSION}`);
  try { parseIsoDate(record.issueId); } catch (e) { fail(`issueId: ${e.message}`); }
  if (file !== `${record.issueId}.json`) fail(`filename must be ${record.issueId}.json`);
  if (record.status !== 'sent') fail(`status must be "sent" (got ${JSON.stringify(record.status)}) — drafts never belong in the ledger`);
  if (!['weekly', 'monthly'].includes(record.cadence)) fail('cadence must be "weekly" or "monthly"');

  const w = record.window;
  if (!w || typeof w !== 'object') fail('window missing');
  try { parseIsoDate(w.start); parseIsoDate(w.end); } catch (e) { fail(`window: ${e.message}`); }
  if (daysBetween(w.start, w.end) < 0) fail('window ends before it starts');
  if (daysBetween(w.end, record.issueId) < 1) fail('window must close before the issue date');
  if (w.timeZone !== TIME_ZONE) fail(`window.timeZone must be ${TIME_ZONE}`);

  if (!Array.isArray(record.items) || record.items.length === 0) fail('items must list at least one post');
  const urls = new Set();
  for (const [i, item] of record.items.entries()) {
    if (!item || !ITEM_ROLES.has(item.role)) fail(`items[${i}].role must be lead, read or weekend`);
    if (typeof item.slug !== 'string' || !SLUG_RE.test(item.slug)) fail(`items[${i}].slug is not a safe slug`);
    let normalized;
    try { normalized = normalizeCanonical(item.canonicalUrl); } catch (e) { fail(`items[${i}]: ${e.message}`); }
    if (normalized !== item.canonicalUrl || normalized !== canonicalUrl(item.slug)) fail(`items[${i}].canonicalUrl does not match its slug`);
    if (urls.has(normalized)) fail(`items[${i}] repeats ${normalized}`);
    urls.add(normalized);
  }

  const s = record.sent;
  if (!s || typeof s !== 'object') fail('sent block missing');
  for (const k of Object.keys(s)) if (!SENT_KEYS.has(k)) fail(`unexpected key "sent.${k}"`);
  let sentAt;
  try { sentAt = instant(s.sentAt, 'sent.sentAt'); } catch (e) { fail(e.message); }
  if (sentAt.getTime() > now.getTime()) fail('sent.sentAt is in the future');
  if (!PROVIDERS.has(s.provider)) fail('sent.provider must be "resend"');
  if (typeof s.providerReference !== 'string' || !PROVIDER_REF.test(s.providerReference)) {
    fail('sent.providerReference must be the provider broadcast/email id ([A-Za-z0-9._:-], ≤128)');
  }
  try { person(s.approvedBy, 'sent.approvedBy'); person(s.recordedBy, 'sent.recordedBy'); } catch (e) { fail(e.message); }
  return record;
}

export function loadSentHistory(dir, { now }) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`Sent-issue ledger ${dir} is missing — refusing to treat that as "nothing was ever sent"`);
  }
  const issues = [];
  const sentCanonicals = new Set();
  const where = new Map();
  for (const file of readdirSync(dir).sort()) {
    if (IGNORED_FILES.has(file)) continue;
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(file)) throw new Error(`${file}: unexpected file in the sent-issue ledger`);
    let record;
    try { record = JSON.parse(readFileSync(join(dir, file), 'utf8')); } catch { throw new Error(`${file}: not valid JSON`); }
    validateSentRecord(record, file, { now });
    for (const item of record.items) {
      if (sentCanonicals.has(item.canonicalUrl)) {
        throw new Error(`${file}: ${item.canonicalUrl} is already recorded as sent in ${where.get(item.canonicalUrl)}`);
      }
      sentCanonicals.add(item.canonicalUrl);
      where.set(item.canonicalUrl, file);
    }
    issues.push(record);
  }
  issues.sort((a, b) => a.issueId.localeCompare(b.issueId));
  return { issues, sentCanonicals, lastSent: issues.at(-1) ?? null };
}

export function buildSentRecord(draft, { providerReference, sentAt, approvedBy, recordedBy, approvalReference, now }) {
  if (!draft || draft.schemaVersion !== SCHEMA_VERSION || draft.kind !== 'concretecomeback-weekly-issue') {
    throw new Error('Not a weekly issue manifest');
  }
  if (draft.status !== 'draft' || !Array.isArray(draft.items) || draft.items.length === 0) {
    throw new Error(`Only a generated draft with items can be recorded as sent (status ${JSON.stringify(draft.status)})`);
  }
  if (typeof providerReference !== 'string' || !PROVIDER_REF.test(providerReference)) {
    throw new Error('A provider reference (the Resend broadcast id) is required');
  }
  const approver = (() => { try { return person(approvedBy, 'approvedBy'); } catch { throw new Error('approvedBy must name who approved the send'); } })();
  const sent = instant(sentAt, 'sentAt');
  const generated = instant(draft.generatedAt, 'draft.generatedAt');
  if (sent.getTime() < generated.getTime()) throw new Error('sentAt is before the draft was generated — wrong draft?');
  if (sent.getTime() > now.getTime()) throw new Error('sentAt is in the future');
  const record = {
    schemaVersion: SCHEMA_VERSION,
    issueId: draft.issueId,
    status: 'sent',
    cadence: 'weekly',
    window: { start: draft.window.start, end: draft.window.end, timeZone: draft.window.timeZone },
    items: draft.items.map(({ role, slug, canonicalUrl: url, title, pubDate, sha256 }) => ({ role, slug, canonicalUrl: url, title, pubDate, sha256 })),
    sent: {
      sentAt: sent.toISOString(),
      provider: 'resend',
      providerReference,
      approvedBy: approver,
      ...(approvalReference ? { approvalReference: String(approvalReference) } : {}),
      recordedBy: person(recordedBy ?? approver, 'recordedBy'),
    },
    provenance: {
      draftGeneratedAt: draft.generatedAt,
      draftSourceCommit: draft.source?.commit ?? null,
      blockersAtGeneration: (draft.sendBlockers ?? []).map((b) => b.code),
    },
  };
  validateSentRecord(record, `${record.issueId}.json`, { now });
  return record;
}

export function writeSentRecord(dir, record, { now }) {
  const file = `${record.issueId}.json`;
  validateSentRecord(record, file, { now });
  if (existsSync(join(dir, file))) throw new Error(`${file} already exists — a sent record is never overwritten`);
  const history = loadSentHistory(dir, { now });
  for (const item of record.items) {
    if (history.sentCanonicals.has(item.canonicalUrl)) throw new Error(`${item.canonicalUrl} is already recorded as sent`);
  }
  if (history.lastSent && history.lastSent.issueId >= record.issueId) {
    throw new Error(`Issue ${record.issueId} is not after the last recorded issue ${history.lastSent.issueId}`);
  }
  writeFileSync(join(dir, file), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return join(dir, file);
}
