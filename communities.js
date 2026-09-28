import { FARMLAND } from './farmland.js';

// Areas covered: roughly Pembroke–Hawkesbury and Kingston–Cornwall.
// Small towns close together share the same air quality grid cell (10 km), weather and
// land type, so they're grouped into one area named after a main town. Each area lists
// the nearby places it covers, and those names still work for search and old saved data.
export const REGIONS = [
  'Prescott-Russell',
  'Ottawa',
  'Stormont, Dundas & Glengarry',
  'Leeds & Grenville',
  'Lanark',
  'Renfrew',
  'Kingston & Frontenac',
  'Other Canadian cities',
];

export const HOME_REGION = 'Eastern Ontario';

// land: urban | suburban | farm | mixed | forest (see models.js LAND_FACTORS)
// covers: [id, name] of nearby places rolled into this area
// tz: time zone; profile: pollen/mould season profile (models.js PROFILES), blank = Eastern Ontario
const A = (id, name, region, lat, lon, land, covers = [], extra = {}) => ({
  id, name, region, lat, lon, land, tz: 'America/Toronto', profile: null, far: false,
  covers: covers.map(([cid, cname]) => ({ id: cid, name: cname })),
  ...extra,
});
const CITY = (id, name, lat, lon, tz, profile, covers = []) =>
  A(id, name, 'Other Canadian cities', lat, lon, 'urban', covers, { tz, profile, far: true });

export const COMMUNITIES = [
  // Prescott-Russell
  A('embrun', 'Embrun', 'Prescott-Russell', 45.2736, -75.2789, 'farm',
    [['russell', 'Russell'], ['limoges', 'Limoges'], ['casselman', 'Casselman'], ['st-isidore', 'St-Isidore']]),
  A('rockland', 'Rockland', 'Prescott-Russell', 45.5461, -75.2922, 'farm',
    [['clarence-creek', 'Clarence Creek'], ['bourget', 'Bourget'], ['plantagenet', 'Plantagenet']]),
  A('hawkesbury', 'Hawkesbury', 'Prescott-Russell', 45.6076, -74.6048, 'farm',
    [['vankleek-hill', 'Vankleek Hill'], ['lorignal', "L'Orignal"], ['alfred', 'Alfred']]),

  // Ottawa
  A('ottawa', 'Ottawa (Downtown)', 'Ottawa', 45.4215, -75.6972, 'urban', [['nepean', 'Nepean']]),
  A('orleans', 'Orléans', 'Ottawa', 45.4760, -75.5140, 'suburban', [['cumberland', 'Cumberland'], ['navan', 'Navan']]),
  A('kanata', 'Kanata', 'Ottawa', 45.3088, -75.8987, 'suburban', [['stittsville', 'Stittsville'], ['carp', 'Carp']]),
  A('barrhaven', 'Barrhaven', 'Ottawa', 45.2750, -75.7400, 'suburban', [['manotick', 'Manotick'], ['richmond', 'Richmond']]),
  A('greely', 'Greely', 'Ottawa', 45.2630, -75.5550, 'farm', [['metcalfe', 'Metcalfe'], ['osgoode', 'Osgoode']]),

  // Stormont, Dundas & Glengarry
  A('cornwall', 'Cornwall', 'Stormont, Dundas & Glengarry', 45.0213, -74.7303, 'suburban',
    [['long-sault', 'Long Sault'], ['ingleside', 'Ingleside'], ['lancaster', 'Lancaster']]),
  A('winchester', 'Winchester', 'Stormont, Dundas & Glengarry', 45.0930, -75.3510, 'farm',
    [['chesterville', 'Chesterville'], ['crysler', 'Crysler'], ['finch', 'Finch']]),
  A('morrisburg', 'Morrisburg', 'Stormont, Dundas & Glengarry', 44.9000, -75.1850, 'farm', [['iroquois', 'Iroquois']]),
  A('alexandria', 'Alexandria', 'Stormont, Dundas & Glengarry', 45.3100, -74.6340, 'farm', [['maxville', 'Maxville']]),

  // Leeds & Grenville
  A('kemptville', 'Kemptville', 'Leeds & Grenville', 45.0170, -75.6440, 'farm', [['merrickville', 'Merrickville']]),
  A('brockville', 'Brockville', 'Leeds & Grenville', 44.5895, -75.6843, 'suburban',
    [['prescott', 'Prescott'], ['cardinal', 'Cardinal'], ['athens', 'Athens']]),

  // Lanark
  A('carleton-place', 'Carleton Place', 'Lanark', 45.1400, -76.1440, 'mixed', [['almonte', 'Almonte']]),
  A('perth', 'Perth', 'Lanark', 44.9000, -76.2480, 'mixed', [['smiths-falls', 'Smiths Falls'], ['lanark', 'Lanark']]),

  // Renfrew
  A('arnprior', 'Arnprior', 'Renfrew', 45.4350, -76.3530, 'mixed', [['renfrew', 'Renfrew']]),
  A('pembroke', 'Pembroke', 'Renfrew', 45.8260, -77.1110, 'mixed',
    [['petawawa', 'Petawawa'], ['cobden', 'Cobden'], ['eganville', 'Eganville']]),

  // Kingston & Frontenac
  A('kingston', 'Kingston', 'Kingston & Frontenac', 44.2312, -76.4860, 'suburban',
    [['amherstview', 'Amherstview'], ['gananoque', 'Gananoque'], ['napanee', 'Napanee']]),
  A('sharbot-lake', 'Sharbot Lake', 'Kingston & Frontenac', 44.7720, -76.6890, 'forest',
    [['westport', 'Westport'], ['sydenham', 'Sydenham']]),

  // Major cities elsewhere in Canada (official Environment Canada AQHI; city-specific pollen seasons)
  CITY('toronto', 'Toronto', 43.6532, -79.3832, 'America/Toronto', 'toronto'),
  CITY('montreal', 'Montréal', 45.5019, -73.5674, 'America/Toronto', 'montreal'),
  CITY('halifax', 'Halifax', 44.6488, -63.5752, 'America/Halifax', 'halifax'),
  CITY('calgary', 'Calgary', 51.0447, -114.0719, 'America/Edmonton', 'calgary'),
  CITY('vancouver', 'Vancouver', 49.2827, -123.1207, 'America/Vancouver', 'vancouver'),
];

// Land type comes from the real crop map (farmland.js), not guesses.
for (const c of COMMUNITIES) if (FARMLAND[c.id]) c.land = FARMLAND[c.id].land;

export const HOME_AREAS = COMMUNITIES.filter((c) => !c.far);

export const LAND_LABELS = {
  urban: 'the city core', suburban: 'suburban surroundings', farm: 'surrounding farmland',
  mixed: 'mixed farmland and woodlots', forest: 'surrounding forest',
};

// Old community IDs (from version 4.0/4.1) → the area that now covers them.
const ALIAS = {};
for (const c of COMMUNITIES) for (const x of c.covers) ALIAS[x.id] = c.id;

/** Look up an area by its ID, or by the ID of a place it covers. */
export const byId = (id) => COMMUNITIES.find((c) => c.id === id) || COMMUNITIES.find((c) => c.id === ALIAS[id]);

/** "Russell, Limoges, Casselman & St-Isidore" */
export function coversText(c) {
  const n = c.covers.map((x) => x.name);
  return n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} & ${n[n.length - 1]}`;
}

export function distanceKm(aLat, aLon, bLat, bLon) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestCommunity(lat, lon) {
  let best = null, bestD = Infinity;
  for (const c of COMMUNITIES) {
    const d = distanceKm(lat, lon, c.lat, c.lon);
    if (d < bestD) { best = c; bestD = d; }
  }
  return { community: best, km: bestD };
}
