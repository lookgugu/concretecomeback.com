import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, renderHtml, escapeHtml, escapeMarkdown, renderNoIssueMarkdown, renderNoIssueHtml } from './render.mjs';

const EVIL = `<script>alert("x")</script> & 'q' [link](javascript:alert(1))`;

function issue(overrides = {}) {
  return {
    issueId: '2026-10-22',
    plannedSendUtc: '2026-10-22T14:00:00.000Z',
    window: { start: '2026-10-15', end: '2026-10-21' },
    lead: {
      title: EVIL, url: 'https://concretecomeback.com/blog/lead/', description: EVIL, author: EVIL, pubDate: '2026-10-20',
      excerpt: [{ type: 'text', text: EVIL }, { type: 'link', text: 'study', href: 'https://example.org/a?b=1&c="2"' }],
    },
    reads: [{ title: 'Read <one>', url: 'https://concretecomeback.com/blog/read-one/', description: 'Desc & more' }],
    weekend: {
      heading: 'What <actually> breaks it', tokens: [{ type: 'text', text: 'Do one thing.' }], items: null,
      source: { title: 'Plateau & co', url: 'https://concretecomeback.com/blog/plateau/' },
    },
    transitionNotice: true,
    blockers: [{ code: 'operator-approval', message: 'Needs <approval>' }],
    physicalAddress: null,
    ...overrides,
  };
}

test('escapeHtml covers the five significant characters', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('escapeMarkdown neutralises link, emphasis and HTML syntax', () => {
  assert.equal(escapeMarkdown('[x](y) *b* <i> `c`'), '\\[x\\]\\(y\\) \\*b\\* &lt;i&gt; \\`c\\`');
});

test('the HTML preview escapes all content and never emits a script or javascript: URL', () => {
  const html = renderHtml(issue());
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &#39;q&#39;/);
  assert.match(html, /href="https:\/\/example\.org\/a\?b=1&amp;c=%222%22"/);
  assert.match(html, /What &lt;actually&gt; breaks it/);
  assert.match(html, /DRAFT PREVIEW/);
  assert.match(html, /Needs &lt;approval&gt;/);
});

test('the markdown draft escapes titles and keeps citations as links', () => {
  const md = renderMarkdown(issue());
  assert.match(md, /\\\[link\\\]\\\(javascript:alert\\\(1\\\)\\\)/);
  assert.doesNotMatch(md, /<script>/);
  assert.match(md, /\[study\]\(https:\/\/example\.org\/a\?b=1&c=%222%22\)/);
  assert.match(md, /\[Read &lt;one&gt;\]\(https:\/\/concretecomeback\.com\/blog\/read-one\/\)/);
});

test('HTML links use https except the exact native unsubscribe merge tag', () => {
  const html = renderHtml(issue());
  for (const [, href] of html.matchAll(/href="([^"]*)"/g)) {
    if (href === '{{{RESEND_UNSUBSCRIBE_URL}}}') continue;
    assert.match(href, /^https:\/\//, href);
  }
});

test('the first weekly issue explains the cadence change and offers the way out', () => {
  const md = renderMarkdown(issue());
  assert.match(md, /monthly/i);
  assert.match(md, /weekly/i);
  assert.match(md, /unsubscribe/i);
  assert.doesNotMatch(renderMarkdown(issue({ transitionNotice: false })), /used to arrive monthly/i);
});

test('a missing physical address renders as a visible blocker, never a made-up address', () => {
  const html = renderHtml(issue());
  assert.match(html, /BLOCKER: physical postal address/i);
  assert.match(renderHtml(issue({ physicalAddress: '1 Example St, Town, ST 00000' })), /1 Example St, Town, ST 00000/);
});

test('the unsubscribe link is the provider merge tag, flagged for verification', () => {
  const md = renderMarkdown(issue());
  const html = renderHtml(issue());
  assert.ok(md.includes('[Unsubscribe]({{{RESEND_UNSUBSCRIBE_URL}}})'));
  assert.ok(html.includes('href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a>'));
  assert.doesNotMatch(html, /<code>\{\{\{RESEND_UNSUBSCRIBE_URL/);
  for (const rendered of [md, html]) {
    assert.match(rendered, /provider merge tag — verify it in a test send/);
    assert.match(rendered, /DRAFT PREVIEW — not approved for sending/);
  }
});

test('no lead/reads and no weekend section render without empty headings', () => {
  const md = renderMarkdown(issue({ reads: [], weekend: null }));
  assert.doesNotMatch(md, /## Also worth your time/);
  assert.doesNotMatch(md, /## For your weekend session/);
});

test('the no-issue report is honest about why', () => {
  const report = { runDate: '2026-10-21', window: { start: '2026-10-15', end: '2026-10-21' }, reason: 'No new <posts>', excluded: [{ slug: 'x', reason: 'draft', pubDate: '2026-10-20' }], staleSkipped: null };
  const md = renderNoIssueMarkdown(report);
  assert.match(md, /No issue this week/);
  assert.match(md, /x.*draft/);
  assert.match(renderNoIssueHtml(report), /No new &lt;posts&gt;/);
});

test('preference footer safely escapes URL syntax in Markdown and HTML', () => {
  const preferenceCenterUrl = `https://concretecomeback.com/preferences/)?x=<&y="quote"&z='single'`;
  const md = renderMarkdown(issue({ preferenceCenterUrl })).split('---').at(-1);
  assert.ok(md.includes('[Manage preferences](https://concretecomeback.com/preferences/%29?x=%3C&y=%22quote%22&z=%27single%27)'));
  const html = renderHtml(issue({ preferenceCenterUrl })).split('You are receiving this')[1];
  assert.ok(html.includes('href="https://concretecomeback.com/preferences/)?x=%3C&amp;y=%22quote%22&amp;z=%27single%27"'));
  assert.doesNotMatch(html, /<script|onclick=/);
});

test('preference footers reject unsafe protocols', () => {
  for (const render of [renderMarkdown, renderHtml]) {
    assert.throws(() => render(issue({ preferenceCenterUrl: 'javascript:alert(1)' })), /unsafe URL/);
  }
});
