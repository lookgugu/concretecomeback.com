#!/usr/bin/env node
// Decides whether this workflow run should build a draft, and writes
// `run=true|false` to $GITHUB_OUTPUT. Inputs arrive as environment variables
// (EVENT_NAME, EVENT_SCHEDULE) rather than being interpolated into a shell
// command, so nothing in the event payload is ever executed.
//
// GUARD_NOW overrides the clock for tests only.

import { appendFileSync } from 'node:fs';
import { scheduledRunDecision } from './schedule.mjs';

try {
  const event = process.env.EVENT_NAME;
  const now = process.env.GUARD_NOW ? new Date(process.env.GUARD_NOW) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error('GUARD_NOW is not a valid instant');
  let decision;
  if (event === 'workflow_dispatch') decision = { run: true, reason: 'Manual dispatch — runs regardless of day or offset.' };
  else if (event === 'schedule') decision = scheduledRunDecision(process.env.EVENT_SCHEDULE ?? '', now);
  else throw new Error(`Unexpected event ${JSON.stringify(event)}`);
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is not set');
  appendFileSync(process.env.GITHUB_OUTPUT, `run=${decision.run}\n`);
  console.log(decision.reason);
} catch (error) {
  console.error(`schedule-guard: ${error.message}`);
  process.exit(1);
}
