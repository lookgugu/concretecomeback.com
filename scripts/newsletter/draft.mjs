// Builds one weekly newsletter draft: markdown, an HTML preview and a JSON
// issue manifest. It reads the repo, GETs the public blog pages it is about to
// feature, and writes four files to an output directory. It never sends,
// never calls Resend, never touches contacts and never writes to the sent
// ledger — a draft is not a send, so it cannot be what marks anything as sent.
//
// Order matters: every local input (sent ledger, every post's metadata, send
// requirements) is validated before the first network request, so malformed
// data fails closed without fetching anything, and draft/future/old/already-
// sent posts are filtered out before any URL is built for the live check.

import { renderLocalPreview } from './preview.mjs';
import { selectPhotos, PHOTO_ROOT } from './photos.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { loadPosts, newnessWindow, selectCandidates, SITE_ORIGIN } from './content.mjs';
import { loadSentHistory, SCHEMA_VERSION } from './ledger.mjs';
import { verifyAllLive } from './live.mjs';
import { findWeekendExcerpt, leadExcerpt, pickIssue } from './select.mjs';
import { renderHtml, renderMarkdown, renderNoIssueHtml, renderNoIssueMarkdown } from './render.mjs';
import { nextIssueDate, nyDate, nyWallClockToUtc, SEND_HOUR, TIME_ZONE } from './schedule.mjs';

const AUDIENCE_VERIFICATION = {
  code: 'audience-verification',
  message: 'An operator must verify the deployed signup effective segment (including any deployed NEWSLETTER_SEGMENT_ID override) and its currently subscribed, double-opt-in membership before every send. Secret-free draft CI and local environment values cannot verify deployed configuration. Never use account-wide contacts or re-add unsubscribed contacts.',
};

export const SEND_POLICY = 'Thursday 10:00 America/New_York, approval-gated. No automated sender exists; an operator sends manually after the approval checklist in docs/weekly-newsletter.md.';

export function loadSendRequirements(path) {
  let cfg;
  try { cfg = JSON.parse(readFileSync(path, 'utf8')); } catch { throw new Error(`${path}: send requirements are missing or not valid JSON`); }
  const allowed = new Set(['schemaVersion', 'physicalPostalAddress', 'preferenceCenterUrl', '$comment']);
  for (const k of Object.keys(cfg || {})) if (!allowed.has(k)) throw new Error(`${path}: unexpected key "${k}"`);
  if (cfg.schemaVersion !== 1) throw new Error(`${path}: schemaVersion must be 1`);
  const addr = cfg.physicalPostalAddress;
  if (addr !== null && (typeof addr !== 'string' || addr.trim().length < 10 || addr.length > 300 || /[<>\u0000-\u001f]/.test(addr))) {
    throw new Error(`${path}: physicalPostalAddress must be null or a 10–300 character postal address`);
  }
  const pref = cfg.preferenceCenterUrl;
  if (pref !== null) {
    let u;
    try { u = new URL(pref); } catch { throw new Error(`${path}: preferenceCenterUrl is not a URL`); }
    if (u.origin !== SITE_ORIGIN || u.username || u.password) throw new Error(`${path}: preferenceCenterUrl must be an https page on ${SITE_ORIGIN}`);
  }
  return { physicalPostalAddress: addr, preferenceCenterUrl: pref };
}

function assertOutsideLedger(outDir, ledgerDir) {
  const rel = relative(resolve(ledgerDir), resolve(outDir));
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new Error(`Refusing to write draft artifacts inside the sent ledger (${ledgerDir}) — a draft must never look like a sent record`);
  }
}

function sendBlockers({ requirements, weeklySent }) {
  const b = [
    AUDIENCE_VERIFICATION,
    { code: 'operator-approval', message: 'No send without an operator approving this exact manifest (issueId, source commit, item list) per docs/weekly-newsletter.md.' },
    { code: 'unsubscribe-verification', message: 'Confirm in a provider test send of this issue that the unsubscribe merge tag renders a working one-click unsubscribe (and List-Unsubscribe header).' },
  ];
  if (!requirements.physicalPostalAddress) {
    b.push({ code: 'physical-address', message: 'newsletter/send-requirements.json has no physicalPostalAddress; commercial email must carry a valid postal address.' });
  }
  if (!requirements.preferenceCenterUrl) {
    b.push({ code: 'preference-center', message: 'No preference page exists, so a subscriber who wanted the old monthly cadence has no option except unsubscribing. Build one or record the decision to ship unsubscribe-only.' });
  }
  if (!weeklySent) {
    b.push({ code: 'subscriber-transition', message: 'First weekly issue: send only to currently subscribed contacts in the operator-verified deployed signup segment, keep the monthly→weekly notice, and never re-add or reactivate anyone who unsubscribed.' });
  }
  return b;
}

function writeAll(outDir, files) {
  mkdirSync(outDir, { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(join(outDir, name), body);
}

export async function generateDraft({ blogDir, ledgerDir, outDir, sendRequirementsPath, now = new Date(), fetchImpl = globalThis.fetch, sourceCommit = null, blogTree = null, photoRoot = PHOTO_ROOT, testOnlyLocalImageVerification = false }) {
  if (!outDir) throw new Error('An output directory is required');
  assertOutsideLedger(outDir, ledgerDir);

  // 1. Local inputs, all validated before any request.
  const history = loadSentHistory(ledgerDir, { now });
  const posts = loadPosts(blogDir);
  const requirements = loadSendRequirements(sendRequirementsPath);

  const runDate = nyDate(now);
  const issueId = nextIssueDate(runDate);
  const plannedSendUtc = nyWallClockToUtc(issueId, SEND_HOUR, 0).toISOString();
  const window = newnessWindow({ runDate, lastSent: history.lastSent });
  const { eligible, excluded } = selectCandidates(posts, { window, runDate, sentCanonicals: history.sentCanonicals });
  const weeklySent = history.issues.some((i) => i.cadence === 'weekly');

  const base = {
    schemaVersion: SCHEMA_VERSION,
    kind: 'concretecomeback-weekly-issue',
    issueId,
    cadence: 'weekly',
    generatedAt: now.toISOString(),
    runDate,
    plannedSend: { localDate: issueId, localTime: `${String(SEND_HOUR).padStart(2, '0')}:00`, timeZone: TIME_ZONE, utc: plannedSendUtc, policy: SEND_POLICY },
    window: { start: window.start, end: window.end, timeZone: TIME_ZONE, policy: window.policy, staleSkipped: window.staleSkipped },
    audience: { status: 'unverified', segmentId: null, note: 'The deployed signup effective segment and currently subscribed, double-opt-in membership require operator verification. Neither the source fallback nor local NEWSLETTER_SEGMENT_ID is authoritative for deployment. Never use the account-wide contact list.' },
    source: { commit: sourceCommit, blogTree, origin: SITE_ORIGIN, sentIssuesInLedger: history.issues.length, lastSentIssue: history.lastSent?.issueId ?? null },
    sendable: false,
    excluded: excluded.filter((e) => e.reason !== 'outside-window' || e.pubDate >= window.start),
  };

  if (!eligible.length) {
    const reason = window.empty
      ? `The last sent issue (${history.lastSent.issueId}) already covers posts through ${window.end}.`
      : `No published, non-draft, non-future post dated ${window.start} → ${window.end} (America/New_York) that has not already been sent.`;
    const photoCheck = await selectPhotos([], { root: photoRoot, now });
    const manifest = { ...base, photography: { schemaVersion: 1, items: [], diagnostics: photoCheck.diagnostics }, status: 'no-eligible-posts', reason, items: [], weekend: null, liveChecks: [], sendBlockers: [AUDIENCE_VERIFICATION] };
    const report = { runDate, window, reason, excluded: base.excluded, staleSkipped: window.staleSkipped };
    writeAll(outDir, {
      'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
      'report.md': renderNoIssueMarkdown(report),
      'report.html': renderNoIssueHtml(report),
    });
    return { status: manifest.status, manifest };
  }

  // 2. Network: public GETs of the exact pages about to be featured. Any
  //    failure throws here, before anything is written.
  const liveChecks = await verifyAllLive(eligible, { fetchImpl });

  // 3. Selection and rendering — pure functions of the inputs above.
  const picked = pickIssue(eligible, { runDate });
  const chosen = [picked.lead, ...picked.reads];
  const bySlug = new Map(eligible.map((p) => [p.slug, p]));
  const priority = [...chosen.map((c) => c.post), ...picked.notSelected.map((n) => bySlug.get(n.slug))];
  const weekend = findWeekendExcerpt(priority);
  const weekendExtra = weekend && !chosen.some((c) => c.post.slug === weekend.source.slug)
    ? picked.ranking.find((r) => r.slug === weekend.source.slug) : null;
  const blockers = sendBlockers({ requirements, weeklySent });
  const reviewNotes = [];
  if (window.staleSkipped) reviewNotes.push(`Posts from ${window.staleSkipped.start} → ${window.staleSkipped.end} were not considered (lookback cap); decide deliberately whether to cover them.`);
  if (!weekend) reviewNotes.push('No new non-health post has a practical section, so the weekend section is omitted rather than written.');
  if (picked.reads.length < 2) reviewNotes.push(`Only ${picked.reads.length} additional read(s) qualified this week; nothing older was added to fill space.`);

  const photography = await selectPhotos(chosen, { root: photoRoot, now, fetchImpl, testOnlyLocalImageVerification });

  const issue = {
    issueId,
    plannedSendUtc,
    window,
    lead: {
      photo: photography.selected.get(picked.lead.post.slug),
      title: picked.lead.post.data.title,
      url: picked.lead.post.canonicalUrl,
      description: picked.lead.post.data.description,
      author: picked.lead.post.data.author,
      pubDate: picked.lead.post.data.pubDate,
      excerpt: leadExcerpt(picked.lead.post),
    },
    reads: picked.reads.map((r) => ({ photo: photography.selected.get(r.post.slug), title: r.post.data.title, url: r.post.canonicalUrl, description: r.post.data.description })),
    weekend,
    transitionNotice: !weeklySent,
    blockers,
    physicalAddress: requirements.physicalPostalAddress,
    preferenceCenterUrl: requirements.preferenceCenterUrl,
  };

  const preview = renderLocalPreview(issue, { root: photoRoot, now });
  const manifest = {
    ...base,
    localPreview: { file: 'preview-local.html', purpose: 'Local review only; not an email payload', images: preview.diagnostics },
    status: 'draft',
    photography: { schemaVersion: 1, diagnostics: photography.diagnostics, items: [...photography.selected].map(([slug, photo]) => ({ slug, ...photo })) },
    items: chosen.map((c, i) => ({
      role: i === 0 ? 'lead' : 'read',
      slug: c.post.slug,
      canonicalUrl: c.post.canonicalUrl,
      title: c.post.data.title,
      pubDate: c.post.data.pubDate,
      sha256: c.post.sha256,
      score: c.score,
      breakdown: c.breakdown,
      why: c.why,
    })).concat(weekendExtra ? [{
      role: 'weekend',
      slug: weekendExtra.slug,
      canonicalUrl: bySlug.get(weekendExtra.slug).canonicalUrl,
      title: bySlug.get(weekendExtra.slug).data.title,
      pubDate: bySlug.get(weekendExtra.slug).data.pubDate,
      sha256: bySlug.get(weekendExtra.slug).sha256,
      score: weekendExtra.score,
      breakdown: weekendExtra.breakdown,
      why: `Not a lead or read, but the highest-priority new non-health post with a practical section ("${weekend.heading}").`,
    }] : []),
    notSelected: picked.notSelected.filter((n) => n.slug !== weekendExtra?.slug),
    ranking: picked.ranking,
    weekend: weekend ? { sourceSlug: weekend.source.slug, heading: weekend.heading, policy: 'Verbatim quote of a practical section from a new, live, non-health post; never generated.' } : null,
    liveChecks,
    sendBlockers: blockers,
    reviewNotes,
  };

  writeAll(outDir, {
    'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'draft.md': renderMarkdown(issue),
    'draft.html': renderHtml(issue),
    'preview-local.html': preview.html,
  });
  return { status: manifest.status, manifest };
}
