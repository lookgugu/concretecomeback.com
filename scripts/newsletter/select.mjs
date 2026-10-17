// Picks the lead and additional reads for a weekly issue and lifts excerpts
// out of the posts themselves.
//
// No text here is written by the generator. The lead excerpt is the post's own
// opening paragraph, the reads use the post's own reviewed `description`, and
// the weekend section quotes a practical section of a new, non-health post
// verbatim with a link back — so the newsletter can never carry advice, medical or
// otherwise, that has not already been through the content-safety gate on its
// way to main. When no post has a practical section, the section is left out.
//
// Scoring is a plain sum of capped components so a reviewer can see exactly
// why one post led instead of another (the manifest records each breakdown).

import { SITE_ORIGIN } from './content.mjs';
import { daysBetween } from './schedule.mjs';

export const MAX_READS = 3;
const DIVERSITY_PENALTY = 2; // per tag shared with a post already chosen
const LEAD_EXCERPT_MAX = 600;

export const HEALTH_TAGS = new Set([
  'health', 'health-benefits', 'injury-prevention', 'joints', 'joint-health', 'recovery', 'supplements',
  'nutrition', 'mental-health', 'arthritis', 'prehab', 'safety', 'cognitive-health', 'foot-care',
]);

// Headings that introduce something a reader can act on, strongest first.
// Matched, never generated.
const PRACTICAL_TIERS = [
  /\b(practical|try this|this weekend|getting started|first steps?|what to do|what actually breaks it|how to start)\b/i,
  /\b(what transfers|what this (?:actually )?(?:means|changes))\b/i,
];

const LINK = /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))*)\)/g;

export function safeHref(href) {
  if (typeof href !== 'string') return null;
  if (href.startsWith('/') && !href.startsWith('//')) {
    const u = new URL(href, SITE_ORIGIN);
    return u.origin === SITE_ORIGIN ? u.href : null;
  }
  if (!/^https?:\/\//i.test(href)) return null;
  let u;
  try { u = new URL(href); } catch { return null; }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || !u.hostname.includes('.')) return null;
  return u.href;
}

function stripEmphasis(s) {
  return s
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w])[*_]([^*_\n]+)[*_](?=[^\w]|$)/g, '$1$2');
}

export function inlineTokens(md) {
  const tokens = [];
  let last = 0;
  const text = (s) => { const t = stripEmphasis(s.replace(/\s+/g, ' ')); if (t) tokens.push({ type: 'text', text: t }); };
  for (const m of md.matchAll(LINK)) {
    text(md.slice(last, m.index));
    const href = safeHref(m[2]);
    const label = stripEmphasis(m[1]);
    tokens.push(href ? { type: 'link', text: label, href } : { type: 'text', text: label });
    last = m.index + m[0].length;
  }
  text(md.slice(last));
  return tokens;
}

export const plainText = (tokens) => tokens.map((t) => t.text).join('');

function blocks(md) {
  return md.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
}

const isProse = (b) => !/^(#|!\[|<|```|\||>|---|[-*+] |\d+\. |import |export )/.test(b);
const isList = (b) => /^([-*+]|\d+\.) /.test(b);

function citations(body) {
  const hosts = new Set();
  for (const m of body.matchAll(LINK)) {
    const href = safeHref(m[2]);
    if (href && !href.startsWith(`${SITE_ORIGIN}/`)) hosts.add(href);
  }
  return hosts.size;
}

function wordCount(body) {
  return body.replace(LINK, '$1').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

export function scorePost(post, { runDate }) {
  const age = daysBetween(post.data.pubDate, runDate);
  const breakdown = {
    recency: Math.max(0, 7 - age),
    featured: post.data.featured ? 5 : 0,
    depth: Math.min(5, Math.floor(wordCount(post.body) / 400)),
    citations: Math.min(5, citations(post.body)),
    hero: post.data.heroImage ? 1 : 0,
  };
  return { total: Object.values(breakdown).reduce((a, b) => a + b, 0), breakdown };
}

const byRank = (a, b) => b.score - a.score || b.post.data.pubDate.localeCompare(a.post.data.pubDate) || a.post.slug.localeCompare(b.post.slug);

export function pickIssue(posts, { runDate }) {
  const ranked = posts.map((post) => {
    const s = scorePost(post, { runDate });
    return { post, score: s.total, breakdown: s.breakdown };
  }).sort(byRank);
  if (!ranked.length) return { lead: null, reads: [], notSelected: [], ranking: [] };
  const [lead, ...rest] = ranked;
  lead.why = `Highest score ${lead.score} (${fmt(lead.breakdown)}).`;
  const chosenTags = new Set(lead.post.data.tags);
  const pool = [...rest];
  const reads = [];
  while (reads.length < MAX_READS && pool.length) {
    for (const c of pool) {
      c.shared = c.post.data.tags.filter((t) => chosenTags.has(t)).length;
      c.adjusted = c.score - DIVERSITY_PENALTY * c.shared;
    }
    pool.sort((a, b) => b.adjusted - a.adjusted || byRank(a, b));
    const next = pool.shift();
    next.why = `score ${next.score} (${fmt(next.breakdown)}) − ${DIVERSITY_PENALTY}×${next.shared} shared tag(s) = ${next.adjusted}.`;
    next.post.data.tags.forEach((t) => chosenTags.add(t));
    reads.push(next);
  }
  return {
    lead,
    reads,
    notSelected: pool.sort(byRank).map((c) => ({ slug: c.post.slug, score: c.score, reason: `Ranked below the ${MAX_READS} additional reads.` })),
    ranking: ranked.map((c) => ({ slug: c.post.slug, score: c.score, breakdown: c.breakdown })),
  };
}

function fmt(b) {
  return Object.entries(b).map(([k, v]) => `${k} ${v}`).join(', ');
}

export function leadExcerpt(post) {
  const para = blocks(post.body).find(isProse);
  if (!para) return [];
  const tokens = inlineTokens(para);
  if (plainText(tokens).length <= LEAD_EXCERPT_MAX) return tokens;
  // Cut on a sentence boundary without ever splitting a link.
  const out = [];
  let used = 0;
  for (const t of tokens) {
    if (used + t.text.length <= LEAD_EXCERPT_MAX) { out.push(t); used += t.text.length; continue; }
    if (t.type === 'text') {
      const room = t.text.slice(0, LEAD_EXCERPT_MAX - used);
      const end = Math.max(room.lastIndexOf('. '), room.lastIndexOf('? '), room.lastIndexOf('! '));
      if (end >= 0) out.push({ type: 'text', text: room.slice(0, end + 1) });
    }
    break;
  }
  // If the cut left a trailing fragment, drop back to the last whole sentence.
  while (out.length && !/[.?!]["”’)]?$/.test(out.at(-1).text.trimEnd())) {
    const last = out.at(-1);
    if (last.type === 'text') {
      const end = Math.max(last.text.lastIndexOf('. '), last.text.lastIndexOf('? '), last.text.lastIndexOf('! '));
      if (end >= 0) { last.text = last.text.slice(0, end + 1); break; }
    }
    out.pop();
  }
  return out;
}

// `posts` arrive in priority order (lead, reads, then the other new posts by
// rank). Health-tagged posts are skipped outright: dosing, injury or medical
// guidance quoted on its own loses the cautions the full post wraps around it,
// so it is never lifted into the weekend slot — those posts are still linked
// as reads, where the reader lands on the whole article.
export function findWeekendExcerpt(posts) {
  const eligible = posts.filter((p) => !p.data.tags.some((t) => HEALTH_TAGS.has(t)));
  for (const tier of PRACTICAL_TIERS) {
    for (const post of eligible) {
      for (const section of post.body.split(/^## +/m).slice(1)) {
        const [headingLine, ...restLines] = section.split('\n');
        const heading = headingLine.trim();
        if (!tier.test(heading)) continue;
        const block = blocks(restLines.join('\n')).find((b) => isProse(b) || isList(b));
        if (!block) continue;
        const source = { slug: post.slug, title: post.data.title, url: post.canonicalUrl };
        if (isList(block)) {
          const items = block.split(/\n(?=(?:[-*+]|\d+\.) )/).slice(0, 3)
            .map((item) => inlineTokens(item.replace(/^([-*+]|\d+\.) +/, '')));
          return { heading, tokens: null, items, source };
        }
        return { heading, tokens: inlineTokens(block), items: null, source };
      }
    }
  }
  return null;
}
