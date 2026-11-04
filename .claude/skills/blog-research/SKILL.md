---
name: blog-research
description: >-
  Discover, validate, and prioritize blog topics and existing-post refreshes for concretecomeback.com
  using on-site GA4 reader engagement, Google Search Console (GSC) search demand, Google Trends /
  Autocomplete, and corpus cannibalization checks. Use when asked what to blog about next, to find
  new blog topics, to identify high-impression/low-CTR posts to refresh, or before drafting new blog posts.
---

# Blog Research: Topic Discovery, GSC Demand & On-Site Reader Interest

Every blog post on `concretecomeback.com` must earn its URL. Before writing anything new, this skill checks what visitors are actually reading on our site, what searchers are looking for in Google Search Console (GSC) and Google Trends, and whether an existing post should be refreshed instead of creating a competing page.

---

## 1. Core Principles

1. **Refresh Before You Duplicate:**
   - If a topic is already covered in `src/content/blog/` (or ranks in GSC at positions 3.5–20 with high impressions and low CTR < 2.5%), **refresh the existing post** (title, meta description, opening answer, or updated section). Never write a second competing article.
2. **Ground Topics in Three Signals:**
   - **On-Site Interest (GA4 + Article Scorecard):** Which articles, tags (`gear`, `safety`, `active-aging`, `joints`, `motivation`, `getting-started`), authors, and directory pages keep visitors reading?
   - **Search Demand (GSC):** Which disclosed search queries are bringing impressions to the site without a dedicated blog post answering them? Which existing blog posts have high impressions but low click-through rates?
   - **Seasonal & Trending Demand (Google Trends & Autocomplete + Web Research):** What are older skaters searching for right now given the season, and what verifiable studies, events, or gear developments can anchor an evidence-backed piece?
3. **Never Publish Unverifiable Claims:**
   - A candidate topic is disqualified if its premise depends on a statistic, clinical study, or event that cannot be verified from a primary source you actually read.
4. **Keep Raw GSC & Analytics Exports Private:**
   - Raw GSC and GA4 reports are stored outside the repository under `/home/beno/clawd/reports/cc-blog-research/current/`. Never commit raw GSC query dumps or credentials into the git repository.

---

## 2. Step-by-Step Topic Discovery Workflow

### Step 1: Run the Automated Discovery Script
Run `.claude/skills/blog-research/scripts/discover_topics.py` from the repository root:

```bash
# Refresh GA4 scorecard first if needed (optional, runs Monday mornings by default)
python3 scripts/analytics/article_scorecard.py

# Run the unified GA4 + GSC + Google Trends/Autocomplete + Corpus audit
python3 .claude/skills/blog-research/scripts/discover_topics.py --stdout-md
```

This script writes `/home/beno/clawd/reports/cc-blog-research/current/topic-discovery.json` and `topic-discovery.md` and outputs four sections:
1. **On-Site Reader Interest (28d GA4 Scorecard + Directory Traffic):**
   - Top blog posts by reach (`pageviews`) and foreground engagement (`engagement_seconds_foreground_proxy` and `avg_fg_seconds`).
   - Top-performing topic tags on the site.
   - Most-visited `/directory/*` pages (parks, shops, groups) to spot regional or indoor/outdoor interest.
2. **Google Search Console Signals (90d & 28d Finalized Data):**
   - **Bucket A — Existing Post Refresh Candidates:** Published blog posts with `impressions >= 25`, `position 3.5–20`, and `CTR < 2.5%`.
   - **Bucket B — Disclosed Blog / Editorial Queries:** Queries hitting the site, tagged with their exact corpus overlap status (`new_topic`, `overlap_warning`, or `duplicate_covered`).
   - **Bucket C — Directory Venue Queries:** Queries landing on `/directory/*` pages (useful for spotting high-interest parks or indoor facilities to reference in blog posts).
3. **Google Trends & Search Autocomplete (`winter` / `spring` / `summer` / `autumn` + Evergreen):**
   - Real user search suggestions expanding seasonal and evergreen older-skater seed queries, automatically filtered to exclude topics already covered in `src/content/blog/` (Jaccard `< 0.34`).
   - You can pass custom seed queries with `--seed "skateboard bushings"` or `--seed "indoor skatepark"`.
4. **Corpus & Author Balance:**
   - Post counts across `Jo Fairweather`, `Sam Torres`, `Marcus Webb`, and `Concrete Comeback Editorial Team`.

---

### Step 2: Vet & Enrich Candidates with Web / Firecrawl Research
Once you identify 3–5 promising new topic candidates (or 1–2 existing posts to refresh) from Step 1, verify the underlying facts and search landscape:

```bash
mkdir -p .firecrawl/blog-research
firecrawl search "<candidate topic or clinical study or event> skateboarding" --limit 5 --scrape -o .firecrawl/blog-research/topic-1.json --json
```

For each candidate topic, confirm:
- **Primary Source Verification:** If it is a health/biomechanics topic (Jo Fairweather's beat), find the actual peer-reviewed paper, sample size, population, and limitations. If it is a culture/community or athlete story (Sam Torres / Marcus Webb), verify dates, ages, contest results, and quotes.
- **SERP Intent Check:** What specific question is the searcher trying to answer in the first 30 seconds?

---

### Step 3: Check for Cannibalization Before Pitching or Drafting
Every proposed title and slug **must** pass both the candidate overlap checker and the repository's duplicate-post script:

```bash
# Test proposed titles or slugs against the 151+ post corpus
python3 .claude/skills/blog-research/scripts/discover_topics.py \
  --check-topic "Your Proposed Title Here" \
  --check-topic "your-proposed-slug-here"

# Run the repo's duplicate-post audit
node scripts/check-duplicate-posts.mjs --audit
```

- **`new_topic` (similarity `< 0.34`):** Safe to pitch and draft as a new post.
- **`overlap_warning` (`0.34–0.49`):** Overlaps an existing post. Either re-angle the title/slug sharply so the primary query and token set are distinct, or fold the material into the existing post.
- **`duplicate_covered` (`>= 0.50`):** Blocked by CI (`check-duplicate-posts.mjs`). Do **not** write a new post; update the existing slug instead.

---

### Step 4: Present the Topic Pitch Table (or Proceed to Drafting)
When presenting researched blog topics to the user (or selecting a batch to draft), structure each recommendation as an evidence card:

| Field | Requirement |
|---|---|
| **Action** | `New Post` or `Refresh Existing Post (/blog/<slug>/)` |
| **Proposed Title & Slug** | Max 80 chars, primary search entity front-loaded, uses `"older skaters"` (never `"adult"` in user-facing copy) |
| **Assigned Author** | `Jo Fairweather` (physio/clinical), `Marcus Webb` (gear/setup/returner mechanics), `Sam Torres` (community/session culture/mindset), or `Concrete Comeback Editorial Team` |
| **Evidence Signal** | Cite the on-site GA4 engagement trend, GSC query/impression gap, or seasonal Google Trends/Autocomplete demand |
| **Verified Source(s)** | Named study, official event record, or technical specification verified during research |
| **Corpus Overlap** | Closest existing slug + Jaccard similarity score (`< 0.34` required for new posts) |
| **Internal Links** | 2–3 existing blog posts or `/directory/{parks,shops,groups}/` entries to cross-link |

---

## 3. Handoff to Writing (`author-voices` & `humanizer`)

When moving from topic selection to drafting or refreshing a post:
1. Follow **`author-voices`** (`docs/AUTHOR-VOICES.md` / `/home/beno/.gemini/config/skills/author-voices/SKILL.md`) for persona perspective, structure, on-page SEO (meta description 50–165 chars, direct answer in paragraph 1, clean H2/H3 hierarchy), and the 7-point Anti-AI Slop Rubric.
2. Run a **`humanizer`** pass (`/home/beno/.gemini/config/skills/humanizer/SKILL.md`) to eliminate em dashes (`—`), `"not X, but Y"` contrasts, bold-label listicles, and crutch words.
3. Validate with `node scripts/check-duplicate-posts.mjs`, `npx astro check`, `npm test`, and `npm run build`.
