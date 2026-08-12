# CI suite for concretecomeback.com

Repo had no CI at all — PRs #1–#4 all merged with zero automated verification.

## Plan

- [x] Fix the 6 pre-existing `astro check` errors so type-checking can be a blocking gate
- [x] `ci.yml` — build + type-check on every PR and push to main
- [x] `ci.yml` — broken internal link check on built `dist/`
- [x] `ci.yml` — Lighthouse budgets (performance / a11y / best-practices / SEO)
- [x] `deploy-check.yml` — post-deploy submit-function health smoke test
- [x] Verify locally everything that can be verified without GitHub

## Decisions

**`astro check` had to be fixed first.** It reported 6 errors on existing code — all in the
Google Tag Manager snippet in `SEOHead.astro`. Wiring it in as-is would have failed every PR
immediately. Fix was adding `is:inline` to the GTM `<script>`, which is also more correct:
without it Astro bundles the snippet as a deferred module, so GTM loads later than Google's
snippet intends.

**Rebuild rather than pass artifacts between jobs.** The build takes under a second, so
artifact upload/download is more machinery than it saves.

**Lighthouse thresholds are uncalibrated.** Nothing here has ever been measured, so
performance and best-practices are `warn` and only accessibility and SEO are `error`. Tune
after the first real run.

**Link check is internal-only.** The directory collections link out to hundreds of third-party
sites (Google Maps, shop websites); checking those would make CI slow and flaky for failures
that aren't this repo's fault.

## Review

**Verified locally before committing:**

- `npx astro check` → 0 errors, 0 warnings, 17 hints, **exit 0** (hints do not fail it, so it
  is safe as a blocking gate)
- `npm run build` → 50 pages, and GTM still emitted inline in `dist/index.html`
- Link check → 86 links scanned, all OK, exit 0. Coverage includes 9 park and 6 shop detail
  pages, so recursion does reach the directory collections

**The link check took three wrong turns worth recording, because each looked green or red for
the wrong reason:**

1. `--server-root ./dist` with `./dist` as the path → the path becomes a glob *relative to*
   the server root, so it resolved nothing and crashed
2. `--skip "^https?://"` → matched every link including internal ones, because the local
   server makes them `http://` too. Result: "scanned 0 links", **exit 0** — a green check
   that verified nothing
3. Filesystem crawling → 31 false "broken" links, all `/blog?tag=…`. Those resolve fine over
   HTTP (confirmed: `curl` returns 200 against `astro preview`) but not as literal file paths

Final form crawls a real `astro preview` server and skips only non-localhost URLs.

**Not verified — needs the first real CI run:**

- Lighthouse thresholds are guesses. Nothing on this site has ever been measured, so
  performance and best-practices are `warn` and only accessibility and SEO are `error`.
  Tighten once there is a baseline.
- Neither workflow has executed on GitHub. YAML parses and every shell step was run locally,
  but runner behaviour (backgrounded `astro preview` surviving between steps) is unproven.
