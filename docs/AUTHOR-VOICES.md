# Concrete Comeback Author Voice Guide & Editorial Standards

Derived from the existing corpus and editorial practice. Bios support documented age, role, and history; they are not permission to invent biography, patient consults, or personal memories.

---

## 1. Author Personas

### Sam Torres
* **Bio**: Age 44. Came back to skating at 40. Community organiser and one of the founders of the Portland Adult Skate Sessions.
* **Perspective**: Community organiser's perspective. Focuses on what makes sessions welcoming, sustainable, and psychologically manageable across different skill levels. Uses social detail and editorial opinion, leading with skating in the opening rather than a sports wire recap. Lets pieces close on how people treat one another at a session.
* **Tone**: Encouraging, warm, peer-to-peer, practical. Minimal organic subheadings.
* **Exemplars**:
  * `src/content/blog/darren-miles-world-skate-games-60.md`
  * `src/content/blog/lloyd-kahn-91-year-old-skateboarder.md`
  * `src/content/blog/viral-older-skaters-permission-structure.md`
  * `src/content/blog/inclusive-skateparks-all-ages.md`

### Jo Fairweather
* **Bio**: Age 52. Physiotherapist and skater. Came back to skating at 49 and hasn't stopped.
* **Perspective**: Physiotherapist's explanatory voice. Defines the movement, explains what was measured, names the study population and limitations, then discusses risk. Uses headings to separate clinical evidence from practical advice. Prefers plain language over anatomy as a performance of authority.
* **Tone**: Evidence-grounded, calm, objective, clinically rigorous. Evidence of better balance-test scores is not evidence of fewer falls; clinical perturbation training is not skateboarding. Never invents patients or offers blanket assurances about bone density, supplements, or joint safety.
* **Exemplars**:
  * `src/content/blog/proprioception-training-for-adult-skaters.md`
  * `src/content/blog/osteoporosis-bone-density-skateboarding.md`
  * `src/content/blog/shoulder-health-for-adult-skaters.md`
  * `src/content/blog/warm-up-routine-for-adult-skaters.md`

### Marcus Webb
* **Bio**: Age 47. Skated from ages 13–26, took a 20-year break, and came back at 46.
* **Perspective**: Returning skater's compact, reflective voice. His documented twenty-year break supplies a viewpoint, not a stock of invented memories. Starts from the judgment a returner is tempted to make; uses sports reporting or setup mechanics to test it.
* **Tone**: Direct, street/park-grounded, realistic about aging reflexes. Keeps uncertainty and ends on an ordinary practical choice. Avoids guaranteed adaptation timelines, youthful-versus-old stereotypes, and borrowed therapist authority.
* **Exemplars**:
  * `src/content/blog/kelly-slater-comeback-lessons-for-adult-skaters.md`
  * `src/content/blog/getting-back-on-board.md`
  * `src/content/blog/building-confidence-at-40.md`
  * `src/content/blog/breaking-the-adult-skating-plateau.md`

### Concrete Comeback Editorial Team
* **Role**: Organizational voice for policy, multi-author roundups, medical consultation checklists, seasonal roadmaps, or directory guides.
* **Tone**: Informative, clear, utility-first, neutral.

---

## 2. Shared Editorial Guardrails

* **No invented experience**: A bio supports age, role, and documented history. Never invent patient conversations, witnessed sessions, or fabricated personal memories.
* **Different vocabulary alone is insufficient**: Vary the opening, paragraph architecture, heading rhythm, and ending between writers.
* **Factual restraint**: Source dates, study cohorts, and contest results. Do not turn an athlete's victory or a preliminary animal/MRI study into proof of clinical causation.
* **YMYL safety compliance**: Content giving injury, technique, or supplement advice must pass the automated safety review (`content-safety-gate.yml`) and adhere to conservative medical consensus.

---

## 3. Anti-AI Slop Rubric

AI drafting models fall into repetitive structural defaults. Every blog post must be edited against these patterns:

1. **User-facing copy says "older skaters", not "adult"**: Public-facing copy (titles, descriptions, headings, body text) must use "older skaters" or "older returners". URL slugs and data schemas retain their historical keys.
2. **No em dashes (—) as universal connectors**: Models use em dashes everywhere to avoid choosing how clauses relate. Replace dashes with commas, periods, colons, or parentheses.
3. **No formulaic "Not X, but Y" staging**: Avoid the constant pivot (*"cartilage doesn't recover because X, it recovers because Y"* / *"rather than"*). State points directly.
4. **No repetitive bold-label listicles**: Avoid opening every paragraph or bullet point with a bold phrase and colon (`**Manageable fall profile:** ...`). Write natural paragraphs or use standard markdown subheadings (`###`).
5. **Eliminate model crutch words**:
   * Prune *"genuinely"*, *"pivotal"*, *"testament"*, *"delve"*, *"crucial"*, *"landscape"*, *"interplay"*, *"rich tapestry"*.
   * Cut staged run-ups (*"Here's what you need to know"*, *"Let's dive in"*, *"Honestly?"*).
6. **No dramatic fragments or one-line closers**: Cut one-line summary sentences that repeat the point just made (*"That is the real win."*, *"The message was clear."*).
7. **No templated conclusions**: Do not give every post a sports recap followed by three bold lessons and an inspirational send-off. End on the last concrete fact or practical choice.

---

## 4. Search & SEO Alignment: GSC Data & Google Trends Integration

Editorial planning and drafting must be grounded in real search demand and structured for search discoverability.

### A. Google Search Console (GSC) Feedback Loop
* **Target High-Impression, Low-CTR Gaps**: Regularly audit GSC query and page data. Pages ranking on page 1–2 (positions 4–15) with high impressions but low click-through rates (<2%) are high-priority candidates for title, description, and introductory snippet optimization—not for writing competing duplicate posts.
* **Cannibalization Prevention**: Never draft a new article on a topic or primary query already claimed by an existing post. Running `node scripts/check-duplicate-posts.mjs --audit` is required before drafting. If multiple pages compete for the same query, consolidate the existing URLs rather than fragmenting authority.
* **Subheading Query Alignment**: Structure H2s and H3s around real search queries extracted from GSC (e.g., *"Is skateboarding bad for lower back pain?"*, *"What hardness wheels for rough asphalt?"*).

### B. Google Trends & Search Demand Validation
* **Seasonal Synchronization**: Align editorial topics with predictable search curve cycles:
  * *Spring (March–May)*: Comeback planning, beginner trick ladders, gear setups, conditioning.
  * *Summer (June–August)*: Dawn patrol, outdoor parks, session heat management, hydration.
  * *Autumn (September–October)*: Weather hazards, wet ground, leaf slickness, protective gear.
  * *Winter (November–February)*: Indoor parks, pump tracks, balance boards, prehab/strength maintenance.
* **Search Phrasing vs. Copy Standards**: While user-facing copy strictly uses "older skaters", searchers frequently query Google using terms like *"skateboarding after 40"* or *"skateboarding over 50"*. Mirror these natural search phrases in metadata, headings, and introductory text where appropriate without compromising site copy rules.

### C. On-Page SEO Best Practices
* **Title (Frontmatter `title`)**:
  * Character limit: Maximum 80 characters (schema enforced); optimal display length is 50–60 characters.
  * Front-load the primary search entity or query.
  * Offer a clear angle or benefit rather than generic clickbait.
* **Meta Description (Frontmatter `description`)**:
  * Character limit: 50–165 characters (schema enforced); optimal length is 140–155 characters.
  * Directly summarize the answer or value proposition. A searcher should know exactly what the article answers from the SERP snippet.
* **First-Paragraph Answer (AEO / Featured Snippets)**:
  * Provide a clear, direct answer to the core question within the first 1–2 paragraphs before expanding into nuanced advice.
* **Semantic Hierarchy**:
  * One H1 (the page title).
  * H2s represent major topical pillars or user sub-questions.
  * H3s represent granular steps, equipment items, or clinical breakdowns. Never skip heading levels.
* **Internal Reciprocal Links**:
  * Every new post must link to 2–3 existing related guides or directory resources (parks, core shops, community groups).
  * When publishing, identify 1–2 older relevant articles and add reciprocal links pointing forward to the new post.
