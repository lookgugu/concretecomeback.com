# Instagram Curator Playbook: `@concretecomeback`

- **Account:** `@concretecomeback` (PostEverywhere Account ID `11053`)
- **Primary Audience:** Returning older skaters (ages 30, 40, 50+) coming back after 10 to 25 years off, plus late-starter beginners
- **Brand Policy Guardrails:** Zero products sold, zero affiliate links, zero paid sponsorships (`brand/preferences.md`); always use `"older skaters"` or `"older returners"` (never `"adult"` or `"adults"`); strict anti-AI slop discipline (zero em/en dashes, zero "not X, but Y" contrasts)
- **Last Updated:** 2026-11-23

---

## 1. Visual Brand & Aesthetic System

Anchored directly to the Tailwind v4 `@theme` design tokens in `src/styles/global.css` and the Pillow 1080x1350 renderer in `scripts/social/post-blog-to-social.py`:

| Role | Design Token | Hex / RGB | Instagram Application |
| :--- | :--- | :--- | :--- |
| **Primary Dark Canvas** | `concrete-900` | `#141210` (`20, 18, 16`) | Background for 4:5 (1080x1350) technical carousels (hardware setup, physiology, fall drills) |
| **Elevated Card Surface** | `concrete-800` | `#1F1C18` (`31, 28, 24`) | Inner card fill (`48px` inset, `24px` corner radius, `3px` `#3A352F` border) |
| **Warm Chalk Canvas** | `concrete-50` / `100` | `#FAF8F5` / `#F3EFEA` | Alternating light-mode cards for **Directory Spotlights** (parks, local shops, 30+ crews) |
| **Primary Signal Accent** | `skate-amber` | `#F59E0B` (`245, 158, 11`) | Top bar, category pills, rule dividers, numbered takeaway bullets, swipe indicators |
| **High-Urgency Accent** | `skate-orange` | `#F97316` (`249, 115, 22`) | Red-flag injury/safety callouts and Story link sticker borders |
| **Primary Display Text** | `concrete-50` | `#FAFAF9` | High-contrast display titles (`Oswald` condensed uppercase/title-case aesthetic) |
| **Body & Spec Copy** | `concrete-200` / `400` | `#E7E5E4` / `#A8A29E` | Spec measurements (`mm`, `durometer`, `inches`) and footer attribution |

### 9-Post Grid Architecture (Checkerboard Rhythm)
Alternate three distinct visual templates across every 3-post row so the grid balances dark technical cards, raw concrete photography, and warm chalk directory spotlights:

```
+-----------------------------+-----------------------------+-----------------------------+
| [1] DARK SPEC CAROUSEL      | [2] DAWN PATROL REEL COVER  | [3] WARM CHALK DIRECTORY    |
| #141210 bg + #F59E0B pill   | Raw coping/concrete photo   | #FAF8F5 bg + shop/park map  |
| "Riser vs. Shock Pads:      | with clean Oswald title bar | "3 Welcoming Shops & Bowls  |
|  180-220+ lb Setup Guide"   | "7:15 AM Sunday Coping Flow"|  for 35+ Skaters: PNW"      |
+-----------------------------+-----------------------------+-----------------------------+
| [4] DAWN PATROL REEL COVER  | [5] DARK SPEC CAROUSEL      | [6] COMMUNITY SETUP CHECK   |
| Grass roll drill B-roll     | #141210 bg + #F59E0B pill   | Overhead deck/truck flatlay |
| "3 Grass Drills That Stop   | "Mellow vs. Steep Concave:  | "Marcus's 47yo Curb Setup:  |
|  the Straight-Arm Reflex"   |  Why Your Arches Cramp"     |  8.75 Deck, Indy 159s, 93A" |
+-----------------------------+-----------------------------+-----------------------------+
| [7] WARM CHALK DIRECTORY    | [8] DAWN PATROL REEL COVER  | [9] DARK SPEC CAROUSEL      |
| #FAF8F5 bg + crew handles   | Bearing clean bench clip    | #141210 bg + #F59E0B pill   |
| "Older-Skater Meetups:      | "20-Minute Winter 608       | "DOMS vs. Joint Pain:       |
|  UK & East Coast Roll Call" |  Bearing Rescue Protocol"   |  The 48-Hour Traffic Light" |
+-----------------------------+-----------------------------+-----------------------------+
```

### Bio & Story Highlights Architecture
- **Searchable Display Name:** `Concrete Comeback | Skateboarding After 30, 40 & 50`
- **Bio Copy (148 chars):**
  > Hardware geometry, joint-friendly recovery, and 339+ parks, local shops & older-skater crews.
  > Zero gatekeeping. No affiliate links.
  > Weekly notes below:
- **Primary Bio Link:** `https://concretecomeback.com/?utm_source=instagram&utm_medium=bio&utm_campaign=weekly_notes`
- **5 Permanent Story Highlights:**
  1. `Start Here` — Mission, the 4 author voices (Sam Torres, Jo Fairweather, Marcus Webb, Editorial Team), and how the directory works.
  2. `Board Setup` — Saved hardware spec slides (riser vs. shock pads, mellow concave, 93A to 97A bushings, 54mm to 56mm wheels, winter 608 bearings).
  3. `Joints & Fall` — Prehab warmups, FOOSH grass shoulder-roll drills, and the 48-hour Green/Amber/Red soreness test.
  4. `Shops & Parks` — Regional taggable slides covering 38 core skate shops and 279 skate parks.
  5. `30+ Crews` — Meetup schedules and `@handles` for the 22 listed older-skater groups.

---

## 2. The 1/3 Content Mix & 30-Day Content Calendar

1. **1/3 Educational (Save & Bookmark Engine — 4:5 Carousels, 1080x1350):** High-utility mechanics, hardware specs, and injury-prevention checklists from the 197 blog articles. Target: **>5% save-to-reach rate**.
2. **1/3 Brand & Directory Utility (Traffic & Co-Sign Engine — Regional Carousels + Tag Stories):** Regional triads pairing an older-skater-friendly skate park (`/directory/parks`), a welcoming independent shop (`/directory/shops`), and a local older-skater meetup (`/directory/groups`), tagging every real `@handle` from frontmatter. Target: **Shop/crew Story reshares + directory visits**.
3. **1/3 Community & Culture (Comment & Share Engine — Reels & Discussion Prompts):** Dawn-patrol session checks, setup roll calls, and 6-month comeback milestone discussions. Target: **High comment velocity + DM shares**.

### 30-Day Content Calendar (4 Feed Posts/Week)

| Week | Day | Pillar (1/3 Mix) | Format | Topic / Source Asset | Primary CTA / Conversion Goal |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **W1** | Tue | **Educational** | 7-Slide 4:5 Carousel | **Riser Pads vs. Shock Pads for 180 to 220+ lb Skaters** (`campaigns/riser-vs-shock-pads/social/instagram/carousel-01.md`) | Save spec table before next shop visit |
| **W1** | Thu | **Directory** | 5-Slide Warm Card | **East Coast & Florida Welcoming Shop + Park Triad** (`@orchardskateshop`, `@labor_skateshop`, `@westsideskates`) | Tag your local shop in comments + visit `/directory/shops` |
| **W1** | Sat | **Community** | 30s Reel (9:16) | **The 7:00 AM Sunday Dawn Patrol Rule:** Why empty concrete beats Friday night ego | Comment your local Sunday morning roll call time |
| **W1** | Sun | **Educational** | 7-Slide 4:5 Carousel | **Mellow vs. Steep Deck Concave: Stopping Arch Cramping** (`campaigns/deck-concave-foot-fatigue/social/instagram/carousel-01.md`) | Save & run the 3-step shop carpet test |
| **W2** | Tue | **Educational** | 7-Slide 4:5 Carousel | **20-Minute Wet Winter 608 Bearing Rescue** (`campaigns/winter-bearings/social/instagram/carousel-01.md`) | Save before your next damp session |
| **W2** | Thu | **Directory** | 5-Slide Warm Card | **West Coast & PNW Classics:** Burnside/Lincoln City + `@calsk8` + `@35thnorth` + `@blacksheepskateshop` | Share to Story + tag a PNW skater |
| **W2** | Sat | **Community** | 45s Reel (9:16) | **3 Grass Drills That Break the Straight-Arm FOOSH Reflex** (`src/content/blog/how-to-fall-safely-after-40.md`) | Send to a friend returning after 15+ years off |
| **W2** | Sun | **Community** | Photo Flatlay | **Setup Roll Call (35 to 55+):** Drop your deck width, truck axle, wheel duro, and age in the comments | High-velocity comment thread |
| **W3** | Tue | **Educational** | 6-Slide 4:5 Carousel | **DOMS vs. Acute Joint Pain: The 48-Hour Traffic Light** (`src/content/blog/recovery-days-for-adult-skaters.md`) | Save the Green / Amber / Red morning checklist |
| **W3** | Thu | **Directory** | 5-Slide Warm Card | **UK Older-Skater Spots & Shops:** `@slamcityskates`, `@nativeskates`, `@note_skate_shop` + UK parks | Submit missing UK parks at `/submit` |
| **W3** | Sat | **Community** | 5-Slide Feed Card | **Why Older Skaters Quit at Month 3 (And the 20-Minute Fix)** (`src/content/blog/why-adult-skaters-quit-at-six-months.md`) | Bio link -> Weekly session notes signup |
| **W3** | Sun | **Educational** | 6-Slide 4:5 Carousel | **72-Hour Post-Session Recovery Timeline: Hydration, Isometric Loading & Mobility** (`src/content/blog/recovery-guide-for-adult-skaters.md`) | Save for Sunday post-session recovery |
| **W4** | Tue | **Directory** | 5-Slide Warm Card | **Midwest & Texas Concrete + Shops:** `@upriseskateshop`, `@familia_skateshop`, `@no_comply_atx`, `@southsideskateshop` | Tag your go-to Midwest/TX park |
| **W4** | Thu | **Educational** | 6-Slide 4:5 Carousel | **Months 1 to 6 Back on a Board: Realistic Physical & Mental Checkpoints** (`src/content/blog/first-six-months-back-what-to-expect.md`) | Save + send to a friend on Month 1 |
| **W4** | Sat | **Community** | 30s Reel (9:16) | **Curb Slappy & Mellow Bank Line vs. Stair Sets:** Redefining progression after 40 | Comment your favorite low-impact trick |
| **W4** | Sun | **Directory** | 5-Slide Warm Card | **22 Older-Skater Meetup Groups & Dawn Patrol Crews** (`/directory/groups`) | Visit `/directory/groups` or submit your crew at `/submit` |

---

## 3. Hashtag, `@handle` Co-Sign & Conversion Architecture

### Focused 5-Tag Stack
- **Base Tags (Always 2):** `#skateboarding` `#olderskaters`
- **Hardware & Setup Posts (Add 3):** `#skatesetup` `#skateboardhardware` `#curbskating`
- **Prehab, Fall & Recovery Posts (Add 3):** `#skaterecovery` `#skateprehab` `#skateover40`
- **Directory & Shop Spotlight Posts (Add 3):** `#supportsaveskateshops` `#skateparkguide` `#oldmanskateclub`

### Automated Directory `@handle` Co-Sign Loop
- `extract_directory_handles()` in `scripts/social/post-blog-to-social.py` automatically detects internal `/directory/(parks|shops|groups)/<country>/<slug>` links in blog markdown, looks up the entry's `instagram:` handle in `src/content/`, and appends `"Spots & shops mentioned: @handle1 @handle2"` to the Instagram caption.
- Within 15 minutes of publishing a post that tags a shop or crew, share the carousel to `@concretecomeback` Stories with a clickable `@mention` sticker so the featured shop or crew receives a 1-tap **"Add to Your Story"** prompt in their DMs.

### Zero-Affiliate Conversion Funnel
1. **Save-to-Bio Newsletter Conversion:** Every educational carousel concludes with a clear invitation to join the weekly session notes via the UTM-tagged link in bio (`newsletter_signup_pending` / `newsletter_signup_confirmed`).
2. **Independent Shop Foot Traffic (`/directory/shops`):** Hardware carousels give skaters exact part specifications (`1/8" rubber shock pad + 1" bolts`, `0.30"-0.35" mellow concave`, `99% IPA bearing flush + 2 drops skate oil`) to bring to their local shop counter.
3. **Community Directory Submissions (`/submit`):** Bi-weekly Story Question Stickers gather new older-skater-friendly park timings, welcoming shops, and 30+/40+ meetup groups.
