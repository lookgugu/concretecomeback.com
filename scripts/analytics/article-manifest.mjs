#!/usr/bin/env node
// Prints the published-article allowlist the GA4 scorecard aggregates over, as
// JSON on stdout. It reuses the newsletter's fail-closed frontmatter reader so
// both pipelines agree on what a published post is: one malformed post stops
// the run rather than silently dropping an article from the report.
//
// Only build metadata leaves this script — slug, title, author, tags, dates.
// Never the body.
//
// Usage: node scripts/analytics/article-manifest.mjs [--as-of YYYY-MM-DD] [--blog-dir DIR]

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPosts } from '../newsletter/content.mjs';
import { daysBetween, parseIsoDate } from '../newsletter/schedule.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export function buildManifest(posts, asOf) {
  if (asOf) parseIsoDate(asOf);
  return posts
    .filter((p) => !p.data.draft && (!asOf || daysBetween(asOf, p.data.pubDate) <= 0))
    .map((p) => ({
      slug: p.slug,
      title: p.data.title,
      author: p.data.author,
      tags: p.data.tags,
      pubDate: p.data.pubDate,
      updatedDate: p.data.updatedDate,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const blogDir = arg('--blog-dir') ?? path.join(here, '..', '..', 'src', 'content', 'blog');
    const manifest = buildManifest(loadPosts(blogDir), arg('--as-of'));
    process.stdout.write(`${JSON.stringify({ articles: manifest })}\n`);
  } catch (error) {
    process.stderr.write(`article-manifest: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}
