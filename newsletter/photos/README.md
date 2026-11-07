# Optional newsletter photography — schema version 1

`manifest.json` is `{ "schemaVersion": 1, "photos": [...] }`. Empty is valid.
`manifest.schema.json` describes the record shape; `scripts/newsletter/photos.mjs`
also enforces matching license URLs, local evidence, file hashes and hosted bytes.
Only exact curated `slugs` are eligible; no hero metadata or remote discovery.
Unknown fields or malformed records are omitted with draft manifest diagnostics.

Each photo has **all** these fields (no others):

```json
{
  "id": "example-photo",
  "slugs": ["exact-blog-slug"],
  "sourcePageUrl": "https://example.org/photo-page",
  "license": "CC-BY-4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
  "author": "Photographer name",
  "attribution": "Photo title — Photographer name",
  "original": { "file": "newsletter/photos/originals/example.jpg", "sha256": "64 lowercase hex characters" },
  "derivative": { "file": "public/images/newsletter/example.jpg", "sha256": "64 lowercase hex characters", "width": 1200, "height": 800, "bytes": 123456 },
  "alt": "Literal description of visible scene",
  "caption": "Literal scene description; no health or efficacy claims",
  "modifications": "Resized to 1200 pixels wide; no crop",
  "checkedAt": "2026-10-17T12:00:00.000Z",
  "visualInspection": { "verified": true, "reviewer": "Reviewer name", "notes": "Inspected original and derivative; scene and credit match" },
  "identity": { "verified": true, "subject": "Identified subject or anonymous scene", "context": "Evidence-backed description of place/activity; no inferred identity or health claims" },
  "evidence": { "file": "newsletter/photos/evidence/example.json", "sha256": "64 lowercase hex characters" }
}
```

Evidence is a local JSON object with exactly `sourcePageUrl`, `license`,
`licenseUrl`, `author`, `originalSha256`, `identity`, `visualInspection`,
`checkedAt`, `commercialUseAllowed: true`, and `notes` (nonempty explanation
of the locally retained source/license and identity research). Values must match
manifest values exactly, including the two nested review objects. Retain source
captures/research beside it; review must establish the license applies to the
specific original, commercial use, identity and context. Assertions are a human
review record, not automated proof of ownership. Never set verified without review.

Only `CC0-1.0` (https://creativecommons.org/publicdomain/zero/1.0/) and
`CC-BY-4.0` are accepted. Noncommercial, unknown, missing or unverified evidence
is ineligible. Paths are repository-relative, with no symlinks or traversal.
JPEG and PNG derivatives only; actual image-header dimensions, bytes and hashes are
checked. Originals are bounded to 30 MB, derivatives to 2 MB, evidence to 256 KB.

Production GETs only `https://concretecomeback.com/images/newsletter/<filename>`
with a timeout, bounded streaming body, no redirects, expected MIME and exact
hash/byte matching. A 404 or other failure skips the photo, never the text draft.
One lead displays at up to 600px, at most two supporting photos at up to 280px;
all scale down on mobile, with natural aspect ratio. Duplicate originals,
derivatives and IDs cannot produce repeated photos. CC0 captions show one useful phrase, photographer, Commons/source and CC0 links;
full attribution, modifications and provenance remain in the issue manifest.
CC BY photos retain full attribution and modification text in HTML and Markdown. Captions/alt must remain
literal descriptions: no new health claims, implied outcomes or endorsements.

`generateDraft({ photoRoot, testOnlyLocalImageVerification: true })` is an explicit
library-only preview/test injection: it still validates all local evidence and
files, marks verification `test-only-local`, and never bypasses send blockers.
The production CLI offers no local verification switch or origin override.


Every draft also includes `preview-local.html`, a standalone **LOCAL PREVIEW**
for browser review, not an email payload. `preview.mjs` revalidates selected
photos and embeds bounded, hash-matched local JPEG derivatives as data URLs.
It never fetches URLs; paths with traversal or symlinks are refused. Unsupported
formats (including PNG), changed files or invalid evidence omit the preview
image with a diagnostic in `manifest.localPreview.images`; text and send blockers
remain. A restrictive preview-only CSP blocks network resources. The production
`draft.html` and Markdown retain verified hosted HTTPS image URLs.

To check delivery-independent rendering, open the original hosted draft and
`preview-local.html` in a browser with all network requests blocked. Hosted images
should fail; all three curated embedded JPEGs should have nonzero natural widths.
This demonstrates an offline preview, not the cause of any delivery failure.
