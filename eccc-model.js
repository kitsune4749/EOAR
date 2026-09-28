// Environment and Climate Change Canada's regional air quality systems (10 km grid):
//   RDAQA  – Regional Deterministic Air Quality Analysis: blends station readings
//            with the model, hourly, ~2 h behind real time. Used for "now".
//   RAQDPS – Regional Air Quality Deterministic Prediction System (includes FireWork
//            wildfire smoke). Hourly forecast ~3 days ahead. Used for forecast days.
// Each request returns the whole Eastern Ontario grid as plain text (~10 KB), and we
// immediately sample it at every community so the cache stays tiny.
import { COMMUNITIES } from './communities.js';
import { aqhiFromConcentrations } from './models.js';

const GEOMET = 'https://geo.weather.gc.ca/geomet';
const BBOX = 'subset=lat(43.8,46.4)&subset=lon(-78.3,-74.1)'; // Eastern Ontario
// Montréal has an official AQHI forecast but no live station reading, so its "now"
// value also comes from the analysis grid (a small extra box).
const EXTRA_NOW_BOXES = ['subset=lat(45.2,45.8)&subset=lon(-74.0,-73.2)'];
const TZ = 'America/Toronto';
const PREFIX = 'eoar4_cache:grid2:'; // v2: sampled at areas
const ANALYSIS = { pm25: 'RDAQA-FW_10km_PM2.5', o3: 'RDAQA_10km_O3', no2: 'RDAQA_10km_NO2' };
const FORECAST = { pm25: 'RAQDPS.SFC_PM2.5', o3: 'RAQDPS.SFC_O3', no2: 'RAQDPS.SFC_NO2' };
const LOCAL_HOURS = [8, 11, 14, 17, 20]; // forecast sample times (local), covers morning, afternoon ozone peak and evening

function readCache(key, ttl) {
  try { const v = JSON.parse(localStorage.getItem(PREFIX + key)); return v && Date.now() - v.t < ttl ? v.data : null; } catch { return null; }
}
function writeCache(key, data) { try { localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), data })); } catch {} }

async function fetchText(url, timeout = 15000) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeout);
  try { const r = await fetch(url, { signal: ctrl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  finally { clearTimeout(timer); }
}

// Time dimension of a layer: { def, start, end, ref }
async function layerTimes(layer, force) {
  const key = 'caps:' + layer;
  if (!force) { const c = readCache(key, 20 * 60 * 1000); if (c) return c; }
  const xml = await fetchText(`${GEOMET}?service=WMS&version=1.3.0&request=GetCapabilities&layer=${encodeURIComponent(layer)}`);
  const dim = (name) => {
    const m = xml.match(new RegExp(`<Dimension[^>]*name="${name}"[^>]*default="([^"]+)"[^>]*>([^<]+)</Dimension>`));
    return m ? { def: m[1], range: m[2].split('/') } : null;
  };
  const t = dim('time'); if (!t) throw new Error('no time dimension');
  const ref = dim('reference_time');
  const out = { def: t.def, start: t.range[0], end: t.range[1], ref: ref?.def || null };
  writeCache(key, out);
  return out;
}

// Parse an ESRI ASCII grid (possibly wrapped in a multipart response) and sample every community.
function sampleGrid(text, scale) {
  // Communities outside the returned grid are left out (never wrapped into a wrong cell).
  const i = text.indexOf('ncols'); if (i < 0) throw new Error('not a grid');
  const lines = text.slice(i).split('--wcs')[0].trim().split(/\r?\n/);
  const h = {}; let k = 0;
  for (; k < lines.length; k++) { const m = lines[k].trim().match(/^([a-zA-Z_]+)\s+(\S+)$/); if (!m) break; h[m[1].toLowerCase()] = Number(m[2]); }
  const vals = lines.slice(k).join(' ').trim().split(/\s+/).map(Number);
  const dx = h.dx ?? h.cellsize, dy = h.dy ?? h.cellsize;
  const out = {};
  for (const c of COMMUNITIES) {
    const col = Math.floor((c.lon - h.xllcorner) / dx);
    const row = h.nrows - 1 - Math.floor((c.lat - h.yllcorner) / dy);
    if (col < 0 || col >= h.ncols || row < 0 || row >= h.nrows) continue;
    const v = vals[row * h.ncols + col];
    out[c.id] = v == null || Number.isNaN(v) || v === h.nodata_value || v < 0 ? null : Math.round(v * scale * 100) / 100;
  }
  return out;
}

// PM2.5 comes in kg/m³ → µg/m³ (×1e9). O3/NO2 come in mol/mol → ppb (×1e9).
async function grid(coverage, time, ref, force, box = BBOX) {
  const key = `${coverage}|${time}|${ref || ''}|${box === BBOX ? '' : box}`;
  if (!force) { const c = readCache(key, (ref ? 3 : 1) * 3600 * 1000); if (c) return c; }
  const url = `${GEOMET}?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${encodeURIComponent(coverage)}&${box}&format=image/x-aaigrid&time=${time}${ref ? '&dim_reference_time=' + ref : ''}`;
  const data = sampleGrid(await fetchText(url), 1e9);
  writeCache(key, data);
  return data;
}

async function pool(tasks, n = 6) {
  const results = new Array(tasks.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < tasks.length) { const my = i++; try { results[my] = await tasks[my](); } catch { results[my] = null; } }
  }));
  return results;
}

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const localDate = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });
const localHour = (ms) => Number(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)));
function localToUtcMs(dateStr, hour) {
  const [y, m, d] = dateStr.split('-').map(Number);
  for (const off of [4, 5]) { const ms = Date.UTC(y, m - 1, d, hour + off); if (localHour(ms) === hour && localDate(ms) === dateStr) return ms; }
  return Date.UTC(y, m - 1, d, hour + 5);
}

function aqhiAll(pm, o3, no2) {
  const out = {};
  for (const c of COMMUNITIES) {
    // aqhiFromConcentrations takes µg/m³ for NO2/O3; convert back from ppb.
    const v = [pm?.[c.id], o3?.[c.id], no2?.[c.id]];
    out[c.id] = v.some((x) => x == null) ? null : aqhiFromConcentrations(v[2] * 1.88, v[1] * 1.96, v[0]);
  }
  return out;
}

/** Current AQHI for every community from the analysis (3-hour average, as the AQHI requires). */
export async function getLocalNow({ force } = {}) {
  const caps = await layerTimes(ANALYSIS.o3, force);
  const latest = Date.parse(caps.def);
  const times = [0, 1, 2].map((h) => iso(latest - h * 3600e3)).filter((t) => Date.parse(t) >= Date.parse(caps.start));
  const jobs = [];
  for (const box of [BBOX, ...EXTRA_NOW_BOXES]) {
    for (const t of times) for (const k of ['pm25', 'o3', 'no2']) jobs.push(() => grid(ANALYSIS[k], t, null, force, box).then((g) => ({ t, k, g })));
  }
  const res = (await pool(jobs)).filter(Boolean);
  if (!res.length) throw new Error('analysis unavailable');
  const avg = (k) => {
    const gs = res.filter((r) => r.k === k).map((r) => r.g); const out = {};
    for (const c of COMMUNITIES) { const v = gs.map((g) => g[c.id]).filter((x) => x != null); out[c.id] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
    return out;
  };
  const pm = avg('pm25'), o3 = avg('o3'), no2 = avg('no2');
  return { aqhi: aqhiAll(pm, o3, no2), pollutants: { pm, o3, no2 }, time: caps.def, fetchedAt: Date.now() };
}

/** Daily maximum AQHI for every community from the regional forecast (~3 days). */
export async function getLocalForecast({ force } = {}) {
  const caps = await layerTimes(FORECAST.o3, force);
  const start = Math.max(Date.parse(caps.start), Date.now() - 3600e3), end = Date.parse(caps.end);
  const dates = [0, 1, 2, 3].map((d) => localDate(Date.now() + d * 86400e3));
  const times = [];
  for (const d of dates) for (const h of LOCAL_HOURS) { const ms = localToUtcMs(d, h); if (ms >= start && ms <= end) times.push({ date: d, t: iso(ms) }); }
  // Make sure "today" has at least one sample even late in the evening.
  if (!times.some((x) => x.date === dates[0])) { const ms = Math.ceil(start / 3600e3) * 3600e3; if (ms <= end && localDate(ms) === dates[0]) times.unshift({ date: dates[0], t: iso(ms) }); }
  const jobs = [];
  for (const { date, t } of times) for (const k of ['pm25', 'o3', 'no2']) jobs.push(() => grid(FORECAST[k], t, caps.ref, force).then((g) => ({ date, t, k, g })));
  const res = (await pool(jobs)).filter(Boolean);
  if (!res.length) throw new Error('forecast unavailable');
  const daily = {}; // id -> date -> max AQHI
  for (const { date, t } of times) {
    const pick = (k) => res.find((r) => r.t === t && r.k === k)?.g;
    const a = aqhiAll(pick('pm25'), pick('o3'), pick('no2'));
    for (const [id, v] of Object.entries(a)) {
      if (v == null) continue;
      daily[id] ||= {};
      daily[id][date] = Math.max(daily[id][date] ?? 0, v);
    }
  }
  return { daily, ref: caps.ref, fetchedAt: Date.now() };
}
