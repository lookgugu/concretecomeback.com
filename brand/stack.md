traffic
# Marketing Stack & Connected Tools
## Last Updated: 2026-11-18 by /start-here
Depth: lite
Data: LOCAL DOCS

## Connected in Repo / Local Scripts
- **Analytics (GA4):** Property `543447613` (`G-VYW5FDDX52` via GTM `GTM-N65JD942`); read-only local scorecard script (`scripts/analytics/article_scorecard.py`) and `blog-research` skill use `/home/beno/.config/gm_tbrd/ga4-service-account.json`.
- **Search Console (GSC):** Read via the local service account in `.claude/skills/blog-research/scripts/discover_topics.py`.
- **Email / ESP (Resend):** Double opt-in signup (`functions/packages/forms/newsletter/newsletter.js` → Resend segment `Concrete Comeback`, `35b5b4f0-ac74-4ffa-b7d3-620e4f0014ed`) and weekly draft builder (`npm run newsletter:draft`).
- **Social Distribution:** `scripts/social/post-blog-to-social.py` posts live blog articles to Instagram and X via PostEverywhere.

## Environment Keys for Boring Marketing Skills (`capability.py`)
- No `.env` keys currently exposed to the Boring Marketing skill runtime (`FIRECRAWL_API_KEY`, `REPLICATE_API_TOKEN`, `GOOGLE_APPLICATION_CREDENTIALS`, `SCRAPECREATORS_API_KEY`).
- All skills work without these keys: `/direct-response-copy`, `/lead-magnet`, `/seo-content`, `/content-atomizer`, and `/newsletter` write directly to disk and integrate with the repo's existing Astro components and scripts.
