# Newsletter Working Notes: Riser Pads vs. Shock Pads & Winter Setup Edition

- **Date:** 2026-11-18
- **Archetype:** Hybrid (compact original deep-dive on riser pads vs. shock pads + curated winter/setup guide picks and weekend directory drill)
- **Target Length:** ~1,100 words (~4 min read)
- **Voice Register:** Marcus Webb / Concrete Comeback peer-to-peer utility voice (direct, mechanical, zero hype, no "adult" phrasing in prose, zero em dashes, zero "not X, but Y" turns)
- **ESP / Performance Priors:** No ESP API keys (`BEEHIIV_API_KEY`, `KIT_API_KEY`, `GHOST_ADMIN_API_KEY`) configured in `.env`, and no prior sends in `./campaigns/newsletters/`. Performance priors are unavailable for this inaugural tracked edition.

## Phase 3 Evidence Pack (Verified Articles & Directory Pages)

```yaml
- headline: "Riser Pads vs. Shock Pads: Wheel Bite and Joint Impact Guide"
  url: https://concretecomeback.com/blog/skateboard-riser-pads-vs-shock-pads-older-skaters/
  published: 2026-11-18
  author: Marcus Webb
  source_type: primary
  summary: Hard injection-molded plastic risers (1/8" to 1/2") maintain exact vertical clearance to stop wheel bite on 56mm to 60mm+ wheels, while soft 1/8" (3.2mm) rubber shock pads compress under the baseplate to damp high-frequency asphalt vibration and prevent bolt-hole stress cracks. Includes a rider-weight and wheel-size clearance matrix plus a hardware bolt-length chart.
  why_it_matters: Older skaters weighing 180 to 220+ pounds compress bushings deeper than teenagers and hit wheel bite roughly 2mm earlier in wheel diameter, while also feeling high-frequency foot numbness on rough winter tarmac.
  everyone_has_it: false

- headline: "Skateboard Truck Bushings: Matching Durometer to Your Weight"
  url: https://concretecomeback.com/blog/skateboard-truck-bushings-durometer-weight-guide/
  published: 2026-11-04
  author: Marcus Webb
  source_type: primary
  summary: Standard factory trucks ship with 88A to 90A medium urethane bushings built for 130- to 155-pound skaters. Cranking the kingpin nut down three threads pre-crushes the urethane, slices the bushing lip with the cup washer, and kills center rebound; swapping to 91A-94A (160-190 lbs) or 95A-98A (195+ lbs) bushings fixes wheel dive at the root.
  why_it_matters: Pairing weight-matched bushings with a single 1/8" pad keeps deck height low for pushing and tail timing instead of forcing skaters onto tall 1/4" plastic blocks.
  everyone_has_it: false

- headline: "Cold-Weather Skate Layering: How to Dress for Winter Sessions With Pads"
  url: https://concretecomeback.com/blog/cold-weather-skate-layering-winter-sessions-with-pads/
  published: 2026-11-14
  author: Sam Torres
  source_type: primary
  summary: Skateboarding's stop-start 60-second run interval causes puffer jackets and cotton hoodies to trap sweat, restrict shoulder rotation, and shred on broom-finished concrete. A three-layer stack of merino/synthetic base, pads over thin tights or under wide canvas pants, and a duck canvas chore coat or vest keeps sessions skateable in the 30s and 40s Fahrenheit.
  why_it_matters: Prevents mid-session chill and preserves full helmet fit and wrist-guard splint clearance on cold morning runs.
  everyone_has_it: false

- headline: "Carpet Boarding and Living-Room Footwork Drills for Winter Days"
  url: https://concretecomeback.com/blog/carpet-boarding-and-home-footwork-drills-for-winter/
  published: 2026-11-18
  author: Sam Torres
  source_type: primary
  summary: Removing trucks, wheels, and all eight mounting bolts creates a smooth bare deck for ten-minute living-room drills on anchored carpet or rubber mats. Covers push-to-ride 45-degree front-foot pivots, five-breath low-crouch knee-tracking holds, and wall-supported tail presses, alongside clear limits on what carpet hides about loop-out physics.
  why_it_matters: Gives working skaters over 40 a safe weeknight footwork habit when it gets dark by 5:00 p.m. and the driveway is wet.
  everyone_has_it: false

- headline: "Concrete Comeback Local Skate Shops & Skateparks Directories"
  url: https://concretecomeback.com/directory/shops
  published: 2026-11-18
  source_type: primary
  summary: Curated directories of 38 welcoming independent skate shops and 279 older-skater-friendly skateparks across the US, UK, Canada, and Australia.
  why_it_matters: Connects the hardware bolt-length checklist directly to counter purchases at rider-run shops and morning transition sessions.
  everyone_has_it: false
```

## Anti-Template & Subject Line Dedup Check

- **Prior editions checked:** None in `./campaigns/newsletters/` (first archived campaign edition).
- **Opening move:** Opens directly on a concrete hardware mechanic (`2mm` of lost axle-to-deck clearance when stepping from `52mm` street wheels to `56mm` softer wheels, compounded by a 195-pound carve compressing stock `90A` bushings). Avoids any newsletter throat-clearing ("Welcome back", "As winter approaches", "In this week's issue").
- **Subject line mechanisms:**
  1. *Specific mechanical tradeoff + audience hook (Chosen):* `"3mm of rubber vs. 195-pound wheel bite (plus winter layering with pads)"`
  2. *Direct question the reader asks at the shop counter:* `"Do 1/8-inch shock pads actually save your knees, or just stop road buzz?"`
  3. *Contrarian setup rule:* `"Why stacking 1/4-inch risers under 56mm wheels tires out your front quad"`

## Phase 5 Quality Gate Scores

| Dimension | Iteration 1 | Iteration 2 (Final) | Notes |
|---|---|---|---|
| **1. Open** | 8/10 | 9/10 | Subject Variant 1 pairs exact specs (`3mm of rubber`, `195-pound wheel bite`) with the seasonal layering hook. Preheader extends with bolt lengths and `56mm` wheel math. |
| **2. Hook** | 8/10 | 9/10 | First two sentences establish the exact `2mm` radius math of stepping up from `52mm` to `56mm` wheels and why a 195-pound carve finds the maple ply earlier than standard charts predict. |
| **3. Value** | 9/10 | 9/10 | Gives the reader an actionable 3-row wheel/weight/bolt lookup table, the locknut torque rule for rubber shock pads, and a 10-minute living-room pivot drill. |
| **4. Forward** | 8/10 | 9/10 | The distinction between high-frequency vibration attenuation and vertical ground-reaction impact, plus the front-leg single-leg squat cost of tall risers, is screenshot-ready for r/OldSkaters or local group chats. |
| **5. Voice** | 9/10 | 9/10 | Pure Marcus Webb / Sam Torres register. Checked line-by-line against `voice-profile.md` and `preferences.md`: zero em dashes, zero "adult" occurrences, zero "not X, but Y" phrasing, zero AI crutch words, zero exclamation marks. |
