// Calendar and schedule rules for the weekly newsletter, all in America/New_York.
//
// GitHub cron is UTC-only, so the Wednesday draft job is declared twice — once
// for each New York offset — and each run proceeds only when the offset it was
// written for is the one in force. The decision keys on the offset rather than
// the local hour so a scheduled job that GitHub starts hours late still runs on
// the right cron; DST changes on a Sunday, so a Wednesday run can never land on
// the wrong side of one.

export const TIME_ZONE = 'America/New_York';
export const CRON_EDT = '0 13 * * 3'; // 09:00 New York while on daylight time (UTC-4)
export const CRON_EST = '0 14 * * 3'; // 09:00 New York while on standard time (UTC-5)
const CRON_OFFSETS = { [CRON_EDT]: -240, [CRON_EST]: -300 };

// Thursday 10:00 New York — the send *policy*. Nothing in this repo sends.
export const SEND_WEEKDAY = 4;
export const SEND_HOUR = 10;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value) {
  const m = typeof value === 'string' ? ISO_DATE.exec(value) : null;
  if (!m) throw new Error(`Invalid date ${JSON.stringify(value)}: expected YYYY-MM-DD`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const check = new Date(t);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new Error(`Invalid date ${JSON.stringify(value)}: no such calendar day`);
  }
  return { y, mo, d, t };
}

export function addDays(isoDate, days) {
  const { t } = parseIsoDate(isoDate);
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

export function weekday(isoDate) {
  return new Date(parseIsoDate(isoDate).t).getUTCDay();
}

export function daysBetween(fromIso, toIso) {
  return Math.round((parseIsoDate(toIso).t - parseIsoDate(fromIso).t) / 86_400_000);
}

function assertInstant(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('Invalid instant');
}

export function nyOffsetMinutes(date) {
  assertInstant(date);
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' })
    .formatToParts(date).find((p) => p.type === 'timeZoneName')?.value;
  const m = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name || '');
  if (!m) throw new Error(`Could not read the ${TIME_ZONE} offset (${name})`);
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

export function nyDate(date) {
  assertInstant(date);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function nyWallClockToUtc(isoDate, hour, minute) {
  const { y, mo, d } = parseIsoDate(isoDate);
  const wall = Date.UTC(y, mo - 1, d, hour, minute);
  // Two passes settle the offset for any time that is not inside a DST gap;
  // the send hour (10:00) never is.
  let guess = wall - nyOffsetMinutes(new Date(wall)) * 60_000;
  guess = wall - nyOffsetMinutes(new Date(guess)) * 60_000;
  return new Date(guess);
}

export function nextIssueDate(runDate) {
  const gap = ((SEND_WEEKDAY - weekday(runDate) + 7) % 7) || 7;
  return addDays(runDate, gap);
}

export function scheduledRunDecision(cron, now) {
  if (!Object.hasOwn(CRON_OFFSETS, cron)) {
    throw new Error(`Unexpected schedule ${JSON.stringify(cron)} — refusing to guess which offset it targets`);
  }
  const offset = nyOffsetMinutes(now);
  const local = nyDate(now);
  if (weekday(local) !== 3) {
    return { run: false, reason: `It is ${local} in New York, no longer Wednesday; skipping the late run.` };
  }
  if (offset !== CRON_OFFSETS[cron]) {
    return { run: false, reason: `Cron ${cron} targets UTC${CRON_OFFSETS[cron] / 60}; New York is on UTC${offset / 60}. The other cron runs today.` };
  }
  return { run: true, reason: `Cron ${cron} matches New York's current offset (UTC${offset / 60}) on Wednesday ${local}.` };
}
