import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('browser QA setup failure replaces stale success with a failed incomplete report', () => {
  const scratch = path.join(homedir(), '.hermes/cache/scratch');
  mkdirSync(scratch, { recursive: true });
  const out = mkdtempSync(path.join(scratch, 'cc-qa-report-test-'));
  try {
    const reportPath = path.join(out, 'browser-results.json');
    writeFileSync(reportPath, JSON.stringify({ status: 'passed', completed: true, passed: 999 }));
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('../qa-newsletter-landing.mjs', import.meta.url)), out], {
      env: { ...process.env, PLAYWRIGHT_MODULE: path.join(out, 'deliberately-missing-module.mjs') },
      encoding: 'utf8', timeout: 10000,
    });
    assert.equal(run.status, 1);
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    assert.equal(report.status, 'failed');
    assert.equal(report.completed, false);
    assert.equal(report.passed, 0);
    assert.deepEqual(report.failedChecks, []); // setup error, not an assertion
    assert.match(report.error.message, /deliberately-missing-module/);
    assert.ok(report.startedAt && report.finishedAt);
    assert.doesNotMatch(run.stdout, /checks passed/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
