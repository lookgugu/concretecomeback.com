#!/usr/bin/env node
/**
 * Regenerates src/data/city-coords.json — the city-centroid table that gives
 * every directory entry an approximate position for the "near me" sort.
 *
 * Entries are located at city granularity on purpose: a centroid is accurate to
 * a few km, which is all a "nearest first" ordering needs, and it never claims
 * venue-level precision the directory has not actually verified. An entry that
 * carries its own `coordinates` in frontmatter overrides the centroid.
 *
 * Geocoded via Nominatim (OSM), which asks for <=1 request/second and a real
 * User-Agent. Run it only when new cities appear:
 *
 *   node scripts/geocode-cities.mjs
 *
 * It preserves coordinates already in the JSON and only looks up what's missing,
 * so a rerun costs one request per genuinely new city. Pass --force to refetch
 * everything. A lookup that fails keeps the previous row rather than dropping
 * it, and the script exits non-zero so a partial table is never mistaken for a
 * complete one. Every result carries the `source` display name Nominatim
 * matched, so a wrong match is visible in review rather than buried in two
 * numbers.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { NATIONWIDE, cityKey, countryKey, foldPlace } from '../src/scripts/geo-distance.js';

const OUT = 'src/data/city-coords.json';
const COLLECTIONS = ['parks', 'shops', 'groups'];
const UA = 'concretecomeback.com city-centroid builder (https://concretecomeback.com)';
const COUNTRY_NAMES = { US: 'United States', UK: 'United Kingdom', CA: 'Canada', AU: 'Australia' };

const field = (src, key) => {
  const m = src.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
};

/**
 * Every distinct place the content names. Online-only groups are skipped by
 * `isOnline`, the same signal cardPosition uses; nationwide placeholders are
 * skipped by the shared NATIONWIDE set so the two can't drift apart.
 */
async function collectCities() {
  const seen = new Map();
  for (const collection of COLLECTIONS) {
    const base = join('src/content', collection);
    for (const country of await readdir(base)) {
      let files;
      try { files = await readdir(join(base, country)); } catch { continue; }
      for (const file of files.filter((f) => /\.mdx?$/.test(f))) {
        const src = await readFile(join(base, country, file), 'utf8');
        const head = src.split(/^---$/m)[1] ?? '';
        if (field(head, 'isOnline') === 'true') continue;
        const code = field(head, 'country');
        const city = field(head, 'city');
        const state = field(head, 'stateProvince');
        if (!code || !city || NATIONWIDE.has(foldPlace(city))) continue;
        const key = cityKey(code, city, state);
        if (!seen.has(key)) seen.set(key, { code, city, state });
      }
    }
  }
  return seen;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode({ code, city, state }) {
  const q = [city, state, COUNTRY_NAMES[code]].filter(Boolean).join(', ');
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${q}`);
  const [hit] = await res.json();
  if (!hit) return null;
  return {
    lat: Number(Number(hit.lat).toFixed(4)),
    lng: Number(Number(hit.lon).toFixed(4)),
    source: hit.display_name,
  };
}

const force = process.argv.includes('--force');
// `previous` is always read so a failed refetch can fall back to the old row;
// `existing` is what --force empties to make every city a fresh lookup.
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const existing = force ? {} : previous;
const cities = await collectCities();
const out = {};
let requested = 0;
let missed = 0;

for (const [key, entry] of [...cities].sort(([a], [b]) => a.localeCompare(b))) {
  if (existing[key]) { out[key] = existing[key]; continue; }
  // Unconditional between requests: throttling only after a *successful* one
  // would let a single 429 turn the rest of the run into a tight loop.
  if (requested > 0) await sleep(1100);
  requested++;
  try {
    const hit = await geocode(entry);
    if (!hit) throw new Error('no match');
    out[key] = hit;
    console.log(`  ${key} -> ${hit.lat},${hit.lng}  (${hit.source})`);
  } catch (err) {
    missed++;
    if (previous[key]) {
      out[key] = previous[key];
      console.warn(`  failed: ${key} — ${err.message}; kept previous row`);
    } else {
      console.warn(`  failed: ${key} — ${err.message}`);
    }
  }
}

// Country centroids, keyed by the bare country code, back the nationwide
// fallback in resolveCoords. They are the mean of the cities the directory
// actually lists in that country rather than a geocoder lookup: asking
// Nominatim for "Canada" free-form returns a village in Bolivia, and a
// centre-of-mass of known-good points is both verifiable and better centred on
// where the listings are. The same city listed with and without a state is
// one point here, not two.
const byCountry = new Map();
const distinct = new Set();
for (const [key, value] of Object.entries(out)) {
  const [code, , city] = key.split('|');
  const dedupe = `${code}|${city}`;
  if (distinct.has(dedupe)) continue;
  distinct.add(dedupe);
  if (!byCountry.has(code)) byCountry.set(code, []);
  byCountry.get(code).push(value);
}
for (const [code, points] of byCountry) {
  const mean = (pick) => Number((points.reduce((sum, p) => sum + p[pick], 0) / points.length).toFixed(4));
  out[countryKey(code)] = {
    lat: mean('lat'),
    lng: mean('lng'),
    source: `derived: mean of ${points.length} listed ${code} cities`,
  };
  console.log(`  ${code} -> ${out[code].lat},${out[code].lng}  (${out[code].source})`);
}

writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`\n${Object.keys(out).length} rows in ${OUT} (${requested} requested, ${missed} failed)`);
if (missed) {
  console.error('Some lookups failed — the table above is incomplete. Rerun to fill the gaps.');
  process.exitCode = 1;
}
