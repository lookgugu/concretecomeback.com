// Confirms each candidate post is actually live before it can go in a draft.
//
// The only URLs ever requested are https://concretecomeback.com/blog/<slug>/
// built from a repo filename that already passed SLUG_RE — never a URL read
// from content, a redirect target that leaves that page, or anything for a
// draft/future post (those are filtered out before this runs). Requests are
// plain GETs with redirects handled by hand so each hop is validated before it
// is followed.

import { canonicalUrl, normalizeCanonical, SITE_ORIGIN } from './content.mjs';

const MAX_REDIRECTS = 3;
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 15_000;
const USER_AGENT = 'concretecomeback-weekly-draft/1 (+https://concretecomeback.com)';

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|#39);/gi, (_, e) => {
    const k = e.toLowerCase();
    if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[k];
  });
}

const squash = (s) => s.replace(/\s+/g, ' ').trim();

function attr(tag, name) {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decodeEntities(m[1] ?? m[2]) : null;
}

function allowedHop(location, current, expected) {
  let next;
  try { next = new URL(location, current); } catch { return null; }
  const site = new URL(SITE_ORIGIN);
  const path = new URL(expected).pathname; // /blog/<slug>/
  if (next.protocol !== 'https:' || next.host !== site.host || next.username || next.password || next.search || next.hash) return null;
  if (next.pathname !== path && next.pathname !== path.slice(0, -1)) return null;
  return next.href;
}

export async function verifyLive(post, { fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const expected = canonicalUrl(post.slug);
  if (normalizeCanonical(post.canonicalUrl) !== expected) {
    throw new Error(`${post.slug}: stored canonical URL ${post.canonicalUrl} does not match its slug`);
  }
  let url = expected;
  let hops = 0;
  let res;
  for (;;) {
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { accept: 'text/html', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new Error(`${post.slug}: GET ${url} failed (${error.message})`);
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      const next = location ? allowedHop(location, url, expected) : null;
      if (!next) throw new Error(`${post.slug}: refused redirect from ${url} to ${JSON.stringify(location)}`);
      if (++hops > MAX_REDIRECTS) throw new Error(`${post.slug}: too many redirects`);
      url = next;
      continue;
    }
    break;
  }
  if (res.status !== 200) throw new Error(`${post.slug}: GET ${url} returned HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!/^text\/html\b/i.test(type)) throw new Error(`${post.slug}: unexpected content-type ${JSON.stringify(type)}`);
  if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) throw new Error(`${post.slug}: response too large`);
  const html = await res.text();
  if (html.length > MAX_BYTES) throw new Error(`${post.slug}: response too large`);

  const canonicalTag = /<link\b[^>]*\srel\s*=\s*["']canonical["'][^>]*>/i.exec(html)?.[0];
  const canonical = canonicalTag ? attr(canonicalTag, 'href') : null;
  if (canonical !== expected) {
    throw new Error(`${post.slug}: live canonical ${JSON.stringify(canonical)} is not ${expected}`);
  }
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (/^robots$/i.test(attr(tag, 'name') || '') && /noindex/i.test(attr(tag, 'content') || '')) {
      throw new Error(`${post.slug}: live page is noindex`);
    }
  }
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const liveTitle = h1 == null ? null : squash(decodeEntities(h1.replace(/<[^>]*>/g, '')));
  if (liveTitle !== squash(post.data.title)) {
    throw new Error(`${post.slug}: live title ${JSON.stringify(liveTitle)} does not match the repo title`);
  }
  return { slug: post.slug, requestedUrl: expected, finalUrl: url, status: res.status, hops, canonical, checkedAt: new Date().toISOString() };
}

export async function verifyAllLive(posts, options) {
  const evidence = [];
  const failures = [];
  for (const post of posts) {
    try { evidence.push(await verifyLive(post, options)); } catch (error) { failures.push(error.message); }
  }
  if (failures.length) {
    throw new Error(`Live check failed for ${failures.length} of ${posts.length} post(s) — no draft was produced:\n  ${failures.join('\n  ')}`);
  }
  return evidence;
}
