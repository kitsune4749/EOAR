// Scoring models. Everything returns a 0–4 scale:
// 0 None · 1 Low · 2 Moderate · 3 High · 4 Very high

export const LEVELS = ['None', 'Low', 'Moderate', 'High', 'Very high'];
export const levelName = (v) => LEVELS[Math.max(0, Math.min(4, Math.round(v)))];
export const SHORT_LEVELS = ['None', 'Low', 'Mod', 'High', 'V.High'];
export const levelShort = (v) => SHORT_LEVELS[Math.max(0, Math.min(4, Math.round(v)))];
export const levelClass = (v) => 'lv' + Math.max(0, Math.min(4, Math.round(v)));

const clamp = (v, lo = 0, hi = 4) => Math.max(lo, Math.min(hi, v));

export function dayOfYear(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
}

// Trapezoid: 0 before a, rises to 1 at b, flat to c, falls to 0 at e.
function trapezoid(x, a, b, c, e) {
  if (x <= a || x >= e) return 0;
  if (x < b) return (x - a) / (b - a);
  if (x <= c) return 1;
  return (e - x) / (e - c);
}

// Typical Eastern Ontario pollen seasons (day of year), based on
// long-run Ottawa-area patterns:
//   Trees (maple, elm, birch, poplar, oak): late March – early June, peak late April–mid May
//   Grasses: late May – early August, peak June
//   Weeds (mostly ragweed): early August – first hard frost, peak late August – mid September
const SEASONS = {
  tree:  { a: 78,  b: 112, c: 136, e: 162, peak: 4 },
  grass: { a: 138, b: 155, c: 186, e: 220, peak: 3.2 },
  weed:  { a: 212, b: 230, c: 255, e: 285, peak: 4 },
};

// How the surrounding land changes local pollen/mould relative to a regional average.
// These are informed estimates (ragweed and grass thrive on open farmland and roadsides;
// forests add tree pollen; city cores have less of everything but street trees).
export const LAND_FACTORS = {
  urban:    { tree: 0.9,  grass: 0.8,  weed: 0.7,  mold: 0.75 },
  suburban: { tree: 1.0,  grass: 0.95, weed: 0.9,  mold: 0.9 },
  farm:     { tree: 0.9,  grass: 1.15, weed: 1.3,  mold: 1.2 },   // crop residue, hay, harvest
  mixed:    { tree: 1.1,  grass: 1.05, weed: 1.05, mold: 1.1 },
  forest:   { tree: 1.25, grass: 0.8,  weed: 0.75, mold: 1.05 },
};

// Season profiles for cities outside Eastern Ontario, relative to the Ottawa-area seasons.
//   shift: days later (+) or earlier (−); factor: overall strength; seasons: replace a window entirely
//   moldMonths: replaces the month-by-month mould season; mold: overall mould factor
export const PROFILES = {
  toronto:  { shift: { tree: -6, grass: -5, weed: 0 }, factor: { weed: 0.9 } },
  montreal: { shift: { tree: 2, grass: 2, weed: 0 } },
  // Maritime: later spring, very little ragweed, damp and mild
  halifax:  { shift: { tree: 14, grass: 12, weed: 0 }, factor: { tree: 0.9, weed: 0.35 },
              moldMonths: [0, 0.25, 0.25, 0.35, 0.55, 0.7, 0.85, 0.95, 1, 1, 0.9, 0.6, 0.35] },
  // Prairie foothills: late spring, short season, ragweed rare, dry air keeps mould lower
  calgary:  { shift: { tree: 18, grass: 8, weed: 0 }, factor: { grass: 0.9, weed: 0.25 }, mold: 0.7 },
  // West coast: alder/birch/cedar from February, grass a bit earlier, little ragweed, mild wet winters
  vancouver: { seasons: { tree: { a: 30, b: 55, c: 110, e: 155, peak: 4 } }, shift: { grass: -12, weed: 0 }, factor: { weed: 0.2 },
              moldMonths: [0, 0.45, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1, 0.9, 0.6, 0.45] },
};

/**
 * Estimate pollen for one day from season + weather.
 * day: { date, tmax, tmin, precip, windMax }
 * ctx: { killingFrostBefore, land, lat }
 *   Seasons shift with latitude: roughly 3 days later per 0.5° north of Ottawa
 *   (Pembroke later, Kingston earlier thanks to Lake Ontario).
 */
export function estimatePollen(day, ctx = {}) {
  // Spring seasons (trees, grass) shift with latitude. Ragweed is triggered by day length
  // and ended by frost (handled via the weather), so it isn't shifted.
  const prof = PROFILES[ctx.profile];
  const shift = ctx.lat && !prof ? Math.round((ctx.lat - 45.4) * 6) : 0;
  const doyBase = dayOfYear(day.date);
  const lf = LAND_FACTORS[ctx.land] || LAND_FACTORS.suburban;
  const out = {};
  for (const type of Object.keys(SEASONS)) {
    const s = prof?.seasons?.[type] || SEASONS[type];
    const doy = prof ? doyBase - (prof.shift?.[type] ?? 0) : type === 'weed' ? doyBase : doyBase - shift;
    let v = trapezoid(doy, s.a, s.b, s.c, s.e) * s.peak * (prof?.factor?.[type] ?? 1);
    // Rain washes pollen out of the air.
    if (day.precip >= 8) v *= 0.3;
    else if (day.precip >= 3) v *= 0.55;
    else if (day.precip >= 1) v *= 0.8;
    // Cold days suppress release.
    if (day.tmax != null) {
      if (day.tmax < 5) v *= 0.3;
      else if (day.tmax < 10) v *= 0.6;
      else if (day.tmax < 14 && type !== 'tree') v *= 0.8;
    }
    // Warm, dry and breezy days spread more pollen.
    if (day.precip < 1 && day.windMax >= 20 && day.tmax >= 18) v *= 1.15;
    if (type === 'weed' && ctx.killingFrostBefore) v *= 0.15;
    out[type] = clamp(v * lf[type]);
  }
  out.max = Math.max(out.tree, out.grass, out.weed);
  out.main = Object.entries({ tree: out.tree, grass: out.grass, weed: out.weed })
    .sort((a, b) => b[1] - a[1])[0][0];
  return out;
}

/**
 * Estimate outdoor mould spores (Alternaria, Cladosporium, etc.).
 * day: { date, tmax, tmin, precip, rhMean, rainPrev3, snowDepth }
 */
export function estimateMold(day, ctx = {}) {
  const m = Number(day.date.slice(5, 7));
  const prof = PROFILES[ctx.profile];
  const seasonByMonth = prof?.moldMonths || [0, 0.15, 0.15, 0.3, 0.55, 0.7, 0.85, 1, 1, 1, 0.95, 0.65, 0.3];
  let v = seasonByMonth[m];
  if (day.snowDepth > 0.02) v *= 0.3; // snow cover locks spores down
  const t = day.tmax;
  if (t != null) {
    if (t < 2) v *= 0.2;
    else if (t < 8) v *= 0.5;
    else if (t < 14) v *= 0.8;
    else if (t > 32) v *= 0.9;
  }
  const rh = day.rhMean ?? 70;
  if (rh < 45) v *= 0.7;
  else if (rh < 60) v *= 0.9;
  else if (rh >= 85) v *= 1.3;
  else if (rh >= 72) v *= 1.15;
  // A downpour washes the common outdoor spores (Alternaria, Cladosporium) out of the air;
  // they rebound in the days after, which rainPrev3 captures.
  if (day.precip >= 10) v *= 0.55;
  else if (day.precip >= 5) v *= 0.7;
  if ((day.rainPrev3 ?? 0) >= 10) v *= 1.2;
  else if ((day.rainPrev3 ?? 0) >= 3) v *= 1.1;
  // Fall leaf litter is a big spore source in Eastern Ontario.
  const doy = dayOfYear(day.date);
  if (doy >= 265 && doy <= 315 && t >= 5) v *= 1.1;
  // Scaled so a typical warm, humid fall day lands around High,
  // and only damp, mild days after rain reach Very high.
  return clamp(v * 2.4 * (LAND_FACTORS[ctx.land] || LAND_FACTORS.suburban).mold * (prof?.mold ?? 1));
}

// Canada's AQHI formula (Stieb et al. 2008) using 3-hour averages.
// no2 & o3 in µg/m³ (converted to ppb), pm25 in µg/m³.
export function aqhiFromConcentrations(no2ug, o3ug, pm25) {
  if ([no2ug, o3ug, pm25].some((v) => v == null || Number.isNaN(v))) return null;
  const no2 = no2ug / 1.88, o3 = o3ug / 1.96;
  const v = (1000 / 10.4) * ((Math.exp(0.000871 * no2) - 1) + (Math.exp(0.000537 * o3) - 1) + (Math.exp(0.000487 * pm25) - 1));
  return Math.max(1, Math.round(v));
}

export function aqhiRisk(v) {
  if (v == null) return { label: 'No data', cls: 'lv0' };
  if (v <= 3) return { label: 'Low risk', cls: 'aq-low' };
  if (v <= 6) return { label: 'Moderate risk', cls: 'aq-mod' };
  if (v <= 10) return { label: 'High risk', cls: 'aq-high' };
  return { label: 'Very high risk', cls: 'aq-vhigh' };
}
export const aqhiText = (v) => (v == null ? '–' : v > 10 ? '10+' : String(v));

// Overall allergy outlook on the same 0–4 scale.
export function outlook(pollenMax, mold, aqhi, farm = 0) {
  // Farm dust and ammonia are asthma triggers, weighted a little below pollen/mould
  // because they're the least certain estimate.
  // Worst trigger, plus a little for a second one at the same time
  // (e.g. ragweed + mould + harvest dust together is worse than any one alone).
  const t = [pollenMax, mold, farm * 0.85].sort((x, y) => y - x);
  let s = t[0] + 0.15 * t[1];
  if (aqhi != null) {
    if (aqhi >= 7) s = Math.max(s, 3);
    else if (aqhi >= 4) s = Math.min(4, s + 0.5);
  }
  return clamp(s);
}

export const POLLEN_NAMES = { tree: 'Tree', grass: 'Grass', weed: 'Weed / ragweed' };

// ---------------- Farm activity (Eastern Ontario farm calendar) ----------------
// What field work is typically happening, and what it puts in the air. None of this is
// in the official AQHI, which only counts ozone, fine particles and nitrogen dioxide.
export const FARM_STAGES = [
  { to: 74,  base: 0.2, name: 'Winter', what: 'Fields are frozen or snow-covered, with little farm activity.' },
  { to: 115, base: 1.8, name: 'Spring thaw & manure spreading', what: 'Manure spreading releases ammonia and odours, and thawing fields start to dry and blow.' },
  { to: 151, base: 2.4, name: 'Tillage & planting', what: 'Working dry fields raises soil dust, especially on windy days.' },
  { to: 181, base: 2.6, name: 'First-cut hay', what: 'Cutting and baling hay stirs up grass pollen and mould spores.' },
  { to: 212, base: 2.4, name: 'Hay & winter wheat harvest', what: 'Second-cut hay and the wheat harvest add grain dust and spores.' },
  { to: 257, base: 2.0, name: 'Late-summer haying', what: 'More hay cutting and field work, and ragweed thrives along field edges and ditches.' },
  { to: 314, base: 3.3, name: 'Soybean & corn harvest', what: 'Combines release grain dust and fungal spores; fall tillage and manure spreading follow.' },
  { to: 334, base: 1.8, name: 'Late harvest & fall manure', what: 'The last corn comes off and manure is spread before freeze-up.' },
  { to: 366, base: 0.2, name: 'Winter', what: 'Fields are frozen or snow-covered, with little farm activity.' },
];
const FARM_LAND = { farm: 1, mixed: 0.7, suburban: 0.3, urban: 0.12, forest: 0.2 };

/** day: { date, tmax, precip, windMax, snowDepth }; ctx: { land, profile } */
export function estimateFarm(day, ctx = {}) {
  const doy = dayOfYear(day.date);
  const stage = FARM_STAGES.find((s) => doy <= s.to);
  let v = stage.base;
  const notes = [];
  if (day.snowDepth > 0.02) { v *= 0.2; }
  else if (day.precip >= 3) { v *= 0.45; notes.push('Rain is keeping dust down and fieldwork paused.'); }
  else if (day.precip >= 1) { v *= 0.75; }
  else if (day.windMax >= 20) { v *= 1.25; notes.push('Dry and windy: field dust travels farther today.'); }
  if (day.tmax != null && day.tmax < 0) v *= 0.5;
  // Other provinces' farm calendars differ; only Eastern Ontario is modelled.
  const landF = ctx.profile ? 0.12 : (FARM_LAND[ctx.land] ?? 0.3);
  return { level: clamp(v * landF), stage, notes, modelled: !ctx.profile };
}
