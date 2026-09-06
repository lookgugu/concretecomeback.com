# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # local dev server
npm run build      # generate-llms → astro build (outputs to dist/)
npm run preview    # serve dist/ locally
npm test           # node --test over the submit-function and form unit tests
npx astro check    # TypeScript/Astro diagnostics
```

`astro check` and `npm test` are deliberately not part of `npm run build` — CI runs them as separate steps. To run a single test file: `node --test src/scripts/submit-form.test.js`. There is no linter.

**CI** (`.github/workflows/`) gates every PR: `ci.yml` runs the duplicate-post check, `astro check`, `npm test`, a production build, a link check against the preview server, and Lighthouse budgets; `content-safety-gate.yml` requires a safety review before health content merges; `deploy-check.yml` runs the post-deploy smoke test.

## Architecture

**Astro 7 static site** (`output: 'static'`, `format: 'directory'`). No server-side rendering. All pages are pre-rendered HTML. Deployed to DigitalOcean App Platform via `.do/app.yaml`; every push to `main` auto-deploys.

**Tailwind CSS v4** — configured entirely through `src/styles/global.css`. There is no `tailwind.config.js`. Design tokens live in the `@theme {}` block. Always use CSS custom properties (`var(--color-concrete-700)`) — never the `theme()` function, which is not supported in v4. Plugins are loaded with `@plugin` directives.

**Content Layer API** — collection schemas are defined in `src/content.config.ts` (root of `src/`, not inside `src/content/`). Collections use `glob()` loaders. Import `z` from `zod` directly, not from `astro:content`. Four collections: `blog`, `parks`, `shops`, `groups`.

**Directory content is organized by country subdirectory** (`us/`, `uk/`, `ca/`, `au/`, `online/`). Because of this, Content Layer generates IDs like `au/bondi-beach-skatepark-nsw`, which contain slashes. Directory detail routes therefore use `[...slug].astro` (rest params) with `params: { slug: entry.id }`. Blog content is flat (no subdirectories), so `src/pages/blog/[slug].astro` uses a plain param — don't "fix" it to a rest param.

**Blog pagination** uses `src/pages/blog/[...page].astro` (rest param handles both `/blog` and `/blog/2`). Access page props as `const page = Astro.props.page as Page<CollectionEntry<'blog'>>`.

**Path aliases** (from `tsconfig.json`):
- `@components/*` → `src/components/*`
- `@layouts/*` → `src/layouts/*`
- `@content/*` → `src/content/*`
- `@styles/*` → `src/styles/*`

**`scripts/generate-llms.mjs`** runs before `astro build` and concatenates all `.md`/`.mdx` content into `public/llms-full.txt` for AI indexing. It is a plain Node.js ESM script — no build tools. It parses frontmatter with its own naive line-splitting regex, not a YAML parser, so multi-line or nested frontmatter values won't survive into the dump.

**SEO/GEO** — `SEOHead.astro` emits all meta tags and JSON-LD. Structured data types: `WebSite`/`Organization` (home), `BlogPosting` (posts), `SportsActivityLocation` (parks), `SportingGoodsStore` (shops), `FAQPage` (faq), `BreadcrumbList` (all pages), `ItemList` (directory index pages, built inline in each index). Google Tag Manager (`GTM-N65JD942`) is in `SEOHead.astro` (head snippet) and `BaseLayout.astro` (noscript body snippet). GA4 (`G-VYW5FDDX52`) is routed through GTM — there is no direct gtag snippet.

## Cross-file contracts

**Directory filtering** is pure client-side and spans three files that must stay in sync:
1. `DirectoryLayout.astro` owns the DOM the filter script targets: `#directory-grid` (cards go in the default `<slot />`), `#filter-count`, and `#no-results`.
2. Each `*Card.astro` renders a top-level `<article>` with `data-*` attributes (`data-country`, `data-difficulty`, `data-adult`, `data-indoor`, `data-online`, `data-adult-advice`, `data-name`, `data-city`, …). `data-name`/`data-city` are lowercased at render time because the search compares against a lowercased query.
3. The vanilla TS `<script>` in `DirectoryFilter.astro` reads/writes `URLSearchParams` (via `history.replaceState`) so filter state is bookmarkable, then toggles `card.hidden`.

The script selects `#directory-grid > article` — a card wrapped in an extra element silently stops filtering. Attribute names map to camelCase in `dataset` (`data-adult-advice` → `dataset.adultAdvice`). No JS framework.

**Submit form conditional sections** need *two* markers on the same element, driving two mechanisms:
- `.park-fields` / `.shop-fields` / `.group-fields` — the CSS `:has()` rules in `global.css` that control visibility.
- `data-listing-section="park|shop|group"` — read by `initListingTypeFields` in `src/scripts/submit-form.js`, which disables controls in inactive sections so the browser omits them from the submission.

Adding a section with only the class leaves hidden fields enabled and they get submitted anyway; adding only the data attribute leaves the section permanently visible.

**Submit form → function field contract**: every `name` attribute in `SubmitForm.astro` needs a matching entry in `FIELD_LABELS` in `functions/packages/forms/submit/submit.js`, or the field is silently dropped from the notification email. `REQUIRED` is a different, deliberately short list — `listing-type`, `name`, `city`, `country`, `description` — and only those five belong in it. Don't add a new field there to make it mandatory: the function rejects any submission missing a `REQUIRED` key, and since the form disables the inactive listing-type sections, a park-only field in `REQUIRED` would reject every shop and group submission. `submit.test.js` covers this function directly — run `npm test` after touching it.

**Tap targets**: `global.css` applies a 44px `min-height`/`min-width` to every `a`, `button`, and `[role="button"]` in `@layer base`. Inline links, badges, and card image wrappers must opt out with `min-h-0 min-w-0` or they blow out the layout.

**User-facing copy says "older skaters", not "adult"** — the data layer kept its original names (`adultFriendly` in the schema, `data-adult` / `data-adult-advice` on cards, `adult` / `adult-advice` in query strings and form fields). Don't rename the data to match the copy; the filter script, card attributes, and submit function all key off the old names.

## Adding content

**Before adding a blog post, check what already exists.** Run `node scripts/check-duplicate-posts.mjs --audit` or read the titles in `src/content/blog/`. Never reuse a slug that already exists — that silently replaces a published article at a live URL. Never write a new post on a topic already covered; update the existing post instead. This is enforced in CI, but the check runs after the writing is done, so check first. The corpus already carries the cost of skipping this: four separate "how to fall" posts, two near-identical 10-minute warm-up routines, and two recovery guides, all competing with each other for the same searches.

Create a `.md` file in the appropriate `src/content/{collection}/{country}/` subdirectory. The filename becomes the URL slug. Schema violations fail the build, so watch:

- `country` is the **uppercase** enum `US | UK | CA | AU`, even though the folder is lowercase (`us/`, `uk/`, …).
- There is no `ONLINE` country. Entries under `groups/online/` still set a real `country` plus `isOnline: true`.
- Length floors are enforced: `description` min 50 chars everywhere; blog `description` 50–165, blog `title` max 80, blog `tags` 1–8.
- `addedDate` is required on parks/shops/groups; `pubDate` and `author` are required on blog posts.
- `googleMapsUrl` for parks must use `https://www.google.com/maps/search/?api=1&query=ADDRESS` format — not `maps.app.goo.gl` short links.

## The submit function

`src/components/forms/SubmitForm.astro` posts to `/api/forms/submit`, a DigitalOcean Functions web action (`functions/packages/forms/submit/submit.js`) that emails submissions via the Resend API and redirects (303) to `/submit/thanks/`, or to the branded `/submit/error/` page on failure. Form fields normally arrive as properties of `args`; the function falls back to decoding `args.__ow_body` (base64) when DO doesn't parse them, and reads the verb from `args.http.method` (`__ow_method` is the legacy fallback). The functions component is declared in `.do/app.yaml` (route prefix `/api`) with runtime `nodejs:18` in `functions/project.yml` (`nodejs:20` is rejected by DO Functions). Two secrets must be set in the DigitalOcean control panel: `RESEND_API_KEY` (send-only key scoped to concretecomeback.com) and `SUBMIT_NOTIFY_EMAIL` (inbox that receives submissions). Sending is from `submissions@concretecomeback.com`, which requires the domain to be verified in Resend.

**Deploy/verify** — DigitalOcean does **not** re-read `.do/app.yaml` on git push; it deploys the *stored* app spec. If the stored spec drifts (e.g. a manual "app spec updated" that drops the `api` component → `/api` returns `Couldn't route the request`), re-apply with `doctl apps update <app-id> --spec .do/app.yaml`. After any deploy, smoke-test the wiring without submitting a real listing:

```bash
curl "https://concretecomeback.com/api/forms/submit?health=1"
# {"ok":true,"hasApiKey":true,"hasNotify":true}
```

The health check is GET-only (so a POST carrying a `health` field can't divert a real submission) and only checks env-var presence — it makes no outbound call. A send-only Resend key can only be validated by actually sending, so confirm the key itself with one real test submission. Note: DO masks any 5xx function response with a generic error page and run logs are often unreachable (`doctl apps logs --type run` → "websocket: bad handshake"), so the health check plus a test submission are the practical way to diagnose config.

## The newsletter signup

`src/components/marketing/NewsletterSignup.astro` posts to `/api/forms/newsletter` (`functions/packages/forms/newsletter/newsletter.js`) and runs double opt-in: the POST only sends a signed, 24-hour confirmation link, and the Resend Contact is created solely by an explicit POST from the confirmation page, so an email scanner following the link cannot subscribe anyone. It needs two more secrets on the `api` component: `RESEND_CONTACTS_API_KEY` (a Resend key with Contacts access — the send-only `RESEND_API_KEY` still delivers the confirmation email) and `NEWSLETTER_CONFIRM_SECRET` (32+ random bytes used to sign links; rotating it invalidates every link in flight).

```bash
curl "https://concretecomeback.com/api/forms/newsletter?health=1"
# {"ok":true,"hasSendKey":true,"hasContactsKey":true,"hasConfirmSecret":true}
```

**Set both secrets before merging anything that references them.** `functions/project.yml` resolves `${VAR}` at deploy time and aborts the whole `forms` package on any unresolved substitution — so a missing `RESEND_CONTACTS_API_KEY` or `NEWSLETTER_CONFIRM_SECRET` fails the deploy of `submit` too, and App Platform keeps the previous deployment live (the static site included). Because DO deploys the *stored* spec, adding a `SECRET` entry to `.do/app.yaml` does nothing on push: set the value in the control panel, or apply the spec with `doctl apps update <app-id> --spec .do/app.yaml`, first.

**Each function directory needs its own `package.json` with `main`.** The deployer zips the directory and the Node runtime does `require(dir)`, which falls back to a non-existent `index.js` when `main` is unset — every request then gets DO's masked error page. Unit tests `require('./name')` explicitly, so they pass regardless; only a deployed health check catches it.

**Any browser `fetch` to `/api/forms/*` must send `application/x-www-form-urlencoded`** — never a raw `FormData` object. DO Functions parses only JSON and form-urlencoded bodies into a web action's `args`; a multipart body arrives base64-encoded in `__ow_body` with a boundary the `URLSearchParams` fallback in each function cannot decode, so every field reads as undefined and the request fails validation. Use `body: new URLSearchParams(new FormData(form))` and let the browser set the content type. Unit tests that call `main()` with pre-parsed args cannot catch this; cover the encoded-body path instead.
