# SEO Content Refresh Notes: Six-Month Returner Pair & Post-Session Recovery Pair (De-Cannibalization, `author-voices` & `humanizer` Pipeline)
Date: 2026-11-19

## 1. De-Cannibalization Map Across the Two Overlapping Blog Pairs

Prior to this refresh, two pairs of blog posts in `src/content/blog/` overlapped in search intent, shared duplicate section claims, and triggered `scripts/check-humanizer.mjs` rules (em dashes `—`, bold-label list items `- **...**` and paragraph openers, user-facing `adult`/`adults` terminology, and AI crutch words such as `genuinely`):

1. **Pair A (Six-Month Returner Curve — Author: Sam Torres, Age 44):** `first-six-months-back-what-to-expect.md` and `why-adult-skaters-quit-at-six-months.md` were published one day apart (2026-09-19 and 2026-09-20) and both discussed the month-one novelty fade, month-three-to-four soreness/skill plateau, and six-month confidence transition.
2. **Pair B (Post-Session Recovery & Scheduling — Author: Marcus Webb, Age 47):** `recovery-days-for-adult-skaters.md` and `recovery-guide-for-adult-skaters.md` were published one day apart (2026-08-17 and 2026-08-18) and both covered 48-hour session spacing, sleep recovery, post-session ankle/hip mobility, and soreness-versus-joint-pain differentiation.

This refresh separates each pair into distinct, non-competing search intents while preserving title token similarity (`jaccard(tokens(old_title), tokens(new_title)) >= 0.34`) required by `scripts/check-duplicate-posts.mjs`:

| Pair & Author | URL Slug | Old Title → New Title (`jaccard` score) | Primary Query & Distinct Search Intent | Unique Clinical / Session Scope | Outbound Internal Links |
|---|---|---|---|---|---|
| **Pair A — Sam Torres** (Age 44, community organiser voice) | `/blog/first-six-months-back-what-to-expect/` | `"What Actually Happens to Your Body in the First Six Months Back"` → `"What Happens to Your Body in the First Six Months Back: A Timeline"` (`5/7 = 0.71 >= 0.34`) | `first six months back skateboarding timeline older skaters` / `proprioception and balance timeline returning to skateboarding after 40` (Physical & neuromuscular adaptation timeline from Week 1 to Month 6) | Stage-by-stage physiological and proprioceptive timeline: Week 1 calf/peroneal soreness and flatground ankle wobble, Month 1 gross-to-fine motor curve, Month 2 to 3 automatic balance consolidation, Month 3 to 4 neuromuscular consolidation plateau, and Month 5 to 6 park-reading competence, with an extractable stage-by-stage timeline table. | `/blog/why-adult-skaters-quit-at-six-months/`, `/blog/8-week-return-plan-adult-skaters/`, `/blog/proprioception-training-for-adult-skaters/`, `/blog/recovery-guide-for-adult-skaters/`, `/blog/how-to-fall-safely-after-40/`, `/directory/parks` |
| **Pair A — Sam Torres** (Age 44, community organiser voice) | `/blog/why-adult-skaters-quit-at-six-months/` | `"Why Adult Returners Quit at Six Months (and How Not To)"` → `"Why Older Returners Quit at Six Months: Session Habits That Stick"` (`4/9 = 0.44 >= 0.34`) | `why older skateboarders quit after a few months` / `how to stay consistent skateboarding after 40 session habits` (Social & scheduling dropout triggers at community sessions + 5 structural adherence habits) | The three month-four dropout triggers observed at community sessions (novelty fade, cumulative minor fatigue, slow skill consolidation colliding with work/family schedules) and the five structural habits that keep older returners showing up: fixed calendar slot, peer accountability via `/directory/groups`, non-trick session logging, planned recovery days, and naming the plateau out loud. | `/blog/first-six-months-back-what-to-expect/`, `/blog/finding-other-adult-skaters/`, `/blog/tracking-skate-sessions-for-progress/`, `/blog/recovery-days-for-adult-skaters/`, `/blog/building-confidence-at-40/`, `/directory/groups` |
| **Pair B — Marcus Webb** (Age 47, returning skater voice) | `/blog/recovery-days-for-adult-skaters/` | `"Recovery Days: How to Structure Rest So You Can Skate More"` → `"Recovery Days for Older Skaters: How to Structure Weekly Rest"` (`4/8 = 0.50 >= 0.34`) | `how many days a week should an older skater skate` / `weekly rest and mobility schedule skateboarding over 40` (Macro weekly schedule architecture, consecutive rest days, sleep consolidation, and off-day mobility) | Weekly training schedule architecture: the 3-to-4 session weekly ceiling after a 20-year break, why high-impact park sessions require two consecutive off-days, the 7-to-8 hour sleep window for motor skill consolidation, a 10-minute off-day ankle/hip/thoracic mobility rotation, and a weekly schedule comparison table. | `/blog/recovery-guide-for-adult-skaters/`, `/blog/sleep-for-older-skaters/`, `/blog/warm-up-routine-for-adult-skaters/`, `/blog/8-week-return-plan-adult-skaters/`, `/directory/parks` |
| **Pair B — Marcus Webb** (Age 47, returning skater voice) | `/blog/recovery-guide-for-adult-skaters/` | `"Your Body the Day After Skating: A Recovery Guide for Older Skaters"` → `"Your Body the Day After Skating: DOMS vs. Injury Recovery Guide"` (`3/6 = 0.50 >= 0.34`) | `soreness day after skateboarding over 40 DOMS vs injury` / `delayed onset muscle soreness vs joint injury skateboarding` (Acute 24-to-72 hour post-session eccentric DOMS physiology, red-flag triage table, and repeated-bout adaptation) | The 24-to-72 hour eccentric DOMS curve (citing Cheung, Hume, and Maxwell 2003 in *Sports Medicine*, PubMed `12617692`), temporary reductions in shock attenuation and peak torque during peak soreness, a side-by-side DOMS vs. acute injury red-flag comparison table, and the repeated-bout adaptation curve across months one to three. | `/blog/recovery-days-for-adult-skaters/`, `/blog/plantar-fasciitis-heel-bruising-skateboarding/`, `/blog/lower-back-pain-skateboarding-returners-guide/`, `/blog/warm-up-routine-for-adult-skaters/`, `/blog/cold-plunge-sauna-recovery-for-adult-skaters/`, `/directory/parks/us/flux-indoor-skatepark-hamden-ct/`, `/directory/parks/us/arvada-skate-park-co/` |

---

## 2. Phase 1 & Phase 1.5: SERP & AI Surface Analysis

```
AI SURFACE 1 (Pair A): "what to expect first six months back skateboarding after 40" / "why older skaters quit after six months"
AIO present: yes · Cited: reddit.com/r/OldSkaters (threads on week-one calf/ankle soreness and month-three trick plateaus), skate-tutorial blogs (general beginner timelines)
Variant phrasings cited: queries about "how long to get balance back on a skateboard after 20 years" surface motor-learning and ankle-proprioception discussions; queries about "staying consistent skating over 40" pull community meetup advice.
Citation gap & Refresh fix:
1. For `first-six-months-back-what-to-expect.md`: Added a standalone stage-by-stage timeline table (Week 1, Month 1, Months 2–3, Months 3–4, Months 5–6) mapping physical sensations, balance/proprioceptive state, and primary risk window, plus answer-first blocks under every H2.
2. For `why-adult-skaters-quit-at-six-months.md`: Separated the psychological and scheduling dropout triggers from physical physiology, converted the bold-labeled list into clean `###` subheadings and an extractable 5-habit adherence table, and routed readers directly to `/directory/groups` for peer accountability.

AI SURFACE 2 (Pair B): "how many recovery days between skate sessions over 40" / "soreness day after skateboarding DOMS vs injury"
AIO present: yes · Cited: sports-medicine DOMS overviews (Cheung et al. 2003; 24–72 hour eccentric soreness peak), r/OldSkaters recovery threads (3–4 sessions/week consensus, sleep and ankle/hip mobility)
Variant phrasings cited: queries asking "is knee pain after skateboarding normal" shift to clinical orthopedics pages comparing muscle belly DOMS against joint-line effusion, locking, or tendon attachment pain.
Citation gap & Refresh fix:
1. For `recovery-days-for-adult-skaters.md`: Focused exclusively on weekly schedule architecture (3-to-4 sessions/week vs daily skating), added a 7-day schedule comparison table (Flatground/Curb Week vs Heavy Park/Bowl Week), removed the unverified first-person opening anecdote per `docs/AUTHOR-VOICES.md`, and cross-linked `/blog/sleep-for-older-skaters/`.
2. For `recovery-guide-for-adult-skaters.md`: Focused exclusively on the 24-to-72 hour post-session assessment window, preserved the Cheung et al. (2003) *Sports Medicine* PubMed citation (`https://pubmed.ncbi.nlm.nih.gov/12617692/`), and added a side-by-side DOMS vs. Acute Joint/Tendon Injury Red-Flag table for direct AI Overview extraction.
```

---

## 3. 4-Stage `author-voices` + `humanizer` Pipeline Checklist

- **Stage 1 — Author Assignment & Exemplar Voice Calibration:**
  - *Pair A (`first-six-months-back-what-to-expect.md`, `why-adult-skaters-quit-at-six-months.md`)*: Calibrated to **Sam Torres** (Age 44, came back at 40, community organiser and co-founder of the Portland Adult Skate Sessions). Warm, peer-to-peer, session-culture grounded; closes on how people treat one another at a session.
  - *Pair B (`recovery-days-for-adult-skaters.md`, `recovery-guide-for-adult-skaters.md`)*: Calibrated to **Marcus Webb** (Age 47, skated ages 13–26, 20-year break, came back at 46). Compact, direct, street/park-grounded, realistic about aging recovery limits; closes on an ordinary practical choice.
- **Stage 2 — Persona Authenticity & Shared Editorial Guardrails:**
  - Removed the invented personal symptom narrative from the opening of `recovery-days-for-adult-skaters.md`, anchoring the perspective strictly in Marcus Webb's documented 20-year break vantage point without fabricated memories.
  - Replaced all user-facing instances of `"adult"` / `"adults"` in titles, descriptions, headings, and body prose with `"older skaters"`, `"older returners"`, or `"skaters over 40"` (preserving `authorBio` and URL slugs).
- **Stage 3 — Mandatory 26-Pattern `humanizer` Pass (`scripts/check-humanizer.mjs`):**
  - `§8-em-or-en-dash`: Removed all em dashes (`—`), en dashes (`–`), and spaced double-hyphens (` -- `) across all four posts.
  - `§19-bold-list-label` & `§19-inline-bold`: Removed all decorative bold list labels and inline bolding in prose, converting sections to standard `###` subheadings and markdown tables.
  - `§1-not-x-but-y` & `§1-excess-rather-than`: Removed formulaic `"not X, but Y"` contrasts and kept `"rather than"` to `0–1` occurrences per post (`<= 2` required).
  - `§12-ai-crutch-words`: Pruned `"genuinely"`, `"crucial"`, `"pivotal"`, and staged run-ups.
- **Stage 4 — Factual Claims, Title Jaccard & Internal Link Verification:**
  - Verified Cheung, Hume, and Maxwell (2003) *Sports Medicine* citation (`https://pubmed.ncbi.nlm.nih.gov/12617692/`) in `recovery-guide-for-adult-skaters.md`.
  - Verified title token similarity (`jaccard >= 0.34`) on all 4 modified posts (`0.71`, `0.44`, `0.50`, `0.50`).
  - Verified `>= 3` outbound `/blog/` links plus `/directory/*` links in every file via `discover_topics.py --verify-links`.
