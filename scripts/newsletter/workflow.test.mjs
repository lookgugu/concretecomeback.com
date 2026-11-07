import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CRON_EDT, CRON_EST } from './schedule.mjs';

const wf = readFileSync(new URL('../../.github/workflows/newsletter-draft.yml', import.meta.url), 'utf8');
const lines = wf.split('\n');
// Executable YAML only: comments may describe what the workflow does not do.
const code = lines.filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/\s+#.*$/, '')).join('\n');

test('the draft workflow is scheduled on both Wednesday crons the guard knows, plus manual dispatch', () => {
  assert.match(wf, new RegExp(`- cron: '${CRON_EDT.replace(/\*/g, '\\*')}'`));
  assert.match(wf, new RegExp(`- cron: '${CRON_EST.replace(/\*/g, '\\*')}'`));
  assert.match(wf, /^\s{2}workflow_dispatch:\s*$/m);
  assert.doesNotMatch(wf, /^\s{2}(push|pull_request|pull_request_target|workflow_run|issue_comment):/m);
  assert.equal((wf.match(/- cron:/g) || []).length, 2);
});

test('the workflow token can only read contents', () => {
  const block = /^permissions:\n((?:\s{2}.+\n)+)/m.exec(wf);
  assert.ok(block, 'top-level permissions block');
  assert.deepEqual(block[1].trim().split('\n').map((l) => l.trim()), ['contents: read']);
  assert.doesNotMatch(wf, /write-all|: write\b/);
  assert.doesNotMatch(wf, /secrets\./, 'the draft needs no secrets');
});

test('every action is pinned to a full commit SHA and checkout does not persist the token', () => {
  const uses = lines.filter((l) => /^\s*-?\s*uses:/.test(l));
  assert.ok(uses.length >= 3);
  for (const l of uses) assert.match(l, /uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40}(\s+#.*)?$/, l.trim());
  assert.match(wf, /persist-credentials: false/);
});

test('no GitHub expression is interpolated into a shell script', () => {
  let inRun = false;
  let runIndent = 0;
  for (const line of lines) {
    const m = /^(\s*)(?:- )?run: ?(\|)?(.*)$/.exec(line);
    if (m) {
      assert.doesNotMatch(m[3], /\$\{\{/, line.trim());
      inRun = Boolean(m[2]);
      runIndent = m[1].length;
      continue;
    }
    if (inRun) {
      const indent = /^(\s*)/.exec(line)[1].length;
      if (line.trim() && indent <= runIndent) inRun = false;
      else assert.doesNotMatch(line, /\$\{\{/, line.trim());
    }
  }
});

test('the workflow drafts only from main and installs no npm dependencies', () => {
  assert.match(wf, /if: github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(code, /npm (ci|install)|npx /);
  assert.match(code, /scripts\/newsletter\/schedule-guard\.mjs/);
  assert.match(code, /scripts\/newsletter\/generate-draft\.mjs/);
  assert.doesNotMatch(code, /record-sent/);
  assert.doesNotMatch(code, /resend|RESEND_/i);
});

test('artifact upload includes the whole output directory, including the local preview', () => {
  assert.match(wf, /--out "\$RUNNER_TEMP\/weekly-newsletter"/);
  assert.match(wf, /path: \$\{\{ runner.temp \}\}\/weekly-newsletter\//);
  assert.match(wf, /preview-local\.html/);
});
