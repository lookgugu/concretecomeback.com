# Daily newsletter funnel check

Instructions for the scheduled cloud routine "CC newsletter funnel check".
**Read-only: never edit files, commit, or open PRs from that routine.**

## Why this exists

The newsletter is double opt-in: a visitor submits the form, receives a signed
confirmation link, and becomes a Resend contact **only** after clicking it.

As of 2026-09-26, roughly 1,400 visitors over 30 days had produced **zero** form
submissions — while the form itself was verified working end to end (submit →
email → confirm → segment). So the failure is upstream of the email, and the
open question is whether the CTA is *seen* at all.

PR #80 (merged 2026-09-26) made the CTAs send their events through `gtag`,
because the GTM container has no triggers for the `newsletter_*` events. Those
calls still produced no GA4 collect request: with no page-level `gtag` config
they had no destination. Every event now names the stream with `send_to`
(see "Signup analytics" in `CLAUDE.md`). **A zero or missing
`newsletter_popup_shown` / `newsletter_inline_shown` from before that change
deployed is a routing artefact, not evidence that nobody saw a CTA.** From the
deploy onward, those two impression events are the numbers that matter, not
the subscriber count.

## Check 1 — subscribers (Resend)

List contacts in segment `35b5b4f0-ac74-4ffa-b7d3-620e4f0014ed` ("Concrete
Comeback").

- **Only this segment counts.** The Resend account is shared with TBR Destroyer
  and 99CentVPN, so most account-wide contacts belong to other sites. Never
  report an account-wide contact count as Concrete Comeback signups — on
  2026-09-26 the account held 28 contacts while this segment held zero.
- `beno.chapman+cc-e2e-20260926@gmail.com` is a deliberate test canary. Exclude
  it from any signup count, but say so if it disappears (the segment plumbing
  would then be suspect).

## Check 2 — submissions (Resend)

List recently sent emails and count those with the subject **"Confirm your
Concrete Comeback roundup"** in the last 24 hours.

Each one means a visitor submitted the form. Zero means nobody did — which
distinguishes "nobody submitted" from "people submitted but never confirmed".
Those two have completely different fixes, so always report this separately from
the subscriber count.

## GA4 is not part of this check

There is no automated route to GA4. Windsor.ai was the only one and has been
dropped deliberately — do not try to read GA4, and do not report a traffic or
`newsletter_popup_shown` figure. Say the GA4 half is checked manually instead of
implying the number is zero.

`newsletter_popup_shown` (and, for the server-rendered form, `newsletter_inline_shown`,
counted only once the form is actually on screen and split by `newsletter_source`:
`in_post`, `home`, `directory`) is still what settles the
diagnosis; it just has to be read by hand in the GA4 app (property `543447613`)
by someone with access to it — no credential available to automation has any.
Never estimate it.

Analytics stops at `newsletter_signup_pending`. Views of `/newsletter/confirmed/`
are not confirmations — the page is public and can be loaded or reloaded by
anyone — so subscribers come from the Resend segment (Check 1) and nowhere else.

## How to read the result

| Signal | Meaning | Next step |
|---|---|---|
| Submissions 0 for days, `popup_shown` ≈ 0 since the `send_to` deploy (read manually) | The CTA is rarely seen. It triggers at 45s on a first pageview, or 50% scroll — and traffic is almost entirely first-time, single-page visitors. | Loosen the triggers in `src/scripts/newsletter-signup.js` |
| `popup_shown` healthy, submissions 0 | People see it and decline. | Offer and copy problem, not plumbing |
| Submissions > 0, subscribers 0 | People submit but never confirm. | Investigate deliverability and the confirm step |

## Reporting

Email a summary to `beno.chapman@gmail.com` from `hello@concretecomeback.com`,
subject `CC newsletter check`. Under 150 words:

1. subscribers in the segment (excluding the canary),
2. confirmation emails sent in the last 24h,
3. what it means — but only where these two numbers settle it.

**Whenever submissions in the last 24h are zero**, they do not settle it: "the
CTA was never seen" and "it was seen and declined" produce identical numbers and
are told apart only by `popup_shown`, which this routine cannot read. Say the
diagnosis is pending the manual GA4 check. Do not pick one.

This keys on submissions alone, never on the subscriber total — subscribers is a
cumulative count, so once a real subscriber exists it stays non-zero through
every quiet day and would otherwise mask exactly the case this rule protects.

State plainly when nothing has changed. A quiet day is a valid result and should
read as one sentence, not a padded report.
