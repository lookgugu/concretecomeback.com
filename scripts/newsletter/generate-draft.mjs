#!/usr/bin/env node
// Generates this week's newsletter draft artifacts. Draft only — see draft.mjs.
//
//   node scripts/newsletter/generate-draft.mjs --out <dir>
//
// --blog/--ledger/--requirements default to the repo paths and exist for
// tests. There is deliberately no flag for the site origin or any URL: the
// only hosts this process can contact are fixed in content.mjs.
// --now overrides the clock (tests, or re-generating a past week by hand).

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { generateDraft } from './draft.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const DEFAULT_BLOG = resolve(REPO, 'src/content/blog');

function git(args) {
  try { return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}

try {
  const { values } = parseArgs({
    strict: true,
    options: {
      out: { type: 'string' },
      blog: { type: 'string', default: DEFAULT_BLOG },
      ledger: { type: 'string', default: resolve(REPO, 'newsletter/issues') },
      requirements: { type: 'string', default: resolve(REPO, 'newsletter/send-requirements.json') },
      now: { type: 'string' },
    },
  });
  if (!values.out) throw new Error('--out <dir> is required');
  const now = values.now ? new Date(values.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error('--now is not a valid instant');

  let sourceCommit = null;
  let blogTree = null;
  if (resolve(values.blog) === DEFAULT_BLOG) {
    // Only committed content has been through review and the safety gate.
    const dirty = git(['status', '--porcelain', '--untracked-files=all', '--', 'src/content/blog']);
    if (dirty === null) throw new Error('Could not read git status for src/content/blog — refusing to draft from unknown content');
    if (dirty) throw new Error(`Uncommitted changes under src/content/blog — draft only from committed content:\n${dirty}`);
    sourceCommit = process.env.GITHUB_SHA || git(['rev-parse', 'HEAD']);
    blogTree = git(['rev-parse', 'HEAD:src/content/blog']);
  }

  const result = await generateDraft({
    blogDir: values.blog,
    ledgerDir: values.ledger,
    sendRequirementsPath: values.requirements,
    outDir: values.out,
    now,
    sourceCommit,
    blogTree,
  });
  const m = result.manifest;
  console.log(`status=${m.status} issue=${m.issueId} window=${m.window.start}..${m.window.end} items=${m.items.length} blockers=${(m.sendBlockers || []).map((b) => b.code).join(',') || 'none'}`);
  console.log(`Artifacts written to ${resolve(values.out)}`);
} catch (error) {
  console.error(`generate-draft: ${error.message}`);
  process.exit(1);
}
