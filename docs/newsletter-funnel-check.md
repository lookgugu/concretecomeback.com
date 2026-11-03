# Daily newsletter funnel check

Instructions for the existing scheduled cloud routine "CC newsletter funnel check".
**Read-only: never edit files, commit, open PRs, change providers or register GA
custom dimensions from that routine. Do not create another schedule.**

## What the funnel measures

The newsletter uses double opt-in: submitting requests a signed confirmation
email; confirming creates or reactivates membership in the newsletter segment.
A provider email is evidence of a successful confirmation-send request, not of
all submission attempts. Zero provider emails does **not** rule out attempts
that failed before the provider call.

The October 20, 2026 audit found zero external subscribers and two internal
members (owner and documented canary). Do not count either internal member as
growth. The newsletter is in preparation; delivery is not scheduled. Postal
footer work is released, but delivered native unsubscribe evidence and a
canary-free production audience remain separate release gates. Existing
sitewide signup defaults still describe weekly delivery without launch-stage
qualification. Those defaults remain an explicit **release HOLD/backlog**;
landing and outcome corrections do not resolve that broader copy mismatch.

## Check 1 — segment members

Read only segment `35b5b4f0-ac74-4ffa-b7d3-620e4f0014ed` (Concrete Comeback),
following pagination to completion. The provider account is shared with other
projects. Never use account-wide contacts as this newsletter's audience.
Use the existing subscriber checker to separate owner/canary from external
members. Membership alone does not establish individual consent provenance.

## Check 2 — confirmation sends

Paginate available email history and count the subject **"Confirm your Concrete
Comeback roundup"** within the reporting window. Separate internal tests from
external candidates, state the earliest available timestamp and any retention
gap, and report sends separately from submitted/pending analytics events.
Do not infer a confirmation rate without a joined, verified external cohort.

## Check 3 — GA4 via the existing read-only API

The October 20 audit verified **local** service-account Analytics Data API
access to property `543447613` (timezone `America/New_York`). This does not
verify credentials, installed tools or network access in the scheduled cloud
routine. Cloud-runtime GA access remains **unverified**. Before reporting GA
figures, establish that the current runtime has an already-authorized read-only
client and can successfully query this property. Do not copy credentials from
a local machine, print credentials, change accounts or provision access here.

Portable read-only reporting recipe (only when runtime access is available):

1. Use the existing authorized identity with OAuth scope
   `https://www.googleapis.com/auth/analytics.readonly` and the Analytics Data
   API `properties/543447613:runReport` endpoint.
2. Resolve yesterday in `America/New_York`; use explicit inclusive start/end
   dates for complete 7-day and 28-day windows ending yesterday. Exclude the
   current partial property-timezone day.
3. Request separate reports for totals (`totalUsers`, `sessions`,
   `engagedSessions`, `engagementRate`), acquisition (`sessionDefaultChannelGroup`
   with sessions/engagedSessions), landing pages (`landingPagePlusQueryString`
   with sessions/engagedSessions), and events (`date`, `eventName` with
   `eventCount`, `totalUsers`, filtered to the newsletter event names below).
4. Use explicit limit/offset pagination, advance by returned rows, and verify
   accumulated rows against `rowCount` for each report. Record request windows,
   filters, metrics/dimensions, response metadata and any thresholding or
   coverage limits. Do not silently label partial reports complete.
5. If credentials/tools are absent, access is unverified, or a request fails,
   report **GA data unavailable in this runtime** with the reason. Do not
   substitute zero, claim local access proves cloud access, or invent a diagnosis.

Report sessions, engaged sessions, acquisition channels, landing pages and
`newsletter_impression`, `newsletter_signup_submitted`,
`newsletter_signup_pending`, `newsletter_signup_error`. Impression tracking was
repaired in October: the audit observed events from October 16–18 only. Do not
compare that partial measurement window with 28 days of traffic as a rate.
Large repeated direct-traffic counts warrant investigation, not an assumption
that every session represents an external human.

Events explicitly route to `G-VYW5FDDX52`; `newsletter_source` is allowlisted
as `popup`, `home_inline`, `parks_inline`, `in_post`, or `newsletter_landing`.
An inline impression requires a visible foreground form and is deduplicated per
mounted placement. The October 20 audit found no registered source custom
dimension. Registering it is a separate authorized admin task; historical
placement reports cannot be reconstructed from current API metadata.

Campaign links may use `?utm_source=partner_slug&utm_medium=referral&utm_campaign=first_readers`.
GA session attribution supports landing-session reporting. These UTMs are not
persisted into confirmation tokens or provider contacts, so provider-confirmed
members cannot be assigned exactly to partners from this instrumentation.

## Interpretation and reporting

| Signal | Interpretation |
|---|---|
| Few impressions | Check measured traffic, visibility and coverage before changing placement. |
| Impressions but no submitted events | Investigate audience and offer; this alone does not establish the cause. |
| Submitted events but no pending events | Investigate request failures and analytics coverage. |
| Pending events/sends but no confirmed members | Inspect deliverability and confirmation, excluding internal tests. |

The existing routine's authorized email summary uses
`hello@concretecomeback.com` → `beno.chapman@gmail.com`, subject
`CC newsletter check`, under 150 words. Report external segment members,
confirmation sends, measured funnel events, coverage and uncertainties.
Editing this document does not authorize a new send or schedule. If API access
fails, report unavailable data and the error rather than zero or a guessed
conversion diagnosis. State plainly when nothing has changed.
