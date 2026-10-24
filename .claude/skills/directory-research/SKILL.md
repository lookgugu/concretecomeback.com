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
   firecrawl search "Lee and Joe Jamail Skatepark Houston address hours features" --limit 4 --scrape -o search-houston.json --json &
   firecrawl search "Kona Skatepark Jacksonville address admission features"       --limit 4 --scrape -o search-kona.json    --json &
   wait
   ```
   Never write shell positional parameters (dollar-one, dollar-two) or `RANDOM` in this file: the skill loader substitutes them with the skill's arguments when it renders. Name each query for the venue, ask for address + hours + features in the query, and run one extra "discovery" query per region only if you lack candidates (they are usually noise — roller rinks, coaching companies).
3. **Extract** with `jq` plus **short** greps. `grep` here is ugrep and fails with "exceeds complexity limits" on long alternations or `.{0,80}` wildcards:
   ```bash
   jq -r '.data.web[] | "=== \(.title) | \(.url)\n\(.markdown // "" | gsub("\n+";"\n"))"' search-kona.json \
     | grep -iE "^===|address|open|hours|free|admission|bowl|street|lights|adult|beginner|built|opened" \
     | cut -c1-200 | awk '/^===/{n=0} {if(n<12){print; n++}}'
   ```
4. **Verify** the one fact that anchors each entry — the street address — against an official council/park/shop page or a mapping listing that quotes it. Run a second targeted search per venue if the first pass lacked it. Official sources outrank goskate/Yelp/blogs; use the latter for features and colour, never for hours or fees when an official page exists.
5. **Write entries** (section 3), using **absolute paths** — the shell's working directory drifts after `cd .firecrawl/...`, and a relative heredoc will fail silently while a trailing `echo` still prints "written". Confirm with `test -s <file>`.
6. **Build to validate**: `npm run build`. Schema violations fail here. Confirm the new pages exist under `dist/directory/...`.
7. **Branch, commit, PR** (`content/<what>-<yyyy-mm>`). Commit `public/llms-full.txt` as regenerated by the build — content PRs do. The commit message and PR body must list each venue with its adult-friendly evidence, the sourcing rule applied, and a **Held back** section.
8. **Review bot**: wait ~4 minutes for the Codex reviewer. It reliably catches dated claims copied from a venue's site ("celebrating 30 years") and misused booleans (`isIndoor` on an open-sided covered park). Fix, reply on the thread with the commit SHA, resolve, re-run checks. A "Safety review" check showing *fail at 0s* after you reply is a **cancelled duplicate** triggered by `pull_request_review` — confirm via the check-runs API, then merge.
9. **Merge and verify live**: squash-merge, watch the "Post-deploy smoke test" run, then curl each new page **with a cache-buster** (append `?cb=` and a random number) — Cloudflare caches every route for 24h, so plain URLs can show stale content. New URLs appear immediately; the listing pages (`/directory/parks/`) may show the old count for up to a day.

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
- `city`: use the venue's actual municipality (e.g. "South Houston", "Cambridge"). The filter's search matches substrings of name, city and — for parks — `tags`, so "Houston" still finds South Houston, and a park in Cambridge is found by "Boston" if you add a `boston` tag. Use a tag for the metro alias; never put it in `city`.

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

Keep this current when a batch defers something, so the next pass starts here. Tip: Trucks and Fins (trucksandfins.com) tags surface ("Concrete Park") and lights explicitly and resolved four surface gaps in one pass in the September 2026 parks batch; search `trucksandfins <park name>` before holding an entry for surface.
- **Charlie Bowins Skate Park (McNabb Park), Ottawa** — Bronson & Gladstone; concrete (New Line, 2015; banks, ledges, rails, pyramid, quarterpipe, wallride per Trucks and Fins); community-funded. Held: no adult-friendly evidence found (no sessions, ability separation, lighting or hours in any source). Ottawa coverage satisfied instead by Legacy Skatepark (Nepean/Centrepointe).
- **Halifax Common Skatepark, Halifax NS** — Cast-in-place concrete with granite features; entered full reconstruction and replacement in June 2026, closed through mid-2027. Held: active construction closure.
- **Underpass Park, Toronto ON** — Covered urban concrete street park under Eastern/Adelaide overpasses; undergoing municipal bridge rehabilitation through early 2027 with ongoing partial facility closures. Held: infrastructure construction and partial closures.
- **Pittville Park Skatepark, Cheltenham UK** — Metal ramps on tarmac base; no floodlighting, rough rolling surface, and no evidence of adult sessions or physical ability separation. Held: surface quality and lack of adult-friendly evidence.
- **Flo Skatepark, Nottingham / Derby** — Indoor timber park; operating hub transitioned to Derby (Derbion) with Nottingham site schedule variable. Held: physical operating address in transition.
- **Palm Isle Skateshop** — 450 av. Victoria, Saint-Lambert QC J4P 2J4 (south shore, not Montréal); hours Mon–Wed 10–6, Thu–Fri 10–7, Sat 10–5, Sun 11–5. Held: new shop, no adult-friendly evidence and not in the paired park's city.
- **Brisbane shop** — Barry Kicker, 115 Gotha St, Fortitude Valley, surfaced only as a blog listing (no hours/site).
- **Adelaide shop** — nothing solid surfaced.
- **Melbourne shop** — Fast Times is a shopping-centre chain; no independent core shop found yet.
- **Grundy's Skate Store, Newcastle NSW** — long-standing skater-owned shop; historical addresses between Warners Bay and Charlestown unverified for current active retail storefront. Held: physical storefront address unconfirmed.
- **Prime Skatepark / Deluxe, Plymouth UK** — Commercial Place / Ebrington St; adult session schedules variable across facilities. Held: session schedules and operating hours require verification.
- **Kangaroo Bay Skate Park (Rosny Skatepark), Hobart / Clarence TAS** — Bastick St, Rosny; concrete competition bowl and street course; City of Clarence master planning reviews for surrounding precinct. Held: civic precinct master planning review.
- **Crushed Skate Shop, Washington DC** — 1342 U Street NW; closed physical storefront in April 2025. Held: physical storefront closed.
- **Cream City Skatepark, Milwaukee WI** — 5560 N. Park Dr; lease ended April 12th, actively looking for a new location. Held: no longer at the original address.
- **Four Seasons Skatepark, Milwaukee WI** — 200 N 25th St; permanently closed on March 31, 2026 after building sold. Held: permanently closed.
- **Kanis Skatepark, Little Rock AR** — 820 S Rodney Parham Rd; concrete. Held: renowned for its challenging deep peanut bowl; described as best suited for experienced skaters with no documented beginner-friendly features or adult sessions.
- **Trinity Skatepark, Providence RI** — downtown Providence; community-built DIY spot. Held: grassroots space with no formal beginner or adult programs and no documented lighting for evening sessions.
- **Roberts Skate Park, Omaha NE** — 730 N 78th St; 14,000 sq ft concrete park. Held: no strong evidence of adult-specific sessions, physical separation, or lighting (open dawn to dusk only).
- **Tosa Skatepark, Wauwatosa WI** — 7300 W Chestnut St. Held: no strong evidence of adult-specific sessions, physical separation, or lighting (fundraising for lights ongoing).
- **Seymour Smith Skate Park, Omaha NE** — 6802 Harrison St; 11,161 sq ft concrete. Held: no strong evidence of ability separation or adult programs.
- **Laurel Skatepark, Glen Allen VA** — 10301 Hungary Spring Rd; concrete. Held: standard transition and street features with no documented ability separation or adult-friendly sessions.
- **Renaissance Park Skatepark, Charlotte NC** — 1536 W Tyvola Rd; concrete. Held: has lights, but is a small 4,000 sq ft park noted to get crowded, with no documented beginner-friendly features or separation.
- **Oso Skate Park, Charlotte NC** — 933 Louise Ave. Held: permanently closed.
- **Osage Park, Bentonville AR** — 700 SW 16th St. Held: contains recreational amenities but no skatepark facility.
- **Clemente DIY Skatepark, Grand Rapids MI** — 546 Rumsey St SW; DIY concrete. Held: uneven surfaces and no explicit beginner separation or features typical of DIYs.
- **Skate Naked, Columbus OH** — 3790 E 5th Ave. Held: permanently closed.
- **Skate Rock City, Las Vegas NV** — 4680 Boulder Hwy. Held: roller skating rink with maple wood floor, no skateboard ramps or skatepark amenities.
- **Curbside Skatepark, Denver CO** — 4000 S Lowell Blvd. Held: permanently closed.
- **Marilla Park Skatepark (old), Morgantown WV** — Marilla Center. Held: demolished during pool reconstruction, new action sports complex in planning.
- **Magdalena Ecke YMCA Skatepark (Adult Night), Encinitas CA** — 200 Saxony Rd. Held: historical adult-specific night discontinued; open skate only.
- **Dodge Skatepark, Columbus OH** — 667 Sullivant Ave; concrete. Held: features significant advanced bowl and transition elements; known for lumpy/uneven concrete with no documented beginner ability separation or adult programs.
- **Iowa City Skatepark (Terrell Mill Park), Iowa City IA** — 1209 N Dubuque St; concrete. Held: open dawn to dusk with no dedicated night lighting, and undergoing active 2026 expansion and pump-track construction.
- **The Railyard Bike Park, Rogers AR** — 299 E Cherry St. Held: dedicated bike skill park with dirt/composite jump lines and rollers rather than a skateboard park.
- **Mount Trashmore Skatepark, Virginia Beach VA** — 310 Edwin Dr; SkateLite composite over wood framing. Held: closes at sunset with no night floodlighting, and its large elements (7-foot bowl and 13.5-foot vert ramp) cater primarily to advanced transition and vert riders; Virginia Beach coverage satisfied by lit concrete Williams Farm Skatepark.
- **Ollie's Skatepark, Florence KY** — 8171 Dixie Hwy; indoor wood warehouse skatepark. Held: permanently closed; Northern Kentucky coverage satisfied instead by municipal concrete Boone/Florence Skate Park.
- **Carmel Skatepark (Central Park), Carmel IN** — 1235 Central Park Dr E; concrete bowl and street plaza operated by Carmel Clay Parks & Recreation. Held: open sunrise to sunset only with no dedicated night lighting, and no documented ability separation or adult-specific sessions.
- **Walker Park Skatepark (Grinders Skate Park), Fayetteville AR** — 10 W 15th St; Purkis Rose concrete bowl and street plaza with push-button lights until 11pm. Held: regional skate sources note the deep bowl pockets and large stair/rail street features lean toward intermediate-to-advanced riders, with no documented beginner separation or structured lessons.
- **Davenport Skatepark (Centennial Park), Davenport IA** — 315 S Marquette St; riverfront concrete park with deep bowls and street obstacles. Held: open sunrise to 30 minutes after sunset with no night lighting, and no documented beginner separation or structured lessons; eastern Iowa coverage satisfied instead by lit Spohn Ranch concrete Riverside Skatepark in Cedar Rapids.
- **Mary Dennison Park Skatepark, Framingham MA** — 54 Beaver St; concrete park designed by Pillar Design Studios and built by Artisan Skateparks. Held: under construction and not yet open to the public.
- **Rapid City Skatepark (Memorial Park), Rapid City SD** — 209 New York St; outdoor concrete street-focused park. Held: no night lighting and no documented beginner separation or structured adult sessions.
- **Runway Bike Park (The Jones Center), Springdale AR** — 922 E Emma Ave; 2.75-acre outdoor bicycle skills park with a Velosolutions asphalt pump track. Held: open sunrise to sunset only with no night lighting, and primarily a mountain-bike training facility where skateboards are prohibited on the progressive skills course.
- **Logan Blvd. Skate Park, Chicago IL** — 2430 W Logan Blvd (N. Western Ave. & Logan Blvd.); covered ramp park beneath the I-90/94 Kennedy Expressway overpass. Held: Chicago Park District lists the facility as impacted/closed due to IDOT Kennedy Expressway bridge repairs, with community advocacy ongoing to replace the aging metal ramps with permanent concrete.
- **Crooked River Skatepark, Cleveland OH** — 1785 Merwin Ave; 15,000 sq ft Grindline public concrete park in the Flats. Held: official park site lists hours as open until sundown only with no night lighting, and no documented beginner separation or structured adult sessions; Greater Cleveland coverage satisfied instead by lit Lakewood Skatepark and Westside Skates.
- **Spearfish Skatepark (Spartan Park), Spearfish SD** — 330 State St; 8,800 sq ft municipal concrete skatepark. Held: grand opening postponed and facility closed to the public while the City of Spearfish resolves concrete quality-control and closeout issues with the contractor.
- **Las Cruces Skate Park (Walnut Street), Las Cruces NM** — 151 N Walnut St; 1998 volunteer-poured concrete park next to the BMX track. Held: local skaters and the *Las Cruces Sun-News* report that roughly half the park's transitions are poorly sloped, steep, and hazardous for inexperienced riders, while the city's replacement Grindline facility at the East Mesa Public Recreation Complex has no published municipal hours or lighting schedule on the city website yet.
- **Al-Town DIY Skatepark, Memphis TN** — Midtown Memphis; community-built DIY concrete spot with homemade quarter-pipes, banks, and rails. Held: local skate guides explicitly note its rough concrete, unconventional transitions, lack of night lighting, and lack of beginner-friendly features; Memphis coverage satisfied instead by lit concrete Raleigh Springs Civic Center Skate Park and indoor Society Memphis.
- **Crossroads Park Skate Bowl, Bellevue WA** — 16000 NE 10th St; Grindline concrete pool-style bowl. Held: official City of Bellevue page lists hours as dawn to dusk only with no night lighting, and its 4-to-9.5-foot depths and over-vertical clamshell cater to advanced transition skaters without a separated beginner area; Bellevue coverage satisfied instead by Bellevue Indoor Skate Park & Highland Skate Plaza.
- **Wasilla Skate Park (Iditapark), Wasilla AK** — Swanson Ave & Tommy Moe Ave; 13,000 sq ft outdoor concrete park. Held: open dawn to dusk only per municipal code with no dedicated night lighting, and no documented beginner separation or structured programs for older skaters; Alaska coverage expanded instead with covered, LED-lit Turnaround Skate Park in Sitka.
- **Russellville Skate Park (Harmon Park), Russellville AR** — S Independence Ave & S Jonesboro Ave; Wally Hollyday / California Skateparks concrete park. Held: open daylight to dark only with no night lighting, and no documented beginner separation or structured programs; Arkansas coverage expanded instead with lit Riverfront Skate and Bike Park in Fort Smith.
- **Coonskin Skate Park, Charleston WV** — 375 Henry C. Shores Dr; Kanawha County Parks & Recreation concrete park. Held: open daylight to dusk only with no dedicated night floodlighting, and no documented ability separation or structured programs; West Virginia coverage expanded instead with lit Grindline concrete Fort Neal Skate Park in Parkersburg.
- **Skate Park of Athens (Southeast Clarke Park), Athens GA** — 4440 Lexington Rd; 14,000 sq ft concrete facility. Held: open 8am to sunset only with no night lighting, and heavily vert-focused with a 5-to-13-foot bowl complex rather than separated beginner terrain; Georgia coverage expanded instead with lit 27,000 sq ft Brook Run Skate Park in Dunwoody.
- **Dr. James A. Dillon Park Skatepark, Noblesville IN** — 6001 Edenshall Ln; concrete bowl and street park. Held: closes at dark/sunset with no dedicated night lighting for after-work sessions, and no documented ability separation or structured programs; Indiana coverage expanded instead with lit 27,000 sq ft Sunset Skatepark in Evansville.
- **Swarner Skate Park, Shawnee KS** — 15120 W 63rd St; municipal concrete bowl and flow park. Held: operates on a dawn-to-dusk daylight schedule without dedicated night lighting, and no documented beginner separation or structured sessions; Kansas coverage expanded instead with lit Centennial Skate Park in Lawrence.
- **Long Branch Skateplex (Seven Presidents Oceanfront Park), Long Branch NJ** — 221 Ocean Ave N; Monmouth County Park System concrete plaza and bowl. Held: open 8am to dusk only with no night lighting, and no documented ability separation or structured sessions; New Jersey coverage expanded instead with lit Pennsauken Skatepark.
- **Orem Skatepark, Orem UT** — 355 N 1200 W; Spohn Ranch concrete plaza and bowl. Held: unlit dawn-to-dusk facility with no dedicated night lighting and no documented beginner separation or structured sessions; Utah coverage expanded instead with lit Spohn Ranch concrete Taylorsville Skatepark.
- **The Bay Omaha (Benson Community Center), Omaha NE** — 6008 Maple St; indoor community skate space. Held: official schedule restricts Thu–Sat 3pm–8pm sessions to "Youth Open Skate & Gaming" with no adult sessions (unlike The Bay Lincoln's 19+ Sunday nights); Nebraska coverage expanded instead with lit Artisan concrete Pier Park Skatepark in Grand Island.
- **Groton Skatepark (Sutton Park), Groton CT** — 185 Fort Hill Rd; municipal concrete bowl and transition park. Held: closed for a full-park municipal redevelopment project through Summer 2027.
- **K Street Skate Park (Case Street) & Marion Kreiner Park Skatepark, Casper WY** — 1701 E K St / 1120 N Kimball St. Held: K Street was permanently closed and demolished in March 2026, while the replacement Marion Kreiner facility drew local skater complaints over abrasive brushed-concrete finishing and flow issues; Wyoming coverage expanded instead with Dreamland concrete LaBonte Skate Park in Laramie.
- **7th Street Skatepark (Wilmington Skatepark), Wilmington DE** — 1180 E 7th St; community-built DIY concrete park on the 7th Street Peninsula. Held: grassroots DIY facility with no formal beginner separation, structured older-skater programs, or verified municipal lighting schedule.
- **Roosevelt Park Skatepark, Minot ND** — 909 3rd Ave NE; outdoor concrete skatepark behind Roosevelt Park pool. Held: impacted by temporary closures from local flood-mitigation construction in the park corridor.
- **Schutte Park Skatepark, Dover DE** — Electric Ave (near John W. Pitts Recreation Center); DIY concrete obstacles on an aging municipal slab. Held: open dawn to dusk only with no dedicated night lighting, and no documented beginner separation or structured municipal programs; Delaware coverage expanded instead with Evergreen concrete Epworth Skatepark in Rehoboth Beach.
- **Holmes Playground Skate Park, Plymouth MA** — 106 Summer St; renovated poured-concrete park with a bowl, street section, and whale-tail feature. Held: unlit daylight-only facility with no dedicated night floodlighting and no documented beginner separation or structured older-skater sessions.
- **I.G. Levy Memorial Park Skatepark (Pascagoula Skate Plaza), Pascagoula MS** — 3900 Chicot St; SITE Design Group concrete street plaza. Held: classified by its designers as an unlit facility with no night floodlighting, and no documented beginner separation or structured programs.
- **Perseverance Skatepark (Living Memorial Park), Brattleboro VT** — 157 Memorial Park Dr; 5,000 sq ft concrete bowl and street park. Held: official Town of Brattleboro rules restrict hours to dawn to dusk with no night floodlighting, and no documented beginner separation or structured sessions.
