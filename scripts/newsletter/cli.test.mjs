import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { postSource, tempDir, writeBlog, writeLedger } from './test-helpers.mjs';

const GUARD = fileURLToPath(new URL('./schedule-guard.mjs', import.meta.url));
const GENERATE = fileURLToPath(new URL('./generate-draft.mjs', import.meta.url));
const NO_NETWORK = fileURLToPath(new URL('./no-network.mjs', import.meta.url));
const REPO_REQUIREMENTS = fileURLToPath(new URL('../../newsletter/send-requirements.json', import.meta.url));

function guard(env) {
  const out = join(tempDir(), 'github-output');
  writeFileSync(out, '');
  const r = spawnSync(process.execPath, [GUARD], { env: { PATH: process.env.PATH, GITHUB_OUTPUT: out, ...env }, encoding: 'utf8' });
  return { status: r.status, output: readFileSync(out, 'utf8'), stderr: r.stderr, stdout: r.stdout };
}

test('schedule guard: the matching cron writes run=true, the other run=false', () => {
  const edt = guard({ EVENT_NAME: 'schedule', EVENT_SCHEDULE: '0 13 * * 3', GUARD_NOW: '2026-10-21T13:07:00Z' });
  assert.equal(edt.status, 0);
  assert.match(edt.output, /^run=true$/m);
  const est = guard({ EVENT_NAME: 'schedule', EVENT_SCHEDULE: '0 14 * * 3', GUARD_NOW: '2026-10-21T14:07:00Z' });
  assert.equal(est.status, 0);
  assert.match(est.output, /^run=false$/m);
});

test('schedule guard: a manual dispatch always runs', () => {
  const r = guard({ EVENT_NAME: 'workflow_dispatch', GUARD_NOW: '2026-10-17T19:00:00Z' });
  assert.equal(r.status, 0);
  assert.match(r.output, /^run=true$/m);
});

test('schedule guard: unknown events or crons fail closed', () => {
  assert.notEqual(guard({ EVENT_NAME: 'push' }).status, 0);
  assert.notEqual(guard({ EVENT_NAME: 'schedule', EVENT_SCHEDULE: '*/5 * * * *' }).status, 0);
  assert.notEqual(guard({ EVENT_NAME: 'schedule', EVENT_SCHEDULE: '0 13 * * 3\nrun=true' }).status, 0);
});

test('the committed send requirements use the exact owner-authorized business address', () => {
  const cfg = JSON.parse(readFileSync(REPO_REQUIREMENTS, 'utf8'));
  assert.equal(cfg.schemaVersion, 1);
  assert.equal(cfg.physicalPostalAddress, '326 Gault St., Santa Cruz, CA 95062');
  assert.equal(cfg.preferenceCenterUrl, null);
});

function fixtureArgs(posts) {
  const { root, blogDir } = writeBlog(posts);
  const ledgerDir = writeLedger(root, {});
  const out = join(root, 'out');
  return { out, args: ['--blog', blogDir, '--ledger', ledgerDir, '--requirements', REPO_REQUIREMENTS, '--out', out] };
}

test('generate-draft CLI: no eligible posts exits 0 with an honest report and no network', () => {
  const { out, args } = fixtureArgs({ 'old.md': postSource({ pubDate: '2026-09-01' }) });
  const r = spawnSync(process.execPath, ['--import', NO_NETWORK, GENERATE, ...args, '--now', '2026-10-21T13:05:00Z'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no-eligible-posts/);
  assert.ok(existsSync(join(out, 'report.md')));
});

test('generate-draft CLI: a live-check failure exits non-zero and leaves no draft', () => {
  const { out, args } = fixtureArgs({ 'fresh.md': postSource({ pubDate: '2026-10-20' }) });
  const r = spawnSync(process.execPath, ['--import', NO_NETWORK, GENERATE, ...args, '--now', '2026-10-21T13:05:00Z'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Live check failed/);
  assert.ok(!existsSync(join(out, 'manifest.json')));
});

test('generate-draft CLI: unknown flags are rejected rather than ignored', () => {
  const { args } = fixtureArgs({});
  const r = spawnSync(process.execPath, ['--import', NO_NETWORK, GENERATE, ...args, '--origin', 'https://evil.example'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
});
