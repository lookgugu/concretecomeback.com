#!/usr/bin/env node
// Records a weekly issue as sent in the committed ledger (newsletter/issues/).
//
// Run this only AFTER the issue has gone out through a separately authorized
// send AND you have confirmed delivery in the Resend dashboard. It makes no
// network call and cannot send anything; it writes one JSON file for you to
// commit. See docs/weekly-newsletter.md, "Recording a sent issue".
//
//   node scripts/newsletter/record-sent.mjs \
//     --draft <artifact>/manifest.json \
//     --provider-reference <resend broadcast id> \
//     --sent-at 2026-10-22T14:00:05Z \
//     --approved-by "Name" \
//     --confirmed-delivered-in-provider

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildSentRecord, writeSentRecord } from './ledger.mjs';

const DEFAULT_LEDGER = fileURLToPath(new URL('../../newsletter/issues', import.meta.url));

try {
  const { values } = parseArgs({
    strict: true,
    options: {
      draft: { type: 'string' },
      ledger: { type: 'string', default: DEFAULT_LEDGER },
      'provider-reference': { type: 'string' },
      'sent-at': { type: 'string' },
      'approved-by': { type: 'string' },
      'approval-reference': { type: 'string' },
      'recorded-by': { type: 'string' },
      'confirmed-delivered-in-provider': { type: 'boolean', default: false },
      now: { type: 'string' },
    },
  });
  if (!values['confirmed-delivered-in-provider']) {
    throw new Error('Refusing to record: pass --confirmed-delivered-in-provider once you have checked the send in Resend.');
  }
  if (!values.draft) throw new Error('--draft <manifest.json> is required');
  const now = values.now ? new Date(values.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error('--now is not a valid instant');
  let draft;
  try { draft = JSON.parse(readFileSync(values.draft, 'utf8')); } catch { throw new Error(`${values.draft} is not a readable JSON manifest`); }
  const record = buildSentRecord(draft, {
    providerReference: values['provider-reference'],
    sentAt: values['sent-at'],
    approvedBy: values['approved-by'],
    approvalReference: values['approval-reference'],
    recordedBy: values['recorded-by'],
    now,
  });
  const path = writeSentRecord(values.ledger, record, { now });
  console.log(`Recorded issue ${record.issueId} as sent: ${path}\nCommit this file so the next draft cannot repeat these posts.`);
} catch (error) {
  console.error(`record-sent: ${error.message}`);
  process.exit(1);
}
