#!/usr/bin/env node
// Post-build guard for where the server-rendered newsletter CTA
// (NewsletterInline.astro) appears, and that each copy still works without
// JavaScript. Unit tests cover the client script; only the built HTML shows
// which pages actually carry a form, under which `newsletter_source`, and
// whether two forms on one page ended up sharing element ids.
//
// The contract: exactly one inline CTA on the homepage (`home`), on every
// park/shop/group detail page (`directory`), on every blog post and on the
// no-JS retry page (`in_post`) — and none anywhere else, so a stray copy on a
// list page or a repeated one per card fails here rather than in review.
//
// Reads files only; never submits anything.
//
//   node scripts/check-newsletter-placement.mjs [distDir]

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = process.argv[2] ?? 'dist';

function* pages(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* pages(path);
    else if (entry.name === 'index.html') yield path;
  }
}

function routeOf(file) {
  const rel = relative(DIST, file).split(sep).slice(0, -1).join('/');
  return rel ? `/${rel}/` : '/';
}

function expectedSource(route) {
  if (route === '/') return 'home';
  if (/^\/directory\/(parks|shops|groups)\/.+\/$/.test(route)) return 'directory';
  // /blog/2/ is pagination, not a post.
  if (/^\/blog\/(?!\d+\/$)[^/]+\/$/.test(route)) return 'in_post';
  if (route === '/newsletter/error/') return 'in_post';
  return null;
}

const INLINE = /<aside\b[^>]*\bclass="[^"]*\bnewsletter-inline\b[^"]*"[^>]*>[\s\S]*?<\/aside>/g;

function checkInline(html) {
  const problems = [];
  const open = html.slice(0, html.indexOf('>') + 1);
  const source = open.match(/\bdata-newsletter-source="([^"]*)"/)?.[1] ?? null;
  const labelledBy = open.match(/\baria-labelledby="([^"]*)"/)?.[1];
  if (!labelledBy || !html.includes(`id="${labelledBy}"`)) problems.push('aria-labelledby points at no heading');
  // The no-JS path: a plain POST the function answers with a 303.
  const form = html.match(/<form\b[^>]*>/)?.[0] ?? '';
  if (!/\baction="\/api\/forms\/newsletter"/.test(form) || !/\bmethod="post"/.test(form)) {
    problems.push('form does not POST to /api/forms/newsletter');
  }
  if (/\bhidden\b/.test(form)) problems.push('form is hidden in the served HTML');
  const email = html.match(/<input\b[^>]*\bname="email"[^>]*>/)?.[0] ?? '';
  if (!/\btype="email"/.test(email) || !/\brequired\b/.test(email)) problems.push('email input missing or not required');
  const emailId = email.match(/\bid="([^"]*)"/)?.[1];
  if (!emailId || !html.includes(`for="${emailId}"`)) problems.push('email input has no label');
  if (!/<input\b[^>]*\bname="consent"[^>]*\bvalue="yes"/.test(html)) problems.push('consent field missing');
  if (!/<input\b[^>]*\bname="_gotcha"/.test(html)) problems.push('honeypot missing');
  if (!/<button\b[^>]*\btype="submit"/.test(html)) problems.push('submit button missing');
  if (!/\bdata-newsletter-status\b/.test(html)) problems.push('status region missing');
  return { source, problems };
}

const failures = [];
const counts = {};
let checked = 0;

for (const file of pages(DIST)) {
  const route = routeOf(file);
  const html = readFileSync(file, 'utf8');
  // `redirects` in astro.config.mjs emit meta-refresh stubs at old post URLs.
  const isRedirect = /<meta\b[^>]*http-equiv="refresh"/i.test(html);
  const expected = isRedirect ? null : expectedSource(route);
  const inlines = html.match(INLINE) ?? [];
  checked++;

  if (expected === null) {
    if (inlines.length) failures.push(`${route}: ${inlines.length} inline CTA(s), expected none`);
  } else if (inlines.length !== 1) {
    failures.push(`${route}: ${inlines.length} inline CTAs, expected exactly one (${expected})`);
  } else {
    const { source, problems } = checkInline(inlines[0]);
    if (source !== expected) failures.push(`${route}: newsletter_source "${source}", expected "${expected}"`);
    for (const problem of problems) failures.push(`${route}: ${problem}`);
    counts[expected] = (counts[expected] ?? 0) + 1;
  }

  // The popup and the inline CTA share a page; a shared id breaks label/for
  // and aria-labelledby on whichever renders second.
  const seen = new Set();
  for (const [, id] of html.matchAll(/\sid="([^"]+)"/g)) {
    if (seen.has(id)) failures.push(`${route}: duplicate id "${id}"`);
    seen.add(id);
  }
}

if (failures.length) {
  const shown = failures.slice(0, 40);
  console.error(`Newsletter placement check failed (${failures.length} problem(s)):`);
  for (const failure of shown) console.error(`  ${failure}`);
  if (failures.length > shown.length) console.error(`  … and ${failures.length - shown.length} more`);
  process.exit(1);
}

console.log(`Newsletter placement OK across ${checked} pages: ${JSON.stringify(counts)}`);
