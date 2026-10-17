// Renders a weekly issue (or an honest "no issue") as Markdown and as an HTML
// preview. Every string from content is escaped; every href is re-validated
// here even though select.mjs already filtered it, so a renderer bug cannot
// reopen a javascript: or off-protocol link.

import { safeHref } from './select.mjs';

// Resend substitutes this per recipient at send time. It must be confirmed to
// produce a working one-click unsubscribe in a provider test send before any
// issue is approved — see docs/weekly-newsletter.md.
export const UNSUBSCRIBE_MERGE_TAG = '{{{RESEND_UNSUBSCRIBE_URL}}}';

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function escapeMarkdown(s) {
  return String(s).replace(/[\\`*_[\]()#|~]/g, '\\$&').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function href(url) {
  const safe = safeHref(url);
  if (!safe) throw new Error(`Refusing to render unsafe URL ${JSON.stringify(url)}`);
  return safe;
}

const mdTokens = (tokens) => tokens.map((t) => (t.type === 'link' && safeHref(t.href)
  ? `[${escapeMarkdown(t.text)}](${href(t.href)})`
  : escapeMarkdown(t.text))).join('');

const htmlTokens = (tokens) => tokens.map((t) => (t.type === 'link' && safeHref(t.href)
  ? `<a href="${escapeHtml(href(t.href))}">${escapeHtml(t.text)}</a>`
  : escapeHtml(t.text))).join('');

const TRANSITION = {
  text: 'You signed up for the Concrete Comeback roundup when it used to arrive monthly. It now comes weekly, with only that week\'s new posts. If weekly is more than you want, the unsubscribe link at the bottom takes you off the list in one click.',
};

function formatDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function renderMarkdown(issue) {
  const out = [];
  out.push(`<!-- DRAFT PREVIEW — not approved for sending. Planned send: ${issue.plannedSendUtc} (Thursday 10:00 America/New_York), approval-gated. -->`);
  out.push('', `# Concrete Comeback — weekly roundup, ${escapeMarkdown(formatDate(issue.issueId))}`, '');
  if (issue.blockers?.length) {
    out.push('> **Send blockers (draft only — remove this block before any send):**');
    for (const b of issue.blockers) out.push(`> - \`${b.code}\`: ${escapeMarkdown(b.message)}`);
    out.push('');
  }
  if (issue.transitionNotice) out.push(`_${escapeMarkdown(TRANSITION.text)}_`, '');

  const { lead } = issue;
  out.push('## This week\'s lead', '');
  out.push(`### [${escapeMarkdown(lead.title)}](${href(lead.url)})`, '');
  out.push(`${escapeMarkdown(lead.description)}`, '');
  if (lead.excerpt?.length) out.push(`> ${mdTokens(lead.excerpt)}`, '');
  out.push(`[Read the full post](${href(lead.url)}) · by ${escapeMarkdown(lead.author)}`, '');

  if (issue.reads.length) {
    out.push('## Also worth your time', '');
    for (const r of issue.reads) out.push(`- **[${escapeMarkdown(r.title)}](${href(r.url)})** — ${escapeMarkdown(r.description)}`);
    out.push('');
  }

  if (issue.weekend) {
    const w = issue.weekend;
    out.push('## For your weekend session', '');
    out.push(`From [${escapeMarkdown(w.source.title)}](${href(w.source.url)}), "${escapeMarkdown(w.heading)}":`, '');
    if (w.items) for (const item of w.items) out.push(`> - ${mdTokens(item)}`);
    else out.push(`> ${mdTokens(w.tokens)}`);
    out.push('', `The full post has the context behind it: [${escapeMarkdown(w.source.title)}](${href(w.source.url)}).`, '');
  }

  out.push('---', '');
  out.push('You are receiving this because you confirmed a subscription at concretecomeback.com.', '');
  out.push(`Unsubscribe: ${UNSUBSCRIBE_MERGE_TAG} (provider merge tag — verify it in a test send)`, '');
  out.push(issue.physicalAddress
    ? escapeMarkdown(issue.physicalAddress)
    : '**BLOCKER: physical postal address required before sending (CAN-SPAM).**');
  out.push('');
  return out.join('\n');
}

const STYLE = {
  body: 'margin:0;padding:24px;background:#f4f4f2;font-family:Georgia,serif;color:#1f1f1d;',
  card: 'max-width:600px;margin:0 auto;background:#ffffff;padding:28px;border-radius:8px;',
  banner: 'max-width:600px;margin:0 auto 16px;padding:12px 16px;background:#fff4e5;border:2px dashed #c2410c;font-family:Arial,sans-serif;font-size:13px;',
  h1: 'font-size:24px;margin:0 0 16px;',
  h2: 'font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#c2410c;margin:28px 0 8px;font-family:Arial,sans-serif;',
  h3: 'font-size:22px;margin:0 0 8px;',
  quote: 'margin:12px 0;padding:0 0 0 14px;border-left:3px solid #d6d3d1;color:#44403c;',
  a: 'color:#c2410c;',
  foot: 'max-width:600px;margin:16px auto 0;font-family:Arial,sans-serif;font-size:12px;color:#57534e;',
};

export function renderHtml(issue) {
  const { lead } = issue;
  const parts = [];
  parts.push('<!DOCTYPE html>', '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(`Concrete Comeback weekly — ${issue.issueId} (draft preview)`)}</title>`,
    '<meta name="robots" content="noindex, nofollow"></head>', `<body style="${STYLE.body}">`);
  parts.push(`<div style="${STYLE.banner}"><strong>DRAFT PREVIEW — not approved for sending.</strong> Planned send ${escapeHtml(issue.plannedSendUtc)} (Thursday 10:00 America/New_York), approval-gated. Nothing in this repository sends email.`);
  if (issue.blockers?.length) {
    parts.push('<ul>', ...issue.blockers.map((b) => `<li><code>${escapeHtml(b.code)}</code>: ${escapeHtml(b.message)}</li>`), '</ul>');
  }
  parts.push('</div>');
  parts.push(`<div style="${STYLE.card}">`);
  parts.push(`<h1 style="${STYLE.h1}">Concrete Comeback — weekly roundup, ${escapeHtml(formatDate(issue.issueId))}</h1>`);
  if (issue.transitionNotice) parts.push(`<p><em>${escapeHtml(TRANSITION.text)}</em></p>`);
  parts.push(`<h2 style="${STYLE.h2}">This week's lead</h2>`);
  parts.push(`<h3 style="${STYLE.h3}"><a style="${STYLE.a}" href="${escapeHtml(href(lead.url))}">${escapeHtml(lead.title)}</a></h3>`);
  parts.push(`<p>${escapeHtml(lead.description)}</p>`);
  if (lead.excerpt?.length) parts.push(`<blockquote style="${STYLE.quote}">${htmlTokens(lead.excerpt)}</blockquote>`);
  parts.push(`<p><a style="${STYLE.a}" href="${escapeHtml(href(lead.url))}">Read the full post</a> · by ${escapeHtml(lead.author)}</p>`);
  if (issue.reads.length) {
    parts.push(`<h2 style="${STYLE.h2}">Also worth your time</h2>`, '<ul>');
    for (const r of issue.reads) {
      parts.push(`<li style="margin-bottom:10px;"><a style="${STYLE.a}" href="${escapeHtml(href(r.url))}"><strong>${escapeHtml(r.title)}</strong></a> — ${escapeHtml(r.description)}</li>`);
    }
    parts.push('</ul>');
  }
  if (issue.weekend) {
    const w = issue.weekend;
    const src = `<a style="${STYLE.a}" href="${escapeHtml(href(w.source.url))}">${escapeHtml(w.source.title)}</a>`;
    parts.push(`<h2 style="${STYLE.h2}">For your weekend session</h2>`);
    parts.push(`<p>From ${src}, “${escapeHtml(w.heading)}”:</p>`);
    parts.push(w.items
      ? `<blockquote style="${STYLE.quote}"><ul>${w.items.map((i) => `<li>${htmlTokens(i)}</li>`).join('')}</ul></blockquote>`
      : `<blockquote style="${STYLE.quote}">${htmlTokens(w.tokens)}</blockquote>`);
    parts.push(`<p>The full post has the context behind it: ${src}.</p>`);
  }
  parts.push('</div>');
  parts.push(`<div style="${STYLE.foot}"><p>You are receiving this because you confirmed a subscription at concretecomeback.com.</p>`);
  parts.push(`<p>Unsubscribe: <code>${escapeHtml(UNSUBSCRIBE_MERGE_TAG)}</code> (provider merge tag — verify it in a test send)</p>`);
  parts.push(issue.physicalAddress
    ? `<p>${escapeHtml(issue.physicalAddress)}</p>`
    : '<p><strong>BLOCKER: physical postal address required before sending (CAN-SPAM).</strong></p>');
  parts.push('</div></body></html>', '');
  return parts.join('\n');
}

function excludedLines(report) {
  return (report.excluded || []).map((e) => `${e.slug} (${e.pubDate}): ${e.reason}`);
}

export function renderNoIssueMarkdown(report) {
  const out = [`# No issue this week (run ${report.runDate})`, '', escapeMarkdown(report.reason), ''];
  out.push(`Newness window: ${report.window.start} → ${report.window.end} (America/New_York).`, '');
  if (report.staleSkipped) out.push(`Not reached back for: ${report.staleSkipped.start} → ${report.staleSkipped.end} (older than the lookback cap).`, '');
  const lines = excludedLines(report).filter((l) => !/: outside-window$/.test(l));
  if (lines.length) out.push('Posts considered and excluded:', '', ...lines.map((l) => `- ${escapeMarkdown(l)}`), '');
  out.push('Nothing was padded with older posts. No email is sent either way.', '');
  return out.join('\n');
}

export function renderNoIssueHtml(report) {
  const lines = excludedLines(report).filter((l) => !/: outside-window$/.test(l));
  return [
    '<!DOCTYPE html>', '<html lang="en"><head><meta charset="utf-8"><title>No issue this week</title><meta name="robots" content="noindex, nofollow"></head>',
    `<body style="${STYLE.body}"><div style="${STYLE.card}">`,
    `<h1 style="${STYLE.h1}">No issue this week (run ${escapeHtml(report.runDate)})</h1>`,
    `<p>${escapeHtml(report.reason)}</p>`,
    `<p>Newness window: ${escapeHtml(report.window.start)} → ${escapeHtml(report.window.end)} (America/New_York).</p>`,
    report.staleSkipped ? `<p>Not reached back for: ${escapeHtml(report.staleSkipped.start)} → ${escapeHtml(report.staleSkipped.end)}.</p>` : '',
    lines.length ? `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : '',
    '<p>Nothing was padded with older posts. No email is sent either way.</p>',
    '</div></body></html>', '',
  ].join('\n');
}
