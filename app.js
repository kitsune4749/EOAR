import { CONFIG } from './config.js';
import { COMMUNITIES, REGIONS, HOME_AREAS, byId, nearestCommunity, LAND_LABELS, coversText } from './communities.js';
import { getLocalNow, getLocalForecast } from './eccc-model.js';
import { getWeather, getAirModel, getOfficialAqhi, nearestStation, getGooglePollen, pruneCache } from './api.js';
import {
  estimatePollen, estimateMold, estimateFarm, aqhiFromConcentrations, aqhiRisk, aqhiText,
  outlook, levelName, levelShort, levelClass, POLLEN_NAMES,
} from './models.js';

// ---------------- helpers ----------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// The person's own time zone for journal dates; each area has its own for forecasts.
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto'; } catch { return 'America/Toronto'; } })();
const todayStr = (tz = TZ) => new Date().toLocaleDateString('en-CA', { timeZone: tz });
const nowHourStr = (tz = TZ) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
};
const dayLabel = (date, tz = TZ) => {
  if (date === todayStr(tz)) return 'Today';
  const d = new Date(date + 'T12:00:00');
  const tomorrow = new Date(todayStr(tz) + 'T12:00:00'); tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-CA', { weekday: 'long' });
};
const shortDate = (date) => new Date(date + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
const round1 = (n) => Math.round(n * 10) / 10;

const WMO = {
  0: ['Clear', '☀️'], 1: ['Mostly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Cloudy', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Freezing fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'], 56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'], 66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'],
  80: ['Showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Heavy showers', '⛈️'], 85: ['Snow showers', '🌨️'], 86: ['Snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm', '⛈️'], 99: ['Thunderstorm', '⛈️'],
};
const wx = (code) => WMO[code] || ['–', '🌡️'];

// ---------------- storage ----------------
const KEYS = { settings: 'eoar4_settings', journal: 'eoar4_journal', shots: 'eoar4_shots' };
const load = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { toast('Could not save — phone storage may be full.'); return false; } };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const settings = Object.assign({
  communityId: CONFIG.DEFAULT_COMMUNITY,
  favourites: CONFIG.DEFAULT_FAVOURITES,
  shotIntervalDays: 7,
  view: 'today',
}, load(KEYS.settings, {}));
// Map any old town IDs (before towns were grouped into areas) to their area.
settings.communityId = (byId(settings.communityId) || byId(CONFIG.DEFAULT_COMMUNITY)).id;
settings.favourites = [...new Set((settings.favourites || []).map((f) => byId(f)?.id).filter(Boolean))];
const saveSettings = () => save(KEYS.settings, settings);

// Bring over entries from the earlier (Beta 3.0) version if they exist on this device.
function migrateOld() {
  if (localStorage.getItem(KEYS.journal) || localStorage.getItem(KEYS.shots)) return;
  const oldJ = load('eoar3_journal', []), oldS = load('eoar3_shots', []);
  if (!oldJ.length && !oldS.length) return;
  const nameToId = (n) => (COMMUNITIES.find((c) => c.name === n || c.name.startsWith(n) || c.covers.some((x) => x.name === n)) || {}).id || CONFIG.DEFAULT_COMMUNITY;
  save(KEYS.journal, oldJ.map((e) => ({ id: uid(), date: e.date, communityId: nameToId(e.community), severity: null, symptoms: [], meds: '', notes: e.notes || '' })));
  save(KEYS.shots, oldS.map((s) => ({ id: uid(), date: s.date || '', arm: '', vial: '', dose: '', reaction: s.reaction ?? '', notes: '' })));
}

// ---------------- state ----------------
const state = { current: null, compare: null, loading: false, region: null, regionLoading: false, stations: null, local: null, map: null, mapView: null };

// Environment Canada's 10 km analysis/forecast, shared by all communities.
async function loadLocal(force) {
  const [n, f] = await Promise.allSettled([getLocalNow({ force }), getLocalForecast({ force })]);
  state.local = { now: n.status === 'fulfilled' ? n.value : state.local?.now || null, fc: f.status === 'fulfilled' ? f.value : state.local?.fc || null };
  return state.local;
}

// ---------------- data assembly ----------------
function hourlyAqhi(air) {
  const h = air?.hourly; if (!h?.time) return { byHour: {}, dailyMax: {} };
  const byHour = {}, dailyMax = {};
  for (let i = 2; i < h.time.length; i++) {
    const avg = (arr) => { const v = [arr[i], arr[i - 1], arr[i - 2]]; return v.some((x) => x == null) ? null : (v[0] + v[1] + v[2]) / 3; };
    const a = aqhiFromConcentrations(avg(h.nitrogen_dioxide), avg(h.ozone), avg(h.pm2_5));
    if (a == null) continue;
    byHour[h.time[i]] = a;
    const d = h.time[i].slice(0, 10);
    dailyMax[d] = Math.max(dailyMax[d] ?? 0, a);
  }
  return { byHour, dailyMax };
}

function buildDays(w, c) {
  const d = w.daily;
  const snow = w.hourly?.snow_depth?.[0] ?? 0;
  const days = [];
  let frost = false;
  for (let i = 0; i < d.time.length; i++) {
    const date = d.time[i];
    const rainPrev3 = [1, 2, 3].reduce((s, k) => s + (d.precipitation_sum[i - k] ?? 0), 0);
    const day = {
      date, code: d.weather_code[i], tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i],
      precip: d.precipitation_sum[i] ?? 0, pop: d.precipitation_probability_max?.[i],
      windMax: d.wind_speed_10m_max[i] ?? 0, rhMean: d.relative_humidity_2m_mean?.[i], rainPrev3, snowDepth: snow,
    };
    day.pollen = estimatePollen(day, { killingFrostBefore: frost, land: c.land, lat: c.lat, profile: c.profile });
    day.mold = estimateMold(day, { land: c.land, profile: c.profile });
    day.farm = estimateFarm(day, { land: c.land, profile: c.profile });
    if (Number(date.slice(5, 7)) >= 8 && day.tmin != null && day.tmin <= -2) frost = true;
    days.push(day);
  }
  return days;
}

function assemble(community, weatherR, airR, stations, gPollen, local) {
  const w = weatherR?.data?.[0];
  const air = airR?.data?.[0];
  const aq = hourlyAqhi(air);
  const station = stations ? nearestStation(stations.filter((x) => x.aqhi != null), community.lat, community.lon) : null;
  const fcStation = stations ? nearestStation(stations.filter((x) => Object.keys(x.forecast || {}).length), community.lat, community.lon) : null;
  const fresh = station?.obsTime && Date.now() - new Date(station.obsTime) < 4 * 3600 * 1000;

  // Best source first: a station in town (≤15 km) → Environment Canada's 10 km analysis
  // for this exact spot → a more distant station → the coarse global model.
  const id = community.id;
  const localNow = local?.now?.aqhi?.[id];
  const p = local?.now?.pollutants;
  const pollutants = p && p.pm[id] != null ? { pm: p.pm[id], o3: p.o3[id], no2: p.no2[id], pm10: p.pm10?.[id] ?? null } : null;
  let aqNow = null;
  if (station && station.aqhi != null && fresh && station.km <= 15) aqNow = { value: station.aqhi, source: 'official', station, pollutants };
  else if (localNow != null) aqNow = { value: localNow, source: 'local', station: fresh ? station : null, pollutants };
  else if (station && station.aqhi != null && fresh) aqNow = { value: station.aqhi, source: 'official', station };
  else if (aq.byHour[nowHourStr(community.tz)] != null) aqNow = { value: aq.byHour[nowHourStr(community.tz)], source: 'model' };

  const allDays = w ? buildDays(w, community) : [];
  const days = allDays.filter((d) => d.date >= todayStr(community.tz));
  for (const day of allDays) {
    if (gPollen?.[day.date]) {
      const g = gPollen[day.date];
      day.pollen = { tree: g.tree ?? 0, grass: g.grass ?? 0, weed: g.weed ?? 0 };
      day.pollen.max = Math.max(day.pollen.tree, day.pollen.grass, day.pollen.weed);
      day.pollen.main = Object.entries({ tree: day.pollen.tree, grass: day.pollen.grass, weed: day.pollen.weed }).sort((a, b) => b[1] - a[1])[0][0];
      day.pollenSource = 'google';
    } else day.pollenSource = 'estimate';
    const off = fcStation?.forecast?.[day.date];
    const loc = local?.fc?.daily?.[id]?.[day.date];
    if (off != null && fcStation.km <= 15) { day.aqhi = off; day.aqhiSource = 'official'; }
    else if (loc != null) { day.aqhi = loc; day.aqhiSource = 'local'; }
    else if (off != null) { day.aqhi = off; day.aqhiSource = 'official'; }
    else { day.aqhi = aq.dailyMax[day.date] ?? null; day.aqhiSource = day.aqhi != null ? 'model' : null; }
    day.outlook = outlook(day.pollen.max, day.mold, day.aqhi, day.farm.level);
  }
  if (days[0] && aqNow) days[0].outlook = outlook(days[0].pollen.max, days[0].mold, Math.max(aqNow.value, days[0].aqhi ?? 0), days[0].farm.level);

  const fetchedAt = Math.min(...[weatherR?.fetchedAt, airR?.fetchedAt].filter(Boolean));
  const stale = !!(weatherR?.stale || airR?.stale);
  return { community, current: w?.current, days, allDays, aqNow, station, fetchedAt, stale };
}

// Rural and small-town areas are compared with downtown Ottawa on the Today screen.
const CITY_COMPARE = 'ottawa';
const wantsCompare = (c) => !c.far && c.id !== CITY_COMPARE && c.land !== 'urban';

async function refresh(force = false) {
  const community = byId(settings.communityId);
  const places = wantsCompare(community) ? [community, byId(CITY_COMPARE)] : [community];
  state.loading = true; render(true);
  const [weatherR, airR, offR, gR, locR] = await Promise.allSettled([
    getWeather(places, { force }),
    getAirModel(places, { force }),
    getOfficialAqhi({ force }),
    getGooglePollen(community, { force }),
    loadLocal(force),
  ]);
  if (offR.status === 'fulfilled') state.stations = offR.value.stations;
  const part = (r, i) => (r.status === 'fulfilled' && r.value.data[i] ? { ...r.value, data: [r.value.data[i]] } : null);
  if (weatherR.status === 'rejected' && airR.status === 'rejected') {
    state.current = { community, error: true };
    state.compare = null;
  } else {
    state.current = assemble(community, part(weatherR, 0), part(airR, 0),
      state.stations, gR.status === 'fulfilled' ? gR.value : null, state.local);
    state.current.officialOk = offR.status === 'fulfilled' || !!state.local?.now;
    state.compare = places[1] && part(weatherR, 1) ? assemble(places[1], part(weatherR, 1), part(airR, 1), state.stations, null, state.local) : null;
  }
  state.loading = false; render(true);
}

async function loadRegion(force = false) {
  if (state.regionLoading) return;
  state.regionLoading = true; render(true);
  try {
    const [wR, aR, offR] = await Promise.allSettled([
      getWeather(COMMUNITIES, { force, pastDays: 40, forecastDays: 1 }),
      getAirModel(COMMUNITIES, { force, forecastDays: 1 }),
      state.stations ? Promise.resolve({ stations: state.stations }) : getOfficialAqhi({ force }),
      state.local?.now && !force ? Promise.resolve(state.local) : loadLocal(force),
    ]);
    if (wR.status === 'rejected') throw wR.reason;
    if (offR.status === 'fulfilled') state.stations = offR.value.stations;
    state.region = COMMUNITIES.map((c, i) => assemble(c,
      { data: [wR.value.data[i]], fetchedAt: wR.value.fetchedAt, stale: wR.value.stale },
      aR.status === 'fulfilled' ? { data: [aR.value.data[i]], fetchedAt: aR.value.fetchedAt } : null,
      state.stations, null, state.local));
  } catch { state.region = 'error'; }
  state.regionLoading = false; render(true);
}

// ---------------- rendering ----------------
function levelPill(v, label) {
  return `<span class="pill ${levelClass(v)}">${esc(label ?? levelName(v))}</span>`;
}
const shortPill = (v) => `<span class="pill ${levelClass(v)}" title="${levelName(v)}">${levelShort(v)}</span>`;
function aqPill(v) { const r = aqhiRisk(v); return `<span class="pill ${r.cls}">${aqhiText(v)}</span>`; }
function bar(v) { return `<div class="bar"><div class="fill ${levelClass(v)}" style="width:${Math.max(4, (v / 4) * 100)}%"></div></div>`; }

function summarySentence(day, aqNow) {
  const parts = [];
  const p = day.pollen;
  if (p.max >= 1.5) parts.push(`${POLLEN_NAMES[p.main].toLowerCase()} pollen is ${levelName(p.max).toLowerCase()}`);
  else parts.push('pollen is low');
  if (day.mold >= 1.5) parts.push(`mould spores are ${levelName(day.mold).toLowerCase()}`);
  if (day.farm?.level >= 1.5) parts.push(`farm dust is ${levelName(day.farm.level).toLowerCase()} (${day.farm.stage.name.toLowerCase()})`);
  const a = aqNow?.value ?? day.aqhi;
  if (a != null && a >= 4) parts.push(`air quality is ${aqhiRisk(a).label.toLowerCase()}`);
  let s = parts.join(', ');
  s = s.charAt(0).toUpperCase() + s.slice(1) + '.';
  return s;
}

function tips(day, aqNow) {
  const t = [];
  const a = aqNow?.value ?? day.aqhi;
  if (day.pollen.max >= 2.5) t.push('Keep windows closed and run A/C or an air purifier if you have one.', 'Shower and change clothes after time outdoors.');
  if (day.pollen.main === 'weed' && day.pollen.max >= 1.5) t.push('Ragweed peaks in the morning; plan outdoor time for later in the day.');
  if (day.mold >= 2.5) t.push('Avoid raking or handling leaves, compost and mulch, or wear a mask.', 'Mould spores rise after rain and on humid evenings.');
  if (day.farm?.level >= 2.5) t.push('Keep windows closed when combines, balers or manure spreaders are working nearby.', 'Wear an N95 mask for yard or field work, and keep your rescue inhaler handy.');
  if (a != null && a >= 7) t.push('Air quality is poor: reduce strenuous outdoor activity, especially with asthma.');
  else if (a != null && a >= 4) t.push('If you have asthma or heart or lung conditions, consider easing off hard outdoor exercise.');
  if (!t.length) t.push('A good day to be outside. Conditions are low for most allergy sufferers.');
  return t.slice(0, 5);
}

function farmCard(s, day) {
  const f = day.farm;
  if (!f || s.community.far) return '';
  return `<section class="card est-card">
      <div class="tile-h">Farm activity <span class="badge est">Estimate</span> <button class="info" data-info="farm" aria-label="About farm activity">?</button></div>
      <div class="prow"><span><b>${esc(f.stage.name)}</b></span>${levelPill(f.level)}</div>${bar(f.level)}
      <p class="small" style="margin:0">${esc(f.stage.what)}${f.notes.length ? ' ' + esc(f.notes.join(' ')) : ''}</p>
      <div class="src">Estimate from the Eastern Ontario farm calendar, today’s weather and ${LAND_LABELS[s.community.land]}. Not part of the official AQHI.</div>
    </section>`;
}

// Countryside vs downtown Ottawa, side by side. Measured pollutants come from Environment
// Canada; pollen, mould and farm activity are the app's estimates.
function compareCard(s, c) {
  const a = s?.days?.[0], b = c?.days?.[0];
  if (!a || !b) return '';
  const here = s.community.name, city = 'Ottawa';
  const pa = s.aqNow?.pollutants, pb = c.aqNow?.pollutants;
  const coarse = (p) => (p?.pm10 != null && p?.pm != null ? Math.max(0, p.pm10 - p.pm) : null);
  const rows = [
    { label: 'AQHI', a: s.aqNow?.value, b: c.aqNow?.value, kind: 'aqhi', group: 'measured' },
    { label: 'Fine particles', a: pa?.pm, b: pb?.pm, kind: 'num', unit: 'µg/m³', group: 'measured' },
    { label: 'Coarse dust', a: coarse(pa), b: coarse(pb), kind: 'num', unit: 'µg/m³', group: 'measured' },
    { label: 'Ozone', a: pa?.o3, b: pb?.o3, kind: 'num', unit: 'ppb', group: 'measured', digits: 0 },
    { label: 'Traffic NO₂', a: pa?.no2, b: pb?.no2, kind: 'num', unit: 'ppb', group: 'measured' },
    { label: 'Pollen', a: a.pollen.max, b: b.pollen.max, kind: 'level', group: 'allergen' },
    { label: 'Mould spores', a: a.mold, b: b.mold, kind: 'level', group: 'allergen' },
    { label: 'Farm dust & ammonia', a: a.farm.level, b: b.farm.level, kind: 'level', group: 'allergen' },
  ].filter((r) => r.a != null && r.b != null);
  const cell = (r, v) => r.kind === 'level' ? shortPill(v) : r.kind === 'aqhi' ? aqPill(v) : `<b>${v.toFixed(r.digits ?? 1)}</b>`;
  const diff = (r) => {
    // Levels and AQHI compare as displayed; measurements need a real (>10%) difference.
    if (r.kind !== 'num') { const d = Math.round(r.a) - Math.round(r.b); return d > 0 ? 'here' : d < 0 ? 'city' : 'same'; }
    const d = r.a - r.b, thr = Math.max(0.3, 0.1 * Math.max(r.a, r.b));
    return d > thr ? 'here' : d < -thr ? 'city' : 'same';
  };
  const marks = { here: `<span class="cmp up" title="Higher in ${esc(here)}">▲ ${esc(here)}</span>`, city: `<span class="cmp dn" title="Higher in Ottawa">▲ ${city}</span>`, same: '<span class="cmp eq">≈ same</span>' };
  const lc = (s) => s.replace(/\b[A-Z][a-z]+/g, (w) => w.toLowerCase()); // keep AQHI, NO₂
  const list = (x) => x.length < 2 ? x.join('') : `${x.slice(0, -1).join(', ')} and ${x[x.length - 1]}`;
  const summarize = (group) => {
    const rs = rows.filter((r) => r.group === group);
    const hh = rs.filter((r) => diff(r) === 'here').map((r) => lc(r.label));
    const hc = rs.filter((r) => diff(r) === 'city').map((r) => lc(r.label.replace('Traffic ', 'traffic ')));
    const parts = [];
    if (hh.length) parts.push(`higher in ${esc(here)}: <b>${esc(list(hh))}</b>`);
    if (hc.length) parts.push(`higher downtown: <b>${esc(list(hc))}</b>`);
    return parts.length ? parts.join('; ') : 'about the same in both places';
  };
  const section = (group, title, note) => {
    const rs = rows.filter((r) => r.group === group);
    if (!rs.length) return '';
    return `<div class="cmp-sec ${group === 'measured' ? 'data' : 'est'}"><b>${title}</b> <span class="muted">${note}</span></div>
      ${rs.map((r) => `<div class="cmp-row"><span>${r.label}${r.unit ? ` <small>${r.unit}</small>` : ''}</span><span>${cell(r, r.a)}</span><span>${cell(r, r.b)}</span>${marks[diff(r)]}</div>`).join('')}`;
  };
  return `<section class="card">
      <div class="tile-h">${esc(here)} vs downtown Ottawa <button class="info" data-info="compare" aria-label="About this comparison">?</button></div>
      <ul class="cmp-story">
        <li><span class="badge data">ECCC data</span> ${summarize('measured')}.</li>
        <li><span class="badge est">Estimates</span> ${summarize('allergen')}.</li>
      </ul>
      <div class="cmp-table">
        <div class="cmp-h"><span></span><span>${esc(here)}</span><span>Ottawa</span><span></span></div>
        ${section('measured', 'Environment Canada data', 'station readings and air quality analysis')}
        ${section('allergen', 'App estimates', 'not measured')}
      </div>
    </section>`;
}

function renderHeader() {
  const c = byId(settings.communityId);
  const fav = settings.favourites.includes(c.id);
  const chips = settings.favourites.map(byId).filter(Boolean)
    .map((f) => `<button class="chip ${f.id === c.id ? 'on' : ''}" data-community="${f.id}">${esc(f.name.replace(' (Downtown)', ''))}</button>`).join('');
  // Each area, followed by the nearby places it covers (picking one of those opens the area).
  const options = REGIONS.map((r) => `<optgroup label="${esc(r)}">${COMMUNITIES.filter((x) => x.region === r)
    .map((x) => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}</option>` +
      x.covers.map((p) => `<option value="${x.id}">&nbsp;&nbsp;↳ ${esc(p.name)} (${esc(x.name.replace(' (Downtown)', ''))} area)</option>`).join('')).join('')}</optgroup>`).join('');
  $('#topbar').innerHTML = `
    <div class="brand"><img src="icon-192.png" alt="" width="28" height="28"><span>EOAR</span><small>Eastern Ontario Air &amp; Allergy</small></div>
    <div class="place-row">
      <label class="select-wrap"><span class="sr">Community</span><select id="communitySelect">${options}</select></label>
      <button class="icon-btn ${fav ? 'starred' : ''}" id="favBtn" aria-label="${fav ? 'Remove from' : 'Add to'} favourites" title="Favourite">${fav ? '★' : '☆'}</button>
      <button class="icon-btn" id="locateBtn" aria-label="Use my location" title="Use my location">📍</button>
    </div>
    ${c.covers.length ? `<div class="covers">Also covers ${esc(coversText(c))}</div>` : ''}
    <div class="chips">${chips}</div>`;
}

function renderToday() {
  const s = state.current;
  if (!s) return skeleton();
  if (s.error) return errorCard();
  const day = s.days[0];
  if (!day) return errorCard();
  const cur = s.current || {};
  const aq = s.aqNow;
  const aqRisk = aqhiRisk(aq?.value);
  const aqSrc = aq?.source === 'official'
    ? `Environment Canada · ${esc(aq.station.name)} station${aq.station.km > 5 ? ` (${Math.round(aq.station.km)} km)` : ''}`
    : aq?.source === 'local'
    ? `Environment Canada local analysis (10 km)${aq.station ? `<br>${esc(aq.station.name)} station: ${aqhiText(aq.station.aqhi)} (${Math.round(aq.station.km)} km)` : ''}`
    : aq ? (s.officialOk === false ? 'Modelled estimate (Environment Canada feed unavailable)' : 'Modelled estimate (no official station nearby)') : 'Unavailable';
  const pSrc = day.pollenSource === 'google' ? 'Google Pollen' : `Seasonal estimate adjusted for today’s weather and ${LAND_LABELS[s.community.land]}`;
  const pol = aq?.pollutants;
  return `
    ${statusLine(s)}
    <section class="card hero ${levelClass(day.outlook)}">
      <div class="hero-top">
        <div>
          <div class="eyebrow">Allergy outlook today</div>
          <div class="hero-level">${levelName(day.outlook)}</div>
        </div>
        <div class="gauge" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${day.outlook >= i - 0.5 ? 'on' : ''}"></i>`).join('')}</div>
      </div>
      <p class="hero-text">${esc(summarySentence(day, aq))}</p>
      <p class="hero-note">Combines Environment Canada air quality data with this app’s pollen, mould and farm estimates.</p>
    </section>

    <div class="sec"><h3>Environment Canada data</h3><p>${aq?.source === 'model' ? 'No Environment Canada reading is available right now, so this is a modelled value.' : 'Station measurements, or Environment Canada’s air quality analysis where there’s no station.'}</p></div>
    <section class="card data-card">
      <div class="tile-h">Air quality (AQHI) ${aq?.source === 'model' ? '<span class="badge est">Modelled</span>' : '<span class="badge data">ECCC data</span>'} <button class="info" data-info="aqhi" aria-label="About AQHI">?</button></div>
      <div class="aq-row"><div class="big ${aqRisk.cls}-text">${aqhiText(aq?.value)}</div><span class="pill ${aqRisk.cls}">${aqRisk.label}</span></div>
      ${pol ? `<div class="pollutants"><span>Fine particles <b>${pol.pm.toFixed(1)}</b> µg/m³</span><span>Ozone <b>${Math.round(pol.o3)}</b> ppb</span><span>NO₂ <b>${pol.no2.toFixed(1)}</b> ppb</span>${pol.pm10 != null ? `<span>Coarse dust <b>${Math.max(0, pol.pm10 - pol.pm).toFixed(1)}</b> µg/m³</span>` : ''}</div>` : ''}
      <div class="src">Source: ${aqSrc}</div>
    </section>

    <div class="sec est"><h3>App estimates</h3><p>Calculated by this app from the season, weather and surrounding land. They are not measurements: no public pollen, mould or farm-dust counts exist for this area.</p></div>
    <section class="card est-card">
      <div class="tile-h">Pollen <span class="badge est">Estimate</span> <button class="info" data-info="pollen" aria-label="About pollen">?</button></div>
      ${['tree', 'grass', 'weed'].map((k) => `
        <div class="prow"><span>${POLLEN_NAMES[k]}</span>${levelPill(day.pollen[k])}</div>${bar(day.pollen[k])}`).join('')}
      <div class="src">${pSrc}</div>
    </section>
    <section class="card est-card">
      <div class="tile-h">Mould spores <span class="badge est">Estimate</span> <button class="info" data-info="mold" aria-label="About mould">?</button></div>
      <div class="prow"><span>Outdoor spores</span>${levelPill(day.mold)}</div>${bar(day.mold)}
      <div class="src">Estimate from humidity, rain, season &amp; ${LAND_LABELS[s.community.land]}</div>
    </section>
    ${farmCard(s, day)}
    ${compareCard(s, state.compare)}

    <section class="card weather">
      <div class="tile-h">Weather <span class="muted small" style="font-weight:400">Open-Meteo forecast</span></div>
      <div class="wx-main"><span class="wx-ico">${wx(cur.weather_code ?? day.code)[1]}</span>
        <div><div class="wx-t">${cur.temperature_2m != null ? Math.round(cur.temperature_2m) + '°' : '–'}</div>
        <div class="muted">${wx(cur.weather_code ?? day.code)[0]} · feels ${cur.apparent_temperature != null ? Math.round(cur.apparent_temperature) + '°' : '–'}</div></div></div>
      <dl class="wx-stats">
        <div><dt>High / low</dt><dd>${Math.round(day.tmax)}° / ${Math.round(day.tmin)}°</dd></div>
        <div><dt>Humidity</dt><dd>${cur.relative_humidity_2m ?? '–'}%</dd></div>
        <div><dt>Wind</dt><dd>${cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : '–'} km/h</dd></div>
        <div><dt>Rain today</dt><dd>${round1(day.precip)} mm</dd></div>
      </dl>
    </section>

    <section class="card">
      <div class="tile-h">What to do</div>
      <ul class="tips">${tips(day, aq).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </section>

    <button class="btn primary" data-go="journal">＋ Log how you feel today</button>
    <p class="disclaimer">Pollen, mould and farm activity are estimates, not measurements. This app isn’t medical advice. Follow your doctor’s or allergist’s guidance.</p>`;
}

function renderForecast() {
  const s = state.current;
  if (!s) return skeleton();
  if (s.error) return errorCard();
  return `${statusLine(s)}
    <h2 class="h">7-day outlook · ${esc(s.community.name)}</h2>
    <p class="muted small" style="margin:0">AQHI: Environment Canada forecast (about 3 days), then a global model. Tree, grass, weed, mould and the overall rating use this app’s estimates.</p>
    <div class="legend">${[1, 2, 3, 4].map((i) => levelPill(i)).join('')}</div>
    ${s.days.map((d, i) => `
      <section class="card fday">
        <div class="fday-h">
          <div><div class="fday-name">${dayLabel(d.date, s.community.tz)}</div><div class="muted small">${shortDate(d.date)}</div></div>
          <div class="fday-wx"><span>${wx(d.code)[1]}</span> ${Math.round(d.tmax)}° <span class="muted">/ ${Math.round(d.tmin)}°</span>${d.pop != null ? `<span class="muted small"> · ${d.pop}% rain</span>` : ''}</div>
          ${levelPill(d.outlook)}
        </div>
        <div class="fday-grid">
          <div><span class="muted small">Tree</span>${shortPill(d.pollen.tree)}</div>
          <div><span class="muted small">Grass</span>${shortPill(d.pollen.grass)}</div>
          <div><span class="muted small">Weed</span>${shortPill(d.pollen.weed)}</div>
          <div><span class="muted small">Mould</span>${shortPill(d.mold)}</div>
          <div><span class="muted small">AQHI</span>${d.aqhi != null ? aqPill(d.aqhi) : '<span class="muted">–</span>'}</div>
        </div>
      </section>`).join('')}
    <p class="disclaimer">AQHI forecasts come from Environment Canada’s regional air quality forecast for each community (about 3 days), then the CAMS model. Pollen and mould are estimates.</p>`;
}

function renderRegion() {
  if (state.region === null && !state.regionLoading) { setTimeout(() => loadRegion(), 0); }
  if (!Array.isArray(state.region) && state.region !== 'error') return `<h2 class="h">Today across the region</h2>${skeleton()}`;
  if (state.region === 'error') return `<h2 class="h">Today across the region</h2>${errorCard('region')}`;
  const mode = settings.regionMode || 'list';
  const rows = [...state.region].filter((r) => r.days?.[0]);
  const t = rows[0]?.fetchedAt;
  const modeSeg = `<div class="seg" role="tablist">
      ${[['list', '☰ List'], ['map', '🗺️ Map']].map(([k, l]) => `<button data-rmode="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`).join('')}
    </div>`;
  const status = t ? `<div class="status">${state.regionLoading ? 'Updating…' : `Updated ${ago(t)}`}</div>` : '';

  if (mode === 'map') {
    const metric = settings.mapMetric || 'outlook';
    return `<h2 class="h">Today across the region</h2>${modeSeg}
      <div class="seg small-seg">${Object.entries(METRICS).map(([k, m]) => `<button data-metric="${k}" class="${metric === k ? 'on' : ''}">${m.label}</button>`).join('')}</div>
      ${status}
      <div class="map-zoom"><span class="muted small">Show:</span><button class="chip-btn" data-mapzoom="home">Eastern Ontario</button><button class="chip-btn" data-mapzoom="canada">All of Canada</button></div>
      <div class="map-wrap card"><div id="map" role="region" aria-label="Map of areas"></div></div>
      <div class="legend">${metric === 'aqhi'
        ? [[2, 'Low 1–3'], [5, 'Moderate 4–6'], [8, 'High 7–10'], [11, 'Very high 10+']].map(([v, l]) => `<span class="pill ${aqhiRisk(v).cls}">${l}</span>`).join('')
        : [1, 2, 3, 4].map((i) => levelPill(i)).join('')}</div>
      <p class="disclaimer">Tap a circle for details; zoom in to see names. Map © OpenStreetMap contributors.</p>`;
  }

  const sort = settings.regionSort || 'region';
  const row = (r) => {
    const d = r.days[0]; const a = r.aqNow?.value ?? d.aqhi;
    return `<button class="rrow" data-community="${r.community.id}">
      <span class="rname">${esc(r.community.name)}${settings.favourites.includes(r.community.id) ? ' <span class="star">★</span>' : ''}${r.community.covers.length ? `<small>${esc(r.community.covers.map((x) => x.name).join(', '))}</small>` : ''}</span>
      <span class="rcell">${shortPill(d.outlook)}</span>
      <span class="rcell">${shortPill(d.pollen.max)}</span>
      <span class="rcell">${shortPill(d.mold)}</span>
      <span class="rcell">${a != null ? aqPill(a) : '–'}</span></button>`;
  };
  const head = `<div class="rrow rhead"><span class="rname">Area</span><span class="rcell">Overall</span><span class="rcell">Pollen</span><span class="rcell">Mould</span><span class="rcell">AQHI</span></div>`;
  let body;
  if (sort === 'worst') {
    rows.sort((a, b) => b.days[0].outlook - a.days[0].outlook || (b.aqNow?.value ?? 0) - (a.aqNow?.value ?? 0));
    body = `<section class="card list">${head}${rows.map(row).join('')}</section>`;
  } else if (sort === 'az') {
    rows.sort((a, b) => a.community.name.localeCompare(b.community.name));
    body = `<section class="card list">${head}${rows.map(row).join('')}</section>`;
  } else {
    body = REGIONS.map((reg) => `<h3 class="sub">${esc(reg)}</h3><section class="card list">${head}${rows.filter((r) => r.community.region === reg).map(row).join('')}</section>`).join('');
  }
  return `<h2 class="h">Today across the region</h2>${modeSeg}
    <div class="seg small-seg" role="tablist">
      ${[['region', 'By area'], ['worst', 'Worst first'], ['az', 'A–Z']].map(([k, l]) => `<button data-sort="${k}" class="${sort === k ? 'on' : ''}">${l}</button>`).join('')}
    </div>
    ${status}
    ${body}
    <p class="disclaimer">Tap an area to open it. Eastern Ontario air quality is Environment Canada’s 10 km local analysis (station readings in Ottawa, Cornwall and Kingston). Other cities use their official Environment Canada stations.</p>`;
}

// ---------- Map (Leaflet + OpenStreetMap, loaded only when the map is opened) ----------
const METRICS = {
  outlook: { label: 'Overall', value: (r) => r.days[0].outlook },
  pollen: { label: 'Pollen', value: (r) => r.days[0].pollen.max },
  mold: { label: 'Mould', value: (r) => r.days[0].mold },
  farm: { label: 'Farm', value: (r) => r.days[0].farm?.level ?? 0 },
  aqhi: { label: 'AQHI', value: (r) => r.aqNow?.value ?? r.days[0].aqhi, aq: true },
};
let leafletLoading = null;
function ensureLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletLoading) return leafletLoading;
  leafletLoading = new Promise((resolve, reject) => {
    const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css' });
    const js = Object.assign(document.createElement('script'), { src: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js' });
    js.onload = resolve; js.onerror = () => { leafletLoading = null; reject(new Error('map library failed')); };
    document.head.append(css, js);
  });
  return leafletLoading;
}
const boundsOf = (list) => list.map((c) => [c.lat, c.lon]);

function mountMap() {
  const el = $('#map');
  if (!el || !Array.isArray(state.region)) return;
  if (!window.L) {
    ensureLeaflet().then(mountMap).catch(() => { el.innerHTML = '<p class="muted" style="padding:16px">The map couldn’t load. Check your connection, or use the list view.</p>'; });
    return;
  }
  const L = window.L;
  if (state.map) { try { state.mapView = { center: state.map.getCenter(), zoom: state.map.getZoom() }; state.map.remove(); } catch {} }
  const map = L.map(el, { zoomSnap: 0.5, attributionControl: true });
  state.map = map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 13, minZoom: 3, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  if (state.mapView) map.setView(state.mapView.center, state.mapView.zoom);
  else map.fitBounds(boundsOf(HOME_AREAS), { padding: [18, 18] });

  const metric = METRICS[settings.mapMetric || 'outlook'];
  for (const r of state.region) {
    if (!r.days?.[0]) continue;
    const v = metric.value(r);
    const cls = v == null ? 'lv0' : metric.aq ? aqhiRisk(v).cls : levelClass(v);
    const text = metric.aq ? aqhiText(v) : '';
    const c = r.community;
    const icon = L.divIcon({ className: '', html: `<div class="mk ${cls} ${c.id === settings.communityId ? 'sel' : ''}">${text}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
    const d = r.days[0]; const a = r.aqNow?.value ?? d.aqhi;
    L.marker([c.lat, c.lon], { icon, title: c.name, keyboard: true }).addTo(map)
      .bindTooltip(esc(c.name.replace(' (Downtown)', '')), { permanent: true, direction: 'bottom', offset: [0, 10], className: 'mk-label' })
      .bindPopup(`<div class="pop"><b>${esc(c.name)}</b>
        <div class="pop-grid"><span>Overall</span>${shortPill(d.outlook)}<span>Pollen</span>${shortPill(d.pollen.max)}<span>Mould</span>${shortPill(d.mold)}<span>AQHI</span>${a != null ? aqPill(a) : '–'}</div>
        <button class="btn primary" data-community="${c.id}">Open ${esc(c.name.replace(' (Downtown)', ''))} ›</button></div>`,
        { maxWidth: 220, keepInView: true, autoPanPadding: [16, 16] });
  }
  const labels = () => el.classList.toggle('hide-labels', map.getZoom() < 7.5);
  map.on('zoomend', labels); labels();
}

// ---------- Journal ----------
const SYMPTOMS = ['Sneezing', 'Runny nose', 'Congestion', 'Itchy eyes', 'Watery eyes', 'Cough', 'Wheezing', 'Short of breath', 'Headache', 'Fatigue', 'Sinus pressure', 'Itchy throat'];

function renderJournal() {
  const entries = load(KEYS.journal, []);
  const c = byId(settings.communityId);
  return `<h2 class="h">Symptom journal</h2>
    <form class="card form" id="journalForm">
      <div class="row2">
        <label>Date<input type="date" name="date" value="${todayStr()}" max="${todayStr()}" required></label>
        <label>Community<select name="communityId">${COMMUNITIES.map((x) => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      </div>
      <label><span>How are your symptoms? <output id="sevOut">3</output>/10</span>
        <input type="range" name="severity" min="0" max="10" value="3" id="sevRange"></label>
      <div class="sev-scale"><span>None</span><span>Severe</span></div>
      <fieldset><legend>Symptoms</legend><div class="toggles">
        ${SYMPTOMS.map((s) => `<label class="tog"><input type="checkbox" name="symptoms" value="${esc(s)}"><span>${esc(s)}</span></label>`).join('')}
      </div></fieldset>
      <label>Medication taken<input type="text" name="meds" placeholder="e.g. cetirizine, nasal spray" autocomplete="off"></label>
      <label>Notes<textarea name="notes" rows="3" placeholder="Where you were, what you did, anything unusual…"></textarea></label>
      <button class="btn primary" type="submit">Save entry</button>
      <p class="muted small">Today’s pollen, mould and air quality are saved with the entry automatically.</p>
    </form>
    ${journalInsights(entries)}
    <h3 class="sub">History</h3>
    ${entries.length ? entries.map(journalItem).join('') : '<p class="muted">No entries yet.</p>'}`;
}

function journalItem(e) {
  const c = byId(e.communityId);
  const snap = e.snapshot;
  return `<article class="card entry">
    <div class="entry-h"><b>${esc(shortDate(e.date))}, ${esc(e.date.slice(0, 4))}</b><span class="muted">${esc(c?.name || '')}</span>
      ${e.severity != null ? `<span class="sev">${e.severity}/10</span>` : ''}</div>
    ${e.symptoms?.length ? `<div class="tags">${e.symptoms.map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div>` : ''}
    ${e.meds ? `<div><span class="muted">Meds:</span> ${esc(e.meds)}</div>` : ''}
    ${e.notes ? `<p class="note">${esc(e.notes)}</p>` : ''}
    ${snap ? `<div class="snap">Pollen ${levelPill(snap.pollen)} Mould ${levelPill(snap.mold)} AQHI ${snap.aqhi != null ? aqPill(snap.aqhi) : '–'}</div>` : ''}
    <button class="link danger" data-del-journal="${e.id}">Delete</button>
  </article>`;
}

function journalInsights(entries) {
  const withSnap = entries.filter((e) => e.snapshot && e.severity != null);
  const recent = entries.filter((e) => e.severity != null).slice(0, 30).reverse();
  let chart = '';
  if (recent.length >= 2) {
    const W = 320, H = 90, bw = W / recent.length;
    chart = `<svg viewBox="0 0 ${W} ${H + 16}" class="chart" role="img" aria-label="Symptom scores for your last ${recent.length} entries">
      ${recent.map((e, i) => { const h = Math.max(2, (e.severity / 10) * H); return `<rect x="${i * bw + 1}" y="${H - h}" width="${Math.max(2, bw - 2)}" height="${h}" rx="2" class="${e.snapshot ? levelClass(e.snapshot.outlook ?? e.snapshot.pollen) : 'lv0'}"><title>${esc(e.date)}: ${e.severity}/10</title></rect>`; }).join('')}
      <text x="0" y="${H + 13}" class="axis">${esc(shortDate(recent[0].date))}</text>
      <text x="${W}" y="${H + 13}" text-anchor="end" class="axis">${esc(shortDate(recent[recent.length - 1].date))}</text></svg>
      <p class="muted small">Bar height = your symptom score. Colour = that day’s allergy outlook.</p>`;
  }
  let insight = '';
  if (withSnap.length >= 5) {
    const hi = withSnap.filter((e) => (e.snapshot.outlook ?? e.snapshot.pollen) >= 2.5);
    const lo = withSnap.filter((e) => (e.snapshot.outlook ?? e.snapshot.pollen) < 1.5);
    const avg = (a) => a.reduce((s, e) => s + e.severity, 0) / a.length;
    if (hi.length >= 2 && lo.length >= 2) {
      insight = `<p>On <b>high-outlook days</b> your symptoms average <b>${avg(hi).toFixed(1)}/10</b>, versus <b>${avg(lo).toFixed(1)}/10</b> on low days.</p>`;
    }
  }
  // Countryside vs city, using where each entry was logged.
  const rural = (e) => ['farm', 'mixed', 'forest'].includes(byId(e.communityId)?.land);
  const sev = entries.filter((e) => e.severity != null);
  const ru = sev.filter(rural), ci = sev.filter((e) => !rural(e));
  const mean = (x) => x.reduce((s, e) => s + e.severity, 0) / x.length;
  if (ru.length >= 2 && ci.length >= 2) {
    const d = mean(ru) - mean(ci);
    insight += `<div class="rvc"><div><span class="muted small">Countryside days</span><b>${mean(ru).toFixed(1)}</b><span class="muted small">${ru.length} entries</span></div>
      <div><span class="muted small">City &amp; town days</span><b>${mean(ci).toFixed(1)}</b><span class="muted small">${ci.length} entries</span></div></div>
      <p class="small">${Math.abs(d) < 0.5 ? 'So far your symptoms are about the same in both.' : d > 0 ? `Your symptoms average <b>${d.toFixed(1)} points higher</b> in the countryside.` : `Your symptoms average <b>${(-d).toFixed(1)} points higher</b> in the city.`} The more entries from both, the stronger the evidence.</p>`;
  } else if (sev.length >= 2) {
    insight += `<p class="muted small">Log entries both at home and when you’re in the city (pick the community you were in). Once you have at least 2 of each, you’ll see how your symptoms compare between the countryside and the city.</p>`;
  }
  if (!chart && !insight) return '';
  return `<section class="card"><div class="tile-h">Your pattern</div>${chart}${insight || '<p class="muted small">After a few more entries on different kinds of days, you’ll see how conditions line up with your symptoms.</p>'}</section>`;
}

// ---------- Immunotherapy ----------
function renderShots() {
  const shots = load(KEYS.shots, []);
  const last = shots.filter((s) => s.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  let due = '';
  if (last) {
    const next = new Date(last.date + 'T12:00:00'); next.setDate(next.getDate() + Number(settings.shotIntervalDays || 7));
    const days = Math.round((next - new Date(todayStr() + 'T12:00:00')) / 86400000);
    const when = next.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
    due = `<section class="card due ${days < 0 ? 'late' : ''}"><div class="eyebrow">Next injection</div>
      <div class="due-d">${when}</div><div class="muted">${days === 0 ? 'Due today' : days > 0 ? `In ${days} day${days === 1 ? '' : 's'}` : `${-days} day${days === -1 ? '' : 's'} overdue`}</div></section>`;
  }
  return `<h2 class="h">Allergy shots (immunotherapy)</h2>
    ${due}
    <form class="card form" id="shotForm">
      <div class="row2">
        <label>Date<input type="date" name="date" value="${todayStr()}" required></label>
        <label>Arm<select name="arm"><option value="">–</option><option>Left</option><option>Right</option></select></label>
      </div>
      <div class="row2">
        <label>Vial / extract<input type="text" name="vial" placeholder="e.g. Ragweed + grass, vial 3"></label>
        <label>Dose (mL)<input type="number" name="dose" step="0.01" min="0" inputmode="decimal"></label>
      </div>
      <label>Local reaction (cm)<input type="number" name="reaction" step="0.1" min="0" inputmode="decimal" placeholder="Size of redness/swelling"></label>
      <label>Notes<textarea name="notes" rows="2" placeholder="Any other reaction, how you felt…"></textarea></label>
      <button class="btn primary" type="submit">Save injection</button>
    </form>
    <label class="card inline-set">Days between injections
      <input type="number" id="shotInterval" min="1" max="60" value="${esc(settings.shotIntervalDays)}" inputmode="numeric"></label>
    <h3 class="sub">History</h3>
    ${shots.length ? shots.map((s) => `<article class="card entry">
      <div class="entry-h"><b>${s.date ? esc(shortDate(s.date)) + ', ' + esc(s.date.slice(0, 4)) : 'No date'}</b>${s.arm ? `<span class="muted">${esc(s.arm)} arm</span>` : ''}
        ${s.reaction !== '' && s.reaction != null ? `<span class="sev">${esc(s.reaction)} cm</span>` : ''}</div>
      ${s.vial || s.dose ? `<div>${esc(s.vial)}${s.vial && s.dose ? ' · ' : ''}${s.dose ? esc(s.dose) + ' mL' : ''}</div>` : ''}
      ${s.notes ? `<p class="note">${esc(s.notes)}</p>` : ''}
      <button class="link danger" data-del-shot="${s.id}">Delete</button></article>`).join('') : '<p class="muted">No injections logged yet.</p>'}
    <p class="disclaimer">Always follow your allergist’s schedule and wait the recommended time after each injection.</p>`;
}

// ---------- More ----------
function renderMore() {
  return `<h2 class="h">More</h2>
    <section class="card">
      <div class="tile-h">Favourites</div>
      <p class="muted small">Favourites show as quick buttons at the top. Tap ☆ next to a community to add it.</p>
      <div class="tags">${settings.favourites.map(byId).filter(Boolean).map((f) => `<span class="tag">${esc(f.name)} <button class="x" data-unfav="${f.id}" aria-label="Remove ${esc(f.name)}">×</button></span>`).join('')}</div>
    </section>
    <section class="card">
      <div class="tile-h">Your data</div>
      <p class="muted small">Journal and injection records are stored only on this device. Back them up now and then, especially before switching phones or clearing Safari data.</p>
      <div class="btns">
        <button class="btn" id="exportJson">Download backup</button>
        <label class="btn file">Restore backup<input type="file" id="importJson" accept="application/json,.json" hidden></label>
        <button class="btn" id="exportCsv">Journal as spreadsheet (CSV)</button>
      </div>
    </section>
    <section class="card">
      <div class="tile-h">Install on iPhone</div>
      <ol class="small"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button.</li><li>Choose <b>Add to Home Screen</b>.</li></ol>
      <p class="muted small">On Android, use Chrome’s menu → <b>Install app</b>.</p>
    </section>
    <section class="card about">
      <div class="tile-h">Where the numbers come from</div>
      <p><b>Air quality (AQHI)</b>: for each community, Environment and Climate Change Canada’s Regional Air Quality Analysis (a 10 km grid that blends station measurements with ECCC’s air quality model, including FireWork wildfire smoke). In Ottawa, Cornwall and Kingston the official station reading is used directly, as it is in Toronto, Halifax, Calgary and Vancouver. Montréal uses the local analysis now and its official forecast. Forecast days come from ECCC’s regional air quality forecast (about 3 days), then the CAMS model via Open-Meteo.</p>
      <p><b>Pollen</b>: ${CONFIG.GOOGLE_POLLEN_KEY ? 'Google Pollen API.' : 'an estimate based on typical Eastern Ontario tree, grass and ragweed seasons, adjusted daily for rain, temperature, wind and the first hard frost, shifted for latitude (later near Pembroke, earlier near Kingston), and adjusted for the land around each community: farmland raises ragweed and grass, forest raises tree pollen, the city core lowers most. Toronto, Montréal, Halifax, Calgary and Vancouver each use their own season profile (for example, Vancouver’s tree pollen starts in February, and Calgary and Halifax see little ragweed). No free public pollen feed exists for this region.'}</p>
      <p><b>Mould</b>: an estimate of outdoor spores based on season, temperature, humidity, recent rain, snow cover, fall leaf litter and surrounding land (harvest dust raises it around farmland). Few places publish mould counts, so treat it as a guide.</p>
      <p><b>Weather</b>: Open-Meteo (Environment Canada GEM and other models).</p>
      <p><b>Areas</b>: nearby small towns share the same air quality grid, weather and land type, so they’re grouped into ${COMMUNITIES.length} areas across the region. Each area lists the places it covers.</p>
      <p class="muted small">EOAR ${CONFIG.VERSION} · Not medical advice.</p>
      <button class="link" id="clearCache">Clear cached forecasts</button>
    </section>`;
}

function statusLine(s) {
  if (!s?.fetchedAt) return '';
  const off = s.officialOk === false ? ' · Environment Canada AQHI unavailable, using model' : '';
  return `<div class="status">${state.loading ? 'Updating…' : `${s.stale ? '⚠️ Offline, showing data from ' : 'Updated '}${ago(s.fetchedAt)}`}${off}
    <button class="link" id="refreshBtn">Refresh</button></div>`;
}
function skeleton() { return `<div class="card skel"></div><div class="grid2"><div class="card skel sm"></div><div class="card skel sm"></div></div><div class="card skel"></div>`; }
function errorCard(which) {
  return `<section class="card err"><b>Couldn’t load conditions.</b><p class="muted">Check your connection and try again.</p>
    <button class="btn" id="${which === 'region' ? 'retryRegion' : 'refreshBtn'}">Try again</button></section>`;
}

const INFO = {
  aqhi: ['Air Quality Health Index', 'Canada’s 1–10+ scale for health risk from air pollution (ozone, fine particles such as wildfire smoke, and nitrogen dioxide). 1–3 low, 4–6 moderate, 7–10 high, above 10 very high. Poor air quality can make allergy and asthma symptoms worse. For most communities the value comes from Environment Canada’s local air quality analysis, a 10 km grid that blends station measurements with its air quality model, so each town gets its own reading.'],
  pollen: ['Pollen', 'Tree pollen runs from late March to early June, grass from late May to early August, and ragweed from early August until the first hard frost. Rain clears pollen from the air; warm, dry, windy days raise it. This is an estimate, not a pollen count.'],
  farm: ['Farm activity', 'Field work puts things in the air that the official AQHI doesn’t measure: soil dust from tilling, grain dust and fungal spores from combining, hay dust and pollen from haying, and ammonia from manure spreading. These are well-known asthma and allergy triggers for people living near farmland. The level shown is an estimate based on the typical Eastern Ontario farm calendar and today’s weather: dry, windy days raise it, and rain lowers it. It is not a measurement.'],
  compare: ['Countryside vs city', 'The official AQHI only counts ozone, fine particles and nitrogen dioxide, which are mostly traffic and smoke pollution. By that measure rural air is often cleaner than downtown. But many of the things that trigger rural asthma and allergies (pollen from fields and ditches, mould spores and grain dust from harvest, soil dust and ammonia) aren’t in the AQHI, and there are no monitoring stations on farmland to catch short dust episodes. This card shows both sides. Log your symptoms in the Journal, both at home and in the city, to build your own evidence.'],
  mold: ['Mould spores', 'Outdoor mould spores (e.g. Alternaria, Cladosporium) rise with warmth, humidity and rain, and peak in late summer and fall when leaves decay. Snow cover suppresses them. This is an estimate, not a spore count.'],
};

// ---------------- main render ----------------
const VIEWS = { today: renderToday, forecast: renderForecast, region: renderRegion, journal: renderJournal, shots: renderShots, more: renderMore };

// fromData: a background data update. Don't redraw pages with forms on them,
// so nothing the person is typing gets wiped.
function render(fromData = false) {
  renderHeader();
  const formView = ['journal', 'shots', 'more'].includes(settings.view);
  if (!(fromData && formView)) {
    if (state.map && !(settings.view === 'region' && settings.regionMode === 'map')) { try { state.map.remove(); } catch {} state.map = null; }
    $('#view').innerHTML = VIEWS[settings.view]();
    if (settings.view === 'region' && settings.regionMode === 'map') mountMap();
  }
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === settings.view));
}

function go(view) {
  settings.view = view; saveSettings();
  $('#view').innerHTML = ''; render(); window.scrollTo(0, 0);
}

function setCommunity(id) {
  id = byId(id)?.id;
  if (!id || id === settings.communityId) { if (settings.view === 'region') go('today'); return; }
  settings.communityId = id; saveSettings();
  state.current = null; state.compare = null;
  if (settings.view === 'region') settings.view = 'today';
  render(); refresh();
}

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function showInfo(key) {
  const [title, body] = INFO[key];
  const d = $('#infoDialog');
  d.innerHTML = `<h3>${esc(title)}</h3><p>${esc(body)}</p><form method="dialog"><button class="btn primary">Got it</button></form>`;
  d.showModal ? d.showModal() : alert(body);
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------- events ----------------
document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button, [data-community]');
  if (!t) return;
  if (t.dataset.view) return go(t.dataset.view);
  if (t.dataset.go) return go(t.dataset.go);
  if (t.dataset.community) return setCommunity(t.dataset.community);
  if (t.dataset.info) return showInfo(t.dataset.info);
  if (t.dataset.sort) { settings.regionSort = t.dataset.sort; saveSettings(); return render(); }
  if (t.dataset.rmode) { settings.regionMode = t.dataset.rmode; saveSettings(); return render(); }
  if (t.dataset.metric) { settings.mapMetric = t.dataset.metric; saveSettings(); return render(); }
  if (t.dataset.mapzoom && state.map) {
    state.map.fitBounds(boundsOf(t.dataset.mapzoom === 'home' ? HOME_AREAS : COMMUNITIES), { padding: [18, 18] });
    return;
  }
  if (t.dataset.unfav) { settings.favourites = settings.favourites.filter((f) => f !== t.dataset.unfav); saveSettings(); return render(); }
  if (t.dataset.delJournal) {
    if (!confirm('Delete this journal entry?')) return;
    save(KEYS.journal, load(KEYS.journal, []).filter((e) => e.id !== t.dataset.delJournal)); return render();
  }
  if (t.dataset.delShot) {
    if (!confirm('Delete this injection record?')) return;
    save(KEYS.shots, load(KEYS.shots, []).filter((e) => e.id !== t.dataset.delShot)); return render();
  }
  switch (t.id) {
    case 'refreshBtn': return refresh(true);
    case 'retryRegion': state.region = null; return loadRegion(true);
    case 'favBtn': {
      const id = settings.communityId;
      settings.favourites = settings.favourites.includes(id) ? settings.favourites.filter((f) => f !== id) : [...settings.favourites, id];
      saveSettings(); return render();
    }
    case 'locateBtn': {
      if (!navigator.geolocation) return toast('Location isn’t available on this device.');
      toast('Finding your location…');
      navigator.geolocation.getCurrentPosition((pos) => {
        const { community, km } = nearestCommunity(pos.coords.latitude, pos.coords.longitude);
        toast(km > 60 ? `You’re outside the coverage area. Showing the nearest community, ${community.name}.` : `Nearest community: ${community.name}`);
        setCommunity(community.id);
      }, () => toast('Couldn’t get your location. Check location permissions for Safari.'), { timeout: 10000, maximumAge: 600000 });
      return;
    }
    case 'exportJson': {
      const data = { app: 'EOAR', version: CONFIG.VERSION, exported: new Date().toISOString(), journal: load(KEYS.journal, []), shots: load(KEYS.shots, []), settings };
      return download(`eoar-backup-${todayStr()}.json`, JSON.stringify(data, null, 2), 'application/json');
    }
    case 'exportCsv': {
      const rows = [['Date', 'Community', 'Severity (0-10)', 'Symptoms', 'Medication', 'Notes', 'Outlook', 'Tree', 'Grass', 'Weed', 'Mould', 'Farm activity', 'AQHI', 'Area type']];
      for (const e of load(KEYS.journal, [])) {
        const s = e.snapshot || {};
        rows.push([e.date, byId(e.communityId)?.name || '', e.severity ?? '', (e.symptoms || []).join('; '), e.meds || '', e.notes || '',
          s.outlook != null ? levelName(s.outlook) : '', s.tree != null ? levelName(s.tree) : '', s.grass != null ? levelName(s.grass) : '', s.weed != null ? levelName(s.weed) : '',
          s.mold != null ? levelName(s.mold) : '', s.farm != null ? levelName(s.farm) : '', s.aqhi ?? '', LAND_LABELS[byId(e.communityId)?.land] || '']);
      }
      const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      return download(`eoar-journal-${todayStr()}.csv`, '﻿' + csv, 'text/csv');
    }
    case 'clearCache': pruneCache(); Object.keys(localStorage).filter((k) => k.startsWith('eoar4_cache:')).forEach((k) => localStorage.removeItem(k)); toast('Cached forecasts cleared'); return refresh(true);
  }
});

document.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.id === 'communitySelect') return setCommunity(t.value);
  if (t.id === 'shotInterval') { settings.shotIntervalDays = Math.max(1, Number(t.value) || 7); saveSettings(); t.blur(); return render(); }
  if (t.id === 'importJson' && t.files[0]) {
    try {
      const data = JSON.parse(await t.files[0].text());
      if (data.app !== 'EOAR' || !Array.isArray(data.journal)) throw new Error('bad file');
      if (!confirm(`Restore ${data.journal.length} journal entries and ${data.shots?.length || 0} injections? This replaces what’s on this device.`)) return;
      save(KEYS.journal, data.journal); save(KEYS.shots, data.shots || []);
      toast('Backup restored'); render();
    } catch { toast('That file isn’t an EOAR backup.'); }
  }
});

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'sevRange') $('#sevOut').textContent = ev.target.value;
});

document.addEventListener('submit', (ev) => {
  const f = ev.target;
  if (f.id === 'journalForm') {
    ev.preventDefault();
    const fd = new FormData(f);
    const entry = {
      id: uid(), date: fd.get('date'), communityId: fd.get('communityId'),
      severity: Number(fd.get('severity')), symptoms: fd.getAll('symptoms'),
      meds: fd.get('meds').trim(), notes: fd.get('notes').trim(),
    };
    // Attach conditions if we have them for that community and date.
    const s = state.current;
    const day = s?.community?.id === entry.communityId ? s.allDays?.find((d) => d.date === entry.date) : null;
    if (day) {
      entry.snapshot = { outlook: day.outlook, farm: day.farm?.level, land: byId(entry.communityId)?.land, pollen: day.pollen.max, main: day.pollen.main, tree: day.pollen.tree, grass: day.pollen.grass, weed: day.pollen.weed, mold: day.mold,
        aqhi: entry.date === todayStr() ? (s.aqNow?.value ?? day.aqhi) : day.aqhi };
    }
    const all = load(KEYS.journal, []); all.push(entry);
    all.sort((a, b) => b.date.localeCompare(a.date));
    if (save(KEYS.journal, all)) { toast('Journal entry saved'); f.reset(); document.activeElement?.blur(); render(); }
  }
  if (f.id === 'shotForm') {
    ev.preventDefault();
    const fd = new FormData(f);
    const shot = { id: uid(), date: fd.get('date'), arm: fd.get('arm'), vial: fd.get('vial').trim(), dose: fd.get('dose'), reaction: fd.get('reaction'), notes: fd.get('notes').trim() };
    const all = load(KEYS.shots, []); all.push(shot);
    all.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (save(KEYS.shots, all)) { toast('Injection saved'); f.reset(); document.activeElement?.blur(); render(); }
  }
});

// Refresh when the app comes back to the foreground after a while.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.current?.fetchedAt && Date.now() - state.current.fetchedAt > 30 * 60000) refresh();
});

// ---------------- start ----------------
migrateOld();
pruneCache();
render();
refresh();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // When a new version takes over, reload once so the update shows immediately.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true; location.reload();
  });
  navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' })
    .then((reg) => reg.update()).catch(() => {});
}
