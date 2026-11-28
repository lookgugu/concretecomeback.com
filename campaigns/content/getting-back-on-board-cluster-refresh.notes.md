# Cluster D Refresh & De-Cannibalization Summary (`getting-back-on-board` Cluster)

**Date:** 2026-11-28  
**Cluster Scope:** Family 2 Cluster D (`cluster 2` in `node scripts/check-duplicate-posts.mjs --audit`)

## 1. Title De-Cannibalization & Modified-Post Guard Math

All three URLs retain their published slugs to preserve search equity while differentiating title token sets below the `0.34` Jaccard overlap threshold and keeping modified-title similarity `>= 0.34` against `origin/main`:

| Post | Before Title (Non-Noise Tokens) | After Title (Non-Noise Tokens) | Before vs. After Jaccard | Pairwise Title Jaccard Across Cluster |
|---|---|---|---|---|
| `src/content/blog/getting-back-on-board.md` | `"Getting Back on a Skateboard After 20 Years"` (`getting`, `back`, `years` = 3) | `"Getting Back on a Skateboard After 20 Years: First Three Sessions & Setup"` (`73` chars; `getting`, `back`, `years`, `three`, `sessions`, `setup` = 6) | `3 / 6 = 0.50` (`>= 0.34` PASS) | vs. `glp-1`: `2 / 10 = 0.20` (`< 0.34`)<br>vs. `osteoporosis`: `2 / 12 = 0.17` (`< 0.34`) |
| `src/content/blog/osteoporosis-bone-density-skateboarding.md` | `"The Osteoporosis Case for Getting Back on a Skateboard"` (`osteoporosis`, `case`, `getting`, `back` = 4) | `"The Osteoporosis Case for Getting Back on a Skateboard: Bone Density & Fall Risk"` (`80` chars; `osteoporosis`, `case`, `getting`, `back`, `bone`, `density`, `fall`, `risk` = 8) | `4 / 8 = 0.50` (`>= 0.34` PASS) | vs. `getting-back-on-board`: `2 / 12 = 0.17` (`< 0.34`)<br>vs. `glp-1`: `2 / 12 = 0.17` (`< 0.34`) |
| `src/content/blog/glp-1-and-getting-back-on-a-skateboard.md` | `"What GLP-1 Users Should Know Before Getting Back on a Skateboard"` (`glp`, `1`, `users`, `know`, `getting`, `back` = 6) | `"What GLP-1 Users Should Know Before Getting Back on a Skateboard"` (`64` chars; unchanged = 6) | `6 / 6 = 1.00` (`>= 0.34` PASS) | vs. `getting-back-on-board`: `2 / 10 = 0.20` (`< 0.34`)<br>vs. `osteoporosis`: `2 / 12 = 0.17` (`< 0.34`) |

*(Note: `getting-back-on-board` and `glp-1-and-getting-back-on-a-skateboard` still share slug tokens `getting` and `back` (`2 / 5 = 0.40`) because published URLs are never renamed; `osteoporosis-bone-density-skateboarding` is completely decoupled from `cluster 2`.)*

## 2. Editorial & GEO Upgrades by File

1. **`src/content/blog/getting-back-on-board.md`** (Marcus Webb, `updatedDate: 2026-11-28`, ~1,390 body words):
   - Expanded from a 280-word stub into a full field guide in Marcus Webb's direct, street/park-grounded voice.
   - Added a 64-word direct opening answer separating preserved procedural motor memory from slower vestibular recalibration, ankle stabilizer endurance, and tendon recovery.
   - Added Markdown tables for **The First Three Sessions Back After a 20-Year Break** and **The Forgiving Hardware Setup for Older Returners** (`8.5"` to `9.0"` mellow deck, `54mm` to `56mm` `87A` to `93A` hybrid wheels, `1/8"` rubber shock pads, certified helmet, dual-splint wrist guards).
   - Added natural cross-links to `/blog/first-six-months-back-what-to-expect/`, `/blog/what-board-size-for-adults/`, `/blog/wheel-hardness-guide-for-adult-skaters/`, `/blog/skateboard-riser-pads-vs-shock-pads-older-skaters/`, `/blog/how-to-fall-safely-after-40/`, `/blog/glp-1-and-getting-back-on-a-skateboard/`, `/blog/osteoporosis-bone-density-skateboarding/`, `/directory/parks`, and `/directory/shops`, plus 3 `###` FAQs.

2. **`src/content/blog/glp-1-and-getting-back-on-a-skateboard.md`** (Jo Fairweather, `updatedDate: 2026-11-28`, ~1,200 body words):
   - Removed the invented first-person clinic anecdote (`"I'm seeing a new kind of patient in clinic this year..."`) per `docs/AUTHOR-VOICES.md`.
   - Added a Markdown table (**4-Week Pre-Skate Readiness & Medical Safety Checklist for GLP-1 Users**) covering prescriber/dose stability, hypoglycemia screening with co-medications (insulin/sulfonylureas), lean muscle and ankle prehab, 30-second single-leg balance benchmarks, and hydration after GI fluid loss.
   - Converted bold-label bullets into `###` subheadings and preserved all YMYL medical disclaimers and cross-links (`/blog/osteoporosis-bone-density-skateboarding/`, `/blog/getting-back-on-board/`, `/blog/8-week-return-plan-adult-skaters/`, `/blog/proprioception-training-for-adult-skaters/`).

3. **`src/content/blog/osteoporosis-bone-density-skateboarding.md`** (Jo Fairweather, `updatedDate: 2026-11-28`, ~1,150 body words):
   - Removed first-person patient consultation framing (`"When patients ask me..."`) and stripped all em/en dashes, AI crutch words, and excess `"rather than"` constructions.
   - Added a clinical Markdown comparison table (**Weight-Bearing Bone Loading vs. Fall-Fracture Risk by Bone Density Status**) across Normal BMD, Osteopenia, and Diagnosed Osteoporosis / Prior Fragility Fracture.
   - Preserved all International Osteoporosis Foundation caveats, progressive resistance training distinctions for the lumbar spine and femoral neck, DEXA screening guidance, and padded hip protector coverage limits, with cross-links to `/blog/skateboarding-counts-as-real-exercise/`, `/blog/safety-gear-guide/`, `/blog/impact-shorts-hip-protectors-for-adult-skaters/`, `/blog/getting-back-on-board/`, and `/blog/glp-1-and-getting-back-on-a-skateboard/`.

## 3. Verification Results

- `node scripts/check-humanizer.mjs src/content/blog/getting-back-on-board.md src/content/blog/glp-1-and-getting-back-on-a-skateboard.md src/content/blog/osteoporosis-bone-density-skateboarding.md` -> **0 Humanizer tells** across all 3 files.
- `python3 ~/.gemini/config/skills/blog-research/scripts/discover_topics.py --verify-links src/content/blog/getting-back-on-board.md src/content/blog/glp-1-and-getting-back-on-a-skateboard.md src/content/blog/osteoporosis-bone-density-skateboarding.md` -> **`all_ok: true`, 0 broken links**.
