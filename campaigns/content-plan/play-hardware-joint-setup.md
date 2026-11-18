# Topic Play: Hardware Setup for Joint Relief & Wheel Clearance
## Family: Hardware Setup for Joint Relief & Wheel Clearance (`NOW`)
Date: 2026-11-18 · Route: `/seo-content`

## 1. Why This Play Wins Now
Older skaters returning after 15–30 years almost universally swap out 52mm rock-hard street wheels for 54mm–60mm softer wheels (78A–93A Dragon/cruiser formulas) to survive rough asphalt and park transitions. That single change triggers a chain of mechanical problems that generic youth skate sites ignore: sudden wheel bite from heavier riders (180–220+ lbs) leaning into carves, high-frequency vibration numbness in 45-year-old feet, and arch cramping from steep modern popsicle concaves.

Concrete Comeback already owns four strong setup pieces ([Wheel Hardness Guide](/blog/wheel-hardness-guide-for-adult-skaters/), [Truck Bushings Durometer Guide](/blog/skateboard-truck-bushings-durometer-weight-guide/), [Wheelbase & Deck Length Guide](/blog/skateboard-wheelbase-deck-length-stance-guide/), and [Cupsole vs. Vulcanized Shoes](/blog/cupsole-vs-vulcanized-skate-shoes-older-skaters/)). Adding the two missing hardware spokes (**Riser Pads vs. Shock Pads** and **Deck Concave & Foot Fatigue**) completes the cluster without a single overlapping slug (`max_similarity: 0.12` and `0.25`).

## 2. Hub & Spoke Architecture

### Existing Pillar Anchor (Cross-Link Hub)
- **[Wheel Hardness: The Setup Detail Older Skaters Get Wrong](/blog/wheel-hardness-guide-for-adult-skaters/)** (Marcus Webb)
- **[Skateboard Truck Bushings: A Durometer and Weight Guide](/blog/skateboard-truck-bushings-durometer-weight-guide/)** (Marcus Webb)
- **[Skateboard Wheelbase and Deck Length Guide for Older Skaters](/blog/skateboard-wheelbase-deck-length-stance-guide/)** (Marcus Webb)

### New Spoke 1 (Commit First — Written in This Workflow)
- **Slug:** `/blog/skateboard-riser-pads-vs-shock-pads-older-skaters/`
- **Title:** `Riser Pads vs. Shock Pads: Wheel Bite and Joint Impact Guide`
- **Author:** Marcus Webb
- **Target Queries:** `skateboard riser pads vs shock pads`, `do shock pads reduce impact skateboarding`, `when do you need riser pads for 56mm and 60mm wheels`, `skateboard hardware bolt length chart for risers`
- **Directory Conversion Target:** `/directory/shops` (local shops that stock 1/8" rubber shock pads, 1/4" hard risers, and 1"–1.25" mounting hardware) and `/directory/parks`.

### New Spoke 2 (Commit Second)
- **Slug:** `/blog/skateboard-deck-concave-mellow-vs-steep-older-skaters/`
- **Title:** `Skateboard Deck Concave: Mellow vs. Steep for Foot Fatigue`
- **Author:** Marcus Webb
- **Target Queries:** `mellow vs steep concave skateboard`, `skateboard foot cramping arch pain older skaters`, `flat vs mellow concave for cruising and bowls`
- **Directory Conversion Target:** `/directory/shops` (standing on decks in person at a local shop before buying).

### New Spoke 3 (Winter Maintenance Spoke)
- **Slug:** `/blog/cleaning-skateboard-bearings-damp-winter-sessions/`
- **Title:** `Cleaning Skateboard Bearings After Damp Winter Sessions`
- **Author:** Marcus Webb
- **Target Queries:** `how to clean skateboard bearings after wet pavement`, `winter skateboard bearing maintenance`
- **Directory Conversion Target:** `/directory/shops` + `/directory/parks` (indoor parks filter).

## 3. Reciprocal Internal Linking Contract
1. New Spoke 1 (`skateboard-riser-pads-vs-shock-pads-older-skaters`) links out to:
   - `/blog/wheel-hardness-guide-for-adult-skaters/`
   - `/blog/skateboard-truck-bushings-durometer-weight-guide/`
   - `/blog/cupsole-vs-vulcanized-skate-shoes-older-skaters/`
   - `/directory/shops` and `/directory/parks`
2. Forward links added from existing posts (`wheel-hardness-guide-for-adult-skaters.md` and `skateboard-truck-bushings-durometer-weight-guide.md`) pointing to `/blog/skateboard-riser-pads-vs-shock-pads-older-skaters/`.

## 4. Acceptance Check
- `discover_topics.py --check-topic` returns `new_topic` (similarity `< 0.34`).
- `node scripts/check-duplicate-posts.mjs` passes with 0 overlapping token errors on the new slug.
- `discover_topics.py --verify-links` passes with ≥2 verified `/blog/<slug>/` links and verified `/directory/` links.
- Every H2 opens with a 40–80 word self-contained answer block and includes an extractable hardware specification table (wheel diameter × truck height × pad thickness × bolt length).
