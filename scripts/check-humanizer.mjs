#!/usr/bin/env node
/**
 * Humanizer prose linter for Concrete Comeback blog posts.
 * Based on https://github.com/blader/humanizer (v4.0.0) and docs/AUTHOR-VOICES.md.
 *
 * Usage:
 *   node scripts/check-humanizer.mjs [files...]
 *   (If no files are passed, checks blog posts changed vs origin/main.)
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const PATTERNS = [
  // §8 Dashes
  {
    id: '§8-em-or-en-dash',
    severity: 'error',
    regex: /[—–]| -- /g,
    message: 'Em dash (—), en dash (–), or spaced double-hyphen ( -- ) in prose (§8).',
  },
  // §19 Bold as decoration (bold-label list items or inline bold in prose)
  {
    id: '§19-bold-list-label',
    severity: 'error',
    regex: /^\s*(?:[-*]|\d+\.)\s+\*\*[^*]+\*\*/gm,
    message: 'Bold-label list item (§19). Use ### subheadings or plain prose instead.',
  },
  {
    id: '§19-inline-bold',
    severity: 'error',
    regex: /\*\*[^*\n]+\*\*/g,
    message: 'Decorative inline bold in prose (§19). Let word choice carry emphasis.',
  },
  // §1 Not X, but Y / formulaic contrasts
  {
    id: '§1-not-x-but-y',
    severity: 'error',
    regex: /\b(?:not\s+(?:just|only|merely)\s+[^.!?\n]{1,60},?\s+but\b|it(?:'s|\s+is)\s+not\s+[^.!?\n]{1,50}[,;—-]\s*it(?:'s|\s+is)\b|this\s+does\s+not\s+mean\b|that\s+does\s+not\s+mean\b)/gi,
    message: 'Staged "Not X, but Y" or "This/That does not mean..." contrast (§1). State the claim directly.',
  },
  // §2 One-line closers and dramatic fragments
  {
    id: '§2-staged-closer',
    severity: 'error',
    regex: /\b(?:that\s+is\s+the\s+real\s+win|that\s+distinction\s+matters|read\s+that\s+again|let\s+that\s+sink\s+in|the\s+message\s+was\s+clear|you\s+already\s+did\s+one)\b/gi,
    message: 'Staged one-line closer or dramatic tagline (§2). End on a concrete fact.',
  },
  // §3 Sayings that sound deep
  {
    id: '§3-deep-sayings',
    severity: 'error',
    regex: /\b(?:the\s+real\s+question\s+is|at\s+its\s+core|what\s+really\s+matters|fundamentally|the\s+heart\s+of\s+the\s+matter|the\s+price\s+of\s+admission\s+is|the\s+architecture\s+of|the\s+currency\s+of|the\s+language\s+of)\b/gi,
    message: 'Aphorism or "saying that sounds deep" (§3). Replace with the specific claim.',
  },
  // §4 Staged run-up before the point
  {
    id: '§4-staged-runup',
    severity: 'error',
    regex: /\b(?:let's\s+dive\s+in|let's\s+explore|let's\s+break\s+this\s+down|here(?:'s|\s+is)\s+what\s+you\s+need\s+to\s+know|without\s+further\s+ado|here(?:'s|\s+is)\s+the\s+thing|let's\s+be\s+honest|real\s+talk)\b/gi,
    message: 'Staged run-up before the point (§4). Delete the announcement and state the point.',
  },
  // §5 Arguing with no one
  {
    id: '§5-arguing-with-no-one',
    severity: 'error',
    regex: /\b(?:this\s+isn't\s+(?:mainly\s+)?about|i'm\s+not\s+saying|to\s+be\s+clear,|don't\s+get\s+me\s+wrong|this\s+is\s+not\s+to\s+say|some\s+might\s+say|one\s+might\s+be\s+tempted\s+to)\b/gi,
    message: 'Arguing with an unstated objection (§5). State the positive claim directly.',
  },
  // §12 Overused AI words + AUTHOR-VOICES crutch words
  {
    id: '§12-ai-crutch-words',
    severity: 'error',
    regex: /\b(?:additionally|align\s+with|bolstered|crucial|crucially|deep\s+dive|delve|delving|enduring|enhance|enhancing|furthermore|garner|interplay|intricate|intricacies|landmark|meticulous|meticulously|moreover|pivotal|showcase|showcasing|tapestry|testament|underscore|underscores|underscored|underscoring|vibrant)\b/gi,
    message: 'Overused AI stock word (§12 / AUTHOR-VOICES). Use plain, specific words.',
  },
  // §15 Shallow -ing riders at clause tails
  {
    id: '§15-shallow-ing-rider',
    severity: 'error',
    regex: /,\s+(?:highlighting|underscoring|emphasizing|ensuring|reflecting|symbolizing|fostering|cultivating|encompassing|showcasing)\b/gi,
    message: 'Shallow -ing rider bolted onto the end of a clause (§15). Cut or state as a direct fact.',
  },
  // §16 Sales language
  {
    id: '§16-sales-language',
    severity: 'error',
    regex: /\b(?:exemplifies|commitment\s+to|nestled|in\s+the\s+heart\s+of|groundbreaking|renowned|featuring|diverse\s+array|breathtaking|must-visit|stunning)\b/gi,
    message: 'Promotional / sales language (§16). State what the place or item actually is.',
  },
  // §18 Avoiding is, are, and has
  {
    id: '§18-fancy-copula',
    severity: 'error',
    regex: /\b(?:serves\s+as|stands\s+as|functions\s+as|operates\s+as|boasts)\b/gi,
    message: 'Inflated verb phrase replacing "is/are/has" (§18).',
  },
  // Concrete Comeback house rule: no user-facing "adult/adults"
  {
    id: 'house-no-adult',
    severity: 'error',
    regex: /\badults?\b/gi,
    message: 'User-facing "adult/adults" terminology. Use "older skaters" or "skaters over 40".',
  },
];

function stripFrontmatterAndUrls(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: '', body: raw };
  const frontmatter = match[1];
  const body = match[2];
  // Strip markdown link URLs (/blog/... or https://...) so slug words like "adult" don't false-positive
  const cleanBody = body.replace(/\]\([^)]+\)/g, ']()');
  // Keep title and description from frontmatter for checking
  const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  const metaText = [titleMatch ? titleMatch[1] : '', descMatch ? descMatch[1] : ''].join('\n');
  return { frontmatter, metaText, cleanBody };
}

function checkFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { metaText, cleanBody } = stripFrontmatterAndUrls(raw);
  const combined = `${metaText}\n${cleanBody}`;
  const findings = [];

  for (const rule of PATTERNS) {
    const matches = [...combined.matchAll(rule.regex)];
    if (matches.length > 0) {
      findings.push({
        id: rule.id,
        message: rule.message,
        samples: matches.slice(0, 5).map((m) => m[0].trim()),
        count: matches.length,
      });
    }
  }

  // Also check excess "rather than" (§1 reversed contrast when repeated > 2 times in a single post)
  const ratherThanMatches = [...cleanBody.matchAll(/\brather\s+than\b/gi)];
  if (ratherThanMatches.length > 2) {
    findings.push({
      id: '§1-excess-rather-than',
      message: `"rather than" appears ${ratherThanMatches.length} times in one post (§1 reversed Not-X-but-Y contrast). Keep at most 2.`,
      samples: ratherThanMatches.map((m) => m[0]),
      count: ratherThanMatches.length,
    });
  }

  return findings;
}

let files = process.argv.slice(2);
if (files.length === 0) {
  try {
    const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', 'origin/main...HEAD', '--', 'src/content/blog/'], {
      encoding: 'utf8',
    });
    files = out.split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.md'));
  } catch {
    files = [];
  }
}

if (files.length === 0) {
  console.log('No blog files to check.');
  process.exit(0);
}

let totalFindings = 0;
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const findings = checkFile(f);
  if (findings.length === 0) {
    console.log(`✔ ${f}: 0 Humanizer tells`);
  } else {
    console.log(`✖ ${f}: ${findings.length} Humanizer rule(s) triggered:`);
    for (const item of findings) {
      totalFindings += item.count;
      console.log(`  - [${item.id}] (${item.count}x): ${item.message}`);
      console.log(`    matches: ${JSON.stringify(item.samples)}`);
    }
  }
}

if (totalFindings > 0) {
  process.exit(1);
}
