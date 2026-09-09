#!/usr/bin/env node
// Guards against the blog generator republishing topics it has already covered.
// It has no memory between runs: on 2026-08-19 it recreated
// how-to-fall-without-breaking-your-wrist.md, a slug it had published on 08-14,
// which surfaced only as a merge conflict. Four "how to fall" posts and two
// near-identical 10-minute warm-ups reached main before anyone noticed.
//
// Only posts ADDED by the branch are checked. The existing corpus already
// contains duplicates; failing on those would make every PR red and the check
// would be switched off within a week.
//
//   node scripts/check-duplicate-posts.mjs [--base <ref>] [--audit]

import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { basename, join } from 'node:path';

const DIR = 'src/content/blog';

// Words too common in this niche to signal a duplicate topic on their own.
const NOISE = new Set([
  'how', 'to', 'the', 'a', 'an', 'for', 'of', 'on', 'at', 'in', 'and', 'or', 'is',
  'it', 'its', 'your', 'you', 'what', 'why', 'that', 'this', 'with', 'without',
  'after', 'before', 'when', 'can', 'do', 'does', 'should', 'need', 'needs',
  'best', 'guide', 'real', 'still', 'first', 'every', 'my', 'me', 'we', 'us',
  'adult', 'adults', 'skater', 'skaters', 'skate', 'skating', 'skateboard',
  'skateboarding', 'skatepark', 'over', 'under', 'plan', 'tips',
  '20', '30', '40', '45', '50', '2025', '2026', '2027',
]);

const tokens = (s) =>
  new Set(
    s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/)
      .filter((t) => t && !NOISE.has(t))
  );

const jaccard = (a, b) => {
  const inter = [...a].filter((t) => b.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
};

const titleOf = (file) => {
  const m = readFileSync(file, 'utf8').match(/^title:\s*["']?(.+?)["']?\s*$/m);
  return m ? m[1] : basename(file, '.md');
};

const args = process.argv.slice(2);
const audit = args.includes('--audit');
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'origin/main';

const all = readdirSync(DIR).filter((f) => f.endsWith('.md')).map((f) => ({
  slug: basename(f, '.md'),
  file: join(DIR, f),
  get title() { return titleOf(this.file); },
}));

if (audit) {
  // Report overlapping clusters across the whole corpus, without failing.
  const seen = new Set();
  let clusters = 0;
  for (const p of all) {
    if (seen.has(p.slug)) continue;
    const group = all.filter(
      (q) => q.slug !== p.slug && !seen.has(q.slug) &&
        (jaccard(tokens(p.slug), tokens(q.slug)) >= 0.34 ||
         jaccard(tokens(p.title), tokens(q.title)) >= 0.34)
    );
    if (group.length) {
      clusters++;
      console.log(`\ncluster ${clusters}:`);
      for (const q of [p, ...group]) { console.log(`  ${q.slug}`); seen.add(q.slug); }
      seen.add(p.slug);
    }
  }
  console.log(clusters ? `\n${clusters} overlapping cluster(s).` : 'No overlapping clusters.');
  process.exit(0);
}

let added = [], modified = [];
try {
  const run = (filter) => execSync(
    `git diff --name-only --diff-filter=${filter} ${base}...HEAD -- ${DIR}`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  ).split('\n').filter((f) => f.endsWith('.md'));
  added = run('A');
  modified = run('M');
} catch {
  console.error(`Could not diff against ${base}. Failing closed.`);
  process.exit(1);
}

if (!added.length && !modified.length) {
  console.log('No blog posts added or changed by this branch — nothing to check.');
  process.exit(0);
}

// Posts that existed before this branch.
const existingSlugs = new Set(
  execSync(`git ls-tree -r --name-only ${base} -- ${DIR}`, { encoding: 'utf8' })
    .split('\n').filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md'))
);

const titleAtBase = (file) => {
  try {
    const raw = execSync(`git show ${base}:${file}`, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    const m = raw.match(/^title:\s*["']?(.+?)["']?\s*$/m);
    return m ? m[1] : null;
  } catch { return null; }
};

let errors = 0, warnings = 0;

for (const file of added) {
  const slug = basename(file, '.md');
  const title = titleOf(file);
  console.log(`\nchecking: ${slug}`);

  if (existingSlugs.has(slug)) {
    console.error(`  ERROR: slug already published — this overwrites an existing post.`);
    errors++;
    continue;
  }

  for (const other of all) {
    if (other.slug === slug || !existingSlugs.has(other.slug)) continue;
    const st = jaccard(tokens(slug), tokens(other.slug));
    const tt = jaccard(tokens(title), tokens(other.title));
    if (st >= 0.5 || tt >= 0.5) {
      console.error(`  ERROR: near-duplicate of ${other.slug} (slug ${st.toFixed(2)}, title ${tt.toFixed(2)})`);
      errors++;
    } else if (st >= 0.34 || tt >= 0.34) {
      console.log(`  WARNING: overlaps ${other.slug} (slug ${st.toFixed(2)}, title ${tt.toFixed(2)})`);
      warnings++;
    }
  }
  if (!errors && !warnings) console.log('  ok');
}

// A same-slug rewrite is how the generator silently replaces a published article:
// it reuses the filename with an entirely different piece. Editing a post is fine;
// swapping it for a different article under the same URL is not.
for (const file of modified) {
  const slug = basename(file, '.md');
  const before = titleAtBase(file);
  const after = titleOf(file);
  if (!before) continue;
  const sim = jaccard(tokens(before), tokens(after));
  if (sim < 0.34) {
    console.log(`\nchecking: ${slug} (modified)`);
    console.error(`  ERROR: title replaced under an existing slug — this overwrites a published post.`);
    console.error(`    was: ${before}`);
    console.error(`    now: ${after}`);
    errors++;
  }
}

console.log(`\n${errors} error(s), ${warnings} warning(s).`);
if (errors) {
  console.error('\nA post here duplicates one already published. Competing pages split their own');
  console.error('ranking signals, so consolidating into one stronger post beats publishing both.');
  console.error('Either retitle and re-scope the new post, or update the existing one instead.');
  process.exit(1);
}
