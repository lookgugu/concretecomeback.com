// Optional curated photos. Every failure becomes a diagnostic, never a text-draft failure.
import { readFileSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { SITE_ORIGIN } from './content.mjs';
import { safeHref } from './select.mjs';

export const PHOTO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MAX_BYTES = 2_000_000;
const licenses = { 'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/', 'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/' };
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const hash = /^[a-f0-9]{64}$/;
const digest = b => createHash('sha256').update(b).digest('hex');
function requireThat(ok, message) { if (!ok) throw new Error(message); }
function keys(o, names) {
  requireThat(o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).sort().join('|') === names.split(' ').sort().join('|'), `invalid fields: expected ${names}`);
}
function text(s) { requireThat(typeof s === 'string' && s.trim().length > 0 && s.length <= 2000 && !/[\u0000-\u001f]/.test(s), 'invalid text'); }
function local(root, file, prefix, limit) {
  requireThat(typeof file === 'string' && file.startsWith(prefix) && /^[a-zA-Z0-9/_.-]+$/.test(file) && !file.split('/').some(p => !p || p === '.' || p === '..'), 'invalid local path');
  let p = resolve(root);
  for (const part of file.split('/')) { p = join(p, part); requireThat(!lstatSync(p).isSymbolicLink(), 'symlink refused'); }
  const st = lstatSync(p);
  requireThat(st.isFile() && st.size > 0 && st.size <= limit, 'invalid file size');
  return readFileSync(p);
}
function checkedFile(root, obj, prefix, limit) {
  requireThat(hash.test(obj.sha256), 'invalid SHA256');
  const bytes = local(root, obj.file, prefix, limit);
  requireThat(digest(bytes) === obj.sha256, 'file SHA256 mismatch');
  return bytes;
}
// Read dimensions from image headers without executing image or metadata content.
export function imageDimensions(b) {
  if (b.length >= 33 && b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && b.toString('ascii', 12, 16) === 'IHDR') {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), type: 'image/png' };
  }
  if (b[0] === 255 && b[1] === 216) {
    let i = 2;
    while (i + 4 < b.length) {
      requireThat(b[i++] === 255, 'invalid JPEG marker');
      while (b[i] === 255) i++;
      const marker = b[i++];
      if (marker === 217 || marker === 218) break;
      const len = b.readUInt16BE(i);
      requireThat(len >= 2 && i + len <= b.length, 'invalid JPEG segment');
      if ([192,193,194].includes(marker)) {
        requireThat(len >= 8, 'invalid JPEG dimensions');
        return { height: b.readUInt16BE(i + 3), width: b.readUInt16BE(i + 5), type: 'image/jpeg' };
      }
      i += len;
    }
  }
  throw new Error('unsupported image');
}
function validate(root, p, now) {
  keys(p, 'id slugs sourcePageUrl license licenseUrl author attribution original derivative alt caption modifications checkedAt visualInspection identity evidence');
  requireThat(slug.test(p.id) && Array.isArray(p.slugs) && p.slugs.length > 0 && p.slugs.every(s => typeof s === 'string' && slug.test(s)) && new Set(p.slugs).size === p.slugs.length, 'invalid exact slug mapping');
  requireThat(Object.hasOwn(licenses, p.license) && licenses[p.license] === p.licenseUrl, 'unsupported license');
  text(p.sourcePageUrl);
  requireThat(/^https:\/\//i.test(p.sourcePageUrl) && safeHref(p.sourcePageUrl), 'invalid source URL');
  for (const k of ['author','attribution','alt','caption','modifications','checkedAt']) text(p[k]);
  requireThat(/^\d{4}-\d\d-\d\dT/.test(p.checkedAt) && Number.isFinite(Date.parse(p.checkedAt)) && Date.parse(p.checkedAt) <= +now, 'invalid checkedAt');
  keys(p.identity, 'verified subject context');
  keys(p.visualInspection, 'verified reviewer notes');
  requireThat(p.identity.verified === true && p.visualInspection.verified === true, 'unverified identity or visual inspection');
  for (const s of [p.identity.subject,p.identity.context,p.visualInspection.reviewer,p.visualInspection.notes]) text(s);
  keys(p.original, 'file sha256'); keys(p.evidence, 'file sha256'); keys(p.derivative, 'file sha256 width height bytes');
  checkedFile(root, p.original, 'newsletter/photos/', 30_000_000);
  const bytes = checkedFile(root, p.derivative, 'public/images/newsletter/', MAX_BYTES);
  requireThat(/^public\/images\/newsletter\/[a-z0-9][a-z0-9-]*\.(jpg|jpeg|png)$/.test(p.derivative.file), 'invalid derivative filename');
  const dims = imageDimensions(bytes);
  requireThat(dims.width === p.derivative.width && dims.height === p.derivative.height && dims.width > 0 && dims.height > 0 && dims.width <= 12000 && dims.height <= 12000 && bytes.length === p.derivative.bytes, 'derivative dimensions or bytes mismatch');
  requireThat(dims.type === (p.derivative.file.endsWith('.png') ? 'image/png' : 'image/jpeg'), 'extension mismatch');
  const e = JSON.parse(checkedFile(root, p.evidence, 'newsletter/photos/', 256_000));
  keys(e, 'sourcePageUrl license licenseUrl author originalSha256 identity visualInspection checkedAt commercialUseAllowed notes');
  requireThat(e.commercialUseAllowed === true && e.originalSha256 === p.original.sha256, 'unverified commercial license/original'); text(e.notes);
  for (const k of ['sourcePageUrl','license','licenseUrl','author','identity','visualInspection','checkedAt']) requireThat(isDeepStrictEqual(e[k], p[k]), `evidence mismatch: ${k}`);
  return { ...p, url: `${SITE_ORIGIN}/${p.derivative.file.slice('public/'.length)}`, type: dims.type };
}
export function loadPhotos({ root = PHOTO_ROOT, now = new Date() } = {}) {
  const diagnostics = [], photos = [];
  try {
    const m = JSON.parse(local(root, 'newsletter/photos/manifest.json', 'newsletter/photos/', 1_000_000));
    keys(m, 'schemaVersion photos'); requireThat(m.schemaVersion === 1 && Array.isArray(m.photos) && m.photos.length <= 500, 'unsupported photo manifest');
    for (const [index, p] of m.photos.entries()) {
      try { photos.push(validate(root, p, now)); }
      catch (e) { diagnostics.push({ index, status: 'omitted', reason: e.message }); }
    }
  } catch (e) { diagnostics.push({ status: 'omitted', reason: `photo manifest: ${e.message}` }); }
  return { photos, diagnostics };
}
export async function verifyHostedPhoto(p, { fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  requireThat(p.url === `${SITE_ORIGIN}/${p.derivative.file.slice(7)}` && /^public\/images\/newsletter\/[a-z0-9][a-z0-9-]*\.(jpg|jpeg|png)$/.test(p.derivative.file), 'invalid hosted path');
  const controller = new AbortController();
  let timer, reader;
  const request = async () => {
    const res = await fetchImpl(p.url, { method: 'GET', redirect: 'error', signal: controller.signal, headers: { accept: p.type } });
    requireThat(res.status === 200, `hosted HTTP ${res.status}`);
    requireThat(!res.redirected && (!res.url || res.url === p.url), 'hosted redirect/URL mismatch');
    requireThat(res.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === p.type, 'hosted MIME mismatch');
    requireThat(Number(res.headers.get('content-length') || 0) <= MAX_BYTES, 'hosted response too large');
    reader = res.body.getReader();
    const chunks = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; requireThat(size <= MAX_BYTES && size <= p.derivative.bytes, 'hosted response too large'); chunks.push(Buffer.from(value)); }
    requireThat(size === p.derivative.bytes && digest(Buffer.concat(chunks)) === p.derivative.sha256, 'hosted hash/bytes mismatch');
    return { status: 'hosted-verified', url: p.url, sha256: p.derivative.sha256 };
  };
  try { return await Promise.race([request(), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('hosted timeout')); }, timeoutMs); })]); }
  finally { clearTimeout(timer); controller.abort(); if (reader) void reader.cancel().catch(() => {}); }
}
export async function selectPhotos(chosen, { root = PHOTO_ROOT, now = new Date(), fetchImpl, testOnlyLocalImageVerification = false } = {}) {
  const { photos, diagnostics } = loadPhotos({ root, now });
  const selected = new Map(), used = new Set(); let supporting = 0;
  for (const [index, item] of chosen.entries()) {
    if (index > 0 && supporting >= 2) break;
    const candidates = photos.filter(p => p.slugs.includes(item.post.slug));
    if (candidates.length > 1) { diagnostics.push({ slug: item.post.slug, status: 'omitted', reason: 'ambiguous slug mapping' }); continue; }
    const p = candidates[0]; if (!p) continue;
    const ids = [p.id, p.original.sha256, p.derivative.sha256];
    if (ids.some(id => used.has(id))) { diagnostics.push({ slug: item.post.slug, status: 'omitted', reason: 'duplicate photo' }); continue; }
    try {
      const verification = testOnlyLocalImageVerification === true ? { status: 'test-only-local', url: p.url } : await verifyHostedPhoto(p, { fetchImpl });
      selected.set(item.post.slug, { ...p, displayWidth: Math.min(index === 0 ? 600 : 280, p.derivative.width), verification });
      ids.forEach(id => used.add(id)); if (index > 0) supporting++;
    } catch (e) { diagnostics.push({ slug: item.post.slug, status: 'omitted', reason: e.message }); }
  }
  return { selected, diagnostics };
}
