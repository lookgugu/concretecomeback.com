# Weekly newsletter: draft generation and send policy

The roundup moved from monthly to weekly. This repo **generates a draft**;
it does not send. There is no sender, no scheduled send and no code path
that calls Resend for an issue. Sending is a manual, approval-gated operator
action, and recording that a send happened is a separate, manual commit.

| What | When (America/New_York) | How |
| --- | --- | --- |
| Draft | Wednesday 09:00 | `.github/workflows/newsletter-draft.yml` (scheduled) or a manual dispatch from `main` |
| Send | Thursday 10:00 — **policy only** | An operator, after the approval checklist below |
| Record | After the send is confirmed in Resend | `scripts/newsletter/record-sent.mjs`, committed via PR |

## Files

- `scripts/newsletter/` — `schedule.mjs` (New York calendar, DST, cron guard),
  `content.mjs` (strict post reader, newness window, candidate filter),
  `ledger.mjs` (sent history), `live.mjs` (public GET verification),
  `select.mjs` (scoring, excerpts, weekend quote), `render.mjs` (Markdown/HTML),
  `preview.mjs` (standalone local JPEG preview), `draft.mjs` (orchestration), CLIs `generate-draft.mjs`, `schedule-guard.mjs`,
  `record-sent.mjs`. Tests are `*.test.mjs` beside them and run in `npm test`.
- `newsletter/issues/` — the committed **sent** ledger (`<issueId>.json`).
- `newsletter/send-requirements.json` — compliance inputs (postal address,
  preference page). A configured `preferenceCenterUrl` is rendered as a safely
  escaped “Manage preferences” link in both Markdown and HTML footers. `null`
  omits that link and keeps the `preference-center` send blocker up.

## Schedule (DST-aware)

GitHub cron is UTC-only. The workflow declares `0 13 * * 3` (09:00 EDT) and
`0 14 * * 3` (09:00 EST); `schedule-guard.mjs` lets a scheduled run through
only when New York's current UTC offset is the one that cron was written for
and it is still Wednesday in New York. Because it checks the offset rather
than the hour, a run GitHub starts late still fires exactly once; DST changes
on a Sunday, so no Wednesday run can straddle one. An unknown cron string
fails the job. `workflow_dispatch` always runs (on `main` only).

The Thursday 10:00 send time is computed per issue (`plannedSend.utc` in the
manifest — 14:00Z in EDT, 15:00Z in EST) as guidance for the operator.

## What goes in an issue

**Sources.** Only blog posts in `src/content/blog/` at the checked-out commit
(the CLI refuses uncommitted blog changes), with `draft: false` and a
`pubDate` no later than the run date in New York. Content on `main` has
already been through review and, for health topics, the content-safety gate;
the newsletter adds no new claims of its own.

**Newness.** Explicit and reported in `manifest.window`:

- *Bootstrap* (no sent issue in the ledger): the 7 days ending on the run date.
- *Since last sent*: from the day after the last sent issue's window closed,
  to the run date — so nothing is skipped or repeated between issues.
- *Cap*: never more than 14 days back. A longer gap is reported in
  `window.staleSkipped` and `reviewNotes`, not silently backfilled.
- Any canonical URL already in the sent ledger is excluded regardless of date.

If nothing qualifies, the run writes `report.md`, `report.html` and a
`manifest.json` with `status: "no-eligible-posts"` explaining why. Nothing
older is used to fill space.

**Live check.** Every candidate is fetched with a plain GET from
`https://concretecomeback.com/blog/<slug>/` (the origin is a constant; the slug
must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`). Redirects are followed by hand and
only to the same page on the same https origin (trailing-slash variants); any
other target is refused before it is requested. The page must return 200
`text/html`, carry `<link rel="canonical">` equal to the expected URL, not be
`noindex`, and show the repo title in its `<h1>`. Drafts, future posts, stale
posts and already-sent posts are filtered out first and are never requested.
One failure fails the whole run.

**Selection** is a deterministic, capped sum recorded per post in
`manifest.items[].breakdown` and `manifest.ranking`:

| Component | Points |
| --- | --- |
| recency | `7 − days since pubDate` (min 0) |
| featured | 5 if `featured: true` |
| depth | 1 per 400 words, max 5 |
| citations | 1 per distinct external link, max 5 |
| hero | 1 if a hero image |

The top score leads (ties: newer, then slug). Up to three additional reads
follow, each picked greedily by score minus 2 per tag shared with posts
already chosen, so the issue is not three takes on one topic.

**Text.** The lead uses its own `description` plus its opening paragraph
(cut on a sentence boundary). Reads use their `description`. The *weekend
section* quotes, verbatim and with a link, the first paragraph or list of a
section with an actionable heading ("practical", "what actually breaks it",
"getting started", …, then softer ones like "what this changes"). It never
quotes a health-tagged post (health, injury-prevention, supplements, joints,
recovery, safety, …): dosing or injury advice lifted out of its article loses
the cautions around it. When no post qualifies the section is omitted. Links
inside quotes are kept as citations if they are `http(s)` or site-relative;
anything else is reduced to text. All output is HTML/Markdown escaped.

**Optional photography.** Exact slug mappings in `newsletter/photos/manifest.json`
may add one lead photo (up to 600px) and two supporting photos (up to 280px).
The [photo schema and evidence requirements](../newsletter/photos/README.md)
require local originals, SHA256 hashes, attribution, commercial licensing
(CC0-1.0 or CC-BY-4.0 only), and reviewed identity/context. No article hero
metadata or arbitrary remote image discovery is used. Every selected derivative
must pass a bounded GET at the fixed production image path, with no redirects,
and match the local hash. Missing evidence, malformed records, unavailable hosted
assets, or any failed verification omit photos with `manifest.photography`
diagnostics; valid text drafts still render. Credits and source/license links
appear in both formats. Photos add no health claims. The library-only hosted-check bypass
is explicitly marked test-only and is unavailable through the production CLI.
The standalone local preview is generated automatically after normal verification.
All send blockers and the Wednesday draft-only schedule remain in force.

There is no LLM, API key or secret involved.

## Artifacts

The workflow uploads `weekly-newsletter-draft-<run id>` (30 days): `draft.md`,
`draft.html` (hosted-image source with a DRAFT banner and blockers),
`preview-local.html` (standalone local browser preview with embedded JPEGs), and
`manifest.json` (`status: "draft"`, `sendable: false`, items with sha256 of
each source file, scores, live-check evidence, exclusions, blockers, source
commit and blog tree hash). Artifacts are review material, **not** history:
nothing is recorded as sent by generating, downloading or approving a draft.

## Send blockers

Every draft lists `sendBlockers`. The first three are permanent per-send checks;
the rest clear only when the underlying requirement is really met.

| Code | Clears when |
| --- | --- |
| `audience-verification` | Never automatically — operator verifies the deployed signup effective segment and its currently subscribed, double-opt-in membership before every send |
| `operator-approval` | Never automatically — see checklist |
| `unsubscribe-verification` | Never automatically — verified per send in a provider test send |
| `physical-address` | `physicalPostalAddress` is set in `newsletter/send-requirements.json` (CAN-SPAM requires a valid postal address in commercial email) |
| `preference-center` | `preferenceCenterUrl` is set; the current config has no supported unsubscribe-only policy field |
| `subscriber-transition` | The first weekly issue is recorded as sent |

The owner-authorized business footer is exactly **326 Gault St., Santa Cruz, CA
95062**, without an apartment. It is configured as `physicalPostalAddress` and
clears only the `physical-address` blocker.

For the initial approved issue, the owner has authorized a simple unsubscribe-only
policy, recorded through external operator provenance referencing that
authorization. No new user decision is required for this initial-issue policy.
Inspection found
that schema version 1 accepts only `physicalPostalAddress`, `preferenceCenterUrl`,
`schemaVersion` and `$comment`; unknown policy keys fail validation. A comment
does not affect gate evaluation. Therefore `preferenceCenterUrl` remains `null`
and `preference-center` remains blocked. The blocker message's suggestion to
record an unsubscribe-only decision is not implemented as a config option;
the external authorization does not automatically clear that generator gate or
authorize a broader policy change. The operator must reference the existing
authorization when reconciling this policy blocker for the initial issue.

The footer uses the native `[Unsubscribe]({{{RESEND_UNSUBSCRIBE_URL}}})`
Markdown link and an HTML anchor with `href="{{{RESEND_UNSUBSCRIBE_URL}}}"` and
reader label “Unsubscribe”. The preview retains the test-send verification notice;
the tag is not a fabricated recipient URL or evidence of a working unsubscribe.
As of this bounded correction (2026-10-17), provider access is login-blocked,
unsubscribe verification remains outstanding, and no email will be sent.

`manifest.audience` is explicitly `status: "unverified"` with `segmentId: null`.
Secret-free draft CI cannot know deployed signup configuration or membership.
The signup function supports a deployed `NEWSLETTER_SEGMENT_ID` override;
its source `DEFAULT_SEGMENT_ID` is only a non-authoritative fallback reference,
not an approved audience. Local environment values do not establish deployed
configuration. The `audience-verification` blocker is always retained, including
after a prior weekly send, when compliance inputs are configured, and in
no-eligible-posts manifests. Generation never verifies contacts or clears it.

## Operator approval checklist (before any send)

1. Take the artifact from a run on `main`. Check `manifest.status` is
   `draft`, `source.commit` is the current `main`, and `issueId` is this
   Thursday. For an already-approved immutable artifact, the bounded
   compliance-only derivation below may instead preserve its original source
   provenance and issue identity; record that exception with the approval.
2. Read `preview-local.html` end to end in a browser for standalone local review,
   then review `draft.html` as the hosted-image email source. Never send the local
   preview: its embedded images and CSP are for browser review only. Open every link. Read `reviewNotes` and
   `excluded`.
3. Resolve every blocker except `operator-approval`. If you changed
   `send-requirements.json`, merge that and regenerate the draft (manual
   dispatch) so the manifest you approve is the one you send, or use the
   compliance-only derivation below for an already-approved immutable artifact.
4. Verify the **deployed signup effective segment**, including any deployed
   `NEWSLETTER_SEGMENT_ID` override, and verify that recipients are its
   **currently subscribed, double-opt-in members**. Record the verified segment
   and membership evidence with the approval; do not infer them from local env,
   the source fallback, a segment name, or the unverified `manifest.audience`.
   Build the Resend broadcast from `draft.html` to that verified segment only
   — never account-wide contacts, which include other sites' lists. Remove the
   DRAFT banner and blocker list; keep the footer with `{{{RESEND_UNSUBSCRIBE_URL}}}`,
   the postal address, and the configured preference link. Verify the preference
   link opens the intended page.
5. Send a test to yourself. Confirm the unsubscribe link works in one click
   and the List-Unsubscribe header is present.
6. Record approval where it can be referenced later (e.g. a GitHub issue
   comment naming `issueId` and `source.commit`); that link is the
   `--approval-reference`.
7. Send (scheduled for Thursday 10:00 New York) only after steps 1–6.

### Compliance-only derivation of an approved immutable artifact

An already-approved immutable artifact may receive a compliance-only derivative
in a **new directory** to incorporate an authorized footer correction without
selecting new articles. Keep every original artifact byte unchanged. This is an
operator procedure, not a new generator mode or permission to send.

Record a provenance sidecar with the original artifact/run identity, original
approval reference, issue ID, source commit and blog tree, SHA256 hashes of every
original file, the exact authorized compliance change and config hash, and
SHA256 hashes of every derived file. Preserve article identities, order, URLs,
source hashes, titles, descriptions, excerpts, weekend quotes, images and their
provenance. Compare the original and derived content and record evidence that
only the authorized footer and corresponding compliance-blocker metadata changed.
Do not rerun article selection or relabel the original source as current `main`.

Review the derived Markdown, hosted HTML, local preview and manifest together;
reference their hashes and provenance in a fresh operator reconciliation of the
exact derivative. That reconciliation can reference the existing authorized
content approval, footer authorization, and initial-issue unsubscribe-only
decision; it does not require a new user approval of unchanged content or the
authorized footer. Retain `sendable: false` and every unresolved gate, including
the generator's `preference-center` blocker under the current configuration;
record its initial-issue policy resolution in external operator provenance.
Audience verification,
operator approval, per-send unsubscribe verification (working one-click link and
List-Unsubscribe header), and the subscriber-transition checks and notice all
remain required. Existing content approval and a footer correction do not satisfy
delivery checks. Complete the same delivery checklist before any send; never
send the local preview. Derivation alone makes no provider calls, changes no
subscribers or schedules, and creates no sent-ledger record.

## Existing monthly subscribers

Everyone on the list today confirmed a *monthly* roundup. Moving them to
weekly is handled without re-consent shortcuts:

- The first weekly issue carries a notice that the cadence changed and points
  to the one-click unsubscribe. The draft adds it until a weekly issue is
  recorded as sent.
- Send only to contacts that are currently subscribed in the segment. Never
  re-add, import or PATCH `unsubscribed: false` on anyone who left; the
  confirm endpoint's reactivation exists only for a person who clicks their
  own fresh confirmation link.
- If the owner judges the change too large for a notice, send a one-off
  "we're going weekly" email (also via the approval checklist) before the
  first weekly issue instead.
- Signup copy, the confirmation email and the privacy page now say weekly.
  Confirmation links issued before this change said "monthly"; they expire
  two hours after issue (`TOKEN_TTL_MS`), so none survive the deploy for long.

## Recording a sent issue

Only after the send is **confirmed in the Resend dashboard** (broadcast status
sent), and only from the manifest that was actually sent:

```bash
node scripts/newsletter/record-sent.mjs \
  --draft path/to/manifest.json \
  --provider-reference <resend broadcast id> \
  --sent-at <ISO time from Resend, e.g. 2026-10-22T14:00:05Z> \
  --approved-by "Name" \
  --approval-reference <link to the approval> \
  --confirmed-delivered-in-provider
```

It makes no network call. It refuses without the confirmation flag, refuses
anything but a `draft` manifest with items, refuses a `sentAt` before the
draft was generated or in the future, refuses an issue that is not after the
last recorded one or that repeats a sent URL, and never overwrites a file.
Commit the new `newsletter/issues/<issueId>.json` in a PR. If the send
featured different posts than the draft, do not record that draft — correct
the manifest's `items` to exactly what went out first, and say so in the PR.
Never hand-write a ledger file and never record a send that did not happen:
the ledger is what stops the next draft repeating posts, and a false entry
would silently drop real posts from the next issue.

Malformed ledger files (bad JSON, wrong status, off-site URL, future
`sentAt`, unknown keys, a URL in two issues, stray files) fail every draft
run closed until fixed.


## Local preview artifacts

Each recurring or manual draft run writes `draft.md`, `draft.html`,
`preview-local.html` and `manifest.json`; the existing directory artifact upload
includes all four. No-issue runs still write only reports and the manifest.
The preview uses already selected, verified local JPEGs, rechecks evidence,
paths, size, dimensions and hashes, and embeds their bytes without any fetch.
Invalid preview images fall back to text with `localPreview.images` diagnostics.
All approval, audience and compliance blockers remain in both HTML files.
Hosted-image verification and the production HTTPS URL strategy are unchanged.
Full photo provenance and modifications are in `photography.items`; reader CC0
captions contain a short contextual phrase and compact credit/source/license links.

For an offline browser regression (Playwright must already be installed):

```bash
node scripts/newsletter/check-preview-offline.mjs /path/to/original/draft.html /path/to/preview-local.html
```

The check blocks HTTP(S) and requires three failed hosted images and three
successfully decoded embedded JPEGs, at desktop and mobile widths. The original
2026-10-17 delivered draft's three hosted assets were reported verified by fresh
GETs (200, JPEG, no redirects, matching hashes). This does not establish why the
delivered view failed or prove a Telegram-specific cause.
