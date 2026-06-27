/**
 * Generates /public/llms-full.txt — a plain-text dump of all site content
 * for LLM indexing. Run before `astro build` as part of npm run build.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const OUT  = join(ROOT, 'public', 'llms-full.txt');

async function listFiles(dir) {
  let files = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(await listFiles(full));
      } else if (['.md', '.mdx'].includes(extname(entry.name))) {
        files.push(full);
      }
    }
  } catch {
    // dir may not exist yet — skip
  }
  return files;
}

function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { meta: {}, body: content };
  const raw = match[1];
  const body = content.slice(match[0].length).trim();
  const meta = {};
  for (const line of raw.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
    meta[key] = val;
  }
  return { meta, body };
}

async function buildSection(label, dir) {
  const files = await listFiles(dir);
  if (files.length === 0) return '';
  const parts = [`\n${'='.repeat(60)}\n## ${label}\n${'='.repeat(60)}\n`];
  for (const file of files.sort()) {
    const raw = await readFile(file, 'utf-8');
    const { meta, body } = extractFrontmatter(raw);
    const title = meta.title ?? meta.name ?? file.split('/').pop();
    parts.push(`\n### ${title}`);
    if (meta.description) parts.push(meta.description);
    if (meta.city)        parts.push(`Location: ${[meta.city, meta.stateProvince, meta.country].filter(Boolean).join(', ')}`);
    if (meta.website)     parts.push(`Website: ${meta.website}`);
    if (body)             parts.push(`\n${body}`);
    parts.push('');
  }
  return parts.join('\n');
}

const header = `# Concrete Comeback — Full Site Content Dump
# Generated for LLM and AI agent ingestion
# Source: https://concretecomeback.com
# llms.txt: https://concretecomeback.com/llms.txt
# Date: ${new Date().toISOString()}
#
# This file contains all blog posts and directory listings in plain text.
# Use /llms.txt for a concise summary. Use this file for complete content.
`;

const sections = await Promise.all([
  buildSection('BLOG POSTS',          join(ROOT, 'src/content/blog')),
  buildSection('SKATE PARKS',         join(ROOT, 'src/content/parks')),
  buildSection('LOCAL SHOPS',         join(ROOT, 'src/content/shops')),
  buildSection('GROUPS & COMMUNITIES',join(ROOT, 'src/content/groups')),
]);

await writeFile(OUT, header + sections.join(''), 'utf-8');
console.log(`[generate-llms] Written to ${OUT}`);
