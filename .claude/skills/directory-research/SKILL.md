---
name: directory-research
description: Find, verify and add skate parks, shops or groups to the concretecomeback.com directory. Use when asked to find parks/shops/groups to add, add a specific venue, fill a city or country gap in the directory, or research whether a venue meets the site's adult-friendly bar.
---

# Directory research: parks, shops and groups

The directory exists for skaters returning in their 40s and beyond. Every entry must give such a reader a concrete reason to trust it — evidence, not fame. This skill is the bar and the workflow. Do not add a directory entry without meeting it.

## 1. Inclusion criteria

### Fill a gap first
Inventory what exists (`ls src/content/{parks,shops,groups}/*/`) and target the empty regions and big uncovered cities. Prefer two entries per country per batch; 7–9 entries per PR is the precedent (#18, #43, #44).

### Require evidence of adult-friendliness
Every park needs at least one — ideally two — of these, **from a source you read**:
- an adult-specific session, night or lesson programme (e.g. Projekts MCR's Wednesday Adults Night; Kona's lessons open to adults)
- a layout that separates ability levels so a beginner is not in advanced traffic (e.g. Cowboys Park's beginner section; Hyde Park's "easier lines" street section)
- forgiving terrain described as such by a source ("mellow bowls")
- a documented quiet window (Houston's 9–11am)
- covered/indoor, lit, or open 24h — practical for people who skate around work and weather

Every shop needs, from the shop's own site or customer reviews on it:
- staff described as patient with beginners or experienced skaters who talk through setups, **or**
- lessons/clinics, repairs, or on-site assembly/custom builds, **or**
- long tenure plus a clear core-shop range (accept, but do not set `adult-advice` on tenure alone)

### Pair shops with listed parks
A shop in a city whose park is listed (or vice versa) is worth more than either alone. Cross-reference the pair in both bodies. Hold a fully-sourced shop back if its city has no park yet, and say so in the PR.

### Prefer independent core shops
Skip shopping-centre chains unless nothing else exists and the chain is skater-owned; say which call you made in the PR.

### Publish caveats, not just praise
If a source says a park is less beginner-friendly than expected, closes for festivals, or requires helmets for adult beginners, put it in the entry. Omitting it makes the listing less trustworthy, not more appealing.

### Never publish a guess
Every address, hours line, fee, feature and service must trace to a page you read. If a **required** field cannot be sourced (e.g. a park's riding surface), hold the entry back and list it under "Held back" in the PR with what is known and what is missing. If an **optional** field cannot be sourced, leave it unset or point the reader to the site ("check the site for current hours").

## 2. Research workflow

1. **Inventory** existing entries by country/city and read the newest entry of that collection as a style template.
2. **Search in parallel** with the Firecrawl CLI (it works even when the `firecrawl` MCP server reports "Connection closed"):
   ```bash
   mkdir -p .firecrawl/parks && cd .firecrawl/parks   # .firecrawl/ is gitignored
   q() { firecrawl search "$2" --limit 4 --scrape -o "search-$1.json" --json >/dev/null 2>&1 && echo "ok $1" || echo "ERR $1"; }
   q houston "Lee and Joe Jamail Skatepark Houston address hours features" &
   q kona    "Kona Skatepark Jacksonville address admission features" &
   wait
   ```
   Name each query for the venue, ask for address + hours + features in the query, and run one extra "discovery" query per region only if you lack candidates (they are usually noise — roller rinks, coaching companies).
3. **Extract** with `jq` plus **short** greps. `grep` here is ugrep and fails with "exceeds complexity limits" on long alternations or `.{0,80}` wildcards:
   ```bash
   jq -r '.data.web[] | "=== \(.title) | \(.url)\n\(.markdown // "" | gsub("\n+";"\n"))"' search-kona.json \
     | grep -iE "^===|address|open|hours|free|\\$|bowl|street|lights|adult|beginner|built|opened" \
     | cut -c1-200 | awk '/^===/{n=0} {if(n<12){print; n++}}'
   ```
4. **Verify** the one fact that anchors each entry — the street address — against an official council/park/shop page or a mapping listing that quotes it. Run a second targeted search per venue if the first pass lacked it. Official sources outrank goskate/Yelp/blogs; use the latter for features and colour, never for hours or fees when an official page exists.
5. **Write entries** (section 3), using **absolute paths** — the shell's working directory drifts after `cd .firecrawl/...`, and a relative heredoc will fail silently while a trailing `echo` still prints "written". Confirm with `test -s <file>`.
6. **Build to validate**: `npm run build`. Schema violations fail here. Confirm the new pages exist under `dist/directory/...`.
7. **Branch, commit, PR** (`content/<what>-<yyyy-mm>`). Commit `public/llms-full.txt` as regenerated by the build — content PRs do. The commit message and PR body must list each venue with its adult-friendly evidence, the sourcing rule applied, and a **Held back** section.
8. **Review bot**: wait ~4 minutes for the Codex reviewer. It reliably catches dated claims copied from a venue's site ("celebrating 30 years") and misused booleans (`isIndoor` on an open-sided covered park). Fix, reply on the thread with the commit SHA, resolve, re-run checks. A "Safety review" check showing *fail at 0s* after you reply is a **cancelled duplicate** triggered by `pull_request_review` — confirm via the check-runs API, then merge.
9. **Merge and verify live**: squash-merge, watch the "Post-deploy smoke test" run, then curl each new page **with a cache-buster** (`?cb=$RANDOM`) — Cloudflare caches every route for 24h, so plain URLs can show stale content. New URLs appear immediately; the listing pages (`/directory/parks/`) may show the old count for up to a day.

## 3. Writing the entries

### Rules that apply to every collection
- File: `src/content/<collection>/<country-lowercase>/<slug>.md`. The filename is the URL — never reuse a slug.
- `country` is the **uppercase** enum `US | UK | CA | AU` even though the folder is lowercase. There is no `ONLINE` country: online groups set a real country plus `isOnline: true`.
- `description` must be ≥ 50 characters; write 2–3 sentences that carry the adult-friendly evidence.
- `addedDate`: today, `YYYY-MM-DD`, unquoted. `lastVerified` (same format) exists on **parks and shops only**; groups track currency with `active` instead.
- **Only use fields the collection's schema declares** (`src/content.config.ts`). Zod strips unknown keys silently, so a misplaced field passes `npm run build` and simply disappears from the page.
- Copy says **"older skaters"**, never "adult", in user-facing prose. Field names (`adultFriendly`, `adult-advice`) keep their code names.
- Use durable wording: "more than 30 years", not "celebrating 30 years" or "marking its 30th year".
- Body: one or two short paragraphs in the site's voice — practical, specific, addressed to someone rebuilding confidence. Say where to start in the park. Cross-reference the paired shop/park by name.
- `city`: use the venue's actual municipality (e.g. "South Houston"). The filter's search matches substrings, so "Houston" still finds it.

### Parks (`src/content.config.ts` → `parks`)
- `surface` (≥1): `concrete | wood | asphalt | hybrid | tiles` — **required; hold the entry if unsourced.**
- `features` (≥1): `bowl | pool | street | ramps | rails | stairs | flatground | pump-track | banks | transitions | mini-ramp | vert | flow-section`. A snake run is `flow-section`; a full pipe or cradle is `vert`/`transitions`.
- `difficulty`: `beginner-friendly | mixed | intermediate | advanced`. Most large parks are `mixed`; use `beginner-friendly` only when a source says so.
- `adultFriendly: true` only with the evidence above.
- `isCovered` = roof over an open-sided park (Projekts under a flyover). `isIndoor` = enclosed building. Never set `isIndoor` for a covered outdoor park — it wrongly matches the "Indoor only" filter.
- `hasLighting`, `hasParking`, `hasToilets`: set only when a source states them; otherwise omit.
- `openingHours` / `entryFee`: quote the official page; if hours vary, say "check the site" rather than picking one.
- `googleMapsUrl` (parks only): `https://www.google.com/maps/search/?api=1&query=<address+with+pluses>` — never `maps.app.goo.gl`. Shops and groups have no map-link field; their `address` is rendered as text.

### Shops (`shops`)
- `servicesOffered` (≥1): `decks | completes | trucks | wheels | bearings | shoes | apparel | protective-gear | repairs | lessons | adult-advice | board-building | online-only`. The first seven are safe for any core shop whose site visibly sells them. Set `repairs`, `lessons`, `board-building` (assembly / custom builds) and `adult-advice` **only when the shop says so in its own words or its customers do in reviews on its site.**
- `adultsWelcomeNote` (≤ 250 chars): the sourced evidence, phrased for a returning skater. Omit if you have none.
- `instagram` is a bare handle; `facebook` and `website` are full URLs; `phone` as displayed locally.
- `hasOnlineShop: true` only if you saw the store.

### Groups (`groups`)
Same bar: evidence that older skaters are welcome (an age range, an "all levels" statement, a regular meet). `skillLevel` enum: `all-levels | beginner | intermediate | advanced`. Provide at least one contact route (`website`, `facebook`, `instagram`, `discord`, `reddit`, `contactEmail`). Groups have `addedDate` and `active` but **no `lastVerified` and no `googleMapsUrl`**; `city` is still required (use "Online" for online-only groups, with `isOnline: true`).

## 4. Templates

```yaml
# park
---
name: "Cowboys Park Skatepark (formerly Shaw Millennium Park)"
country: "CA"
stateProvince: "Alberta"
city: "Calgary"
address: "1220 9 Ave SW, Calgary, AB"
description: "…2–3 sentences carrying the evidence…"
surface: ["concrete"]
features: ["bowl", "street", "stairs", "rails", "banks", "transitions", "vert"]
difficulty: "mixed"
adultFriendly: true
hasLighting: true
hasParking: true
isIndoor: false
openingHours: "Skatepark open 24 hours; surrounding park 5am–11pm"
entryFee: "Free"
website: "https://www.calgary.ca/parks/cowboys-park.html"
googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=1220+9+Ave+SW+Calgary+AB"
featured: false
addedDate: 2026-09-05
lastVerified: 2026-09-05
tags: ["concrete", "free", "lit", "downtown"]
---
```

```yaml
# shop
---
name: "NOTE"
country: "UK"
stateProvince: "England"
city: "Manchester"
address: "61 Thomas Street, Northern Quarter, Manchester"
description: "…2–3 sentences carrying the evidence…"
website: "https://www.noteshop.co.uk"
instagram: "noteshop"
phone: "0161 478 3535"
servicesOffered: ["decks", "completes", "trucks", "wheels", "bearings", "shoes", "apparel", "board-building", "adult-advice"]
hasOnlineShop: true
adultsWelcomeNote: "…≤250 chars, sourced…"
featured: false
addedDate: 2026-09-05
lastVerified: 2026-09-05
---
```

## 5. Held-back register

Keep this current when a batch defers something, so the next pass starts here:
- **Le TAZ, Montréal** (8931 av. Papineau, H2M 0A5) — Canada's largest indoor park, adults welcome, sessions ~$16–20. Held: riding surface unconfirmed after three searches and a scrape of taz.ca.
- **Brisbane shop** — Barry Kicker, 115 Gotha St, Fortitude Valley, surfaced only as a blog listing (no hours/site).
- **Adelaide shop** — nothing solid surfaced.
- **Melbourne shop** — Fast Times is a shopping-centre chain; no independent core shop found yet.
