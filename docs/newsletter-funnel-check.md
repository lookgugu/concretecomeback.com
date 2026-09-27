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

PR #80 (merged 2026-09-26) made the CTAs send their events to GA4 through
`gtag`, because the GTM container has no triggers for the `newsletter_*` events
and every one of them had been dropped since launch. `newsletter_popup_shown` is
therefore the number that matters, not the subscriber count.

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

## Check 3 — traffic and events (Windsor-ai → GA4)

GA4 property `543447613`. Pull the last 7 days of `event_name` + `event_count`,
and sessions/users if available.

**Trap:** if any returned field contains `not your real numbers` or `reads are
paused`, the Windsor free-plan limit is blocking reads and the numbers are
placeholders. Report GA4 as **UNAVAILABLE** in that case. Never present those
zeros as real data — they are indistinguishable from a genuine zero at a glance.

## How to read the result

| Signal | Meaning | Next step |
|---|---|---|
| `newsletter_popup_shown` ≈ 0 | The CTA is rarely seen. It triggers at 45s on a first pageview, or 50% scroll — and traffic is almost entirely first-time, single-page visitors. | Loosen the triggers in `src/scripts/newsletter-signup.js` |
| `popup_shown` healthy, submissions 0 | People see it and decline. | Offer and copy problem, not plumbing |
| Submissions > 0, subscribers 0 | People submit but never confirm. | Investigate deliverability and the confirm step |

## Reporting

Email a summary to `beno.chapman@gmail.com` from `hello@concretecomeback.com`,
subject `CC newsletter check`. Under 150 words:

1. subscribers in the segment (excluding the canary),
2. confirmation emails sent in the last 24h,
3. GA4 status — `newsletter_popup_shown` count, or UNAVAILABLE,
4. one line on what it means, using the table above.

State plainly when nothing has changed. A quiet day is a valid result and should
read as one sentence, not a padded report.
