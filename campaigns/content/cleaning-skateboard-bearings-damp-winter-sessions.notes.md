# SEO Content Working Notes: cleaning-skateboard-bearings-damp-winter-sessions
Date: 2026-11-19

## Phase 1: SERP Evidence Summary
- **Queries:** `how to clean skateboard bearings after wet pavement` / `winter skateboard bearing maintenance` / `can you clean rusted skateboard bearings with isopropyl alcohol or acetone wd40`
- **Observed Ranking Pages (via live web search, summaries):**
  1. `sector9.com` (~650w, brand maintenance guide): covers popping shields off with a razor blade, soaking in isopropyl alcohol or acetone, drying with compressed air, and applying 1 to 2 drops of skate lube. Warns against WD-40. No solvent-by-solvent comparison table (70% vs 91% vs 99% IPA vs acetone vs citrus degreasers) or winter road-salt corrosion timeline.
  2. `tactics.com` & `warehouseskateboards.com` (~550w to 700w, retail guides): standard 6-step bearing cleaning tutorials aimed at dry-weather dirt buildup. Mention using glass containers for acetone, but do not distinguish cosmetic surface flash rust from structural raceway pitting or explain why 70% rubbing alcohol and water-rinsed citrus cleaners trigger flash rust in cold, humid winter rooms.
  3. `routeone.co.uk` & `skamidan.com` (~600w, retailer blog posts): explain why WD-40 strips grease and attracts dust, and cover basic alcohol agitation. Neither quantifies the 4-to-6-hour wet salt-brine corrosion window on SAE 52100 chrome steel or compares low-viscosity skate oil against marine/PTFE grease for sub-45°F winter commuting vs park sessions.
  4. `reddit.com/r/OldSkaters` & `r/NewSkaters`: frequent winter threads from riders who rolled through damp car parks or salted concrete paths, put the board away overnight, and woke up to locked wheels. Top community questions revolve around whether crunchy rusted bearings can be saved, whether acetone melts nylon ball cages, and whether a $20 beater set of Bones Reds or Mini Logo bearings beats cleaning high-end Swiss bearings in winter.

## Phase 1.5: AI Surface Analysis
```
AI SURFACE: "how to clean skateboard bearings after wet pavement" & "can you clean rusted skateboard bearings with isopropyl alcohol or acetone wd40"
AIO present: yes · Cited: sector9.com (step-by-step shield removal, solvent shake, 1-2 drops skate oil), tactics.com (acetone in glass jar warning and WD-40 lubricant myth), routeone.co.uk (91%+ isopropyl alcohol vs 70% water content), reddit.com (flash-rust air-drying warning and pitted-race replacement threshold)
Variant phrasings cited: conversational prompts ("my skateboard bearings got wet in winter and won't spin, can I save them?") pull Reddit and skate shop summaries noting that solvents dissolve old grease and road salt grime rather than structural rust pits, and emphasizing immediate forced-air drying.
Citation gap: No single cited page provides (1) an extractable solvent safety matrix comparing water content, nylon-cage compatibility, grease-cutting speed, and flash-rust risk across 99% IPA, 91% IPA, 70% IPA, pure acetone, citrus cleaner, and WD-40, plus (2) a diagnostic decision table separating recoverable surface flash rust from permanent SAE 52100 raceway pitting.
```

## Phase 2: Coverage Map & Claim Contract
- **Primary Keyword:** `cleaning skateboard bearings after wet pavement`
- **Secondary Keywords:** `winter skateboard bearing maintenance`, `how to clean wet skateboard bearings`, `isopropyl alcohol vs acetone skateboard bearings`, `why is wd-40 bad for skateboard bearings`
- **Play Role:** Spoke 3 in `./campaigns/content-plan/play-hardware-joint-setup.md`
- **Author Assignment:** Marcus Webb (Age 47; skated 13 to 26, took a 20-year break, came back at 46). Compact, street/park-grounded voice focused on setup mechanics and realistic winter maintenance choices.
- **Claim Contract:**
  - *May say:* Standard 608 skate bearings use SAE 52100 chrome steel balls (typically 7 balls in a nylon retainer cage) and races; road salt (sodium chloride / magnesium chloride) accelerates galvanic/electrolytic surface oxidation within 4 to 6 hours; 70% rubbing alcohol is 30% water by volume; pure acetone attacks polycarbonate/ABS plastics and can embrittle nylon cages if soaked; 1 to 2 drops of light skate oil is the standard lubrication charge per bearing.
  - *Must not say:* Never invent personal memories or fabricated anecdotes for Marcus Webb; never claim solvents dissolve deep structural pitting in steel races; never use "adult" or "adults" in public-facing copy; never use em/en dashes (`—`, `–`) or decorative bold labels (`**...**`).

## Phase 4 & 6: 4-Stage `author-voices` + `humanizer` & Quality Gate Verification
1. **Stage 1 (Persona & Exemplar Alignment):** Matched to Marcus Webb's setup/hardware beat and calibrated against `src/content/blog/cold-weather-skateboarding-urethane-bearings-joints.md` (starts with the everyday setup mistake returning skaters make after a damp winter roll, explains the hardware chemistry and mechanics plainly, and ends on a practical shop/park choice).
2. **Stage 2 (Guardrails & Terminology):** Zero invented personal memories or witnessed sessions; uses "older skaters" and "returning skaters" exclusively (0 occurrences of "adult/adults" outside legacy URL slugs).
3. **Stage 3 (`humanizer` 26-Pattern Sweep):**
   - `node scripts/check-humanizer.mjs` verified: 0 tells across `cleaning-skateboard-bearings-damp-winter-sessions.md`, `cold-weather-skateboarding-urethane-bearings-joints.md`, and `cold-weather-skate-layering-winter-sessions-with-pads.md`.
   - 0 em dashes (`—`), en dashes (`–`), or spaced double-hyphens (` -- `).
   - 0 inline bold (`**...**`) or bold-labeled list items in prose or table cells.
   - 0 "Not X, but Y" contrasts, 0 one-line dramatic closers, 0 AI crutch words.
4. **Stage 4 (Track A/B GEO & Link Verification):**
   - 40 to 80 word self-contained answer-first block under every H2.
   - Two original extractable comparison/diagnostic tables (Solvent Compatibility & Flash-Rust Matrix; Post-Flush Bearing Rust Diagnostic Matrix).
   - 6 verified `/blog/<slug>/` internal links and 2 `/directory/` links (`discover_topics.py --verify-links` returns `"all_ok": true`).
   - Reciprocal forward links added in `cold-weather-skateboarding-urethane-bearings-joints.md` and `cold-weather-skate-layering-winter-sessions-with-pads.md`.
