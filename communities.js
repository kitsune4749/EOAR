// Communities covered: roughly Pembroke–Hawkesbury and Kingston–Cornwall.
// Coordinates are approximate town centres.
export const REGIONS = [
  'Prescott-Russell',
  'Ottawa',
  'Stormont, Dundas & Glengarry',
  'Leeds & Grenville',
  'Lanark',
  'Renfrew',
  'Kingston & Frontenac',
];

const C = (id, name, region, lat, lon) => ({ id, name, region, lat, lon });

export const COMMUNITIES = [
  // Prescott-Russell
  C('embrun', 'Embrun', 'Prescott-Russell', 45.2736, -75.2789),
  C('russell', 'Russell', 'Prescott-Russell', 45.2575, -75.3597),
  C('limoges', 'Limoges', 'Prescott-Russell', 45.3308, -75.2464),
  C('casselman', 'Casselman', 'Prescott-Russell', 45.3144, -75.0886),
  C('st-isidore', 'St-Isidore', 'Prescott-Russell', 45.3867, -74.9075),
  C('bourget', 'Bourget', 'Prescott-Russell', 45.4378, -75.1500),
  C('rockland', 'Rockland', 'Prescott-Russell', 45.5461, -75.2922),
  C('clarence-creek', 'Clarence Creek', 'Prescott-Russell', 45.5047, -75.2186),
  C('plantagenet', 'Plantagenet', 'Prescott-Russell', 45.5333, -74.9956),
  C('alfred', 'Alfred', 'Prescott-Russell', 45.5570, -74.8790),
  C('lorignal', "L'Orignal", 'Prescott-Russell', 45.6192, -74.6917),
  C('vankleek-hill', 'Vankleek Hill', 'Prescott-Russell', 45.5184, -74.6517),
  C('hawkesbury', 'Hawkesbury', 'Prescott-Russell', 45.6076, -74.6048),

  // Ottawa
  C('ottawa', 'Ottawa (Downtown)', 'Ottawa', 45.4215, -75.6972),
  C('orleans', 'Orléans', 'Ottawa', 45.4760, -75.5140),
  C('cumberland', 'Cumberland', 'Ottawa', 45.5170, -75.4000),
  C('navan', 'Navan', 'Ottawa', 45.4200, -75.4230),
  C('kanata', 'Kanata', 'Ottawa', 45.3088, -75.8987),
  C('stittsville', 'Stittsville', 'Ottawa', 45.2590, -75.9200),
  C('nepean', 'Nepean', 'Ottawa', 45.3450, -75.7550),
  C('barrhaven', 'Barrhaven', 'Ottawa', 45.2750, -75.7400),
  C('manotick', 'Manotick', 'Ottawa', 45.2270, -75.6830),
  C('greely', 'Greely', 'Ottawa', 45.2630, -75.5550),
  C('metcalfe', 'Metcalfe', 'Ottawa', 45.2300, -75.4680),
  C('osgoode', 'Osgoode', 'Ottawa', 45.1470, -75.6000),
  C('richmond', 'Richmond', 'Ottawa', 45.1930, -75.8330),
  C('carp', 'Carp', 'Ottawa', 45.3480, -76.0400),

  // Stormont, Dundas & Glengarry
  C('cornwall', 'Cornwall', 'Stormont, Dundas & Glengarry', 45.0213, -74.7303),
  C('long-sault', 'Long Sault', 'Stormont, Dundas & Glengarry', 45.0310, -74.8870),
  C('ingleside', 'Ingleside', 'Stormont, Dundas & Glengarry', 44.9990, -74.9950),
  C('morrisburg', 'Morrisburg', 'Stormont, Dundas & Glengarry', 44.9000, -75.1850),
  C('iroquois', 'Iroquois', 'Stormont, Dundas & Glengarry', 44.8500, -75.3170),
  C('winchester', 'Winchester', 'Stormont, Dundas & Glengarry', 45.0930, -75.3510),
  C('chesterville', 'Chesterville', 'Stormont, Dundas & Glengarry', 45.1000, -75.2280),
  C('crysler', 'Crysler', 'Stormont, Dundas & Glengarry', 45.2170, -75.1500),
  C('finch', 'Finch', 'Stormont, Dundas & Glengarry', 45.1370, -75.0880),
  C('maxville', 'Maxville', 'Stormont, Dundas & Glengarry', 45.2860, -74.8530),
  C('alexandria', 'Alexandria', 'Stormont, Dundas & Glengarry', 45.3100, -74.6340),
  C('lancaster', 'Lancaster', 'Stormont, Dundas & Glengarry', 45.1380, -74.4970),

  // Leeds & Grenville
  C('kemptville', 'Kemptville', 'Leeds & Grenville', 45.0170, -75.6440),
  C('merrickville', 'Merrickville', 'Leeds & Grenville', 44.9170, -75.8370),
  C('cardinal', 'Cardinal', 'Leeds & Grenville', 44.7850, -75.3800),
  C('prescott', 'Prescott', 'Leeds & Grenville', 44.7120, -75.5170),
  C('brockville', 'Brockville', 'Leeds & Grenville', 44.5895, -75.6843),
  C('athens', 'Athens', 'Leeds & Grenville', 44.6300, -75.9500),
  C('westport', 'Westport', 'Leeds & Grenville', 44.6790, -76.3970),
  C('gananoque', 'Gananoque', 'Leeds & Grenville', 44.3300, -76.1620),

  // Lanark
  C('smiths-falls', 'Smiths Falls', 'Lanark', 44.9040, -76.0210),
  C('perth', 'Perth', 'Lanark', 44.9000, -76.2480),
  C('lanark', 'Lanark', 'Lanark', 45.0170, -76.3650),
  C('carleton-place', 'Carleton Place', 'Lanark', 45.1400, -76.1440),
  C('almonte', 'Almonte', 'Lanark', 45.2260, -76.1930),

  // Renfrew
  C('arnprior', 'Arnprior', 'Renfrew', 45.4350, -76.3530),
  C('renfrew', 'Renfrew', 'Renfrew', 45.4720, -76.6830),
  C('cobden', 'Cobden', 'Renfrew', 45.6260, -76.8830),
  C('eganville', 'Eganville', 'Renfrew', 45.5330, -77.1000),
  C('pembroke', 'Pembroke', 'Renfrew', 45.8260, -77.1110),
  C('petawawa', 'Petawawa', 'Renfrew', 45.8990, -77.2830),

  // Kingston & Frontenac
  C('kingston', 'Kingston', 'Kingston & Frontenac', 44.2312, -76.4860),
  C('amherstview', 'Amherstview', 'Kingston & Frontenac', 44.2240, -76.6600),
  C('sydenham', 'Sydenham', 'Kingston & Frontenac', 44.4090, -76.6030),
  C('sharbot-lake', 'Sharbot Lake', 'Kingston & Frontenac', 44.7720, -76.6890),
  C('napanee', 'Napanee', 'Kingston & Frontenac', 44.2500, -76.9500),
];

// Surrounding land type, used to adjust pollen and mould estimates.
//   urban    – dense city core: less ragweed/grass, some street trees
//   suburban – lawns, parks, some open lots
//   farm     – open farmland and roadsides: ragweed and grass thrive, harvest dust raises fall mould
//   mixed    – farmland mixed with woodlots (Ottawa Valley, Lanark edges)
//   forest   – Canadian Shield / heavily forested: more tree pollen, less ragweed
const LAND = {
  urban: ['ottawa'],
  suburban: ['orleans', 'kanata', 'nepean', 'barrhaven', 'stittsville', 'rockland', 'hawkesbury', 'cornwall', 'brockville',
    'kingston', 'amherstview', 'pembroke', 'petawawa', 'smiths-falls', 'carleton-place', 'arnprior', 'gananoque', 'napanee', 'kemptville', 'renfrew', 'perth'],
  farm: ['embrun', 'russell', 'limoges', 'casselman', 'st-isidore', 'bourget', 'clarence-creek', 'plantagenet', 'alfred', 'lorignal',
    'vankleek-hill', 'navan', 'cumberland', 'metcalfe', 'greely', 'osgoode', 'manotick', 'richmond', 'winchester', 'chesterville', 'crysler', 'finch',
    'maxville', 'alexandria', 'lancaster', 'morrisburg', 'iroquois', 'ingleside', 'long-sault', 'cardinal', 'prescott'],
  mixed: ['carp', 'almonte', 'merrickville', 'athens', 'cobden', 'eganville', 'lanark'],
  forest: ['westport', 'sharbot-lake', 'sydenham'],
};
export const LAND_LABELS = {
  urban: 'the city core', suburban: 'suburban surroundings', farm: 'surrounding farmland',
  mixed: 'mixed farmland and woodlots', forest: 'surrounding forest',
};
for (const [type, ids] of Object.entries(LAND)) for (const id of ids) { const c = COMMUNITIES.find((x) => x.id === id); if (c) c.land = type; }
for (const c of COMMUNITIES) c.land ||= 'suburban';

export const byId = (id) => COMMUNITIES.find((c) => c.id === id);

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
