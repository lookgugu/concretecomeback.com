# Keyword Research Working Notes — Concrete Comeback
Date: 2026-11-18
Data: LOCAL DOCS (193-post corpus audit + check-duplicate-posts.mjs) + LIVE WEB SEARCH (SERP & AI Overview checks across 4 families)

## 1. Phase 1: Six-Circle Seeds (24 seeds across 6 lenses)

1. **What we offer (directory & guides):**
   - `skateparks for older skaters` (commercial/navigational)
   - `adult skate nights near me` (transactional/local)
   - `local skate shop for older beginners` (commercial)
   - `older skateboarder community groups` (informational/navigational)
2. **Problems we solve (in customer words from voc.md):**
   - `skateboard riser pads vs shock pads wheel bite` (commercial/informational)
   - `do shock pads reduce impact skateboarding` (informational)
   - `skateboard deck concave foot fatigue cramping` (informational)
   - `skateboarding after meniscus tear surgery` (informational)
   - `cleaning skateboard bearings after wet winter session` (informational)
   - `how to fall safely skateboarding over 40` (informational — cannibalized in corpus)
3. **Outcomes we deliver:**
   - `skateboarding at 45 without knee pain` (informational)
   - `how to cruise rough asphalt on a skateboard` (informational)
   - `when do you need riser pads for 56mm and 60mm wheels` (informational)
   - `mellow vs steep concave for older skaters` (commercial/informational)
4. **Positioning ("The Monday-Ready Session"):**
   - `low impact skateboard setup for older skaters` (commercial/informational)
   - `weekend skatepark session recovery over 40` (informational)
   - `forgiving skateboard setup for returning skaters` (commercial)
5. **Adjacent topics (winter season Nov–Feb + cross-training):**
   - `indoor skatepark wood ramps wheel hardness` (informational)
   - `carpet boarding winter footwork drills` (already covered: `carpet-boarding-and-home-footwork-drills-for-winter`)
   - `cold weather skate layering with pads` (already covered: `cold-weather-skate-layering-winter-sessions-with-pads`)
6. **Entities to be named next to:**
   - `Powell Peralta Dragon wheels riser pads` (commercial)
   - `Independent vs Thunder truck height riser chart` (comparison)
   - `Bones Reds bearings winter cleaning` (informational)
   - `Old Bones Therapy vs 187 Killer Pads` (comparison)

## 2. Corpus Overlap & Cannibalization Receipts (`discover_topics.py --check-topic` & `check-duplicate-posts.mjs --audit`)

- `Skateboard Riser Pads and Shock Pads for Wheel Bite and Joint Impact` -> `status: new_topic`, `max_similarity: 0.12` (closest: `joint-supplements-for-adult-skaters`)
- `Skateboard Deck Concave Guide for Older Skaters: Mellow vs Steep Foot Fatigue` -> `status: new_topic`, `max_similarity: 0.25` (closest: `longboard-vs-cruiser-vs-popsicle-deck`)
- `How to Clean and Maintain Skateboard Bearings After Damp Winter Sessions` -> `status: new_topic`, `max_similarity: 0.20` (closest: `cold-weather-skate-layering-winter-sessions-with-pads`)
- `Skateboarding After Meniscus Tear or Arthroscopic Knee Surgery` -> `status: new_topic`, `max_similarity: 0.17` (closest: `knee-braces-for-adult-skaters`)
- `Choosing a Local Skate Shop as an Older Returning Skater` -> `status: new_topic`, `max_similarity: 0.18` (closest: `longboard-vs-cruiser-vs-popsicle-deck`)
- `Indoor Skatepark Guide for Older Skaters: Wood Ramps, Pad Rules, and Quiet Hours` -> `status: overlap_warning`, `max_similarity: 0.36` (closest: `indoor-skateparks-wood-ramps-grip-session-timing` — SKIP as new post; fold into existing)
- `Hip Impact Pads and Crash Shorts for Older Skaters` -> `status: overlap_warning`, `max_similarity: 0.43` (closest: `impact-shorts-hip-protectors-for-adult-skaters` — SKIP as new post)

### Existing Cannibalized Clusters (`node scripts/check-duplicate-posts.mjs --audit`)
- Cluster 1: `first-six-months-back-what-to-expect` + `why-adult-skaters-quit-at-six-months`
- Cluster 2: `getting-back-on-board` + `glp-1-and-getting-back-on-a-skateboard` + `osteoporosis-bone-density-skateboarding`
- Cluster 3: `how-to-fall-safely-after-40` + `how-to-fall-safely-skateboarding` + `how-to-fall-skateboarding-adults`
- Cluster 4: `recovery-days-for-adult-skaters` + `recovery-guide-for-adult-skaters`

## 3. Rung 2 Evidence Packs & Phase 3 Validation

### Family 1: Hardware Setup for Joint Relief & Wheel Clearance
- **Type:** comparison / content
- **Validation:**
  - `demand PASS`: recurring Google PAA & Reddit `r/OldSkaters` / `r/NewSkaters` threads on riser vs shock pads, 56mm/60mm wheel clearance, and mellow vs steep concave foot cramping.
  - `market PASS`: searches target universal hardware setup questions (`riser pads vs shock pads`, `when do you need riser pads for 56mm wheels`, `mellow vs steep concave foot fatigue`).
  - `competitive PASS`: top results (`sector9.com`, `yocaher.com`, `warehouseskateboards.com`, `skatedeluxe.com`, `surfertoday.com`, Reddit threads) are thin ecommerce blurbs (400–800 words) or generic beginner glossaries. None address older-skater body weight (180–220+ lbs compressing bushings further), center-of-gravity tradeoffs on aging ankles, or exact hardware bolt-length math.
  - `advantage YES`: Marcus Webb's setup mechanics voice + direct internal linking to existing wheelbase, bushing durometer, wheel hardness, and cupsole shoe guides + `/directory/shops`.
- **Verdict:** **NOW** (High business value, High opportunity, LOW zero-click risk with clear citation path via extractable spec tables).

### Family 2: Cannibalized Cluster Consolidation (Fall Mechanics, Six-Month Plateau, Recovery Days)
- **Type:** content (refresh/consolidation)
- **Validation:**
  - `demand PASS`: core evergreen older-skater topics already indexed on site.
  - `market PASS`: high search alignment.
  - `competitive PASS`: internal competition (3 separate fall posts, 2 recovery posts, 2 six-month posts) is the primary blocker.
  - `advantage YES`: Jo Fairweather & Marcus Webb existing articles.
- **Verdict:** **NOW (fixing beats writing)** — differentiate titles/H2s or consolidate overlapping slugs.

### Family 3: Orthopedic & Post-Surgical Return (Meniscus Tear & Arthroscopic Knee Surgery)
- **Type:** content
- **Validation:**
  - `demand PASS`: high search and forum demand among 40+ returners with prior knee surgeries; AI-native conversational queries are high ("can I skateboard after partial meniscectomy at 45?").
  - `market PASS`: problem-centric.
  - `competitive PASS`: medical clinic pages (`brettowensmd.com`, `ipphysio.co.uk`, NIH papers) cover general pivoting sports (soccer/skiing) but never map back-leg ollie pop shear vs front-leg eccentric landing load in skateboarding.
  - `advantage YES`: Jo Fairweather (52, physiotherapist & skater) voice + existing knee brace and cartilage MRI guides.
- **Verdict:** **NEXT** (High value, High citation path; requires checking specific primary peer-reviewed RTS cohort numbers to satisfy `content-safety-gate.yml`).

### Family 4: First Local Skate Shop Visit & Setup Buying
- **Type:** commercial / content
- **Validation:**
  - `demand PASS`: strong `r/OldSkaters` recurring question ("walking into a skate shop at 40/45, what to ask for").
  - `market PASS`: problem-centric.
  - `competitive PASS`: forum threads dominate; zero structured guides with shop directory integration.
  - `advantage YES`: pairs directly with `/directory/shops` (38 vetted shops across US, UK, CA, AU).
- **Verdict:** **NEXT** (High value for directory conversion; sequence right after Hardware Setup spoke).

### Family 5: City-by-City Older-Skater Park & Session Guides
- **Type:** page generation (`route: /programmatic-seo`)
- **Validation:**
  - `demand PASS`: local queries (`adult skate sessions [city]`, `beginner friendly skatepark [city]`).
  - `advantage YES`: 279 curated parks in `src/content/parks/` with `adultFriendly`, `difficulty`, and `adultAdvice` fields.
- **Verdict:** **HOLD** until shop (38) and group (22) coverage is expanded across top 20 metros so generated city pages have all three pillars (parks + shops + groups).
