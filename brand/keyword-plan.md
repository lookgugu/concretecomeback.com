# Keyword & Topic Plan — Concrete Comeback
## Last Updated: 2026-11-18 by /keyword-research
Depth: full
Data: LOCAL DOCS (193-post corpus audit) + LIVE WEB SEARCH (SERP & AI Overview checks across 4 families)

## 1. The Verdict

- **Start here (`NOW`):** Commit to **Family 1: Hardware Setup for Joint Relief & Wheel Clearance**, starting with **Riser Pads vs. Shock Pads: Wheel Bite and Joint Impact Guide** (`/blog/skateboard-riser-pads-vs-shock-pads-older-skaters/`) and **Skateboard Deck Concave: Mellow vs. Steep for Foot Fatigue** (`/blog/skateboard-deck-concave-mellow-vs-steep-older-skaters/`). Both are verified `new_topic` gaps across your 193 existing articles (`max_similarity: 0.12` and `0.25`), carry commercial/setup intent that bridges readers straight into `/directory/shops`, and face thin ecommerce category blurbs (450–900 words) that ignore how a 180–220+ lb older skater compresses bushings and absorbs road chatter.
- **Fix alongside (`NOW` — fixing beats writing):** Resolve **Family 2: Cannibalized Cluster Consolidation** across the 4 overlapping topic clusters flagged by `check-duplicate-posts.mjs --audit` (especially the 3 competing `how-to-fall-safely` posts and 2 `recovery-days` posts) so existing pages stop splitting impressions.
- **Up next (`NEXT`):**
  - **Family 3: Orthopedic & Post-Surgical Return (`skateboarding-after-meniscus-tear-knee-surgery`)** — `new_topic` (`max_similarity: 0.17`). Move to `NOW` once specific peer-reviewed arthroscopic partial meniscectomy (APM) vs. meniscal repair return-to-sport cohort citations are assembled for Jo Fairweather's byline and `content-safety-gate.yml`.
  - **Family 4: First Local Skate Shop Visit & Setup Buying (`choosing-a-local-skate-shop-older-returning-skater`)** — `new_topic` (`max_similarity: 0.18`). Move to `NOW` after the Hardware Setup spokes ship, as a bottom-of-funnel bridge into `/directory/shops`.
- **Hold (`HOLD`):**
  - **Family 5: City-by-City Older-Skater Park & Session Guides** (`route: /programmatic-seo`). Hold until `/directory/shops` (currently 38) and `/directory/groups` (currently 22) expand across top metros to match `/directory/parks` (279).
- **Leave out (`DROP` as new posts):**
  - **Indoor Skatepark Wood Ramps & Pad Rules** (`max_similarity: 0.36` with `/blog/indoor-skateparks-wood-ramps-grip-session-timing/`) and **Hip Impact Shorts & Crash Pads** (`max_similarity: 0.43` with `/blog/impact-shorts-hip-protectors-for-adult-skaters/`). Both are already covered on site; refresh those existing URLs instead of creating duplicates.

---

## 2. Business Context

Concrete Comeback (`https://concretecomeback.com`) already publishes 193 articles alongside 279 skate parks, 38 local shops, and 22 community groups across the US, UK, Canada, and Australia. At 193 articles, the biggest risk to search growth is writing duplicate topics that trigger CI cannibalization failures (`similarity >= 0.34`). The highest-leverage search moves are filling specific hardware/orthopedic gaps that have zero overlap with the existing corpus while consolidating the 4 existing overlapping clusters.

---

## 3. The Topic Map

### Comparison & Setup Families

#### Family 1: Hardware Setup for Joint Relief & Wheel Clearance (`NOW`)
- **Demand evidence:** Recurring Google People-Also-Ask questions and `r/OldSkaters` / `r/NewSkaters` threads on riser vs. shock pads, 56mm–60mm wheel clearance, and mellow vs. steep concave foot cramping; winter bearing maintenance searches rise Nov–Feb (`cleaning skateboard bearings after wet session`).
- **Competitive opening:** Top results (`sector9.com`, `surfertoday.com`, `yocaher.com`, `skatedeluxe.com`, `warehouseskateboards.com`) are generic 450–900 word product blurbs. None include a decision table combining **wheel diameter (54mm–60mm) × truck height × rider weight (180–220+ lbs) × bolt length**, and none explain the honest physics of what 3mm of rubber actually damps (high-frequency road chatter and pressure cracks) vs. what requires softer wheels and cupsole shoes.
- **Observed terms & questions:**
  - `skateboard riser pads vs shock pads` (commercial/informational)
  - `do shock pads reduce impact skateboarding` (informational)
  - `when do you need riser pads for 56mm and 60mm wheels` (informational)
  - `skateboard hardware bolt length chart for risers` (informational)
  - `skateboard deck concave mellow vs steep foot fatigue` (commercial/informational)
  - `cleaning skateboard bearings after damp winter sessions` (informational)
- **Confidence:** High (`max_similarity` verified at `0.12`, `0.25`, and `0.20` against all 193 existing posts; strong internal link hub already live).
- **Verdict:** **NOW**

### Content & Clinical Authority Families

#### Family 2: Cannibalized Cluster Consolidation (`NOW` — Refresh/Differentiate)
- **Demand evidence:** Core evergreen queries where Concrete Comeback already holds multiple competing URLs:
  - Cluster A: `how-to-fall-safely-after-40`, `how-to-fall-safely-skateboarding`, `how-to-fall-skateboarding-adults`
  - Cluster B: `first-six-months-back-what-to-expect`, `why-adult-skaters-quit-at-six-months`
  - Cluster C: `recovery-days-for-adult-skaters`, `recovery-guide-for-adult-skaters`
  - Cluster D: `getting-back-on-board`, `glp-1-and-getting-back-on-a-skateboard`, `osteoporosis-bone-density-skateboarding`
- **Competitive opening:** Internal keyword cannibalization splits impressions and click-through rate across duplicate H1s and title tokens.
- **Confidence:** High (verified directly via `node scripts/check-duplicate-posts.mjs --audit`).
- **Verdict:** **NOW** (route to `/seo-content` Refresh Mode after shipping the Family 1 spoke).

#### Family 3: Orthopedic & Post-Surgical Return (`NEXT`)
- **Demand evidence:** High conversational and forum demand from returning skaters in their 40s and 50s managing old meniscus tears, arthroscopic partial meniscectomy (APM), or meniscal repair.
- **Competitive opening:** Orthopaedic clinic pages (`brettowensmd.com`, `ipphysio.co.uk`) treat all pivoting sports identically and never distinguish back-leg ollie tail-snap shear on the posterior horn from front-leg eccentric landing control in transition skating.
- **Observed terms & questions:**
  - `skateboarding after meniscus tear surgery`
  - `partial meniscectomy vs meniscus repair return to skateboarding timeline`
  - `knee swelling after skate session over 40`
- **Confidence:** Medium-High (`max_similarity: 0.17`, `new_topic`; requires primary clinical study citations for `content-safety-gate.yml`).
- **Verdict:** **NEXT** (settle by pulling exact PMID/DOI cohort figures for APM vs. repair RTS criteria).

### Commercial / Directory Bridge Families

#### Family 4: First Local Skate Shop Visit & Setup Buying (`NEXT`)
- **Demand evidence:** High recurring `r/OldSkaters` pain point ("walking into a skate shop at 45 without feeling ridiculous", "what to ask for at a local skate shop").
- **Competitive opening:** Only unstructured forum threads rank; no guide connects first-visit setup questions directly to a vetted international shop directory (`/directory/shops`).
- **Confidence:** Medium-High (`max_similarity: 0.18`, `new_topic`).
- **Verdict:** **NEXT**

### Page Generation Families

#### Family 5: City-by-City Older-Skater Park & Session Guides (`HOLD`)
- **Demand evidence:** Local search frames (`older skater sessions in [city]`, `mellow skateparks in [city]`).
- **Competitive opening:** General directories (`Concrete Disciples`, `GoSkate`) lack older-skater friendliness filters, quiet morning-hour notes, and paired shop/group listings.
- **Confidence:** Medium (279 parks ready, but only 38 shops and 22 groups).
- **Verdict:** **HOLD** (`route: /programmatic-seo` once top 20 metros have paired shop and group coverage).

---

## Cluster Priorities

| Family | Priority | Intent | Route | zero_click_risk | citation_path |
|---|---|---|---|---|---|
| Family 1: Hardware Setup for Joint Relief & Wheel Clearance | high | commercial / informational | `/seo-content` | LOW | YES (Rider Weight × Wheel Size × Riser/Bolt spec table) |
| Family 2: Cannibalized Cluster Consolidation (4 clusters) | high | informational | `/seo-content` (refresh) | MED | YES (Jo Fairweather clinical fall & recovery mechanics) |
| Family 3: Orthopedic & Post-Surgical Return (Meniscus) | medium | informational | `/seo-content` | LOW | YES (Skate-specific back-leg vs front-leg load breakdown) |
| Family 4: First Local Skate Shop Visit & Setup Buying | medium | commercial | `/seo-content` | LOW | YES (Vetted 38-shop directory integration) |
| Family 5: City-by-City Older-Skater Park Guides | low | transactional / local | `/programmatic-seo` | LOW | YES (First-party 279-park dataset) |

---

## 4. Competitor Gaps

1. **Ecommerce Skate Retailers (`warehouseskateboards.com`, `skatedeluxe.com`, `yocaher.com`):** Write 500-word definitions aimed at 15-year-olds riding 52mm street wheels. They ignore how a 195-lb older skater on 56mm–58mm softer wheels compresses bushings into sudden wheel bite, and they overpromise impact protection from 1/8" rubber shock pads.
2. **Reddit (`r/OldSkaters`):** Holds the best lived anecdotes (pad recommendations, foot cramping on steep concaves, post-meniscectomy sessions), but answers are scattered across hundreds of unindexed comment threads with contradictory hardware math.
3. **Orthopedic & PT Clinic Blogs:** Give calendar-based return-to-sport timelines (4–8 weeks for APM, 6–9 months for meniscal repair) without explaining skateboarding's asymmetric knee loads or criteria-based hop/LSI testing.

---

## 5. Ordered Backlog & Brief Index

| Rank | Piece Title | Family | Route | Reason | Status | Brief / Play File |
|---:|---|---|---|---|---|---|
| 1 | Riser Pads vs. Shock Pads: Wheel Bite and Joint Impact Guide | Family 1 | `/seo-content` | `new_topic` (0.12 sim); completes wheel/bushing setup hub and links to `/directory/shops` | completed | `./campaigns/content-plan/skateboard-riser-pads-vs-shock-pads-older-skaters.md` |
| 2 | Skateboard Deck Concave: Mellow vs. Steep for Foot Fatigue | Family 1 | `/seo-content` | `new_topic` (0.25 sim); high `r/OldSkaters` pain point with weak SERP | completed | `./campaigns/content-plan/skateboard-deck-concave-mellow-vs-steep-older-skaters.md` |
| 3 | Cleaning Skateboard Bearings After Damp Winter Sessions | Family 1 | `/seo-content` | `new_topic` (0.20 sim); seasonal Nov–Feb winter maintenance search | completed | `./campaigns/content-plan/play-hardware-joint-setup.md` |
| 4 | Consolidate/Differentiate `how-to-fall-safely-*`, `six-months-*`, `recovery-*`, and `getting-back-on-board` (4 clusters) | Family 2 | `/seo-content` (refresh) | Eliminates keyword cannibalization across all 4 overlapping topic clusters | completed | `./campaigns/content/getting-back-on-board-cluster-refresh.notes.md` |
| 5 | Skateboarding After a Meniscus Tear or Arthroscopic Knee Surgery | Family 3 | `/seo-content` | `new_topic` (0.17 sim); high clinical authority gap for Jo Fairweather | completed | `./campaigns/content/skateboarding-after-meniscus-tear-knee-surgery.notes.md` |
| 6 | Walking Into a Local Skate Shop After 40: What to Ask For | Family 4 | `/seo-content` | `new_topic` (0.11 sim); drives direct clicks into `/directory/shops` | completed | `./campaigns/content/choosing-a-local-skate-shop-older-returning-skater.notes.md` |

---

## 6. Sources and Assumptions

- Based on a full overlap audit of all 193 published blog posts in `src/content/blog/` (`discover_topics.py --check-topic` and `check-duplicate-posts.mjs --audit`) and live web search SERP/AI-Overview checks across 4 topic families on Nov 18, 2026.
- No paid volume API (`DataForSEO`) was connected and live Google Search Console credentials were outside the sandbox environment, so topic prioritization rests on corpus gap verification, SERP competitor thickness, and observed community/PAA questions rather than monthly search volume numbers.
- Before drafting Family 3 (Meniscus Surgery Return), confirm primary PMID/DOI clinical study citations so the post clears `content-safety-gate.yml`.
