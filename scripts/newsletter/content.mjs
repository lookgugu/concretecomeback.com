// Reads blog posts from the repo for the weekly newsletter draft and decides
// which ones are new enough to include.
//
// Everything here fails closed. A post whose metadata cannot be read with
// certainty might be a draft or future-dated, so one malformed file stops the
// run instead of being skipped — a skipped file is invisible, a stopped run is
// not. The frontmatter reader is deliberately narrower than YAML: it accepts
// exactly the shapes this corpus uses and rejects the rest.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { addDays, daysBetween, parseIsoDate } from './schedule.mjs';

export const SITE_ORIGIN = 'https://concretecomeback.com';
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const BOOTSTRAP_DAYS = 7;
export const MAX_LOOKBACK_DAYS = 14;

const KEY_LINE = /^([A-Za-z][A-Za-z0-9_]*):(?:[ \t]+(.*))?$/;

function parseScalar(raw, where) {
  const v = raw.trim();
  if (v.startsWith('"')) {
    try {
      const out = JSON.parse(v);
      if (typeof out === 'string') return out;
    } catch { /* fall through */ }
    throw new Error(`${where}: unreadable double-quoted value`);
  }
  if (v.startsWith("'")) {
    const m = /^'((?:[^']|'')*)'$/.exec(v);
    if (!m) throw new Error(`${where}: unreadable single-quoted value`);
    return m[1].replace(/''/g, "'");
  }
  if (v.startsWith('[')) {
    let out;
    try { out = JSON.parse(v); } catch { throw new Error(`${where}: unreadable inline list`); }
    if (!Array.isArray(out) || !out.every((x) => typeof x === 'string')) throw new Error(`${where}: list must hold strings`);
    return out;
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (!v || /^[&*!|>%@`{#-]/.test(v) || /:\s|\s#/.test(v)) throw new Error(`${where}: value needs quoting`);
  return v;
}

export function parseFrontmatter(source, file) {
  const lines = source.replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0] !== '---') throw new Error(`${file}: missing opening frontmatter fence`);
  const close = lines.indexOf('---', 1);
  if (close === -1) throw new Error(`${file}: missing closing frontmatter fence`);
  const data = {};
  for (let i = 1; i < close; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const m = KEY_LINE.exec(line);
    if (!m || m[2] === undefined || !m[2].trim()) {
      throw new Error(`${file}:${i + 1}: unsupported frontmatter line (only one-line "key: value" entries are read)`);
    }
    if (Object.hasOwn(data, m[1])) throw new Error(`${file}:${i + 1}: duplicate key "${m[1]}"`);
    data[m[1]] = parseScalar(m[2], `${file}:${i + 1} (${m[1]})`);
  }
  return { data, body: lines.slice(close + 1).join('\n') };
}

function validate(data, file) {
  const fail = (msg) => { throw new Error(`${file}: ${msg}`); };
  const str = (k, min, max) => {
    const v = data[k];
    if (typeof v !== 'string' || v.length < min || v.length > max) fail(`"${k}" must be a string of ${min}–${max} characters`);
    return v;
  };
  const date = (k) => {
    try { parseIsoDate(data[k]); } catch (e) { fail(`"${k}": ${e.message}`); }
    return data[k];
  };
  const bool = (k) => {
    if (data[k] === undefined) return false;
    if (typeof data[k] !== 'boolean') fail(`"${k}" must be true or false`);
    return data[k];
  };
  const tags = data.tags;
  if (!Array.isArray(tags) || tags.length < 1 || tags.length > 8) fail('"tags" must list 1–8 tags');
  if (data.heroImage !== undefined && typeof data.heroImage !== 'string') fail('"heroImage" must be a string');
  return {
    title: str('title', 1, 80),
    description: str('description', 50, 165),
    pubDate: date('pubDate'),
    updatedDate: data.updatedDate === undefined ? null : date('updatedDate'),
    author: str('author', 1, 200),
    tags: tags.map((t) => t.toLowerCase()),
    draft: bool('draft'),
    featured: bool('featured'),
    heroImage: data.heroImage ?? null,
  };
}

export function canonicalUrl(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) throw new Error(`Unsafe slug ${JSON.stringify(slug)}`);
  return `${SITE_ORIGIN}/blog/${slug}/`;
}

// The one gate every newsletter URL passes: the fixed origin over https, the
// /blog/<slug>/ shape and nothing else — no credentials, port, query or hash.
export function normalizeCanonical(value) {
  let u;
  try { u = new URL(value); } catch { throw new Error(`Invalid canonical URL ${JSON.stringify(value)}`); }
  const origin = new URL(SITE_ORIGIN);
  if (u.protocol !== 'https:' || u.host !== origin.host || u.username || u.password || u.search || u.hash) {
    throw new Error(`Off-site or decorated canonical URL ${JSON.stringify(value)}`);
  }
  const m = /^\/blog\/([^/]+)\/?$/.exec(u.pathname);
  if (!m || !SLUG_RE.test(m[1])) throw new Error(`Canonical URL is not a blog post: ${JSON.stringify(value)}`);
  return canonicalUrl(m[1]);
}

export function loadPosts(blogDir) {
  const files = readdirSync(blogDir).filter((f) => ['.md', '.mdx'].includes(extname(f))).sort();
  const seen = new Map();
  const posts = files.map((name) => {
    const slug = basename(name, extname(name));
    if (!SLUG_RE.test(slug)) throw new Error(`${name}: filename is not a safe slug`);
    const source = readFileSync(join(blogDir, name), 'utf8');
    const { data, body } = parseFrontmatter(source, name);
    const post = {
      slug,
      file: name,
      canonicalUrl: canonicalUrl(slug),
      data: validate(data, name),
      body,
      sha256: createHash('sha256').update(source).digest('hex'),
    };
    if (seen.has(post.canonicalUrl)) {
      throw new Error(`${seen.get(post.canonicalUrl)} and ${name} resolve to the same canonical URL ${post.canonicalUrl}`);
    }
    seen.set(post.canonicalUrl, name);
    return post;
  });
  return posts;
}

// Newness policy: a post is new if it was published after the last *sent*
// issue's window closed. With no sent history (bootstrap) the window is the
// seven days ending on the run date. Either way it never reaches back more
// than MAX_LOOKBACK_DAYS — a missed week reports the gap instead of quietly
// padding an issue with old posts.
export function newnessWindow({ runDate, lastSent }) {
  parseIsoDate(runDate);
  const floor = addDays(runDate, -(MAX_LOOKBACK_DAYS - 1));
  if (!lastSent) {
    return { start: addDays(runDate, -(BOOTSTRAP_DAYS - 1)), end: runDate, policy: 'bootstrap-rolling-7-days', staleSkipped: null };
  }
  const since = addDays(lastSent.window.end, 1);
  if (daysBetween(since, runDate) < 0) {
    return { start: since, end: runDate, policy: 'since-last-sent', staleSkipped: null, empty: true };
  }
  if (daysBetween(since, floor) > 0) {
    return { start: floor, end: runDate, policy: 'since-last-sent-capped', staleSkipped: { start: since, end: addDays(floor, -1) } };
  }
  return { start: since, end: runDate, policy: 'since-last-sent', staleSkipped: null };
}

export function selectCandidates(posts, { window, runDate, sentCanonicals }) {
  const eligible = [];
  const excluded = [];
  for (const post of [...posts].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const { pubDate, draft } = post.data;
    let reason = null;
    if (draft) reason = 'draft';
    else if (daysBetween(runDate, pubDate) > 0) reason = 'future';
    else if (window.empty || daysBetween(window.start, pubDate) < 0 || daysBetween(pubDate, window.end) < 0) reason = 'outside-window';
    else if (sentCanonicals.has(post.canonicalUrl)) reason = 'already-sent';
    if (reason) excluded.push({ slug: post.slug, pubDate, reason });
    else eligible.push(post);
  }
  return { eligible, excluded };
}
