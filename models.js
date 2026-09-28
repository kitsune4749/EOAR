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

/**
 * Estimate pollen for one day from season + weather.
 * day: { date, tmax, tmin, precip, windMax }
 * ctx: { killingFrostBefore: boolean } — hard frost already happened this fall
 */
export function estimatePollen(day, ctx = {}) {
  const doy = dayOfYear(day.date);
  const out = {};
  for (const [type, s] of Object.entries(SEASONS)) {
    let v = trapezoid(doy, s.a, s.b, s.c, s.e) * s.peak;
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
    out[type] = clamp(v);
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
export function estimateMold(day) {
  const m = Number(day.date.slice(5, 7));
  const seasonByMonth = [0, 0.15, 0.15, 0.3, 0.55, 0.7, 0.85, 1, 1, 1, 0.95, 0.65, 0.3];
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
  if ((day.rainPrev3 ?? 0) >= 10) v *= 1.2;
  else if ((day.rainPrev3 ?? 0) >= 3) v *= 1.1;
  // Fall leaf litter is a big spore source in Eastern Ontario.
  const doy = dayOfYear(day.date);
  if (doy >= 265 && doy <= 315 && t >= 5) v *= 1.1;
  // Scaled so a typical warm, humid fall day lands around High,
  // and only damp, mild days after rain reach Very high.
  return clamp(v * 2.4);
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
export function outlook(pollenMax, mold, aqhi) {
  let s = Math.max(pollenMax, mold);
  if (aqhi != null) {
    if (aqhi >= 7) s = Math.max(s, 3);
    else if (aqhi >= 4) s = Math.min(4, s + 0.5);
  }
  return clamp(s);
}

export const POLLEN_NAMES = { tree: 'Tree', grass: 'Grass', weed: 'Weed / ragweed' };
