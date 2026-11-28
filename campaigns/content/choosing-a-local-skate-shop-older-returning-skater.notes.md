# Verification Notes: Walking Into a Local Skate Shop After 40: What to Ask For

- **Slug / Canonical File:** `src/content/blog/choosing-a-local-skate-shop-older-returning-skater.md`
- **Campaign Copy:** `campaigns/content/choosing-a-local-skate-shop-older-returning-skater.md`
- **Author Voice:** Sam Torres (`authorAge: 44`), community organizer perspective, warm, practical, zero invented anecdotes.
- **Publication Date:** `2026-11-28`
- **Word Count:** 1,568 body words (1,646 total words including frontmatter), within the target 1,400–1,650 word window.

## 1. Humanizer Prose Lint (`scripts/check-humanizer.mjs`)
- Command: `node scripts/check-humanizer.mjs src/content/blog/choosing-a-local-skate-shop-older-returning-skater.md`
- Result: `✔ src/content/blog/choosing-a-local-skate-shop-older-returning-skater.md: 0 Humanizer tells`
- Zero em dashes, en dashes, or spaced double-hyphens.
- Zero decorative inline bold (`**...**`) or bold-label list items.
- Zero occurrences of user-facing `"adult"` / `"adults"` (only used in historical URL slugs).
- Zero `"not X, but Y"` contrasts, zero `"rather than"`, and zero AI crutch words.

## 2. Internal Link & Directory Handle Verification (`discover_topics.py --verify-links`)
- Command: `python3 ~/.gemini/config/skills/blog-research/scripts/discover_topics.py --verify-links src/content/blog/choosing-a-local-skate-shop-older-returning-skater.md`
- Result: `"all_ok": true`, `"broken_internal_links": []`
- **Verified Blog Cross-Links (6):**
  - `/blog/wheel-hardness-guide-for-adult-skaters/`
  - `/blog/what-board-size-for-adults/`
  - `/blog/skateboard-deck-concave-mellow-vs-steep-older-skaters/`
  - `/blog/skateboard-truck-bushings-durometer-weight-guide/`
  - `/blog/skateboard-riser-pads-vs-shock-pads-older-skaters/`
  - `/blog/safety-gear-guide/`
- **Verified Directory Hub & Shop Links (12):**
  - `/directory/shops`
  - `/directory/parks`
  - `/directory/groups`
  - `/directory/shops/us/cal-skate-portland-or`
  - `/directory/shops/us/35th-north-seattle-wa`
  - `/directory/shops/us/orchard-skateshop-boston-ma` (note: verified directory slug is `orchard-skateshop-boston-ma`)
  - `/directory/shops/us/uprise-chicago-il`
  - `/directory/shops/us/westside-skates-lakewood-oh` (note: verified directory slug for Westside Skates is `westside-skates-lakewood-oh`)
  - `/directory/shops/uk/slam-city-london`
  - `/directory/shops/ca/ninetimes-calgary-ab`
  - `/directory/shops/au/evolve-skate-store-prahran-vic` (note: verified Melbourne directory slug is `evolve-skate-store-prahran-vic`)
  - `/directory/shops/au/black-sheep-sydney`
