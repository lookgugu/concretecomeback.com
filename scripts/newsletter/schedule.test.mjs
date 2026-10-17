import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CRON_EDT, CRON_EST, nyDate, nyOffsetMinutes, nyWallClockToUtc, nextIssueDate,
  addDays, scheduledRunDecision, parseIsoDate,
} from './schedule.mjs';

test('New York offset follows US daylight saving time', () => {
  assert.equal(nyOffsetMinutes(new Date('2026-10-21T13:00:00Z')), -240); // EDT
  assert.equal(nyOffsetMinutes(new Date('2026-11-04T13:00:00Z')), -300); // EST
  assert.equal(nyOffsetMinutes(new Date('2027-03-17T13:00:00Z')), -240); // EDT again
});

test('nyDate is the calendar date in New York, not UTC', () => {
  // 02:00Z on the 22nd is still the evening of the 21st in New York.
  assert.equal(nyDate(new Date('2026-10-22T02:00:00Z')), '2026-10-21');
  assert.equal(nyDate(new Date('2026-10-22T05:00:00Z')), '2026-10-22');
});

test('Thursday 10:00 New York maps to 14:00Z in EDT and 15:00Z in EST', () => {
  assert.equal(nyWallClockToUtc('2026-10-22', 10, 0).toISOString(), '2026-10-22T14:00:00.000Z');
  assert.equal(nyWallClockToUtc('2026-11-05', 10, 0).toISOString(), '2026-11-05T15:00:00.000Z');
  // The week DST ends (Sun 1 Nov 2026) — Thursday before and after.
  assert.equal(nyWallClockToUtc('2026-10-29', 10, 0).toISOString(), '2026-10-29T14:00:00.000Z');
  // The week DST starts (Sun 14 Mar 2027).
  assert.equal(nyWallClockToUtc('2027-03-11', 10, 0).toISOString(), '2027-03-11T15:00:00.000Z');
  assert.equal(nyWallClockToUtc('2027-03-18', 10, 0).toISOString(), '2027-03-18T14:00:00.000Z');
});

test('the issue date is the next Thursday strictly after the run date', () => {
  assert.equal(nextIssueDate('2026-10-21'), '2026-10-22'); // Wednesday → next day
  assert.equal(nextIssueDate('2026-10-17'), '2026-10-22'); // Saturday
  assert.equal(nextIssueDate('2026-10-22'), '2026-10-29'); // Thursday → following week
});

test('addDays and parseIsoDate reject impossible dates', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  for (const bad of ['2026-02-30', '2026-13-01', '26-10-01', '2026-10-1', '', null, 20261001, '2026-10-01T00:00:00Z']) {
    assert.throws(() => parseIsoDate(bad), /date/i, String(bad));
  }
});

test('the EDT cron runs only while New York is on daylight time', () => {
  assert.deepEqual(scheduledRunDecision(CRON_EDT, new Date('2026-10-21T13:04:00Z')).run, true);
  assert.deepEqual(scheduledRunDecision(CRON_EDT, new Date('2026-11-04T13:04:00Z')).run, false);
});

test('the EST cron runs only while New York is on standard time', () => {
  assert.equal(scheduledRunDecision(CRON_EST, new Date('2026-11-04T14:04:00Z')).run, true);
  assert.equal(scheduledRunDecision(CRON_EST, new Date('2026-10-21T14:04:00Z')).run, false);
});

test('exactly one of the two crons fires every Wednesday across a year of DST changes', () => {
  let day = '2026-01-07';
  for (let i = 0; i < 60; i++, day = addDays(day, 7)) {
    const edt = scheduledRunDecision(CRON_EDT, new Date(`${day}T13:00:00Z`)).run;
    const est = scheduledRunDecision(CRON_EST, new Date(`${day}T14:00:00Z`)).run;
    assert.equal(Number(edt) + Number(est), 1, day);
  }
});

test('a delayed scheduled run still fires on the right cron, but not once it slips past Wednesday', () => {
  // GitHub can start a scheduled job hours late; the offset, not the hour, decides.
  assert.equal(scheduledRunDecision(CRON_EDT, new Date('2026-10-21T17:45:00Z')).run, true);
  assert.equal(scheduledRunDecision(CRON_EST, new Date('2026-11-04T19:30:00Z')).run, true);
  const late = scheduledRunDecision(CRON_EDT, new Date('2026-10-22T05:00:00Z'));
  assert.equal(late.run, false);
  assert.match(late.reason, /Wednesday/);
});

test('an unknown cron expression fails closed', () => {
  assert.throws(() => scheduledRunDecision('0 12 * * 3', new Date('2026-10-21T12:00:00Z')), /unexpected schedule/i);
  assert.throws(() => scheduledRunDecision('', new Date()), /unexpected schedule/i);
});
