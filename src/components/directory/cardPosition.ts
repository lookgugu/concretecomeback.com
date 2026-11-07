import cityCoords from '../../data/city-coords.json';
import { resolveCoords } from '../../scripts/geo-distance.js';

interface Positionable {
  name: string;
  country: string;
  city: string;
  stateProvince?: string;
  isOnline?: boolean;
  coordinates?: { lat: number; lng: number };
}

/**
 * `data-lat`/`data-lng`/`data-position` for a directory card, read by the
 * "near me" sort in DirectoryFilter.astro. Online-only groups get no
 * attributes at all and the sort parks them after everything it can measure,
 * rather than treating a missing position as (0, 0) off the coast of Africa.
 *
 * `data-position` carries the precision ('exact' | 'city' | 'country'); the
 * sort prints a distance only for the first two, because a nationwide entry's
 * position is a sort anchor rather than a place anyone can travel to.
 *
 * Any other entry without a position is a content bug — a listing in a city
 * the centroid table has never seen — and fails the build here, on the same
 * zod-parsed data the page renders from, so the symptom is a named file and
 * the fix rather than a card that quietly sinks to the bottom of the sort.
 */
export function cardPosition(data: Positionable): Record<string, string> {
  if (data.isOnline) return {};
  const coords = resolveCoords(data, cityCoords);
  if (!coords) {
    throw new Error(
      `"${data.name}" (${data.city}${data.stateProvince ? `, ${data.stateProvince}` : ''}, ${data.country}) ` +
      'has no position: its city is not in src/data/city-coords.json. ' +
      'Run `node scripts/geocode-cities.mjs` and commit the result.',
    );
  }
  return {
    'data-lat': String(coords.lat),
    'data-lng': String(coords.lng),
    'data-position': coords.precision,
  };
}
