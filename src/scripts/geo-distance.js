/**
 * Distance helpers shared by the directory cards (build time, to stamp each
 * card with a position) and by DirectoryFilter's browser script (runtime, to
 * sort by proximity once a visitor shares their location).
 *
 * Positions are city centroids from src/data/city-coords.json unless an entry
 * carries its own `coordinates` in frontmatter, so a distance is accurate to
 * roughly the size of a city — enough to order a list, not enough to claim a
 * venue-level precision the directory has not verified. `formatDistance`
 * rounds accordingly and never prints a decimal under 10 units.
 */

const EARTH_RADIUS_KM = 6371;
const KM_PER_MILE = 1.609344;

// Regions that measure road distance in miles. Everywhere else gets km, which
// covers the directory's Canadian and Australian listings.
const MILE_REGIONS = new Set(['US', 'GB', 'LR', 'MM']);

/**
 * `city` values that mean "everywhere in this country" — an in-person group
 * that runs nationwide rather than from one town. The single source of truth:
 * scripts/geocode-cities.mjs imports it to keep these out of the geocoder, and
 * resolveCoords uses it to grant the country-centroid fallback.
 */
export const NATIONWIDE = new Set(['various', 'nationwide', 'countrywide']);

/**
 * Lowercases and strips diacritics so "Montréal" and "Montreal" — both of
 * which the content uses — are one key, not two rows with the same centroid.
 */
export function foldPlace(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Key into the city-centroid table: `COUNTRY|state|city`. Country stays
 * uppercase (it is the schema's enum); state and city are folded. The state
 * segment is what keeps Portland, OR and a future Portland, ME apart — without
 * it the second silently inherits the first's coordinates. Entries without a
 * stateProvince get an empty middle segment, so a city listed both with and
 * without one ("Bristol" / "Bristol, England") costs two rows, which is cheap.
 */
export function cityKey(country, city, state) {
  if (!country || !city) return '';
  return `${country}|${foldPlace(state)}|${foldPlace(city)}`;
}

/** Key for a country's derived centroid: the bare country code. */
export function countryKey(country) {
  return country ? String(country) : '';
}

/**
 * Position for a directory entry, with how much to trust it:
 *
 *   'exact'   — coordinates from the entry's own frontmatter
 *   'city'    — the centroid of its city
 *   'country' — the centre of mass of that country's listings, for an entry
 *               that genuinely operates nationwide ("Silver Skate UK", city
 *               "Various"). Enough to sort it near a visitor in that country;
 *               nowhere near enough to print a distance for, which is why
 *               callers suppress the distance label at this precision.
 *
 * Returns null for an entry with no meaningful location at all — an online-only
 * group, or a city missing from the table because content added it without a
 * rerun of scripts/geocode-cities.mjs.
 */
export function resolveCoords(entry, table) {
  const own = entry?.coordinates;
  if (own && Number.isFinite(own.lat) && Number.isFinite(own.lng)) {
    return { lat: own.lat, lng: own.lng, precision: 'exact' };
  }
  if (!entry?.country) return null;

  // Only a stated nationwide scope earns the country fallback, and it is
  // checked first so a nationwide placeholder can never be shadowed by a city
  // row the geocoder should not have produced. An unrecognised city is a
  // content bug, and pinning it to the middle of the country would hide that
  // behind a plausible-looking position.
  if (NATIONWIDE.has(foldPlace(entry.city))) {
    const country = table?.[countryKey(entry.country)];
    return country ? { lat: country.lat, lng: country.lng, precision: 'country' } : null;
  }

  const city = table?.[cityKey(entry.country, entry.city, entry.stateProvince)];
  return city ? { lat: city.lat, lng: city.lng, precision: 'city' } : null;
}

/** Great-circle distance in kilometres between two {lat, lng} points. */
export function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 'mi' or 'km' for a BCP-47 locale such as 'en-GB' or 'fr-CA'. */
export function distanceUnit(locale) {
  const region = String(locale ?? '').split('-')[1];
  return MILE_REGIONS.has(String(region).toUpperCase()) ? 'mi' : 'km';
}

/**
 * Human distance label. Centroid positions do not justify decimals at range,
 * so only sub-10 distances keep one, and anything under a city's own radius
 * reads as "less than a mile/km away" rather than a fake zero.
 */
export function formatDistance(km, unit = 'km') {
  const value = unit === 'mi' ? km / KM_PER_MILE : km;
  if (value < 1) return `Less than 1 ${unit} away`;
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${unit} away`;
}
