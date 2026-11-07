# Sent-issue ledger

One `<issueId>.json` per weekly issue that was **actually sent**, written by
`scripts/newsletter/record-sent.mjs` and committed by hand. The draft
generator reads this directory to decide where the next newness window starts
and which canonical URLs may never be featured again; it never writes here.

An empty directory means no issue has been sent yet (bootstrap). Anything
other than `README.md`, `.gitkeep` and valid `YYYY-MM-DD.json` sent records
fails the draft run closed. See `docs/weekly-newsletter.md`.
