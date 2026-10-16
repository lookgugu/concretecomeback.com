# Newsletter exposure and tracking — implementation review

Worktree `cc-newsletter-exposure-20261016`, branch `feat/newsletter-exposure-20261016`,
based on `main` at `3426586`. Written 2026-10-16. **Not committed, pushed, merged or deployed.**

## Status at hand-off

| Gate | Result |
|---|---|
| Regression tests written first, observed failing on the unmodified module | **Done** — 20 of 26 new tests failed before implementation (below) |
| `npm test` | **PASS** — 98 tests, 0 failures (after the review fixes below) |
| `npx astro check` | **PASS** — 69 files, 0 errors, 0 warnings, 22 hints |
| `npm run build` | **PASS** — 409 pages built |
| Desktop + mobile Playwright QA (`scripts/qa-newsletter-exposure.mjs`) | **PASS** — 101/101 checks, exit 0 (re-run after the review fixes, 2026-10-16T22:56Z) |
| `npm audit` | 18 vulnerabilities (6 moderate, 11 high, 1 critical), all **pre-existing** in the locked tree; no dependency or lockfile change was authorised or made |
| Commit | Not made (instruction for this session: "Do not commit yet") |

## Independent review (agy, Gemini Argon high) — findings and resolution

The frozen diff was reviewed. The orchestrator independently re-ran 93 tests,
`astro check` (0 errors, 0 warnings, 24 hints), the build (409 pages) and the
browser QA (101 checks), all passing. Two findings were corrected test-first. The
new tests were run against the unfixed module first: **4 failed**
(`unknown inline visibility blocks the popup`, `not yet known to be off screen`,
`an unpainted popup is not an impression`, and the signup-before-paint case),
and they pass after the fix.

1. **Missing IntersectionObserver let the popup cover a visible inline form.**
   Without IO, `placement.visible` stayed `false`, so the popup treated an
   inline form of unknown position as off screen. **Fix:** `visible` now starts
   as `null` (unknown) and only becomes `true`/`false` from a real observer
   entry. The popup treats anything but `false` as on screen, so it fails
   closed. This also covers the moment before a browser's first entry arrives.
   No impression is ever counted without a ratio. Popup-only pages are
   unaffected. Tests: *without IntersectionObserver an inline form fails
   closed*, *a popup-only page still gets the popup at five seconds*, *an inline
   form whose first observer entry has not arrived yet also holds the popup*.
   Two older tests that mounted an inline form without any observer entry now
   deliver the off-screen entry a browser sends on `observe()`.
2. **A late animation frame could resurrect a finished popup.** `show()` unhid
   the panel and set `data-visible` in a `requestAnimationFrame`. A `hide()`
   before that frame returned early (`data-visible` was still `false`), leaving
   the panel unhidden, and the late frame then revealed it. The impression and
   `popup_shown` were also counted before any paint. **Fix:** the frame id is
   kept. `hide()` cancels it, and the callback is also guarded on `finished`. A
   popup hidden before paint is re-hidden with no event (nobody saw it).
   `newsletter_popup_shown` and the `popup` impression are now sent from the
   frame callback, i.e. only once the popup is actually revealed. Tests use a
   queued (async) fake `requestAnimationFrame`: *stood down before its first
   frame stays hidden and reports nothing*, *a signup elsewhere before the popup
   paints cancels it the same way*, *a painted popup reports shown and
   impression exactly once*.
3. **Unused-parameter hints** in the test helpers (`mountPopup(p)`,
   `mountInline(p, …)`) were renamed to `_page`, taking hints from 24 to 22. The
   remaining test-file hint is the `FormData` constructor stub, which mirrors
   the existing pattern in `newsletter-signup.test.js`.

Scope was not broadened. The changes are limited to `newsletter-signup.js`
(placement visibility state, popup reveal/hide) and the exposure tests.

**History.** In the first pass, this session's permission layer refused
`npm ci` and `npx`, so only `npm test` could run. The orchestrator then
installed the locked dependencies (`npm ci`), symlinked `playwright-core` into
`node_modules` from scratch tooling, and set `CHROMIUM_PATH`. Every gate above
was run after that. `npm run build` re-stamps the tracked `public/llms-full.txt`;
I restored it with `git checkout -- public/llms-full.txt` so it is not part of the diff.

The first QA run scored 99/101. Both failures were "popup not shown at
4,999ms", and both were bugs in the QA script, not the product. A plain
`page.clock.install()` lets fake time keep flowing with real time, so page
load and the real 250ms IntersectionObserver waits had already used up part
of the five seconds. The script now pauses the fake clock (`freezeClock`:
`install` then `pauseAt`), so page time only moves through `runFor()`. Two
smaller script fixes were also needed: the preview server path
(`node_modules/astro/bin/astro.mjs`) and splitting batched collect bodies on
`\r?\n`. No product code changed after the first QA run.

## What changed

### Placements (server-rendered, offer unchanged)
- `NewsletterInline.astro` takes `source` (`in_post` default | `home_inline` |
  `parks_inline`) and `compact`. `source` becomes `data-newsletter-source` and
  namespaces every id (`newsletter-home-inline-email`,
  `newsletter-parks-inline-email`, …). `in_post` keeps its original
  `newsletter-inline-*` ids. Copy, button, consent line, honeypot, hidden
  `consent=yes`, `action="/api/forms/newsletter" method="post"` are unchanged.
- Homepage: compact CTA directly below the hero, above the site counts.
- `/directory/parks`: compact CTA in a new optional `intro` slot of
  `DirectoryLayout`, under the page heading and **outside** `#directory-grid`
  (the filter script only manages `#directory-grid > article`). Shops and
  groups indexes do not pass the slot and render exactly as before.
- Blog posts keep `<NewsletterInline />` (`in_post`). `/newsletter/error/` also
  keeps the default `in_post`, as before; I did not introduce a new source the
  brief did not ask for.
- All of these go through `bindNewsletterForm`: same URL-encoded body, the same
  `Accept: application/json` fetch, the same HTML 303 fallback for no-JS, the
  same `cc-newsletter-*` bookkeeping. No backend file changed.

### Popup policy (`initNewsletterSignup`)
- The **only** trigger is `POPUP_DELAY_MS = 5000`. The 50%-scroll trigger, the
  45s first-page timer and the 1.5s subsequent-page timer (and the
  `cc-page-views` counter that fed it, including the line on
  `/newsletter/error/` that seeded it) are removed.
- After five seconds the popup is shown at most once per page, and only when,
  at the same moment: the visitor is not suppressed (re-read from storage), the
  tab is visible, no inline CTA is on screen (any intersection) or in use
  (focused, has a typed address, or a request in flight), and no form control
  anywhere has focus (input/textarea/select/contenteditable — e.g. the
  directory search or filters).
- **Later eligibility (deliberate):** if any condition fails at five seconds it
  does not give up. It re-checks on `focusin`, `focusout`, `input`,
  `visibilitychange` and on an inline CTA's state change (scrolling in/out of
  view, request start/finish). So a visitor who scrolls past the top inline CTA
  and keeps reading can still get the popup, once.
- An open popup **stands down** (`newsletter_popup_stood_down`,
  `newsletter_reason: inline_visible`; not a dismissal, no storage write) when
  an inline CTA comes into view while the popup itself is not in use. It never
  reopens on that page. A half-typed or submitting popup is never pulled away.
- Unchanged: excluded routes (`/submit`, `/newsletter`, `/privacy`, now one
  exported `isPopupExcludedPath`), the 30-day close-button dismissal (popup
  only), Escape hiding for the page without a dismissal, pending (2h) and
  subscribed suppression, and the `cc:newsletter-pending` stand-down after a
  signup elsewhere (now `newsletter_reason: signup_elsewhere`).

### Analytics
- Every `gtag('event', …)` now carries `send_to: 'G-VYW5FDDX52'`
  (`GA4_MEASUREMENT_ID`). No `config` command, no page_view. The dataLayer
  push is kept (GTM channel). dataLayer and gtag sinks are in separate
  `try` blocks, so a throwing sink can block neither the request nor the other sink.
- Every event now carries `newsletter_source` (`popup`, `home_inline`,
  `parks_inline`, `in_post`); popup lifecycle events had none before. Unknown
  `data-newsletter-source` values fall back to `in_post`, so markup can never put
  free text into analytics. The only other param is the fixed stand-down
  reason. No address, token or typed value is ever a parameter.
- New exposure event `newsletter_impression`, separate from
  `newsletter_signup_submitted` / `_pending` / `_error`:
  - inline: once per mounted placement per page, the first time an
    IntersectionObserver entry **for that form** reports `isIntersecting` and
    `intersectionRatio >= 0.5` while the document is visible and the form is
    still live (not replaced by "check your inbox"/"subscribed"). A form on
    screen in a background tab is counted when the tab becomes visible, only if
    still on screen. Thresholds `[0, .25, .5, .75, 1]` so the crossing is
    observed. Without IntersectionObserver: no impression (no guess), and the
    form's visibility counts as unknown, which holds the popup (fail closed).
  - popup: once, from the animation frame that actually reveals it (it only
    opens to a visible tab and is fixed to the viewport). A popup hidden before
    that frame reports nothing. `newsletter_popup_shown` is still sent too.
  - A page restored from bfcache is the same mounted page: no second impression.

## Evidence

### Test-first: the new regressions failed on the original module
`src/scripts/newsletter-exposure.test.js` imports the module as a namespace,
so it ran against the unmodified `newsletter-signup.js` and failed on behaviour:

```
$ node --test src/scripts/newsletter-exposure.test.js   # before implementation
ℹ tests 26   ℹ pass 6   ℹ fail 20
✖ the October 8 routing regression: a submit event names the GA4 destination
    actual: undefined, expected: 'G-VYW5FDDX52'
✖ the popup appears at five seconds, never earlier, regardless of scrolling or page count
    AssertionError: no scroll trigger is installed  actual: 1, expected: 0
✖ later eligibility / stand-down / impressions / visibility / source / suppression … (18 more)
```

The six that passed on the baseline were behaviours that already held (e.g.
an inline signup standing the popup down, pending/subscribed suppression).
The October 8 probe (`…/2026-10-08/newsletter-analytics-routing.regression.test.mjs`)
is reproduced verbatim as the first test in that file; running the original
file outside the worktree was refused by the permission layer.

### After implementation
```
$ npm test                       # after the review fixes
ℹ tests 98   ℹ suites 0   ℹ pass 98   ℹ fail 0
$ npx astro check
Result (69 files): 0 errors, 0 warnings, 22 hints
$ npm run build
[build] 409 page(s) built in 4.14s — Complete!
$ node scripts/qa-newsletter-exposure.mjs --out docs/qa/newsletter-exposure
101/101 checks passed.   (exit 0; full log: docs/qa/newsletter-exposure/qa-run.log)
$ git diff --check     # no output
```

`astro check` hints are pre-existing in kind. Two are the
`FormData` constructor stubs in the test files, one of them pre-existing.

Two fixtures in the existing `newsletter-signup.test.js` were updated, not
weakened: the fake document now reports `visibilityState: 'visible'`, and the
"second page view shows it immediately" premise (the removed 1.5s trigger) is
now "the immediate fake timer has run out the five seconds".

New coverage (`newsletter-exposure.test.js`, 32 tests, fake DOM/clock/IO, fetch
mocked, no network):
- **Routing:** the Oct-8 probe; every gtag command across impression, popup
  shown, submit and error is `event` (never `config`/`page_view`), has
  `send_to: G-VYW5FDDX52` and an allow-listed source; serialized analytics
  contains neither the address nor anything token- or address-shaped; a
  throwing `gtag` does not block the URL-encoded POST.
- **Five seconds:** no scroll listener is installed; not at 1.5s with seven
  session page views; not at 4,999ms; shown at 5,000ms.
- **Coordination incl. later eligibility:** hidden tab defers; a focused
  control defers until focus leaves; a visible inline holds it, scrolling it
  away after 5s makes it eligible; scrolling away before 5s still waits the
  full 5s; a typed-into inline holds it; an in-flight inline request holds it;
  an open popup stands down when the inline appears (no dismissal, no storage)
  and does not reopen after repeated scrolling; a popup in use is not pulled
  away; an inline signup before 5s means it never appears.
- **Suppression:** excluded routes; dismissal suppresses the popup only (inline
  still shown and counted); pending and subscribed show the outcome, no form,
  no impression, no popup; Escape is per page; close records the dismissal.
- **Impressions:** 0.01, zero-area-intersecting and 0.49 do not count, an entry
  for another element does not count, 0.5 does; five scroll cycles count once;
  two placements count once each under their own source; hidden-tab handling
  both ways; a form replaced by its outcome is not counted; unknown source →
  `in_post`; no IntersectionObserver → no impression and the popup is held
  on pages with an inline form, but still shown on popup-only pages.
- **Paint race:** with queued animation frames, a popup stood down or
  superseded by a signup before its first frame stays hidden and reports
  nothing, and a painted one reports shown/impression exactly once.
- **Submitted / pending / error (local mocks):** exact event sequence
  `impression → submitted → error → submitted → pending`, all tagged
  `home_inline`; readable error copy and re-enabled button; `Accept: application/json`.
- **Markup contract** (source-level, so it runs in `npm test` without a build): the
  component's `source` union equals `INLINE_SOURCES`, the homepage and parks
  index pass `home_inline` / `parks_inline`, blog keeps the default, and the
  intro slot precedes `#directory-grid`.

## Browser QA (run: 101/101 pass)

Evidence is in `docs/qa/newsletter-exposure/`: `qa-run.log` (every check line),
`results.json` (per-check detail, transport, aborted hosts), and screenshots
`{desktop,mobile}-{home_inline,parks_inline,popup-open}.png`. The parks
screenshot is taken after the "filtering still works" check, so its grid shows
the intended "No listings match" state.

**Intercepted transport (final run).** The real GTM container and Google tag
scripts loaded: 4 GETs from `www.googletagmanager.com`. That tag produced 7
collect requests. All 7 were answered with 204 inside the browser context and
none left the machine. Parsed newsletter hits, all with `tid=G-VYW5FDDX52`:

| `en` | `ep.newsletter_source` | hits (desktop + mobile) |
|---|---|---|
| `newsletter_impression` | `home_inline` | 2 |
| `newsletter_popup_shown` | `popup` | 2 |
| `newsletter_impression` | `popup` | 2 |
| `newsletter_popup_stood_down` | `popup` | 2 |

So with `send_to`, the newsletter events *are* emitted by the real tag, where
the October audits saw destination-less events stay queued. There were also 2
`page_view` hits, one per coordination page. They come from the container's
own config; this code issues no `config` command, and the routing check
asserts that. The only other external request was `fonts.googleapis.com`,
which was aborted. This is transport evidence, not GA4 ingestion.

`scripts/qa-newsletter-exposure.mjs` serves `dist/` with `astro preview` on
`127.0.0.1:4387` and runs every scenario at desktop 1440×900 and mobile 390×844
(Chromium, `isMobile`/touch on mobile), writing `results.json` and screenshots
to `$TMPDIR/cc-newsletter-exposure-qa` (or `--out DIR`). Exit code is non-zero on
any failed check. Safety is installed on the context **before** the first
navigation:
- `/api/forms/*` is always fulfilled by a local mock (JSON `{ok:true}` or a 502
  HTML page; 303 to `/newsletter/pending/` or `/error/` for `text/html` posts),
  never forwarded. The only address used is `qa-local-mock@example.invalid`.
- Any URL matching GA/collect patterns (`/g/collect` incl. `www.google.com/g/collect`,
  `/j/collect`, `google-analytics.com`, `analytics.google.com`, `doubleclick.net`)
  is recorded and answered 204 locally. An init script also wraps
  `navigator.sendBeacon` for the same patterns.
- Only GETs of `www.googletagmanager.com/gtm.js|gtag/js` are allowed out, so
  the real tag can show what it *would* transmit; `--no-tags` aborts those too.
  Every other external request is aborted and its host recorded.
- Timers run on a paused `page.clock` that only moves through `runFor()`. Tab
  visibility is driven by an init-script override.

DOM assertions per viewport: one CTA per page with the right source, no
duplicate ids, namespaced ids, near the top (within 1.5 viewports), offer copy
unchanged, correct action/method, parks CTA outside/above `#directory-grid`
and filtering still works; popup not at 1.6s on a "later" page, not on scroll
to bottom, not at 4,999ms, open just after 5s with one `popup` impression;
held while the home inline is on screen, appears once it scrolls away, stands
down when it returns, never reopens, no dismissal written, `home_inline`
impression counted once over repeated scrolling, stand-down reason, every gtag
command names `G-VYW5FDDX52`; held while `#filter-search` has focus and shown
once it blurs; hidden tab → no impression/popup, visible → one `parks_inline`
impression; dismissal hides popup only; pending → outcome shown, no
form/impression/popup; no popup on `/privacy/`, `/submit/`, `/newsletter/error/`;
mocked success and error flows (one URL-encoded POST asking for JSON, state,
event sequence, address never in analytics); **no-JS**: inline form rendered
and visible with the popup hidden on `/` and `/directory/parks/`, and a native
submit lands on `/newsletter/pending/` via the mocked 303.

Transport is reported separately from dataLayer: `results.json.transport`
parses intercepted collect hits (`tid`, `en`, `ep.newsletter_source`). When tag
scripts loaded, the run fails unless newsletter hits were intercepted and all
carry `tid=G-VYW5FDDX52`. Interception is not GA4 ingestion; that can only be
confirmed after deploy in GA4 itself.

## Reproduce

```bash
cd /home/beno/Projects/worktrees/cc-newsletter-exposure-20261016
npm ci
npm test
npx astro check
npm run build                 # regenerates public/llms-full.txt; restore it if not committing
npm install --no-save playwright-core   # or symlink an existing install into node_modules
# Use the Chromium that playwright-core version downloads, or an installed one, e.g.:
CHROMIUM_PATH=$HOME/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
  node scripts/qa-newsletter-exposure.mjs --out docs/qa/newsletter-exposure
# add --no-tags for zero external fetches (the transport check is then skipped)
git checkout -- public/llms-full.txt    # undo the build stamp if not committing
```

Port 4387 must be free: the script starts its own `astro preview` there and
stops it on exit.

## Risks and judgement calls
- **A partly visible inline holds the popup.** On desktop the homepage CTA is
  partly in the first viewport, so a visitor who never scrolls never sees the
  popup there; the inline form is the offer in that case. Intentional.
- **A focused filter radio/checkbox holds the popup** until focus moves. This
  is the price of never interrupting the directory filters.
- **Lighthouse (CI)** audits `/` and `/directory/parks/`. The compact CTA reuses
  the existing component's colours (orange eyebrow, white-on-orange button,
  already present on the homepage hero). Lighthouse was not run locally; CI runs it.
- `newsletter_impression` and `newsletter_popup_shown` both fire when the popup
  opens. Use `newsletter_impression` by source for exposure; `popup_shown`
  remains for continuity.
- Do not add GTM custom-event tags for the `newsletter_*` names while the
  direct `send_to` routing exists — every event would be counted twice.

## Deployment (not performed)
From `.do/app.yaml` and `.github/workflows/`:
1. Open a PR from this branch to `main`. `ci.yml` runs the duplicate-post check,
   `astro check`, `npm test`, the production build, the link check against
   the preview on port 4321, and Lighthouse on `/`, `/directory/parks/`, `/blog/`,
   `/faq/`. `content-safety-gate.yml` concerns health content; this PR adds none.
2. Merging to `main` auto-deploys: the static site component `web`
   (`npm run build` → `dist/`) and the `api` functions component both have
   `deploy_on_push: true` on `lookgugu/concretecomeback.com`. DigitalOcean deploys
   its **stored** app spec, not the file; this change touches neither the
   spec nor `functions/`, and needs no new secret.
3. `deploy-check.yml` then waits for the new `llms-full.txt` build stamp
   (cache-busted) and runs the function health/honeypot smoke tests. It sends
   no real signup.
4. Cloudflare caches HTML with `s-maxage=86400`, so `/` and `/directory/parks`
   may serve the old HTML for up to 24h; verify with a cache-busting query.
5. After deploy, confirm in GA4 property `543447613` (realtime/debug view) that
   `newsletter_impression` arrives with `newsletter_source`, without running a
   signup (none is authorised). This session did not run `doctl`: even
   `command -v doctl` needed approval. The orchestrator's read-only `doctl`
   check reports that stored app `5646075c-e724-4fde-954d-8c8d111a78dd`
   (`concretecomeback-www`) deploys `lookgugu/concretecomeback.com` `main` with
   `deploy_on_push: true`. Per that same report, `web` builds with `npm run build`
   into `dist`, `api` sources `functions/`, and ingress routes `/api`. That
   matches `.do/app.yaml`, so merging is the whole deploy step. No deployment
   configuration was changed.

## Safety
No real signup, email, contact, confirmation link or production request was
made. No secret was read, no provider or deployment configuration changed, no
push/merge/deploy, no cron added, no other worktree, profile or the main
checkout touched. Unit tests replace `fetch` with in-memory mocks; the QA
script answers `/api/forms/*` and every collection URL locally.
