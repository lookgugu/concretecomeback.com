# Campaign Brief: Sitewide Newsletter CTA Upgrade (`NewsletterInline.astro` & `NewsletterSignup.astro`)

**Date:** 2026-11-19
**Campaign:** `newsletter-cta`
**Data:** LOCAL DOCS + LIVE (6 sources from `./brand/voc.md` and `./brand/positioning.md`)

---

## 1. Frame the Job

- **Format:** On-page inline signup form (`NewsletterInline.astro`, rendered compact near the top of `/` and `/directory/parks`, and full-width at the end of all 193 blog posts via `BlogLayout.astro`) plus the coordinated 5-second popup card (`NewsletterSignup.astro`).
- **Chosen Angle (`positioning.md#chosen-angle`):** **★ The "Monday-Ready Session" Angle** — Practical, evidence-grounded guidance and vetted local intelligence built specifically for older skaters (35–60+) who want to progress on the weekend and still show up to work healthy on Monday.
- **Where the reader came from & what they were promised:**
  - **Organic Search & Blog Readers (`in_post`):** Arrived via specific problem queries (how to fall on pads without breaking a wrist, choosing an 8.5"+ deck or softer wheels for rough asphalt, managing knee/achilles load after 40, breaking a six-month flatground plateau). They were promised technical, evidence-grounded answers written for older bodies.
  - **Directory Visitors (`parks_inline` & `home_inline`):** Arrived looking for a low-ego skate park with mellow transitions and quiet dawn-patrol hours, a welcoming independent shop, or a 30+/40+ session crew across the US, UK, Canada, or Australia.
  - **Why the existing CTA failed (0 signups across ~1,400 visitors in 30 days):** "Keep your comeback rolling. The week's best new reads and, when available, one practical idea for your weekend session." sounds like a generic content digest. It disconnects from the physical stakes that brought the reader to the page: setup mechanics, pad confidence, joint recovery, and showing up to work intact on Monday.
- **Awareness Level (Schwartz):** **Level 2 (Problem-Aware) to Level 3 (Solution-Aware).** Visitors acutely feel the physical and social friction of returning after a 15–30 year break ("man I need some pads", "Wrist also took some damage", "Anyone here start in their 40's?"). They know pads, wider setups, and morning sessions exist, and they are actively reading Concrete Comeback to dial in their setup and technique. The copy must lead with the specific mechanics of skating after 35 and the Monday-morning payoff before naming the weekly delivery cadence.

---

## 2. The So-What Chain

1. **Feature:** A weekly email compiling Concrete Comeback's new articles and, when available, one practical idea for your weekend session.
2. **So what?** You get board setup mechanics (deck width, wheel durometer, bushings), fall and pad technique, and joint-saving recovery notes filtered specifically for skaters in their 30s, 40s, 50s, and 60s.
3. **So what?** You stop guessing on gear aimed at teenagers or learning pad lessons the hard way after a slam on concrete.
4. **Bottom-level payoff (Time / Money / Worry):** You skate better on Saturday morning and still show up to work healthy on Monday.

---

## 3. Voice of Customer (VoC) Evidence (`./brand/voc.md`)

- **Pain — Post-slam pad realization:** *"That was my immediate thought afterwards, man I need some pads. I use the old bones knee sleeves but I'm thinking I need to get some wrist guards, elbow pads, and maybe some rhip clips."* ([r/OldSkaters](https://www.reddit.com/r/OldSkaters/comments/ymx8x5/took_a_nice_slam_at_the_local_park_the_other_day/), seen 2026-11-18)
- **Pain — Wrist and knee damage on the return:** *"I always wear my helmet but never thought I needed pads. Took a pretty good fall, scraped up pretty good so I want to get some knee/elbow pads. Just wondering what the best pads were and if it was a good idea to get /wear the wrist gaurds also. Wrist also took some damage."* ([r/OldSkaters](https://www.reddit.com/r/OldSkaters/comments/w77syc/took_a_pretty_good_fall_time_for_some_pads_opinions/), seen 2026-11-18)
- **Desire — Learning to trust pads and fall mechanics:** *"For me the trick was to actually fall voluntarily in a controlled way. And doing so in the correct way using your pads. I really had to learn to trust the pads … once my body (and brain) got used to the right way of falling I started to land on my pads in real crashes."* ([r/OldSkaters](https://www.reddit.com/r/OldSkaters/comments/ebzgyj/must_learn_to_fall_because_pads_dont_always_help/), seen 2026-11-18)
- **Objection / Identity — Starting or returning in your 40s and 50s:** *"Anyone here start in their 40's?"* ([r/OldSkaters](https://www.reddit.com/r/OldSkaters/comments/18c4h6u/start_as_an_old_skater_45yo/), seen 2026-11-18) and *"First post, LOVE reading over this sub."* ([r/OldSkaters](https://www.reddit.com/r/OldSkaters/comments/1d4a0t3/new_old_skater_getting_back_into_it_50yo/), seen 2026-11-18)
- **Customer Shorthand:** "getting back on the board", "20-year break", "dawn patrol", "wide deck (8.5+)", "soft wheels / Dragon wheels", "wrist guards", "knee sleeves", "pads", "session", "flat ground", "carving transition", "showing up on Monday".

---

## 4. Fact Sheet & Proof Inventory (Claim Gate Contract)

Every line in the shipped CTA must trace to a verified fact below. No unbuilt lead magnets, no instant PDF downloads, and no monthly spot/group digest promises may appear in shipped copy.

| Fact ID | Verified Fact | Source |
|---|---|---|
| **F1** | The email is sent **weekly** ("Weekly roundup" / "weekly Concrete Comeback email"). It is never monthly. | `src/scripts/newsletter-cadence-copy.test.js`, `brand.yaml` |
| **F2** | Every weekly issue is built from new Concrete Comeback blog posts and, **when available, one practical idea for your weekend session** (health-only issues or issues without practical headings omit the weekend section). | `src/scripts/newsletter-cadence-copy.test.js`, `scripts/newsletter/` |
| **F3** | The weekly email does **not** include newly added skate spots or community groups (those belonged to the retired monthly format). | `src/scripts/newsletter-cadence-copy.test.js` (line 30–32) |
| **F4** | Blog coverage spans board setup mechanics (wider decks, wheel durometer, trucks/bushings), protective gear (wrist guards, knee sleeves, pads), fall technique, joint/tendon recovery, and comeback stories for older skaters returning after a break. | `brand.yaml` (193 articles), `voice-profile.md`, `voc.md` |
| **F5** | Concrete Comeback is 100% free, with zero paid placements, zero affiliate links, and one-click unsubscribe anytime. | `positioning.md`, `preferences.md`, `NewsletterInline.astro` |
| **F6** | **Hard Code & Test Contract (`src/scripts/newsletter-cadence-copy.test.js`):** Both `NewsletterInline.astro` and `NewsletterSignup.astro` must contain `>Weekly roundup<`, `The week's best new reads and, when available, one practical idea for your weekend session.`, and `you agree to receive the weekly Concrete Comeback email. Unsubscribe anytime.`, and must NEVER match `/monthly|each month|every month|per month/i` or `/new skate spots|and one practical idea|practical advice/i`. | `src/scripts/newsletter-cadence-copy.test.js` |
| **F7** | **Brand Guardrails (`preferences.md`):** Public copy must say "older skaters" or "older returners" (never "adult skaters"), and avoid em dashes as clause connectors, "not X, but Y" contrasts, bold-label listicles, and AI crutch words. | `preferences.md`, `voice-profile.md` |

---

## 5. Phase 4 Gate: 7-Dimension Calibration Scorecard & Rewrite History

Scored against `references/calibration-anchors.md`. Because the newsletter has 0 prior conversions recorded in the last 30 days and does not yet display subscriber count or reader testimonials on the form, **Proof** is evaluated strictly on claim-to-evidence alignment and zero-spam/zero-affiliate trust facts (7/10 floor), while Urgency respects the calibration anchor ceiling for an evergreen weekly signup without manufactured scarcity (7/10 via Saturday-to-Monday session utility).

### Baseline Score: Existing Live Copy (Before)
> **Heading:** Weekly roundup
> **Body:** Keep your comeback rolling. The week's best new reads and, when available, one practical idea for your weekend session.
> **Button:** Send me the roundup
> **Consent:** By subscribing, you agree to receive the weekly Concrete Comeback email. Unsubscribe anytime. Privacy

| Dimension | Score | Pointer & Diagnosis |
|---|---|---|
| **Clarity** | 5/10 | "Keep your comeback rolling" and "best new reads" could apply to any hobby blog; doesn't tell an older skater what kind of reads they get. |
| **Specificity** | 3/10 | Zero hardware, body, or session specifics. No mention of setup mechanics, wrist guards, knee sleeves, or Monday recovery. |
| **Voice** | 5/10 | Clean and polite, but generic newsletter template voice rather than Marcus Webb / Jo Fairweather / Sam Torres peer-to-peer specificity. |
| **Desire** | 4/10 | "One practical idea for your weekend session" hints at a session, but misses the felt moment of skating Saturday and showing up to work healthy on Monday. |
| **Proof** | 6/10 | Passes the claim gate (accurately qualifies "when available"), but states no credibility differentiator (free, no affiliate hype, written for 35+ bodies). |
| **Urgency** | 4/10 | No reason to subscribe before this weekend's session versus ignoring the box. |
| **Flow** | 6/10 | Short and readable, but "Keep your comeback rolling" does zero work pulling the reader into the second sentence or the button. |
| **Total** | **33/70** | **FAIL** (6 dimensions below 7; total below 56/70). |

### Pass 1: Adding Specifics & Monday-Ready Hook
> **Eyebrow / Heading:** Weekly roundup
> **Subhead:** Skate this weekend. Show up healthy on Monday.
> **Body:** Board setup mechanics, pad and fall notes, and joint-saving recovery for older skaters. The week's best new reads and, when available, one practical idea for your weekend session.
> **Button:** Get the weekly session notes
> **Consent:** Free every week, no affiliate links. By subscribing, you agree to receive the weekly Concrete Comeback email. Unsubscribe anytime. Privacy

| Dimension | Score | Pointer & Diagnosis |
|---|---|---|
| **Clarity** | 8/10 | One pass tells the reader who it's for (older skaters), what's inside (setup mechanics, pad/fall notes, recovery), and the cadence (weekly). |
| **Specificity** | 7/10 | Names board setup mechanics, pad/fall notes, and joint-saving recovery, though it can use sharper VoC nouns ("wrist guards, softer wheels, knee load"). |
| **Voice** | 8/10 | Sounds like an experienced 45-year-old skater talking to a peer at the park. Zero AI tells, zero em dashes. |
| **Desire** | 8/10 | "Skate this weekend. Show up healthy on Monday." puts the reader inside the exact Saturday-to-Monday transformation they care about. |
| **Proof** | 7/10 | Every claim matches the 193-article corpus and weekly script behavior; "Free every week, no affiliate links" anchors Concrete Comeback's verifiable editorial stance. |
| **Urgency** | 6/10 | Names "this weekend", but can sharpen the cost of waiting (one more weekend guessing on setup or taking a dry slam before your next session). |
| **Flow** | 8/10 | Subhead hooks the outcome -> body names the concrete topics and satisfies the test contract -> button names the action. |
| **Total** | **52/70** | **REWRITE NEEDED** (Urgency at 6/10; total 52/70 vs 56/70 gate). |

### Pass 2 (Final Shipped Copy): Lifting Specificity & Honest Pre-Session Urgency
> **Eyebrow (`<h2>`):** Weekly roundup
> **Hook Lead (`<p>`):** **Skate Saturday morning and still show up healthy on Monday.**
> **Body (`<p>`):** Setup mechanics (wider decks, softer wheels), wrist-guard and pad notes, and joint-saving recovery for older skaters returning after a break. The week's best new reads and, when available, one practical idea for your weekend session.
> **Button:** Send my weekly session notes
> **Friction Reducer / Consent (`<p>`):** Free before your next weekend session. Zero spam or affiliate gear hype. By subscribing, you agree to receive the weekly Concrete Comeback email. Unsubscribe anytime. Privacy

| Dimension | Score | Pointer & Verification |
|---|---|---|
| **Clarity** | 9/10 | Instant comprehension: who it is for ("older skaters returning after a break"), what arrives ("Setup mechanics... wrist-guard and pad notes, and joint-saving recovery"), and when ("weekly"). |
| **Specificity** | 8/10 | Uses verbatim VoC hardware and body nouns ("wider decks, softer wheels", "wrist-guard and pad notes", "joint-saving recovery", "Saturday morning", "healthy on Monday"). |
| **Voice** | 8/10 | Grounded peer-to-peer voice matching Marcus Webb and Jo Fairweather; respects every rule in `preferences.md` (uses "older skaters", zero em dashes, zero "not X, but Y" pivots). |
| **Desire** | 8/10 | "Skate Saturday morning and still show up healthy on Monday" renders the exact after-state from `positioning.md#chosen-angle` as a concrete scene. |
| **Proof** | 8/10 | 100% compliant with the Claim Gate and `newsletter-cadence-copy.test.js`. Anchors trust with verifiable site facts ("Free before your next weekend session. Zero spam or affiliate gear hype."). |
| **Urgency** | 7/10 | "Free before your next weekend session" ties signing up today to an immediate, real calendar boundary (this Saturday's session) without fake scarcity. |
| **Flow** | 8/10 | Eyebrow sets expectation -> bold hook lands the Saturday/Monday scene -> concrete VoC specifics bridge seamlessly into the required cadence sentence -> first-person CTA button ("Send my weekly session notes") closes the loop. |
| **Total** | **56/70** | **PASS** (All 7 dimensions >= 7; total 56/70; 100% Claim Gate and test-suite pass). |
