# Article engagement scorecard

Two parts:

1. **`scripts/analytics/article_scorecard.py`** — a read-only GA4 report over published articles.
2. **`src/scripts/article-engagement.js`** — an on-page tracker that adds article reading and click events.

The scorecard runs fine without the tracker. Every tracker metric and every newsletter event metric stays **UNKNOWN** until a verified rollout is recorded in `scripts/analytics/instrumentation-rollout.json` (see *Rollout controls*).

## Running the report

```bash
pip install google-auth requests        # the only Python dependencies
python3 scripts/analytics/article_scorecard.py --verbose
```

| Flag | Default | Notes |
|---|---|---|
| `--credentials` | `/home/beno/.config/gm_tbrd/ga4-service-account.json` | Passed to google-auth with the `analytics.readonly` scope. The script never reads, prints or copies the key. |
| `--out` | `/home/beno/clawd/reports/cc-article-scorecard/current` | Refused if it is inside this repo or has a `public`/`dist`/`www`/`htdocs` path component. |
| `--end-date` | yesterday (America/New_York) | Must be a complete New York day. |
| `--angles` | none | Curated JSON `{ "slug": "angle" }`. Without it, every article's angle is `unclassified`. |
| `--manifest` | runs `article-manifest.mjs` | A pre-built manifest. Used by the tests. |
| `--rollout` | `scripts/analytics/instrumentation-rollout.json` | Validated before any GA4 call; an invalid file exits 2. |

Output: `scorecard.json`, `.csv`, `.md` and `.html`. The Markdown and HTML both show:

- the caveats
- data quality
- each rollout's state and whether it covers the window
- included and excluded hosts
- excluded blog paths
- article rows, including the active-time, completion and navigation columns
- the author, tag and angle groups

The script writes them to a temp sibling directory, then swaps that directory into place, keeping the previous run as `<out>.previous`. If any step of the swap fails, both `current` and `previous` are restored. If a run fails, the current report is left untouched.

The script is quiet on success; pass `--verbose` for a one-line summary. Exit codes:

| Code | Meaning |
|---|---|
| 0 | OK |
| 2 | Usage error (bad date, angles file or rollout config) |
| 3 | GA4 or data failure: HTTP error, wrong property timezone, sampled report, pagination mismatch, missing metadata field, or manifest failure |
| 4 | Unsafe output path |

Error messages are sanitised, so no key material or tokens appear in them.

Tests (fixtures only; no network, no credentials):

```bash
python3 -m unittest discover -s scripts/analytics -p 'test_*.py'
npm test     # includes scripts/analytics/*.test.mjs and the tracker tests
```

### What it queries

The report only queries GA4 property `543447613`. Each window (7 and 28 days, ending on the end date) runs five `runReport` calls, all paginated with `limit`/`offset`:

| Report | Dimensions | Metrics | Filter |
|---|---|---|---|
| pages | pagePath | screenPageViews, userEngagementDuration, totalUsers | host in {concretecomeback.com, www.concretecomeback.com}, path begins `/blog` |
| events | pagePath, eventName | eventCount | host, eventName in the newsletter_* / article_* list |
| events_sitewide | eventName | eventCount | host, same list (reported as observed counts only; never proof of coverage) |
| hosts | hostName | screenPageViews | path begins `/blog` |
| article_scope_users | — | totalUsers | host, `/blog/<slug>` shape, not pagination |

Before any report runs, the script calls the `metadata` endpoint. It fails if a standard field it needs is missing. It also lists any registered `customEvent:*` dimensions, but never queries them.

Every response's `metadata.timeZone` must be `America/New_York`, or the run fails. `dataLossFromOtherRow` and `subjectToThresholding` are recorded under `data_quality` (any flag sets `complete: false`). A sampled response fails the run.

### Article allowlist

`scripts/analytics/article-manifest.mjs` builds the allowlist from `src/content/blog`. It uses the newsletter's fail-closed frontmatter reader (`scripts/newsletter/content.mjs`) and keeps posts that are not drafts and are dated on or before the end date.

The report aggregates only paths matching `/blog/<allowlisted-slug>` with or without a trailing slash. Everything else is counted in buckets, never by raw path:

- `/blog` and `/blog/` → `blog_index`
- `/blog/<n>/` → `pagination`
- anything else, including unpublished or renamed slugs and odd casing → `unlisted`

## Metric dictionary

| Metric | Source | Additive across aliases / articles? |
|---|---|---|
| `pageviews` | screenPageViews. **Reach.** | yes |
| `engagement_seconds_foreground_proxy` | userEngagementDuration. Seconds the tab was in the foreground. **Not active reading.** | yes |
| `avg_engagement_seconds_per_pageview_foreground_proxy` | the above ÷ pageviews | — |
| `users` | totalUsers, only when the article appears under exactly one path row. Otherwise UNKNOWN. | **never summed** |
| `returning_users` | always UNKNOWN | — |
| `site_article_scope_users` | GA4-deduplicated totalUsers across all `/blog/<slug>` paths, including unlisted slugs (a superset) | — |
| `newsletter_impressions` | `newsletter_impression` on the page, any placement including the popup | yes, once covered |
| `newsletter_submitted` | `newsletter_signup_submitted`: a JS form submit attempt on the page. Counts attempts, not people. No-JS submits are invisible. | yes, once covered |
| `newsletter_pending` | `newsletter_signup_pending`: the endpoint accepted the address and sent a confirmation email. **Not a subscription.** | yes, once covered |
| `newsletter_confirmed` | always UNKNOWN per article. Confirmation happens on another page and there is no join back to the article. | — |
| `active_30s` / `active_60s` / `active_120s` | `article_active_30s` / `_60s` / `_120s`: page views reaching 30 / 60 / 120 s of **active reading time** (tab visible, article body on screen, interaction within 30 s) | yes, once covered |
| `meaningful_reads` | `article_meaningful_read` | yes, once covered |
| `completions` | `article_read_complete` | yes, once covered |
| `next_article_clicks` | `article_next_click` | yes, once covered |
| `directory_clicks` | `article_directory_click` | yes, once covered |
| `low_traffic` | pageviews < 50 in the window. A caution flag, not a ranking. Rows are alphabetical. | — |
| `partial_window` | the article was published after the window started | — |

Groups:

- **author**: additive.
- **topic_tag**: overlapping (`additive: false`) because a post carries several tags. Never sum tag rows.
- **editorial_angle**: always `unclassified` unless a curated `--angles` file is supplied.

Each group sums every additive metric: reach, foreground engagement, the newsletter events, the active-time milestones, meaningful reads, completions and both navigation clicks. A group is UNKNOWN if any member is UNKNOWN; in that case it carries the summed `observed_lower_bound`. Users are UNKNOWN for every group.

## Unknown vs zero

- **Pageviews** absent for an allowlisted article are a measured 0. GTM page_view collection predates every window.
- **Newsletter and article events** are UNKNOWN unless their entry in the rollout config is `complete` with a `deployment_date` on or before the window start. Seeing an event somewhere on the site does **not** establish coverage of the whole window. Counts observed under unverified coverage are reported only as `observed_lower_bound` (shown as `UNKNOWN (≥n)`), never as the value. Absence is never reported as zero.
- **Hostname:** both production aliases count, `concretecomeback.com` and `www.concretecomeback.com`. GA4 filters on them and aggregates pagePath across them before counting users. Local hosts (`127.0.0.1`, `localhost`, `*.local`), preview hosts (`*.ondigitalocean.app`, `*.pages.dev`, …), `(not set)` and any other host are excluded. Excluded hosts are reported as per-class pageview totals and a distinct-host count; their names are not shown. The first live run found 290 `/blog*` pageviews from `127.0.0.1`. That was local QA traffic, not audience behaviour.
- **Internal traffic:** historical internal or tester traffic that was never marked cannot be removed.

## Rollout controls

Rollouts are controlled by `scripts/analytics/instrumentation-rollout.json`. Change it only in a reviewed PR. No Python edit is needed.

```json
{
  "schema_version": 1,
  "article_tracker":   { "version": null, "deployment_date": null, "completeness": "unknown", "evidence": null },
  "newsletter_events": { "version": null, "deployment_date": null, "completeness": "unknown", "evidence": null }
}
```

Validation runs before any GA4 call; any violation exits 2. The rules:

- `completeness` must be `unknown`, `partial` or `complete`.
- `deployment_date` is `YYYY-MM-DD` or null, and must not be after the report end date.
- `version` is a short string or null.
- No unknown keys are allowed.
- `complete` requires `version`, `deployment_date` and a non-empty `evidence` note saying how it was verified live.
- `article_tracker.version` must equal `TRACKER_VERSION` in `src/scripts/article-engagement.js`.

After the tracker is deployed **and verified live**, set its entry to the first full New York day it was live. Do the same for `newsletter_events` once its full-window coverage is verified. Windows that start before that date stay UNKNOWN, so the 7-day metrics become measurable 7 days after deployment and the 28-day metrics after 28 days. When the tracker's events change, bump `TRACKER_VERSION` and record a new rollout.

## The tracker

`BlogLayout.astro` marks the prose div with `data-article-body` plus build metadata:

- `data-article-slug`
- `data-article-author` (a slug-form key)
- `data-article-topic` (the first tag, as a slug-form key)
- `data-article-words`

It also embeds the published-slug allowlist as `#cc-article-allowlist`.

The end-of-post newsletter CTA, tags and footer sit outside that div, so they never count as progress.

- **Active time** accrues only when all three hold:
  - the tab is visible
  - some of the article body is inside the viewport (reading the newsletter CTA or footer below the article does not count)
  - the visitor has interacted within the last 30 s

  The timer stops while the tab is hidden. `article_active_30s`, `_60s` and `_120s` fire once each as active time crosses those marks.
- **Body progress** is recorded only under the same visible and in-view conditions. A hidden tab never advances it. A page restored or jumped to a point below the article (body entirely above the viewport) records no progress. Because of that, a single jump straight past the article end is not counted as a completion.
- **Thresholds** scale with word count (230 wpm):
  - meaningful read: 20 % of the expected reading time, clamped to 10–30 s, plus 25 % body progress
  - completion: 35 % of the expected reading time, clamped to 15–90 s, plus the body end on screen (≥ 98 %)

  A short article that fits on screen can still complete.
- **Clicks:**
  - `article_next_click` sends only `destination_slug`, which must be another allowlisted slug.
  - `article_directory_click` sends only `destination_section` (`parks` / `shops` / `groups` / `index`).
  - Both send `link_region` (`body` or `page`).

  GA4 records the page location itself, so pagePath stays the source article.
- **Dedup and errors:** each event is sent once per page view. On `pagehide` the tracker removes its listeners and stops. Any exception stops tracking and never reaches the page.
- **Routing:** events go through `src/scripts/analytics-transport.js`, the same routing as the newsletter (`send_to: 'G-VYW5FDDX52'`, dataLayer push, no `config`, no new page_view).
- **Custom parameters:** the event params (`article_*`, `destination_*`, `link_region`, `tracker_version`) are not registered as custom dimensions, and the scorecard does not depend on them.

### QA suppression

Either of these stops every `newsletter_*` and `article_*` event in that browser:

- `localStorage.setItem('cc-analytics-suppress', '1')`
- `window.__CC_ANALYTICS_SUPPRESS__ = true`

It does **not** stop GTM's own page_view, which fires from the container. Browser QA therefore still blocks collection at the network.

### Browser checker

```bash
npm run build
npm install --no-save playwright-core     # not a project dependency
node scripts/qa-article-tracker.mjs [--out DIR]
```

The checker serves `dist/` on `127.0.0.1:4397`. Before the first navigation it aborts every non-local request, including GTM, gtag.js and `google.com/g/collect`. It also wraps `sendBeacon` and `fetch`, and answers `/api/forms/*` with a local mock.

It checks:

- the meaningful read, then completion, each sent once
- the active-time milestones, each sent once
- that a page scrolled past the article sends nothing (skipped, with a note, if the page is too short to scroll the body out of view)
- that a short article completes
- that a hidden tab sends nothing
- that next-article and directory clicks are sanitised and sent once
- that QA suppression stops both article and newsletter events

It never requests a production URL. Exit code is 0 when all checks pass, 1 otherwise.

## Weekly run

Run the scorecard on Monday morning (New York). The default end date is Sunday, so the 7-day window is the full Monday–Sunday week.

The durable runner is outside the repo at `/home/beno/clawd/reports/cc-article-scorecard/runner/run-weekly.sh`. It points at a durable checkout, not the scratch worktree. It prints nothing and exits 0 on success. On failure it exits non-zero with the CLI's actionable message on stderr, logs it, and leaves the prior report in place.

The scheduling line is in that directory's `README.md`. The repo installs no cron.
