// Fixture builders shared by the newsletter tests. Not imported by any CLI.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function tempDir(prefix = 'cc-newsletter-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function postSource({
  title = 'A perfectly ordinary post title',
  description = 'A description that is comfortably longer than the fifty character schema floor.',
  pubDate = '2026-10-12',
  tags = ['motivation'],
  draft,
  featured,
  heroImage,
  extra = '',
  body = 'First paragraph of the post.\n\n## What actually breaks it\n\nDo one small thing.\n',
} = {}) {
  const lines = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    `pubDate: ${pubDate}`,
    'author: "Sam Torres"',
    `tags: ${JSON.stringify(tags)}`,
  ];
  if (featured !== undefined) lines.push(`featured: ${featured}`);
  if (draft !== undefined) lines.push(`draft: ${draft}`);
  if (heroImage) lines.push(`heroImage: ${JSON.stringify(heroImage)}`);
  if (extra) lines.push(extra);
  lines.push('---', '', body);
  return lines.join('\n');
}

export function writeBlog(posts) {
  const root = tempDir();
  const blogDir = join(root, 'blog');
  mkdirSync(blogDir);
  for (const [name, source] of Object.entries(posts)) writeFileSync(join(blogDir, name), source);
  return { root, blogDir };
}

export function writeLedger(root, records) {
  const dir = join(root, 'issues');
  mkdirSync(dir, { recursive: true });
  for (const [name, record] of Object.entries(records)) {
    writeFileSync(join(dir, name), typeof record === 'string' ? record : JSON.stringify(record, null, 2));
  }
  return dir;
}

export function sentRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    issueId: '2026-10-15',
    status: 'sent',
    cadence: 'weekly',
    window: { start: '2026-10-08', end: '2026-10-14', timeZone: 'America/New_York' },
    items: [
      { role: 'lead', slug: 'old-lead', canonicalUrl: 'https://concretecomeback.com/blog/old-lead/' },
    ],
    sent: {
      sentAt: '2026-10-15T14:02:11.000Z',
      provider: 'resend',
      providerReference: 'bc_0123456789abcdef',
      approvedBy: 'Beno Chapman',
      recordedBy: 'Beno Chapman',
    },
    ...overrides,
  };
}

// A public page shaped like the live Astro output.
export function livePage({ slug, title, canonical, noindex = false }) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<!DOCTYPE html><html><head><title>${esc(title)} | Concrete Comeback</title>
<link rel="canonical" href="${canonical ?? `https://concretecomeback.com/blog/${slug}/`}">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}
</head><body><h1 class="text-3xl">${esc(title)}</h1></body></html>`;
}

export function fakeResponse({ status = 200, body = '', headers = {} } = {}) {
  const h = new Map(Object.entries({ 'content-type': 'text/html; charset=utf-8', ...headers }).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => h.get(k.toLowerCase()) ?? null },
    text: async () => body,
  };
}
