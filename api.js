// Data fetching with a small localStorage cache so the app works offline
// and doesn't hammer the free APIs.
import { distanceKm } from './communities.js';
import { CONFIG } from '../config.js';

const TZ = 'America/Toronto';
const CACHE_PREFIX = 'eoar4_cache:';
const TTL_MS = 30 * 60 * 1000;

function readCache(key) {
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + key)); } catch { return null; }
}
function writeCache(key, data) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), data })); }
  catch { pruneCache(); }
}
export function pruneCache() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => {
      const v = readCache(k.slice(CACHE_PREFIX.length));
      if (!v || Date.now() - v.t > 24 * 3600 * 1000) localStorage.removeItem(k);
    });
  } catch {}
}

// Returns { data, fetchedAt, stale }. Falls back to cached data if offline.
async function cachedJson(url, { force = false, timeout = 15000 } = {}) {
  const cached = readCache(url);
  if (!force && cached && Date.now() - cached.t < TTL_MS) return { data: cached.data, fetchedAt: cached.t, stale: false };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    writeCache(url, data);
    return { data, fetchedAt: Date.now(), stale: false };
  } catch (err) {
    if (cached) return { data: cached.data, fetchedAt: cached.t, stale: true };
    throw err;
  } finally { clearTimeout(timer); }
}

const r4 = (n) => Number(n).toFixed(4);
const asList = (d) => (Array.isArray(d) ? d : [d]);

// ---------- Weather (Open-Meteo, free, no key) ----------
export async function getWeather(places, { force, pastDays = 40, forecastDays = 7 } = {}) {
  const q = new URLSearchParams({
    latitude: places.map((p) => r4(p.lat)).join(','),
    longitude: places.map((p) => r4(p.lon)).join(','),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean',
    hourly: 'snow_depth',
    past_hours: '0',
    forecast_hours: '1',
    past_days: String(pastDays),
    forecast_days: String(forecastDays),
    timezone: TZ,
  });
  const r = await cachedJson(`https://api.open-meteo.com/v1/forecast?${q}`, { force });
  return { ...r, data: asList(r.data) };
}

// ---------- Air quality model (Open-Meteo / CAMS), used for AQHI forecast + fallback ----------
export async function getAirModel(places, { force, forecastDays = 5 } = {}) {
  const q = new URLSearchParams({
    latitude: places.map((p) => r4(p.lat)).join(','),
    longitude: places.map((p) => r4(p.lon)).join(','),
    hourly: 'pm2_5,nitrogen_dioxide,ozone',
    past_days: '1',
    forecast_days: String(forecastDays),
    timezone: TZ,
  });
  const r = await cachedJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}`, { force });
  return { ...r, data: asList(r.data) };
}

// ---------- Official AQHI (Environment and Climate Change Canada) ----------
const ECCC = 'https://api.weather.gc.ca/collections';
const BBOX = '-78.3,43.8,-74.1,46.4'; // Eastern Ontario + margin

const pick = (o, ...keys) => { for (const k of keys) if (o?.[k] != null) return o[k]; return undefined; };

function stationFrom(f) {
  const p = f.properties || {};
  const [lon, lat] = f.geometry?.coordinates || [pick(p, 'longitude', 'lon'), pick(p, 'latitude', 'lat')];
  return {
    id: pick(p, 'location_id', 'location_name_en', 'location_name') || `${lat},${lon}`,
    name: pick(p, 'location_name_en', 'location_name', 'name') || 'AQHI station',
    lat: Number(lat), lon: Number(lon),
    aqhi: p.aqhi != null ? Number(p.aqhi) : null,
  };
}

export async function getOfficialAqhi({ force } = {}) {
  const obsUrl = `${ECCC}/aqhi-observations-realtime/items?f=json&lang=en&bbox=${BBOX}&sortby=-observation_datetime&limit=200`;
  const fcUrl = `${ECCC}/aqhi-forecasts-realtime/items?f=json&lang=en&bbox=${BBOX}&sortby=-publication_datetime&limit=500`;
  const [obsR, fcR] = await Promise.allSettled([cachedJson(obsUrl, { force }), cachedJson(fcUrl, { force })]);

  const stations = new Map();
  if (obsR.status === 'fulfilled') {
    for (const f of obsR.value.data.features || []) {
      const s = stationFrom(f);
      const time = f.properties?.observation_datetime;
      if (s.aqhi == null || !Number.isFinite(s.lat)) continue;
      const prev = stations.get(s.id);
      if (!prev || (time && time > prev.obsTime)) stations.set(s.id, { ...s, obsTime: time, forecast: {} });
    }
  }
  if (fcR.status === 'fulfilled') {
    // Keep only the latest publication for each location, then take the daily max.
    const latestPub = new Map();
    const feats = fcR.value.data.features || [];
    for (const f of feats) {
      const s = stationFrom(f); const pub = f.properties?.publication_datetime || '';
      if (!latestPub.has(s.id) || pub > latestPub.get(s.id)) latestPub.set(s.id, pub);
    }
    for (const f of feats) {
      const s = stationFrom(f); const p = f.properties || {};
      if (s.aqhi == null || (p.publication_datetime || '') !== latestPub.get(s.id)) continue;
      const when = p.forecast_datetime ? new Date(p.forecast_datetime) : null;
      if (!when || Number.isNaN(+when)) continue;
      const date = when.toLocaleDateString('en-CA', { timeZone: TZ });
      if (!stations.has(s.id)) stations.set(s.id, { ...s, aqhi: null, obsTime: null, forecast: {} });
      const st = stations.get(s.id);
      st.forecast[date] = Math.max(st.forecast[date] ?? 0, s.aqhi);
    }
  }
  if (!stations.size && obsR.status === 'rejected' && fcR.status === 'rejected') throw obsR.reason;
  const fetchedAt = obsR.status === 'fulfilled' ? obsR.value.fetchedAt : Date.now();
  return { stations: [...stations.values()], fetchedAt };
}

export function nearestStation(stations, lat, lon, maxKm = 70) {
  let best = null;
  for (const s of stations) {
    const km = distanceKm(lat, lon, s.lat, s.lon);
    if (km <= maxKm && (!best || km < best.km)) best = { ...s, km };
  }
  return best;
}

// ---------- Optional: Google Pollen API (needs a key in config.js) ----------
export async function getGooglePollen(place, { force } = {}) {
  if (!CONFIG.GOOGLE_POLLEN_KEY) return null;
  const q = new URLSearchParams({
    key: CONFIG.GOOGLE_POLLEN_KEY,
    'location.latitude': r4(place.lat), 'location.longitude': r4(place.lon),
    days: '5', languageCode: 'en', plantsDescription: 'false',
  });
  const r = await cachedJson(`https://pollen.googleapis.com/v1/forecast:lookup?${q}`, { force });
  const byDate = {};
  for (const d of r.data.dailyInfo || []) {
    const date = `${d.date.year}-${String(d.date.month).padStart(2, '0')}-${String(d.date.day).padStart(2, '0')}`;
    const v = {};
    for (const t of d.pollenTypeInfo || []) {
      const key = { TREE: 'tree', GRASS: 'grass', WEED: 'weed' }[t.code];
      // Google's index is 0–5; map to our 0–4 scale.
      if (key) v[key] = t.indexInfo ? Math.min(4, t.indexInfo.value * 0.8) : 0;
    }
    byDate[date] = v;
  }
  return byDate;
}
