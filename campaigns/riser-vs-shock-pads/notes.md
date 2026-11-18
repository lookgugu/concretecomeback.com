# Working Notes: Riser Pads vs. Shock Pads Atomization

- **Source:** `./campaigns/content/skateboard-riser-pads-vs-shock-pads-older-skaters.md`
- **Live URL:** `https://concretecomeback.com/blog/skateboard-riser-pads-vs-shock-pads-older-skaters/`
- **Author Voice:** Marcus Webb (`brand/voice-profile.md`)
- **Platform Facts Freshness Check:** `references/platform-facts.md` `last-verified: 2026-09-02` (`ttl-days: 90`). Checked on `2026-11-18` (77 days elapsed, within 90-day TTL).

---

## Phase 4 Quality Gate Scores (5 Dimensions)

Ship bar: >= 8.0 average, no dimension below 7, Slop lint clean (PASS).

| Asset | 1. Native Fit | 2. Hook | 3. Specificity | 4. Voice Match | 5. Slop Lint | Average |
|---|---|---|---|---|---|---|
| `social/x/text-post-01.md` | 9/10 | 9/10 | 10/10 | 9/10 | PASS (10/10) | 9.4 |
| `social/x/thread-01.md` | 9/10 | 9/10 | 10/10 | 9/10 | PASS (10/10) | 9.4 |
| `social/instagram/carousel-01.md` | 9/10 | 9/10 | 10/10 | 9/10 | PASS (10/10) | 9.4 |
| `social/pinterest/pin-01.md` | 9/10 | 9/10 | 10/10 | 9/10 | PASS (10/10) | 9.4 |

### Per-Asset Scoring Notes

1. **`social/x/text-post-01.md`**
   - **Native Fit (9/10):** 258-character two-paragraph observation that delivers the full mechanical distinction in the main post and places the article URL in Reply 1 to avoid X's 30% to 50% external-link reach penalty and $0.20 URL API fee.
   - **Hook (9/10):** Opens with the specific thickness (`1/8"` / `3.2mm`) and the 20-minute foot numbness mechanism on rough pavement. Survives a standalone quote or screenshot.
   - **Specificity (10/10):** Traces directly to the "Do Shock Pads Reduce Joint Impact on Rough Pavement?" section (`1/8"`, `3.2mm`, 20 minutes, four bolts pre-compressing the rubber, wheels/cupsoles/knee bend).
   - **Voice Match (9/10):** Marcus Webb's compact, practical register; zero hype or engagement solicitation.
   - **Slop Lint (PASS):** Zero banned hook openers, zero engagement-bait CTAs, zero em dashes, zero "not X, but Y" contrasts, zero AI crutch words.

2. **`social/x/thread-01.md`**
   - **Native Fit (9/10):** 4-post sequence where each post holds an independent mechanical step (1: rider weight vs factory 90A chart assumption; 2: 0.5mm radius math + 94A-96A bushing pairing; 3: front-leg squat and tail arc trade-off of 1/4" risers; 4: exact bolt length chart + two shop-bench rules) with the link isolated in Reply 1.
   - **Hook (9/10):** Post 1 contrasts standard 140 lb / 90A wheel-bite charts with 180 to 220+ lb older skaters hitting wheel bite ~2mm earlier. No "Thread:" or emoji announcement.
   - **Specificity (10/10):** Every figure (`140 lb`, `90A`, `180 to 220+ lbs`, `2mm`, `52mm` to `56mm`, `0.5mm` radius, `5/64"`, `1/8"` / `3.2mm`, `94A` to `96A`, `1/4"` / `6.4mm`, `7/8"`, `1"`, `1 1/8"`, `1 1/4"`) comes straight from the source tables and body text.
   - **Voice Match (9/10):** Peer-to-peer shop-bench tone, varied sentence and post lengths (255, 366, 391, 398 chars), no recap slide or follow/RT begging.
   - **Slop Lint (PASS):** Clean across `slop-patterns.md` and `ai-tells.md`.

3. **`social/instagram/carousel-01.md`**
   - **Native Fit (9/10):** 7-slide 4:5 (1080x1350) reference carousel designed for saves and sends, paired with a `172`-word caption (within the `120` to `220` word voice-profile window) and zero hashtag walls.
   - **Hook (9/10):** Caption line 1 is 88 characters (`At 190+ lbs, you hit wheel bite 2mm earlier in wheel size than standard shop charts say.`), well under the 110-character truncation threshold.
   - **Specificity (10/10):** Full wheel-diameter × rider-weight × bolt-length matrix, radius math, front-quad single-leg squat mechanics, and bench rules included on the slides.
   - **Voice Match (9/10):** Grounded, encouraging without clichés, links to `/directory/shops` and the blog guide.
   - **Slop Lint (PASS):** Ends on Slide 7 ("Two Shop-Bench Rules Before You Skate") rather than a banned TL;DR recap or "Follow -> Like -> Save" slide.

4. **`social/pinterest/pin-01.md`**
   - **Native Fit (9/10):** 2:3 (1000x1500) vertical specification infocard layout paired with search-indexed copy.
   - **Hook / Search Title (9/10):** `Skateboard Riser Pads vs. Shock Pads: Wheel & Bolt Chart` (56 characters, within the `<=70` char rule, front-loading the primary keyword).
   - **Specificity (10/10):** Two-sentence factual description + complete visual hierarchy covering material, bolt compression, wheel-size matrix for under 175 lbs vs 175-220+ lbs, and bolt lengths from `7/8"` to `1 1/2"`.
   - **Voice Match (9/10):** Utility-driven, clear reference register matching `voice-profile.md#platform-adaptations`.
   - **Slop Lint (PASS):** Clean.

---

## Slop & Editorial Guardrail Verification Checklist

- **Terminology check ("older skaters" terminology enforced):** Verified across all 6 files. Zero instances of banned age label.
- **Em-dash check (U+2014):** Verified across all 6 files. Zero instances of em dashes.
- **Formulaic contrast check ("not X, but Y" / "It's not X. It's Y."):** Verified across all 6 files. Zero instances.
- **AI crutch words check (preferences.md & ai-tells.md Tier-1 canon):** Verified across all 6 files. Zero instances.
- **Banned hooks & CTAs check (`slop-patterns.md`):** No "Unpopular opinion", "Thread:", "Here's the part most people miss", "Let's talk about", "Save this for later", or follow/RT bait.

---

## Verbatim Source Quotes & Evidence Anchors Used

1. **Material & thickness split (Lines 97, 103, 109-114):**
   - "Hard plastic riser pads (`1/8\"` to `1/2\"` thick) add vertical clearance between your skateboard deck and wheels to prevent sudden wheel bite when riding `55mm` to `60mm+` wheels or carving hard."
   - "Soft rubber or polyurethane shock pads (`1/8\"` / `3.2mm` thick) sit in the same spot between the truck baseplate and wood, where they dampen high-frequency road vibration and reduce stress cracks around the mounting bolts."
   - Compression under bolts: Hard riser pads = `Zero; holds exact deck-to-axle height`; Soft shock pads = `Compresses ~0.5mm-1.0mm when locknuts are tightened`.
2. **Vibration vs. drop impact (Lines 118-122):**
   - "A `1/8\"` (`3.2mm`) rubber shock pad noticeably reduces high-frequency road vibration (the buzzing chatter from coarse asphalt, brick, and pebble-worn concrete that leaves your feet tingling after twenty minutes), and it buffers the sharp wood-on-metal spike that causes pressure cracks at the mounting bolts. However, three millimeters of rubber cannot compress enough to absorb the vertical ground-reaction force of a heavy drop or stiff-legged landing."
3. **Rider weight & radius math (Lines 126-137):**
   - "Because a 190- to 220-pound older skater compresses truck bushings further into a carve than a 140-pound teenager, heavier riders hit the wheel-bite threshold about `2mm` earlier in wheel diameter unless they also upgrade to firmer bushings."
   - "Every millimeter increase in wheel diameter only moves the top edge of the wheel `0.5mm` (the radius increase) closer to the deck. Moving from a `52mm` street wheel to a `56mm` park or hybrid wheel shrinks your clearance by just `2mm` (`5/64\"`)."
4. **Pushing fatigue & tail timing (Lines 141-145):**
   - "Lifting the board a quarter-inch to a half-inch with tall risers and `60mm` wheels forces your front knee and ankle through a deeper range of motion on every push. Over a forty-minute cruiser session, that extra quarter-inch of drop adds up in your front quadriceps and patellar tendon."
   - "For flatground ollies or lifting the nose over a curb, a `1/4\"` riser delays the pop by a fraction of a second and asks for a sharper downward snap from your back ankle."
5. **Hardware bolt lengths & bench rules (Lines 149-169):**
   - No pads = `7/8\"` min / `1\"` flush; `1/8\"` pad = `1\"` min / `1 1/8\"` flush/easy-start; `1/4\"` riser = `1 1/4\"`; `1/2\"` riser = `1 1/2\"`.
   - "Avoid stacking two separate pads under the same truck baseplate. Two sliding interfaces allow the mounting bolts to flex and shear under side-load during turns or landings."
   - "Cranking the nuts until the `1/8\"` rubber is crushed flat squeezes out its elastic give and turns the shock pad into a thin, rigid spacer."
