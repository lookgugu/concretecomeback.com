// Standalone operator artifact, never an email payload. No network access.
import { previewJpeg } from './photos.mjs';
import { renderHtml, escapeHtml } from './render.mjs';

export function renderLocalPreview(issue, options = {}) {
  const sources = new Map(), diagnostics = [];
  for (const item of [issue.lead, ...issue.reads]) {
    if (!item.photo) continue;
    const p = item.photo;
    try {
      const bytes = previewJpeg(p, options);
      sources.set(escapeHtml(p.url), `data:image/jpeg;base64,${bytes.toString('base64')}`);
      diagnostics.push({ id: p.id, status: 'embedded', sha256: p.derivative.sha256, bytes: bytes.length });
    } catch (error) {
      diagnostics.push({ id: p.id, status: 'omitted', reason: error.message });
    }
  }
  const html = renderHtml(issue)
    .replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">`)
    .replace('DRAFT PREVIEW —', 'LOCAL PREVIEW — embedded images; not an email payload. DRAFT PREVIEW —')
    .replace(/<img src="([^"]*)"[^>]*>/g, (tag, src) => sources.has(src) ? tag.replace(`src="${src}"`, `src="${sources.get(src)}"`) : '');
  return { html, diagnostics };
}
