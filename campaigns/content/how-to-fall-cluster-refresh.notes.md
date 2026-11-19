# SEO Content Refresh Notes: How to Fall Cluster (De-Cannibalization & SERP/AI Citation Diff)
Date: 2026-11-19

## 1. De-Cannibalization Map Across the 3 Competing Articles

Prior to this refresh, `how-to-fall-safely-after-40.md`, `how-to-fall-safely-skateboarding.md`, and `how-to-fall-skateboarding-adults.md` were published within three days of one another (2026-08-15 to 2026-08-17) with near-identical structures: each opened with "everyone teaches gear, nobody teaches how to fall," repeated the same four-step tuck-and-roll list, included a generic paragraph on grass practice, and closed with "wrist guards still matter." They split impressions across the same core queries and flagged multiple `scripts/check-humanizer.mjs` errors (em dashes, bold-label lists, and user-facing `adult`/`adults` terminology).

This refresh separates the three URLs into non-overlapping search intents while preserving title token similarity (`jaccard(tokens(old_title), tokens(new_title)) >= 0.34`) so `scripts/check-duplicate-posts.mjs` passes without treating any update as a silent URL overwrite:

| URL Slug | Old Title → New Title (`jaccard` score) | Primary Query & Distinct Search Intent | Unique Clinical / Mechanical Scope | Outbound Internal Links |
|---|---|---|---|---|
| `/blog/how-to-fall-safely-after-40/` | `"How to Fall Safely on a Skateboard After 40"` → `"How to Fall Safely After 40: Tuck, Roll, and Transition"` (`0.40 >= 0.34`) | `how to fall safely on a skateboard after 40` / `knee slide vs tuck and roll transition skateboarding` (Terrain-specific bail mechanics & hip fracture protection after 40) | Flatground diagonal shoulder-to-hip tuck-and-roll mechanics versus hard-cap knee-pad sliding on transition walls (ramps, bowls, banks), plus protecting the greater trochanter (outer hip) where lateral impacts concentrate hip-fracture force as bone density declines. | `/blog/how-to-fall-safely-skateboarding/`, `/blog/how-to-fall-skateboarding-adults/`, `/blog/impact-shorts-hip-protectors-for-adult-skaters/`, `/directory/parks` |
| `/blog/how-to-fall-safely-skateboarding/` | `"How to Fall Safely: The Technique Adult Beginners Need"` → `"How to Fall Safely for Older Beginners: Technique and Post-Fall Checks"` (`0.57 >= 0.34`) | `how to fall safely skateboarding beginner` / `what to do after a skateboard fall red flags` (Unlearning the FOOSH reflex + 60-second on-ground triage and emergency red flags) | Biomechanics of the outstretched-hand (FOOSH) distal radius and scaphoid fracture mechanism in older beginners, the 60-second on-ground self-assessment protocol right after a slam, and emergency red-flag symptoms (concussion, spinal injury, occult fracture signs) requiring immediate medical evaluation. | `/blog/how-to-fall-safely-after-40/`, `/blog/how-to-fall-skateboarding-adults/`, `/blog/concussion-protocol-for-skaters-over-40/`, `/directory/parks` |
| `/blog/how-to-fall-skateboarding-adults/` | `"How to Fall: The Skill Adult Skaters Need to Learn First"` → `"How to Fall on a Skateboard: Grass Drills to Learn the Skill First"` (`0.60 >= 0.34`) | `how to practice falling on a skateboard grass drills` / `skateboard breakfall drills wrist guards` (Off-board motor-learning progression & splint-plus-elbow-flexion integration) | Off-board grass and gym-mat breakfall training progression (crouch diagonal side-roll, kneeling bent-elbow forearm catch, 60-second pre-session motor imagery routine) and how rigid-splint wrist guards work mechanically alongside elbow flexion and palm sliding. | `/blog/how-to-fall-safely-after-40/`, `/blog/how-to-fall-safely-skateboarding/`, `/blog/wrist-guards-for-adult-skaters/`, `/directory/shops` |

---

## 2. Phase 1: SERP Diff (August 2026 vs. November 2026)

- **Target Queries Queried (2026-11-19):**
  1. `how to fall safely on a skateboard after 40 tuck and roll knee slide transition`
  2. `how to fall on a skateboard without breaking your wrist FOOSH grass drills`
- **Observed Ranking Pages & Evidence (~ summary reads via web search):**
  - `whythetrick.io` & `brailleskateboarding.com` (~600–900w, beginner tutorials): Cover basic parkour shoulder-roll cues (tuck chin, roll diagonally over one shoulder rather than straight down the spine) and warn against "rag-dolling" vs freezing up. Neither addresses midlife bone-density risk at the greater trochanter or distinguishes when a knee slide grabs on flat concrete versus gliding on transition walls.
  - `shop709.com` (~550w, skate shop guide): Explains dropping both knees simultaneously onto hard-cap knee pads on quarter pipes and leaning the torso slightly back to avoid pitching forward. Lacks post-fall medical triage or red-flag fracture/concussion criteria.
  - `surfertoday.com` (~700w, action-sports explainer): Names the FOOSH (Fall Onto Outstretched Hand) reflex and recommends forearm-and-shoulder rolling, plus basic grass practice. No structured rep-by-rep off-board progression or explanation of how a rigid palm splint interacts with a locked elbow vs a flexed elbow.
  - `reddit.com/r/OldSkaters` & `r/NewSkaters`: Community threads highlight two recurring gaps in standard beginner guides: (1) older returners landing squarely on the bony outer hip (greater trochanter) during low-speed sideways stalls, and (2) older beginners jumping straight up after a slam out of embarrassment at the park and skating on an undiagnosed radial head, scaphoid, or rib fracture.
- **PAA & Search Intent Shifts Identified:**
  - *When should you knee slide vs tuck and roll on a skateboard?* (Assigned to `how-to-fall-safely-after-40.md`)
  - *Why do older skaters hit their hip so hard on low-speed falls?* (Assigned to `how-to-fall-safely-after-40.md`)
  - *What should you check in the first 60 seconds after a skateboard slam?* (Assigned to `how-to-fall-safely-skateboarding.md`)
  - *How do you practice falling off a skateboard on grass before going to a skatepark?* (Assigned to `how-to-fall-skateboarding-adults.md`)

---

## 3. Phase 1.5: AI Surface & Citation Diff

```
AI SURFACE 1: "how to fall safely on a skateboard after 40 tuck and roll knee slide transition"
AIO present: yes · Cited: whythetrick.io (diagonal shoulder roll mechanics), brailleskateboarding.com (chin tuck & fetal curl), shop709.com (two-knee simultaneous drop on transition ramps), reddit.com/r/OldSkaters (grass drill and hard-cap knee pad consensus)
Variant phrasings cited: queries asking about hip injuries after 40 pull general medical pages on greater trochanter fractures alongside r/OldSkaters threads on padded impact shorts.
Citation gap & Refresh fix: No cited source pairs a terrain-by-terrain decision table (Flatground vs Mellow Bank vs Transition Wall vs Over-the-Coping Bail) with greater trochanter fracture prevention for skaters over 40. Added an extractable answer-first block under every H2 and a terrain bail comparison table in `how-to-fall-safely-after-40.md`.

AI SURFACE 2: "how to fall on a skateboard without breaking your wrist FOOSH grass drills"
AIO present: yes · Cited: surfertoday.com (FOOSH definition and forearm redistribution), reddit.com (mantis forearm slide and deep-squat shoulder roll drills on grass), youtube.com tutorial transcripts
Variant phrasings cited: queries on post-fall wrist pain or head impact shift to generic sports-medicine FOOSH pages (scaphoid/distal radius tenderness) and CDC concussion red-flag lists, none tailored to older skateboarders at a park session.
Citation gap & Refresh fix:
1. For `how-to-fall-safely-skateboarding.md`: Added a structured 60-second on-ground self-assessment checklist separating general muscular impact ache from focal fracture tenderness (anatomic snuffbox / scaphoid, distal radius, clavicle) and immediate emergency red flags.
2. For `how-to-fall-skateboarding-adults.md`: Added a 3-drill off-board grass progression table (starting posture, contact sequence, rep target, advancement rule) plus the biomechanical breakdown of how a rigid-splint wrist guard requires elbow flexion and palm sliding rather than a locked-arm plant.
```

---

## 4. Quality & Humanizer Verification Log

- `node scripts/check-humanizer.mjs` target: `0 Humanizer tells` across all 3 refreshed posts.
  - Removed all `—` and `–` dashes.
  - Removed all `**...**` inline bold and bold-label lists (replaced with `###` subheadings and clean tables/lists).
  - Replaced all user-facing occurrences of `adult` / `adults` in titles, descriptions, headings, and body prose with `older skaters`, `skaters over 40`, or `older beginners`.
  - Kept `rather than` to `<= 2` occurrences per file (`0–1` used).
  - Removed AI crutch words (`genuinely`, `crucial`, etc.).
- `node scripts/check-duplicate-posts.mjs` target: `0 error(s)` on modified files (`jaccard` title token similarity `0.40`, `0.57`, and `0.60`, all `>= 0.34`).
- Author persona compliance (`docs/AUTHOR-VOICES.md`): Jo Fairweather's calm, evidence-grounded physiotherapist voice; no fabricated patient conversations or invented personal anecdotes.
