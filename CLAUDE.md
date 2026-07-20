# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # local dev server
npm run build      # generate-llms → astro build (outputs to dist/)
npm run preview    # serve dist/ locally
```

`astro check` is available but excluded from the build command — run it manually when verifying TypeScript.

## Architecture

**Astro 7 static site** (`output: 'static'`, `format: 'directory'`). No server-side rendering. All pages are pre-rendered HTML. Deployed to DigitalOcean App Platform via `.do/app.yaml`; every push to `main` auto-deploys.

**Tailwind CSS v4** — configured entirely through `src/styles/global.css`. There is no `tailwind.config.js`. Design tokens live in the `@theme {}` block. Always use CSS custom properties (`var(--color-concrete-700)`) — never the `theme()` function, which is not supported in v4. Plugins are loaded with `@plugin` directives.

**Content Layer API** — collection schemas are defined in `src/content.config.ts` (root of `src/`, not inside `src/content/`). Collections use `glob()` loaders. Import `z` from `zod` directly, not from `astro:content`. Four collections: `blog`, `parks`, `shops`, `groups`.

**Directory content is organized by country subdirectory** (`us/`, `uk/`, `ca/`, `au/`, `online/`). Because of this, Content Layer generates IDs like `au/bondi-beach-skatepark-nsw`, which contain slashes. Detail page routes use `[...slug].astro` (rest params), not `[slug].astro`. The `getStaticPaths` in these pages maps `params: { slug: entry.id }`.

**Blog pagination** uses `src/pages/blog/[...page].astro` (rest param handles both `/blog` and `/blog/2`). Access page props as `const page = Astro.props.page as Page<CollectionEntry<'blog'>>`.

**Directory filtering** is pure client-side: each card renders `data-*` attributes (`data-country`, `data-difficulty`, `data-adult`, `data-name`, `data-city`, etc.). A vanilla TS `<script>` in `DirectoryFilter.astro` reads/writes `URLSearchParams` to keep filter state bookmarkable. No JS framework.

**Path aliases** (from `tsconfig.json`):
- `@components/*` → `src/components/*`
- `@layouts/*` → `src/layouts/*`
- `@content/*` → `src/content/*`
- `@styles/*` → `src/styles/*`

**`scripts/generate-llms.mjs`** runs before `astro build` and concatenates all `.md`/`.mdx` content into `public/llms-full.txt` for AI indexing. It is a plain Node.js ESM script — no build tools.

**SEO/GEO** — `SEOHead.astro` emits all meta tags and JSON-LD. Structured data types: `WebSite`/`Organization` (home), `BlogPosting` (posts), `SportsActivityLocation` (parks), `SportingGoodsStore` (shops), `FAQPage` (faq), `BreadcrumbList` (all pages). Google Tag Manager (`GTM-N65JD942`) is in `SEOHead.astro` (head snippet) and `BaseLayout.astro` (noscript body snippet). GA4 (`G-VYW5FDDX52`) is routed through GTM — there is no direct gtag snippet.

**Adding content** — create a `.md` file in the appropriate `src/content/{collection}/{country}/` subdirectory. The filename becomes the URL slug. `googleMapsUrl` for parks must use `https://www.google.com/maps/search/?api=1&query=ADDRESS` format — not `maps.app.goo.gl` short links.

**The submit form** (`src/components/forms/SubmitForm.astro`) posts to `/api/forms/submit`, a DigitalOcean Functions web action (`functions/packages/forms/submit/submit.js`) that emails submissions via the Resend API and redirects to `/submit/thanks/`. The functions component is declared in `.do/app.yaml` (route prefix `/api`) and requires two secrets set in the DigitalOcean control panel: `RESEND_API_KEY` (send-only key scoped to concretecomeback.com) and `SUBMIT_NOTIFY_EMAIL` (inbox that receives submissions). Sending is from `submissions@concretecomeback.com`, which requires the domain to be verified in Resend. The function runtime is `nodejs:18` (`nodejs:20` is rejected by DO Functions). Conditional field sections are shown via CSS `:has()` with no JavaScript.

**Deploy/verify the submit function** — DigitalOcean does **not** re-read `.do/app.yaml` on git push; it deploys the *stored* app spec. If the stored spec drifts (e.g. a manual "app spec updated" that drops the `api` component → `/api` returns `Couldn't route the request`), re-apply with `doctl apps update <app-id> --spec .do/app.yaml`. After any deploy, smoke-test without submitting a real listing: `curl "https://concretecomeback.com/api/forms/submit?health=key"` returns JSON — `{"ok":true,...,"resendKey":"ok"}` means route + secrets + Resend key are all good (`resendKey:"invalid (401)"` means the `RESEND_API_KEY` secret is wrong). Note: DO masks any 5xx function response with a generic error page and run logs are often unreachable (`doctl apps logs --type run` → "websocket: bad handshake"), so this health check is the practical way to diagnose config.
