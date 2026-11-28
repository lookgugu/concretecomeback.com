# Campaign Verification Notes: Skateboarding After a Meniscus Tear or Arthroscopic Knee Surgery

## File Ownership & Locations
- Blog Post: `src/content/blog/skateboarding-after-meniscus-tear-knee-surgery.md`
- Campaign Copy: `campaigns/content/skateboarding-after-meniscus-tear-knee-surgery.md`
- Verification Notes: `campaigns/content/skateboarding-after-meniscus-tear-knee-surgery.notes.md`

## Author Persona & Frontmatter Check
- Author: Jo Fairweather (`authorAge: 52`, physiotherapist and skater).
- Voice & Guardrails: Evidence-grounded, calm, clinically rigorous. Separates clinical evidence from practical skateboarding advice using clear headings and tables. Zero invented patient anecdotes or fabricated memories.
- Frontmatter:
  - `title`: "Skateboarding After a Meniscus Tear or Arthroscopic Knee Surgery" (63 chars, within 80-char limit)
  - `description`: "How arthroscopic partial meniscectomy, meniscal repair, and non-operative rehab differ for older skaters, plus criteria-based knee clearance tests." (147 chars, within 50-165 char limit)
  - `pubDate`: 2026-11-28

## Clinical & YMYL Safety Verification
1. **Opening Direct Answer & Surgeon/PT Clearance Mandate:** Opens with a 71-word direct answer stating that return to skateboarding depends on the management path (structured non-operative PT, APM, or meniscal suture repair), tear pattern, and passing objective strength and effusion benchmarks under the direct clearance of an orthopedic surgeon and physical therapist, and that calendar weeks alone never clear a knee.
2. **H2 1 (Non-Operative PT vs. Partial Meniscectomy vs. Meniscal Repair):** Explains meniscal hoop stress and tibiofemoral axial load (50% to 70% of compartment load), cites FIDELITY (Sihvonen et al., 2013, *NEJM*) and METEOR (Katz et al., 2013, *NEJM*) trials for degenerative medial meniscal tears without mechanical locking in ages 35-65, notes true mechanical locking from bucket-handle or unstable flap tears as a surgical indication, and cites return-to-sport systematic reviews (Lee et al., 2019, *OJSM*; Eberbach et al., 2018, *KSSTA*) alongside Markdown Table 1.
3. **H2 2 (Front Stance Knee vs. Back Pushing and Popping Knee):** Details asymmetric stance demands (front knee sustained single-leg pushing squats at 30 to 60 degrees and axial landing compression; back knee repetitive ground-contact pushing, high-velocity tail pop extension, and combined flexion-rotation shear during kickturns/carves; deep flexion >90 degrees posterior horn compression).
4. **H2 3 (Criteria-Based Clearance Benchmarks):** Includes Markdown Table 2 covering Joint Effusion (Sweep/Brush Test), Passive & Active Range of Motion, Quadriceps & Hamstring LSI (>=90%), Single-Leg Squat & Step-Down Control, and Low-Impact Landing & 24-Hour Joint Response, plus explanation of arthrogenic muscle inhibition.
5. **H2 4 (Hardware, Footwear, and Session Modifications):** Covers 54mm to 56mm (87A to 93A) wheels, 1/8" rubber shock pads, cushioned cupsole shoes, realistic limits of compression sleeves/braces, and a 4-stage progressive session ramp.
6. **H2 5 (Red-Flag Symptoms):** Distinguishes normal muscular soreness from true mechanical locking, sharp joint-line catching/clicking with pain, 12- to 24-hour joint effusion, and giving way/buckling.
7. **H2 6 (Frequently Asked Questions):** 3 `###` questions answered directly.

## Automated Linter & Link Verification Results
- `node scripts/check-humanizer.mjs src/content/blog/skateboarding-after-meniscus-tear-knee-surgery.md`: `✔ 0 Humanizer tells` (0 em/en dashes, 0 inline bold or bold list items, 0 user-facing "adult/adults", 0 formulaic contrasts or AI crutch words).
- `python3 ~/.gemini/config/skills/blog-research/scripts/discover_topics.py --verify-links src/content/blog/skateboarding-after-meniscus-tear-knee-surgery.md`: `all_ok: true`, 7 verified blog cross-links, 1 verified directory link (`/directory/parks`), 0 broken links.
