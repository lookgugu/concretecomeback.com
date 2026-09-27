import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  NATIONWIDE,
  foldPlace,
  cityKey,
  countryKey,
  resolveCoords,
  haversineKm,
  distanceUnit,
  formatDistance,
} from './geo-distance.js';

const CITY_COORDS = JSON.parse(readFileSync(new URL('../data/city-coords.json', import.meta.url), 'utf8'));

const PORTLAND = { lat: 45.5202, lng: -122.6742 };
const SEATTLE = { lat: 47.6038, lng: -122.3301 };
const LONDON = { lat: 51.5074, lng: -0.1278 };

test('foldPlace lowercases, trims and strips diacritics', () => {
  assert.equal(foldPlace('Montréal'), 'montreal');
  assert.equal(foldPlace('  Des Moines '), 'des moines');
  assert.equal(foldPlace(undefined), '');
});

test('cityKey is COUNTRY|state|city with the country enum kept uppercase', () => {
  assert.equal(cityKey('US', 'Des Moines', 'Iowa'), 'US|iowa|des moines');
  assert.equal(cityKey('UK', 'Bristol'), 'UK||bristol');
  assert.equal(cityKey('US', ''), '');
  assert.equal(cityKey('', 'Portland'), '');
});

test('the state segment keeps same-named cities apart', () => {
  // Without it a Portland, ME park would inherit Portland, OR's coordinates.
  assert.notEqual(cityKey('US', 'Portland', 'Oregon'), cityKey('US', 'Portland', 'Maine'));
});

test('Montreal and Montréal are one key', () => {
  assert.equal(cityKey('CA', 'Montreal', 'Quebec'), cityKey('CA', 'Montréal', 'Quebec'));
});

test('resolveCoords prefers an entry\'s own coordinates over its city centroid', () => {
  const coords = resolveCoords(
    { country: 'US', city: 'Portland', stateProvince: 'Oregon', coordinates: { lat: 45.5, lng: -122.6 } },
    CITY_COORDS,
  );
  assert.deepEqual(coords, { lat: 45.5, lng: -122.6, precision: 'exact' });
});

test('resolveCoords falls back to the city centroid', () => {
  const coords = resolveCoords({ country: 'US', city: 'Portland', stateProvince: 'Oregon' }, CITY_COORDS);
  assert.deepEqual(coords, { lat: 45.5202, lng: -122.6742, precision: 'city' });
});

test('a nationwide entry falls back to its own country, not to nothing', () => {
  // "Silver Skate UK" runs across the UK with city "Various". Without this it
  // sorted behind Melbourne for a London visitor.
  const coords = resolveCoords({ country: 'UK', city: 'Various' }, CITY_COORDS);
  assert.equal(coords.precision, 'country');
  assert.deepEqual(
    { lat: coords.lat, lng: coords.lng },
    { lat: CITY_COORDS.UK.lat, lng: CITY_COORDS.UK.lng },
  );
  // Close enough to London to outrank an Australian listing, which is the
  // whole point of the fallback.
  assert.ok(haversineKm(coords, LONDON) < 300);
});

test('a nationwide placeholder wins even if a city row for it somehow exists', () => {
  // Guards the check order: a stray geocoded "Various" must never surface as
  // a driveable 'city' distance.
  const table = { ...CITY_COORDS, [cityKey('UK', 'Various')]: { lat: 0, lng: 0 } };
  assert.equal(resolveCoords({ country: 'UK', city: 'Various' }, table).precision, 'country');
});

test('every NATIONWIDE spelling gets the country fallback', () => {
  for (const city of NATIONWIDE) {
    assert.equal(resolveCoords({ country: 'US', city }, CITY_COORDS)?.precision, 'country', city);
  }
});

test('an unrecognised city gets no position rather than a plausible-looking one', () => {
  // A content bug (new city, centroid table not regenerated) must surface as a
  // missing position, not get quietly pinned to the middle of the country.
  assert.equal(resolveCoords({ country: 'US', city: 'Nowheresville', stateProvince: 'Ohio' }, CITY_COORDS), null);
  // Same city, different state, is a different place.
  assert.equal(resolveCoords({ country: 'US', city: 'Portland', stateProvince: 'Maine' }, CITY_COORDS), null);
});

test('resolveCoords returns null without a country or entry', () => {
  assert.equal(resolveCoords(undefined, CITY_COORDS), null);
  assert.equal(resolveCoords({ city: 'Portland' }, CITY_COORDS), null);
});

test('resolveCoords ignores partial or non-numeric coordinates', () => {
  const entry = { country: 'US', city: 'Portland', stateProvince: 'Oregon', coordinates: { lat: 45.5 } };
  assert.deepEqual(
    resolveCoords(entry, CITY_COORDS),
    { lat: 45.5202, lng: -122.6742, precision: 'city' },
  );
});

test('haversineKm matches a known great-circle distance', () => {
  // Portland -> Seattle is ~233 km as the crow flies.
  assert.ok(Math.abs(haversineKm(PORTLAND, SEATTLE) - 233) < 5);
});

test('haversineKm is zero for a point against itself and is symmetric', () => {
  assert.equal(haversineKm(PORTLAND, PORTLAND), 0);
  assert.equal(haversineKm(PORTLAND, SEATTLE), haversineKm(SEATTLE, PORTLAND));
});

test('haversineKm handles antipodal points without NaN from float drift', () => {
  const km = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
  assert.ok(Number.isFinite(km));
  assert.ok(Math.abs(km - 20015) < 5);
});

test('distanceUnit gives miles to US and UK visitors and km to everyone else', () => {
  assert.equal(distanceUnit('en-US'), 'mi');
  assert.equal(distanceUnit('en-GB'), 'mi');
  assert.equal(distanceUnit('en-CA'), 'km');
  assert.equal(distanceUnit('fr-CA'), 'km');
  assert.equal(distanceUnit('en-AU'), 'km');
  assert.equal(distanceUnit('en'), 'km');
  assert.equal(distanceUnit(undefined), 'km');
});

test('formatDistance keeps a decimal only under 10 units', () => {
  assert.equal(formatDistance(4.25, 'km'), '4.3 km away');
  assert.equal(formatDistance(42.4, 'km'), '42 km away');
  assert.equal(formatDistance(233, 'mi'), '145 mi away');
});

test('formatDistance never prints a fake zero for a same-city centroid', () => {
  assert.equal(formatDistance(0, 'km'), 'Less than 1 km away');
  assert.equal(formatDistance(0.4, 'mi'), 'Less than 1 mi away');
});

test('every country has a derived centroid for nationwide entries', () => {
  for (const code of ['US', 'UK', 'CA', 'AU']) {
    const row = CITY_COORDS[countryKey(code)];
    assert.ok(row, `missing country centroid for ${code}`);
    assert.ok(Number.isFinite(row.lat) && Number.isFinite(row.lng));
    assert.match(row.source, /^derived:/, `${code} centroid should be derived, not geocoded`);
  }
});

test('every directory city resolves to coordinates inside its own country', () => {
  // A geocoder mismatch (Newcastle AU vs Newcastle UK, say) shows up as a
  // centroid outside the country's bounding box, not as a plausible number.
  const BOXES = {
    US: { lat: [18, 72], lng: [-180, -66] },
    UK: { lat: [49, 61], lng: [-9, 2] },
    CA: { lat: [41, 84], lng: [-141, -52] },
    AU: { lat: [-44, -9], lng: [112, 154] },
  };
  for (const [key, value] of Object.entries(CITY_COORDS)) {
    // Country rows are a derived centre of mass, not a geocoded city; a mean
    // of a country's listings can legitimately land just over its own border.
    if (!key.includes('|')) continue;
    const box = BOXES[key.split('|')[0]];
    assert.ok(box, `unknown country in city key: ${key}`);
    assert.ok(
      value.lat >= box.lat[0] && value.lat <= box.lat[1] &&
      value.lng >= box.lng[0] && value.lng <= box.lng[1],
      `${key} at ${value.lat},${value.lng} falls outside its country (${value.source})`,
    );
  }
});

test('no two city rows share coordinates within a country', () => {
  // Two spellings of one city ("Montreal"/"Montréal") used to produce two rows
  // and double-count the city in the country centroid. Two rows for the same
  // city with and without a state (Bristol) are expected; their city segment
  // matches, so they are excluded here.
  const seen = new Map();
  for (const [key, value] of Object.entries(CITY_COORDS)) {
    if (!key.includes('|')) continue;
    const [code, , city] = key.split('|');
    const sig = `${code}:${value.lat},${value.lng}`;
    const prev = seen.get(sig);
    assert.ok(!prev || prev === city, `${key} duplicates ${code}|…|${prev} at the same coordinates`);
    seen.set(sig, city);
  }
});
