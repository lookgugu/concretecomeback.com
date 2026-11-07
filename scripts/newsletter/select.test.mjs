import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePost, pickIssue, findWeekendExcerpt, inlineTokens, leadExcerpt, plainText } from './select.mjs';

const mk = (slug, { pubDate = '2026-10-15', tags = ['motivation'], featured = false, heroImage = null, body = 'Intro.' } = {}) => ({
  slug, canonicalUrl: `https://concretecomeback.com/blog/${slug}/`,
  data: { title: slug, description: `${slug} description that is long enough to be valid here.`, pubDate, tags, featured, heroImage, author: 'A' },
  body,
});

const words = (n) => Array.from({ length: n }, () => 'word').join(' ');

test('scores are an explainable sum of fixed, capped components', () => {
  const body = `${words(1300)}\n\n[a](https://nih.gov/a) [b](https://nih.gov/a) [c](https://example.org/c) [d](/blog/x/) [e](http://example.net/e)`;
  const s = scorePost(mk('p', { pubDate: '2026-10-19', featured: true, heroImage: '/x.jpg', body }), { runDate: '2026-10-21' });
  assert.deepEqual(s.breakdown, { recency: 5, featured: 5, depth: 3, citations: 3, hero: 1 });
  assert.equal(s.total, 17);
  // Caps hold.
  const huge = scorePost(mk('q', { pubDate: '2026-10-21', body: `${words(9000)} ${Array.from({ length: 9 }, (_, i) => `[s](https://s${i}.org/)`).join(' ')}` }), { runDate: '2026-10-21' });
  assert.equal(huge.breakdown.depth, 5);
  assert.equal(huge.breakdown.citations, 5);
  assert.equal(huge.breakdown.recency, 7);
});

test('the lead is the top score; ties break by newer pubDate, then slug', () => {
  const a = mk('alpha', { pubDate: '2026-10-15' });
  const b = mk('bravo', { pubDate: '2026-10-16' });
  const c = mk('charlie', { pubDate: '2026-10-16' });
  const issue = pickIssue([a, c, b], { runDate: '2026-10-21' });
  assert.equal(issue.lead.post.slug, 'bravo');
  assert.deepEqual(issue.reads.map((r) => r.post.slug), ['charlie', 'alpha']);
});

test('additional reads cap at three and prefer topic diversity over a near-duplicate', () => {
  const lead = mk('lead', { featured: true, tags: ['injury', 'recovery'] });
  const sameTopic = mk('same-topic', { tags: ['injury', 'recovery'], pubDate: '2026-10-16' });
  const other1 = mk('other-one', { tags: ['community'] });
  const other2 = mk('other-two', { tags: ['gear'] });
  const other3 = mk('other-three', { tags: ['travel'] });
  const issue = pickIssue([lead, sameTopic, other1, other2, other3], { runDate: '2026-10-21' });
  assert.equal(issue.lead.post.slug, 'lead');
  assert.equal(issue.reads.length, 3);
  assert.ok(!issue.reads.some((r) => r.post.slug === 'same-topic'), 'near-duplicate topic should lose to diverse reads');
  for (const r of issue.reads) assert.match(r.why, /score \d+/);
  assert.deepEqual(issue.notSelected.map((r) => r.slug), ['same-topic']);
});

test('one eligible post makes a lead-only issue rather than padding with old content', () => {
  const issue = pickIssue([mk('only')], { runDate: '2026-10-21' });
  assert.equal(issue.lead.post.slug, 'only');
  assert.deepEqual(issue.reads, []);
});

test('selection is deterministic regardless of input order', () => {
  const posts = ['a', 'b', 'c', 'd', 'e'].map((s, i) => mk(`p-${s}`, { pubDate: `2026-10-1${i}`, tags: [s] }));
  const one = pickIssue(posts, { runDate: '2026-10-21' });
  const two = pickIssue([...posts].reverse(), { runDate: '2026-10-21' });
  assert.deepEqual(
    [one.lead.post.slug, ...one.reads.map((r) => r.post.slug)],
    [two.lead.post.slug, ...two.reads.map((r) => r.post.slug)],
  );
});

test('inline markdown keeps safe citations as absolute links and drops unsafe ones', () => {
  const tokens = inlineTokens('See [the study](https://pubmed.ncbi.nlm.nih.gov/1/), [our guide](/blog/how-to-fall/), [bad](javascript:alert(1)) and **bold** _it_.');
  assert.deepEqual(tokens, [
    { type: 'text', text: 'See ' },
    { type: 'link', text: 'the study', href: 'https://pubmed.ncbi.nlm.nih.gov/1/' },
    { type: 'text', text: ', ' },
    { type: 'link', text: 'our guide', href: 'https://concretecomeback.com/blog/how-to-fall/' },
    { type: 'text', text: ', ' },
    { type: 'text', text: 'bad' },
    { type: 'text', text: ' and bold it.' },
  ]);
  for (const href of ['//evil.example/x', 'data:text/html,x', 'https://u:p@evil.example/', 'vbscript:x']) {
    assert.equal(inlineTokens(`[x](${href})`)[0].type, 'text', href);
  }
});

test('the lead excerpt is the opening paragraph, cut on a sentence boundary', () => {
  const body = `![hero](/x.jpg)\n\n<div>html</div>\n\nOne sentence here. ${'Another long sentence follows here. '.repeat(30)}\n\n## Heading`;
  const tokens = leadExcerpt({ body });
  const text = plainText(tokens);
  assert.ok(text.startsWith('One sentence here.'));
  assert.ok(text.length <= 600);
  assert.match(text, /\.$/);
});

test('the weekend section quotes a practical section verbatim from a selected post', () => {
  const post = mk('plateau', { body: 'Intro.\n\n## Why it happens\n\nTheory.\n\n## What actually breaks it\n\nPick **one** trick and give it [three sessions](/blog/sessions/).\n\nMore.\n' });
  const w = findWeekendExcerpt([post]);
  assert.equal(w.heading, 'What actually breaks it');
  assert.equal(w.source.slug, 'plateau');
  assert.equal(plainText(w.tokens), 'Pick one trick and give it three sessions.');
});

test('a list in the practical section is quoted as up to three items', () => {
  const post = mk('basics', { body: '## The practical basics\n\n- First thing.\n- Second thing.\n- Third thing.\n- Fourth thing.\n' });
  const w = findWeekendExcerpt([post]);
  assert.deepEqual(w.items.map(plainText), ['First thing.', 'Second thing.', 'Third thing.']);
});

test('no practical section means no weekend section — nothing is invented', () => {
  assert.equal(findWeekendExcerpt([mk('story', { body: '## The first fifty years\n\nHistory.\n' })]), null);
});

test('health-tagged posts are never quoted in the weekend section, however practical the heading', () => {
  // Lifting dosing or injury guidance out of its post strips the safety context around it.
  const creatine = mk('creatine', { tags: ['supplements', 'health'], body: '## The practical basics\n\nA typical dose is 3 to 5 grams.\n' });
  assert.equal(findWeekendExcerpt([creatine]), null);
  const plateau = mk('plateau', { tags: ['training'], body: '## What actually breaks it\n\nIsolate the failing piece.\n' });
  assert.equal(findWeekendExcerpt([creatine, plateau]).source.slug, 'plateau');
});

test('a clearly actionable heading in a later post beats a softer one in an earlier post', () => {
  const viral = mk('viral', { body: '## What this actually changes at the park\n\nIt changes the anxiety.\n' });
  const plateau = mk('plateau', { body: '## What actually breaks it\n\nIsolate the failing piece.\n' });
  assert.equal(findWeekendExcerpt([viral, plateau]).source.slug, 'plateau');
  assert.equal(findWeekendExcerpt([viral]).source.slug, 'viral');
});
