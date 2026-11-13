import * as M from './model.js';

/* ══════════════════════════════════════════════════════ 基础 */
const $ = (s, el = document) => el.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const iso = () => new Date().toISOString();

// 口令来源（按优先级）：
//   1) URL 上的 ?t=              —— 最可靠，分享链接就是它
//   2) localStorage              —— 上次 ?t= 打开时存下的
//   3) 服务端 /plant-token 换的 cookie —— 手机切网络/被清存储后的兜底
const TOKEN = (() => {
  try {
    const u = new URL(location.href);
    const t = u.searchParams.get('t');
    if (t && t.length > 3) {
      localStorage.setItem('plant_token', t);
      u.searchParams.delete('t');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
      return t;
    }
    return localStorage.getItem('plant_token') || '';
  } catch { return ''; }
})();

const SAVED_INPUT = (() => {
  try { return localStorage.getItem('plant_token_input') || ''; } catch { return ''; }
})();

const S = {
  state: null, config: null, weather: null, idx: null, readonly: false,
  route: 'today', plans: {}, suns: {}, tasks: [], today: M.localDate(),
  busy: '', err: '', sheet: null, syncing: false, dirty: false,
};

const ICON = {
  today: '<svg viewBox="0 0 24 24"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="4"/></svg>',
  plants: '<svg viewBox="0 0 24 24"><path d="M12 21c0-6 4-9.5 8-10.5C19 17 15.5 20.5 12 21z"/><path d="M12 21c0-5-3-8-7-8.8C6 18 8.5 20.4 12 21z"/><path d="M12 21v-6"/></svg>',
  weather: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1"/><path d="M8.5 19h8a3.5 3.5 0 000-7 4.5 4.5 0 00-8.6 1.2A3 3 0 008.5 19z"/></svg>',
  album: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8.5" cy="10" r="1.6"/><path d="M4 17l4.5-4.5 3 3L15 12l5 5"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  drop: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3s6 6.4 6 10.4A6 6 0 016 13.4C6 9.4 12 3 12 3z"/></svg>',
  camera: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="13" rx="3"/><circle cx="12" cy="12.5" r="3.2"/></svg>',
  sun: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>',
  move: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h11l-2.5-2.5M20 16H9l2.5 2.5"/></svg>',
  flower: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="2.6"/><path d="M12 9.4c0-2.4 1-4 0-6.4-1 2.4 0 4 0 6.4zM12 14.6c0 2.4 1 4 0 6.4-1-2.4 0-4 0-6.4zM9.4 12c-2.4 0-4 1-6.4 0 2.4-1 4 0 6.4 0zM14.6 12c2.4 0 4 1 6.4 0-2.4-1-4 0-6.4 0z"/></svg>',
  flask: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 3h6M10 3v6l-5 9.5A2 2 0 006.8 21h10.4A2 2 0 0019 18.5L14 9V3"/><path d="M7.5 15h9"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

const KIND_META = {
  water: { label: '浇水', cls: 'green', icon: 'drop' },
  prep: { label: '备水', cls: 'blue', icon: 'drop' },
  check: { label: '探土', cls: '', icon: 'drop' },
  moveIn: { label: '搬进屋', cls: 'blue', icon: 'move' },
  moveOut: { label: '晒太阳', cls: 'gold', icon: 'sun', img: '/img/weather/icon_weather_sunny.jpg' },
  bloom: { label: '查灰霉', cls: 'gold', icon: 'flower' },
  photo: { label: '拍照', cls: '', icon: 'camera' },
  fert: { label: '施肥', cls: '', icon: 'flask' },
  leach: { label: '冲盐', cls: 'blue', icon: 'drop' },
  waterManual: { label: '浇水', cls: 'green', icon: 'drop' },
  measure: { label: '测光', cls: 'blue', icon: 'sun', img: '/img/weather/icon_weather_sunny.jpg' },
  toSun: { label: '搬去晒', cls: 'gold', icon: 'sun', img: '/img/weather/icon_weather_sunny.jpg' },
  toHome: { label: '搬回来', cls: '', icon: 'move' },
};

/* ══════════════════════════════════════════════════════ 视觉插画与图标映射 */
const PLANT_ASSETS = {
  p_kalanchoe: {
    avatar: '/img/plants/plant_kalanchoe_avatar.jpg',
    full: '/img/plants/plant_kalanchoe_full.jpg',
  },
  p_podocarpus: {
    avatar: '/img/plants/plant_podocarpus_avatar.jpg',
    full: '/img/plants/plant_podocarpus_full.jpg',
  },
};

function plantAvatar(p, size = 40) {
  if (!p) return `<div class="plant-emoji" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.5)}px">🌿</div>`;
  const custom = p.avatar || PLANT_ASSETS[p.id]?.avatar;
  if (custom) {
    return `<img class="plant-avatar-img" src="${custom}" alt="${esc(p.name)}" style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.3)}px">`;
  }
  return `<div class="plant-emoji" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.5)}px">${p.emoji || '🌿'}</div>`;
}

function plantBadge(plantId, fallbackEmoji = '', size = 20) {
  const p = S.state?.plants?.find((x) => x.id === plantId);
  const custom = p?.avatar || (plantId && PLANT_ASSETS[plantId]?.avatar);
  if (custom) {
    return `<img class="plant-avatar-img" src="${custom}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;vertical-align:middle;margin-right:4px">`;
  }
  return fallbackEmoji ? `<span style="margin-right:4px">${fallbackEmoji}</span>` : '';
}

function weatherIconImg(code, size = 20) {
  const c = Number(code);
  let file = 'icon_weather_sunny.jpg';
  if (c === 0) file = 'icon_weather_sunny.jpg';
  else if (c <= 2) file = 'icon_weather_cloudy.jpg';
  else if (c === 3) file = 'icon_weather_overcast.jpg';
  else if (c >= 45 && c <= 48) file = 'icon_weather_fog.jpg';
  else if (c >= 51 && c <= 57) file = 'icon_weather_drizzle.jpg';
  else if (c >= 61 && c <= 67) file = 'icon_weather_drizzle.jpg';
  else if (c >= 80 && c <= 82) file = 'icon_weather_cloudy.jpg';
  else file = 'icon_weather_overcast.jpg';

  return `<img class="wx-icon-img" src="/img/weather/${file}" alt="${M.weatherWord(code)}" style="width:${size}px;height:${size}px">`;
}

/* ══════════════════════════════════════════════════════ 网络 */
async function api(path, opt = {}) {
  const r = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(TOKEN ? { 'x-plant-token': TOKEN } : {}) },
    ...opt,
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  const txt = await r.text();
  let data;
  try { data = txt ? JSON.parse(txt) : {}; } catch { throw new Error('返回不是 JSON：' + txt.slice(0, 120)); }
  if (!r.ok) {
    if (r.status === 401) { S.readonly = true; render(); }
    throw new Error(data.error || `HTTP ${r.status}`);
  }
  return data;
}

const fallbackWeather = () => ({
  utc_offset_seconds: 28800,
  daily: {
    time: Array.from({ length: 14 }, (_, i) => M.addDays(M.localDate(), i)),
    weather_code: Array(14).fill(3),
    temperature_2m_max: Array(14).fill(18),
    temperature_2m_min: Array(14).fill(11),
    precipitation_sum: Array(14).fill(0),
    precipitation_probability_max: Array(14).fill(20),
    et0_fao_evapotranspiration: Array(14).fill(1.3),
    sunshine_duration: Array(14).fill(3 * 3600),
    shortwave_radiation_sum: Array(14).fill(7),
    wind_speed_10m_max: Array(14).fill(10),
    relative_humidity_2m_mean: Array(14).fill(75),
  },
  hourly: {
    time: Array.from({ length: 14 * 24 }, (_, i) => {
      const d = M.addDays(M.localDate(), Math.floor(i / 24));
      return `${d}T${pad(i % 24)}:00`;
    }),
    cloud_cover: Array(14 * 24).fill(60),
    precipitation: Array(14 * 24).fill(0),
    temperature_2m: Array(14 * 24).fill(15),
    relative_humidity_2m: Array(14 * 24).fill(75),
    shortwave_radiation: Array(14 * 24).fill(200),
    wind_speed_10m: Array(14 * 24).fill(10),
  },
  fallback: true,
});

async function loadAll({ silent = false } = {}) {
  S.syncing = true;
  const prevRev = S.state?.revisedAt;
  if (!silent) render();
  try {
    const auth = await api('/api/auth').catch(() => ({ ok: true, protected: false }));
    S.readonly = auth.protected && !auth.ok;
    const [state, cfg] = await Promise.all([api('/api/state'), api('/api/config').catch(() => S.config || { vision: {} })]);
    S.state = state;
    S.config = cfg;
    try {
      S.weather = await api(`/api/weather?lat=${state.location.lat}&lon=${state.location.lon}`);
    } catch (e) {
      S.weather = S.weather || fallbackWeather();
      S.err = '天气没取到，先用占位数据：' + e.message;
    }
    S.idx = M.indexWeather(S.weather);
    compute();
    S.err = S.weather?.fallback ? '当前用的是占位天气（取不到实时预报）' : '';
    const rev = state.revisedAt;
    S.syncing = false;
    if (!silent || rev !== prevRev || !S.renderedOnce) { S.renderedOnce = true; render(); }
  } catch (e) {
    S.err = e.message;
    S.syncing = false;
    render();
  }
}

function compute() {
  const st = S.state;
  S.today = M.localDate();
  S.plans = {};
  S.suns = {};
  for (const p of st.plants) {
    S.plans[p.id] = M.waterPlan(p, S.idx, st.settings);
    S.suns[p.id] = M.sunPlan(p, S.idx, st.site, S.today, st.location.lat, st.location.lon);
  }
  S.tasks = M.buildTasks({
    plants: st.plants, wIndex: S.idx, site: st.site,
    settings: st.settings, horizonDays: 7,
    photos: st.photos || [], doneMap: st.tasksDone || {},
  });
}

async function saveState() {
  if (!S.state) return;
  S.dirty = true;
  try {
    await api('/api/state', { method: 'PUT', body: S.state });
    S.dirty = false;
  } catch (e) {
    toast('保存失败：' + e.message, 'err');
  }
}

/* ══════════════════════════════════════════════════════ 渲染入口 */
function render() {
  const app = $('#app');
  if (!S.state || !S.idx) {
    app.innerHTML = `<div class="boot"><span class="boot-dot"></span>${S.err ? '连不上服务：' + esc(S.err) : '正在读取花况…'}</div>`;
    return;
  }
  const pending = pendingTasks();
  lastPending = pending;
  document.title = (pending ? `(${pending}) ` : '') + '花花和松松';
  const y = window.scrollY;
  app.innerHTML = shell();
  renderSheet();
  document.documentElement.dataset.boot = 'ok';
  if (y) window.scrollTo(0, y);
}

const localHM = (iso) => { try { return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }); } catch { return ''; } };
const localYMD = (iso) => { try { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; } catch { return ''; } };
const localMD = (iso) => localYMD(iso).slice(5);
const localMDHM = (iso) => { const d = new Date(iso); return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${localHM(iso)}`; };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n, d = 0) => (Number.isFinite(n) ? Number(n).toFixed(d) : '–');

function pendingTasks() {
  const hm = nowHM();
  return S.tasks.filter((t) => t.date === S.today && !t.state && t.time <= hm).length;
}

function shell() {
  const tabs = [
    ['today', '今日', ICON.today],
    ['plants', '植株', ICON.plants],
    ['weather', '天气', ICON.weather],
    ['album', '相册', ICON.album],
    ['settings', '设置', ICON.settings],
  ];
  const pend = pendingTasks();
  return `
  <nav class="tabbar">
    <div class="navbrand"><div class="mark"><img src="/icons/mark.png" alt="花花和松松" style="width:100%;height:100%;border-radius:inherit;display:block"></div><div><b>花花和松松</b><small>${esc(S.state.location.short)} · ${S.state.plants.length} 株</small></div></div>
    ${tabs.map(([k, name, icon]) => `
      <button class="tab ${S.route === k ? 'on' : ''}" data-go="${k}">
        ${icon}<span>${name}</span>${k === 'today' && pend ? '<i class="pip"></i>' : ''}
      </button>`).join('')}
  </nav>
  <div class="content">
    <header class="top">
      <div class="brand">
        <div class="mark"><img src="/icons/mark.png" alt="花花和松松" style="width:100%;height:100%;border-radius:inherit;display:block"></div>
        <div>
          <h1>花花和松松</h1>
          <p>${M.monthDay(S.today)} ${M.weekdayCN(S.today)} · ${esc(S.state.location.short)} · ${S.state.plants.length} 株</p>
        </div>
      </div>
      <div class="top-right">
        ${S.readonly ? '<button class="badge red" data-act="askToken" style="cursor:pointer">只读 · 输入口令</button>' : ''}
        ${weatherChip()}
        <span class="sync ${S.syncing ? 'off' : S.dirty ? 'off' : 'on'}" title="${S.syncing ? '同步中' : S.dirty ? '未保存' : '已同步'}"></span>
      </div>
    </header>
    <main class="main">${S.err ? `<div class="card tight" style="border-color:var(--gold);background:#fdf6e4;margin-bottom:12px"><b style="font-size:12.5px">${esc(S.err)}</b></div>` : ''}${view()}</main>
  </div>`;
}

function weatherChip() {
  const d = S.idx?.daily.get(S.today);
  if (!d) return '<div class="wchip">天气 –</div>';
  return `<button class="wchip" data-go="weather" style="gap:7px">${weatherIconImg(d.code, 20)}<b>${Math.round(d.tmax)}°</b><span style="color:var(--muted)">${M.weatherWord(d.code)}</span></button>`;
}

function view() {
  switch (S.route) {
    case 'plants': return viewPlants();
    case 'weather': return viewWeather();
    case 'album': return viewAlbum();
    case 'settings': return viewSettings();
    default: return viewToday();
  }
}

/* ══════════════════════════════════════════════════════ 今日 */
function heroBanner() {
  return `<div class="hero-banner">
    <img src="/img/scenes/scene_balcony_hero.jpg" alt="阳台与走廊一角">
    <div class="hero-bar">
      <span class="hero-tag">钱塘 · 下沙</span>
      <span class="hero-sub">红砖栏板 · 走廊与阳台的花</span>
    </div>
  </div>`;
}

function viewToday() {
  const st = S.state;
  const d = S.idx?.daily.get(S.today) || {};
  const rain = M.rainOutlook(S.idx, S.today);
  const todays = S.tasks.filter((t) => t.date === S.today);
  const later = S.tasks.filter((t) => t.date !== S.today).slice(0, 4);

  return `<div class="stack">
    ${heroBanner()}
    ${wxCard(d, rain)}
    <div class="cols">
      <div class="stack">
        ${st.plants.map((p) => plantCard(p)).join('')}
        ${sunCard()}
        ${explainCard()}
      </div>
      <div class="stack">
        ${taskCard(todays)}
        ${later.length ? `<div class="card">
          <div class="card-head"><div class="card-title">接下来</div><button class="linkbtn" data-go="weather">全部</button></div>
          <div class="tasklist">${later.map((t) => taskRow(t, true)).join('')}</div>
        </div>` : ''}
      </div>
    </div>
  </div>`;
}

function wxCard(d, rain) {
  const sun = S.suns[S.state.plants[0]?.id];
  const coldNight = (d.tmin ?? 99) < 8;
  return `<div class="card wx">
    <div class="wx-top">
      <div style="display:flex;align-items:center;gap:12px">
        ${weatherIconImg(d.code, 46)}
        <div class="wx-temp">${Math.round(d.tmax)}<sup>°</sup></div>
      </div>
      <div class="wx-meta">
        <div>最低 <b>${Math.round(d.tmin)}°</b> · ${M.weatherWord(d.code)} · 湿 <b>${Math.round(d.rh ?? 70)}%</b></div>
        <div>${rain ? `<span style="color:${rain.tone === 'dry' ? 'var(--muted)' : 'var(--blue)'}">${rain.text}</span>` : ''} · ET₀ <b>${num(d.et0, 2)}</b> mm</div>
      </div>
    </div>
    <div class="wx-stats">
      <div><b>${num(d.sunSec / 3600, 1)}<i>h</i></b><span>气象日照</span></div>
      ${sun?.indoor
        ? `<div><b>散射</b><span>走廊·无直射</span></div>`
        : `<div><b>${sun ? sun.directHours : 0}<i>h</i></b><span>盆位直射</span></div>`}
      <div><b>${sun ? sun.dli : '–'}</b><span>${sun?.indoor ? '散射 DLI' : 'DLI mol'}</span></div>
    </div>
    ${coldNight ? `<div style="display:flex;align-items:center;gap:8px;margin-top:10px;padding:7px 11px;background:var(--blue-2);border-radius:10px;font-size:12px;color:var(--blue)">
      <img src="/img/status/icon_status_night_lamp.jpg" alt="夜温提示" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex:none">
      <span>今夜最低 <b>${Math.round(d.tmin)}℃</b> 偏冷，傍晚 17:00 记得把怕冷的花收进屋。</span>
    </div>` : ''}
    <div class="note wx-hint">${dayHint(d, sun)}</div>
  </div>`;
}

function dayHint(d, sun) {
  const bits = [];
  const north = Math.abs(((S.state.site.azimuth % 360) + 540) % 360 - 180) < 55; // 接近正北
  if ((d.precip ?? 0) >= 1.5) bits.push('有雨，露天的先收进来。');
  if ((d.tmin ?? 99) < 8) bits.push('夜里偏冷。');
  if (sun?.indoor) {
    bits.push(north ? '朝北阳台 11 月本来就没直射，走廊只吃散射，别指望晒太阳。' : '走廊里只有散射光，靠门口或补光才管用。');
  } else if (sun && sun.verdict === '不足') {
    bits.push(north ? '朝北阳台 11 月零直射，垫高也没用，只能补光。' : '盆位晒不到太阳，垫高试试。');
  }
  if (!bits.length) bits.push('天气平稳，按计划走就行。');
  return esc(bits.join(' '));
}

function plantCard(p) {
  const plan = S.plans[p.id];
  const sun = S.suns[p.id];
  const d = S.idx?.daily.get(S.today) || {};
  const v = M.plantVerdict(p, plan, sun, d);
  const barCls = plan.leftPct <= 15 ? 'crit' : plan.leftPct <= 40 ? 'low' : '';
  const due = plan.daysLeft <= 0;
  return `<div class="card">
    <div class="plant-head">
      ${plantAvatar(p, 52)}
      <div style="min-width:0">
        <div class="plant-name">${esc(p.name)}</div>
        <div class="plant-sub">${esc(p.fullName || (p.species + (p.cultivar ? ' · ' + p.cultivar : '')))}</div>
      </div>
      <div class="right">
        <div class="big-day ${due ? 'due' : ''}">${due ? (plan.overdueDays ? `−${plan.overdueDays}` : '今天') : plan.daysLeft}${due && !plan.overdueDays ? '' : due ? '<small>天</small>' : '<small>天后</small>'}</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:2px">${due ? '该浇水了' : M.monthDay(plan.nextDate) + ' 浇'}</div>
      </div>
    </div>

    <div class="bar"><i class="${barCls}" style="width:${Math.max(3, plan.leftPct)}%"></i></div>
    <div class="bar-row">
      <span class="pct" style="display:inline-flex;align-items:center;gap:4px">
        <img src="/img/status/icon_status_water_gauge.jpg" alt="" style="width:16px;height:16px;border-radius:50%;object-fit:cover">
        还剩 ${plan.leftPct}%
      </span>
      <span>·</span>
      <span>本次 ${plan.amount} ml</span>
      <span style="margin-left:auto">≈ ${plan.targetWetDays} 天的量</span>
    </div>

    <dl class="metrics">
      <div class="metric"><dt>今日耗水</dt><dd>${plan.dailyUseToday}<small>ml</small></dd></div>
      <div class="metric"><dt>${sun?.indoor ? '散射 DLI' : '直射'}</dt><dd>${sun?.indoor ? sun.dli : (sun ? sun.directHours : 0)}<small>${sun?.indoor ? 'mol' : 'h'}</small></dd></div>
      <div class="metric"><dt>满盆</dt><dd>${plan.capacity}<small>ml</small></dd></div>
    </dl>

    <div class="verdicts">
      ${v.map((x) => `<div class="vline ${x.tone}"><i class="dot"></i><span>${esc(x.text)}</span></div>`).join('')}
    </div>

    ${S.readonly ? '' : `<div class="actions">
      ${due
        ? `<button class="btn wide" data-act="water" data-plant="${p.id}">${ICON.drop} 浇水 ${plan.amount} ml</button>`
        : `<button class="btn ghost" data-act="water" data-plant="${p.id}">提前浇一点</button>`}
      <button class="btn ghost" data-act="soilSheet" data-plant="${p.id}">${ICON.drop} 探土</button>
      <button class="btn ghost" data-act="photoFor" data-plant="${p.id}">${ICON.camera} 拍照</button>
      <button class="btn ghost" data-act="plantDetail" data-plant="${p.id}">参数</button>
    </div>`}
  </div>`;
}

function sunCard() {
  const p0 = S.state.plants[0];
  if (!p0) return '';
  const sun = S.suns[p0.id];
  if (!sun) return '';

  if (sun.indoor) {
    const pct = Math.min(100, Math.round((sun.dli / sun.need) * 100));
    const trip = S.state.site.dayTrip?.enabled ? S.state.site.dayTrip : null;
    const onBalcony = trip
      ? M.sunPlan(
        { ...p0, care: { ...p0.care, place: 'balcony' } },
        S.idx, { ...S.state.site, ...trip, covered: false },
        S.today, S.state.location.lat, S.state.location.lon,
      )
      : null;
    return `<div class="card">
      <div class="card-head">
        <div class="card-title" style="display:flex;align-items:center;gap:6px"><img src="/img/weather/icon_weather_sunny.jpg" style="width:20px;height:20px;border-radius:50%;object-fit:cover" alt="阳光">今天的光</div>
        <div class="note">${sun.note} · 透过率 ${Math.round((S.state.site.corridorLight ?? 0.18) * 100)}%</div>
      </div>
      <div class="dli-gauge">
        <div class="dli-fill" style="width:${pct}%"></div>
        <i style="left:${Math.min(100, Math.round((sun.min / sun.need) * 100))}%"></i>
      </div>
      <div class="bar-row" style="margin-top:6px">
        <span class="pct">DLI ${sun.dli}</span>
        <span>·</span>
        <span>${p0.name}需要 ${sun.need}</span>
        <span style="margin-left:auto">${pct}%</span>
      </div>
      <div class="sun-blocked-box">
        <img src="/img/status/icon_status_sun_blocked.jpg" alt="栏板遮挡">
        <div class="note" style="margin:0;font-size:12px;color:var(--ink)">
          <b>走廊·零直射</b>：朝北走廊 11 月没有直射，垫高没用；门开大或搬到阳台散射量能翻倍。
        </div>
      </div>
      <div class="cmp" style="margin-top:10px">
        <div class="cmp-row"><span>现在：走廊</span><b>${sun.dli}</b></div>
        ${onBalcony ? `<div class="cmp-row hi"><span>白天搬到${esc(S.state.site.dayTrip.label || '外出台')}</span><b>${onBalcony.dli}</b></div>
        <div class="note">${esc(S.state.site.dayTrip.label || '外出台')}今天直射 ${onBalcony.directHours} h，比走廊的纯散射高一个档。</div>`
          : '<div class="note">还没设置外出台，所以没有能晒到直射的位置。</div>'}
      </div>
    </div>`;
  }

  const byHour = new Map((sun.trace || []).map((t) => [t.hour, t]));
  const hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const need = M.heightForSun({ plant: p0, wIndex: S.idx, site: S.state.site, date: S.today, lat: S.state.location.lat, lon: S.state.location.lon, targetHours: 3 });
  return `<div class="card">
    <div class="card-head">
      <div class="card-title" style="display:flex;align-items:center;gap:6px"><img src="/img/weather/icon_weather_sunny.jpg" style="width:20px;height:20px;border-radius:50%;object-fit:cover" alt="阳光">今天的光</div>
      <div class="note">${compass(S.state.site.azimuth)}向 · 栏板 ${S.state.site.parapetCm} cm · 盆面 ${S.state.site.potTopCm} cm</div>
    </div>
    <div class="sunstrip">
      ${hours.map((h) => {
        const t = byHour.get(h);
        const lit = t?.lit;
        const hgt = t ? Math.max(8, Math.round((t.alt / 60) * 100)) : 6;
        return `<div class="suncol">
          <div class="sunbar ${lit ? 'lit' : ''}" style="height:${Math.min(100, hgt)}%" title="${h}:00 高度角 ${t ? Math.round(t.alt) : 0}°"></div>
          <span>${h}</span>
        </div>`;
      }).join('')}
    </div>
    <div class="sun-blocked-box">
      <img src="/img/status/icon_status_sun_blocked.jpg" alt="栏板遮挡">
      <div class="note" style="margin:0;font-size:12px;color:var(--ink)">
        <b>全天直射 ${sun.directHours} 小时</b>：${sun.directHours === 0
          ? `朝${compass(S.state.site.azimuth)}的阳台这个季节太阳方位不在这边。`
          : (S.state.site.parapetType === 'railing' ? '栏杆透光，低角度阳光也能进来。' : '栏板挡掉了低角度的那部分。')}${need && !need.already ? `若要满 3 小时需垫高到 ${need.heightCm} cm。` : ''}
      </div>
    </div>
  </div>`;
}

function taskCard(todays) {
  const hm = nowHM();
  const open = todays.filter((t) => !t.state);
  const doneCount = todays.length - open.length;
  return `<div class="card">
    <div class="card-head">
      <div class="card-title">今天要做的事</div>
      <div class="note">${todays.length ? `${doneCount}/${todays.length} 已完成` : '今天没有任务'}</div>
    </div>
    ${todays.length
      ? `<div class="tasklist">${todays.map((t) => taskRow(t)).join('')}</div>`
      : `<div class="empty">
          <img src="/img/weather/icon_weather_sunny.jpg" alt="晒太阳" style="width:48px;height:48px;border-radius:50%;margin-bottom:8px;box-shadow:0 2px 8px rgba(184,135,27,0.18)">
          <div><strong>清空，去晒晒太阳</strong></div>
          <div style="margin-top:2px">明天要做什么会自己算出来</div>
        </div>`}
    ${open.length ? `<div class="note" style="margin-top:10px">没做的会一直留着；漏太久会标红提醒。</div>` : ''}
  </div>`;
}

function taskRow(t, compact) {
  const meta = KIND_META[t.kind] || { label: t.kind, cls: '' };
  const st = t.state;
  const done = st?.done;
  const skipped = st?.skipped;
  const late = !st && t.date === S.today && t.time < nowHM();
  const lateDay = !st && t.date < S.today;
  const isSunTask = t.kind === 'moveOut' || t.kind === 'toSun' || meta.icon === 'sun';
  return `<div class="task ${done || skipped ? 'done' : ''} ${late || lateDay ? 'late' : ''}">
    <div class="task-time">${esc(t.time)}${lateDay ? '<div style="font-size:9.5px;color:var(--red)">逾期</div>' : ''}</div>
    <div class="task-main">
      <div class="task-title" style="display:flex;align-items:center;gap:6px">
        ${plantBadge(t.plantId, t.emoji, 18)}
        ${isSunTask ? `<img class="task-sun-icon" src="/img/weather/icon_weather_sunny.jpg" alt="晒太阳" title="晒太阳">` : ''}
        <span>${esc(t.title)}</span>
      </div>
      ${compact ? `<div class="task-detail">${M.monthDay(t.date)} ${M.weekdayCN(t.date)} ${esc(t.time)}</div>` : `<div class="task-detail">${esc(t.detail || '')}</div>`}
      ${compact ? '' : `<div class="task-why">${esc(t.why || '')}</div>`}
      <div class="task-meta">
        <span class="badge ${meta.cls}">${meta.img ? `<img src="${meta.img}" alt="" style="width:12px;height:12px;margin-right:3px">` : ''}${meta.label}</span>
        ${skipped ? `<span class="badge">已跳过${st.reason ? '·' + esc(st.reason) : ''}</span>` : ''}
        ${done ? `<span class="badge green">完成 ${st.at ? localHM(st.at) : ''}</span>` : ''}
        ${!compact && !done && !skipped && !S.readonly ? `<button class="linkbtn" data-act="skip" data-task="${t.id}">跳过</button>` : ''}
      </div>
    </div>
    <div class="task-side">
      ${compact || S.readonly ? '' : `<button class="tick ${done ? 'on' : ''}" data-act="toggle" data-task="${esc(t.id)}" aria-label="完成">${ICON.check}</button>`}
    </div>
  </div>`;
}

function explainCard() {
  return `<div class="card tight">
    <details>
      <summary>这些数字是怎么来的</summary>
      <div class="body">
        <p><b>一次浇多少</b>：先算<b>这盆花每天喝多少</b>（基准 × ET₀ × 场地系数，长寿花现在约 30 ml/天），再乘以<b>它能忍受土湿几天</b>（长寿花 6 天、罗汉松 8 天）＝ 180 ml。上限是盆能装下的量（满盆 350 ml × 给水比例），两个取小的。</p>
        <p style="margin-top:6px"><b>为什么不用 350</b>：350 是把整盆浇到饱和的量，会让底半部在饱和线附近待上两三天。景天科的须根缺氧 48 小时就开始褐变，而它的水库在叶子里，不在根里——不需要每次都灌满。</p>
        <p style="margin-top:6px"><b>代价</b>：小剂量浇不到盆底，下层根长期喝不到水会退化。所以每月有一次“彻底浇透”，顺便把攒下的盐冲掉。</p>
        <p style="margin-top:6px"><b>多久浇</b>：日耗 = 基准耗水 × ET₀/1.3 × 校准系数；累计耗完可用水的那天就是浇水日。雨天按盆口面积折算补水。</p>
        <p style="margin-top:6px"><b>直射几小时</b>：按太阳方位角/高度角与栏板高度、盆位进深算遮挡；斜射时用 cos 修正阴影投影。朝向设错这数就会错。</p>
        <p style="margin-top:6px"><b>校准</b>：你说过“还湿”或“干透了”，模型会自己调系数。</p>
      </div>
    </details>
  </div>`;
}

/* ══════════════════════════════════════════════════════ 植株 */
function viewPlants() {
  return `<div class="stack">
    ${S.state.plants.map((p) => {
      const plan = S.plans[p.id];
      const logs = (S.state.logs || []).filter((l) => l.plantId === p.id).slice(0, 5);
      const photos = (S.state.photos || []).filter((x) => x.plantId === p.id);
      const fullIllust = p.illustration || PLANT_ASSETS[p.id]?.full;
      return `<div class="card">
        ${fullIllust ? `<img class="plant-illust-card" src="${fullIllust}" alt="${esc(p.name)}">` : ''}
        <div class="plant-head">
          ${plantAvatar(p, 52)}
          <div>
            <div class="plant-name">${esc(p.name)}</div>
            <div class="plant-sub">${esc(p.fullName || (p.cultivar ? p.name + ' · ' + p.cultivar : p.species))}</div>
          </div>
          <div class="right"><button class="btn ghost sm" data-act="plantDetail" data-plant="${p.id}">编辑</button></div>
        </div>
        <div class="grid2">
          <div>
            <div class="kv"><span>盆口×高</span><b>${p.pot.diaCm}×${p.pot.heightCm} cm</b></div>
            <div class="kv"><span>根球占比</span><b>${Math.round((p.pot.rootBallRatio ?? 1) * 100)}%</b></div>
            <div class="kv"><span>排水</span><b>${p.pot.drainage === 'yes' ? '有孔' : p.pot.drainage === 'no' ? '无孔' : '待确认'}</b></div>
            <div class="kv"><span>基质</span><b>${({ coir: '椰糠/泥炭', humus: '腐叶土', grit: '颗粒土' })[p.pot.media] || p.pot.media}</b></div>
          </div>
          <div>
            <div class="kv"><span>一次浇透</span><b>${plan.amount} ml</b></div>
            <div class="kv"><span>基准日耗</span><b>${p.traits.baseDailyMl} ml</b></div>
            <div class="kv"><span>校准</span><b>×${(p.calibration?.factor ?? 1).toFixed(2)} · ${p.calibration?.samples || 0} 次</b></div>
            <div class="kv"><span>耐寒线</span><b>${p.traits.minNightC}℃</b></div>
          </div>
        </div>
        ${p.notes ? `<div class="note" style="margin-top:10px;padding:9px 11px;background:var(--paper-2);border-radius:10px">${esc(p.notes)}</div>` : ''}
        <div class="hr"></div>
        <div class="card-head"><div class="card-title">最近记录</div><div class="note">${photos.length ? `${photos.length} 张照片` : ''}</div></div>
        ${(() => {
          const checks = (S.state.logs || []).filter((l) => l.plantId === p.id && l.type === '探土').slice(0, 3);
          if (!checks.length) return '<div class="note" style="margin-bottom:6px">还没用竹签校准过——第一次记完，日耗就会按你的土改。</div>';
          return `<div class="note" style="margin-bottom:6px">最近探土：${checks.map((c) => `第 ${c.days} 天${esc(c.note)}`).join(' · ')}　→ 系数 ×${(p.calibration?.factor ?? 1).toFixed(2)}</div>`;
        })()}
        ${logs.length ? logs.map((l) => `<div class="kv"><span>${esc(localYMD(l.at))} · ${esc(l.type)}${l.note ? '（' + esc(l.note) + '）' : ''}</span><b>${l.amountMl ? l.amountMl + ' ml' : (l.days ? l.days + ' 天' : '')}</b></div>`).join('')
          : '<div class="note">还没有浇水或探土记录</div>'}
        <div class="actions">
          <button class="btn ghost sm" data-act="water" data-plant="${p.id}">记一次浇水</button>
          <button class="btn ghost sm" data-act="photoFor" data-plant="${p.id}">上传照片</button>
          <button class="btn ghost sm" data-act="calibrate" data-plant="${p.id}">校准耗水</button>
        </div>
      </div>`;
    }).join('')}
    <button class="btn ghost" data-act="addPlant">${ICON.plus} 添加一株</button>
  </div>`;
}

/* ══════════════════════════════════════════════════════ 天气 */
function wxContext() {
  const site = S.state.site;
  const trip = site.dayTrip?.enabled ? site.dayTrip : null;
  const p0 = S.state.plants[0] || {};
  const want = S.wxSpot ?? (trip ? 'trip' : 'home');
  if (trip && want === 'trip') {
    return {
      key: 'trip',
      label: trip.label || '外出台',
      note: `${trip.label} · ${compass(trip.azimuth)} ${trip.azimuth}° · ${trip.parapetType === 'railing' ? '栏杆有缝' : '实心栏板'}`,
      plant: { ...p0, care: { ...p0.care, place: 'balcony' } },
      site: { ...site, ...trip, covered: false },
    };
  }
  return {
    key: 'home',
    label: site.label || '走廊',
    note: `${site.label || '走廊'} · 只有散射，直射恒为 0`,
    plant: p0,
    site,
  };
}

function viewWeather() {
  const dates = S.idx.dates.slice(0, 9);
  const ctx = wxContext();
  const p0 = S.state.plants[0];
  const trip = S.state.site.dayTrip?.enabled ? S.state.site.dayTrip : null;
  const sunAt = (date) => M.sunPlan(ctx.plant, S.idx, ctx.site, date, S.state.location.lat, S.state.location.lon);

  const rows = dates.map((date) => {
    const d = S.idx.daily.get(date);
    const sun = sunAt(date);
    return `<tr class="${date === S.today ? 'today' : ''}">
      <td>${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}<span class="dn">${M.weekdayCN(date).replace('周', '')}</span></td>
      <td style="text-align:left;color:var(--muted);white-space:nowrap">${weatherIconImg(d.code, 20)} ${M.weatherWord(d.code)}</td>
      <td>${Math.round(d.tmin)}–${Math.round(d.tmax)}°</td>
      <td class="${(d.precip ?? 0) > 0 ? 'rain-cell' : 'rain-cell zero'}">${num(d.precip, 1)}</td>
      <td class="col-hide">${num(d.et0, 2)}</td>
      <td class="col-hide">${num(d.sunSec / 3600, 1)}</td>
      <td style="font-weight:600">${sun.indoor ? 0 : sun.effectiveHours.toFixed(1)}</td>
      <td class="col-hide">${sun.dli}</td>
    </tr>`;
  }).join('');

  const et0s = dates.map((x) => S.idx.daily.get(x).et0);
  const dlis = dates.map((x) => sunAt(x).dli);

  return `<div class="stack">
    <div class="card">
      <div class="card-head" style="align-items:flex-start">
        <div>
          <div class="card-title">未来 9 天</div>
          <div class="note" style="margin-top:3px">${esc(ctx.note)}</div>
        </div>
        ${trip ? `<div class="seg mini">
          <button data-act="wxSpot" data-spot="home" class="${ctx.key === 'home' ? 'on' : ''}">${esc(S.state.site.label || '走廊')}</button>
          <button data-act="wxSpot" data-spot="trip" class="${ctx.key === 'trip' ? 'on' : ''}">${esc(trip.label)}</button>
        </div>` : ''}
      </div>
      <div style="overflow-x:auto">
      <table class="tbl">
        <thead><tr><th>日期</th><th style="text-align:left">天</th><th>气温</th><th>雨 mm</th><th class="col-hide">ET₀</th><th class="col-hide">日照 h</th><th>实照 h</th><th class="col-hide">DLI</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="note" style="margin-top:10px">“实照”是按云量折算后的有效直射小时（几何上晒得到 × 晴天比例），全阴天会掉到 1 h 以下${trip ? `；想看走廊的点上面那颗按钮` : ''}。改朝向或栏板类型，整列都会变。</div>
    </div>
    <div class="cols even">
      <div class="card">
        <div class="card-head"><div class="card-title">蒸发需求 ET₀</div><div class="note">mm/天 · 点击查看数值</div></div>
        ${chartWidget('et0', { vals: et0s, dates, color: '#376a83', unit: 'mm/天', fmt: (v) => v.toFixed(2) })}
        <div class="note" style="margin-top:8px">ET₀ 高 = 盆干得快。模型直接用这个数缩放日耗水。</div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">${esc(ctx.label)}的光量 DLI</div><div class="note">mol/m²/d · 点击查看数值</div></div>
        ${chartWidget('dli', { vals: dlis, dates, color: '#b8871b', unit: 'mol/m²/d', fmt: (v) => v.toFixed(1), threshold: p0.traits.lightNeedDli || 10, thresholdLabel: '花花需 ' + (p0.traits.lightNeedDli || 10) })}
        <div class="note" style="margin-top:8px">花花要 ≥${p0.traits.lightNeedDli}、松松 ≥${S.state.plants[1]?.traits.lightNeedDli ?? 6} 才够。</div>
      </div>
    </div>
    ${sunSetupCard()}
  </div>`;
}

function chartWidget(id, { vals, dates, color, unit, fmt, threshold, thresholdLabel }) {
  S.charts = S.charts || {};
  S.charts[id] = { vals, dates, unit, fmt: fmt || ((v) => v), threshold };

  const W = 340, H = 118;
  const padL = 6, padR = 6, padT = 14, padB = 18;
  const iw = W - padL - padR, ih = H - padT - padB;
  const clean = vals.map((v) => (Number.isFinite(v) ? v : 0));

  // 只用数据本身定纵向范围；阈值高得离谱时不参与缩放，否则会把曲线压扁
  const lo0 = Math.min(...clean), hi0 = Math.max(...clean);
  const span = hi0 - lo0;
  const pad = span > 0.001 ? span * 0.22 : Math.max(0.5, hi0 * 0.2);
  const lo = Math.max(0, lo0 - pad), hi = hi0 + pad;
  const thrIn = threshold != null && threshold >= lo && threshold <= hi;

  const x = (i) => padL + (i * iw) / Math.max(1, clean.length - 1);
  const y = (v) => padT + ih - ((v - lo) / Math.max(0.001, hi - lo)) * ih;

  const line = clean.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(clean.length - 1).toFixed(1)},${(padT + ih).toFixed(1)} L${x(0).toFixed(1)},${(padT + ih).toFixed(1)} Z`;
  const grid = [lo, (lo + hi) / 2, hi].map((v) => ({ v, y: y(v) }));

  const axis = [0, Math.floor((clean.length - 1) / 2), clean.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i);
  const todayIdx = dates.findIndex((d) => d === S.today);

  const dots = clean.map((v, i) => {
    const isToday = i === todayIdx;
    return `<circle class="cdot ${isToday ? 'today' : ''}" data-i="${i}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${isToday ? 3.8 : 2}" fill="${isToday ? '#fff' : color}" stroke="${color}" stroke-width="${isToday ? 2.2 : 0}"/>`;
  }).join('');

  const thr = thrIn
    ? `<line x1="${padL}" x2="${W - padR}" y1="${y(threshold).toFixed(1)}" y2="${y(threshold).toFixed(1)}" stroke="${color}" stroke-width="1" stroke-dasharray="3 3" opacity=".5"/>
       <text x="${padL + 2}" y="${(y(threshold) - 4).toFixed(1)}" text-anchor="start" class="cthr" fill="${color}">${esc(thresholdLabel || '需 ' + fmt(threshold))}</text>`
    : '';

  return `<div class="chart" data-chart="${id}">
    <div class="chart-tip" hidden></div>
    <svg viewBox="0 0 ${W} ${H}" class="csvg" role="img">
      <defs><linearGradient id="g-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity=".2"/>
        <stop offset="100%" stop-color="${color}" stop-opacity=".01"/>
      </linearGradient></defs>
      ${grid.map((g) => `<line x1="${padL}" x2="${W - padR}" y1="${g.y.toFixed(1)}" y2="${g.y.toFixed(1)}" stroke="var(--line-2)" stroke-width="1"/>`).join('')}
      <path d="${area}" fill="url(#g-${id})"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/>
      ${thr}
      <line class="ccross" x1="0" x2="0" y1="${padT}" y2="${padT + ih}" stroke="${color}" stroke-width="1" opacity="0"/>
      ${dots}
      <circle class="ccrossdot" cx="0" cy="0" r="5" fill="#fff" stroke="${color}" stroke-width="2.4" opacity="0"/>
      ${grid.map((g) => `<text x="${W - padR}" y="${(g.y - 4).toFixed(1)}" text-anchor="end" class="clab">${fmt(g.v)}</text>`).join('')}
      ${axis.map((i) => `<text x="${x(i).toFixed(1)}" y="${H - 4}" text-anchor="${i === 0 ? 'start' : i === clean.length - 1 ? 'end' : 'middle'}" class="cxlab">${Number(dates[i].slice(5, 7))}/${Number(dates[i].slice(8, 10))}</text>`).join('')}
    </svg>
    <div class="chart-sum">${chartSummary(clean, dates, fmt, unit, threshold, thrIn)}</div>
  </div>`;
}

function chartSummary(vals, dates, fmt, unit, threshold, thrIn) {
  const max = Math.max(...vals), min = Math.min(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const iMax = vals.indexOf(max), iMin = vals.indexOf(min);
  const ti = dates.indexOf(S.today);
  const today = ti >= 0 ? vals[ti] : null;
  const md = (i) => `${Number(dates[i].slice(5, 7))}/${Number(dates[i].slice(8, 10))}`;
  const parts = [];
  if (today != null) parts.push(`<b>今天 ${fmt(today)}<i>${unit}</i></b>`);
  parts.push(`<span>峰值 ${fmt(max)}<em>${md(iMax)}</em></span>`);
  parts.push(`<span>最低 ${fmt(min)}<em>${md(iMin)}</em></span>`);
  parts.push(`<span>均值 ${fmt(avg)}</span>`);
  // 阈值不在图内时，用文字说明差距，而不是把曲线压扁
  if (threshold != null && !thrIn) {
    const gap = threshold - max;
    parts.push(`<span class="thr-note">${gap > 0 ? `距 ${fmt(threshold)} 还差 ${fmt(gap)}` : `已超 ${fmt(threshold)}`}</span>`);
  }
  return parts.join('');
}

function sunSetupCard() {
  const site = S.state.site;
  const trip = site.dayTrip || null;
  const p0 = S.state.plants[0];
  const lat = S.state.location.lat, lon = S.state.location.lon;
  const probe = { ...p0, care: { ...p0.care, place: 'balcony' } };

  const home = M.sunPlan(p0, S.idx, site, S.today, lat, lon);
  const win = trip ? M.sunWindow({ spot: trip, wIndex: S.idx, date: S.today }) : null;
  const tripSun = trip ? M.sunPlan(probe, S.idx, { ...site, ...trip, covered: false }, S.today, lat, lon) : null;
  const railing = trip?.parapetType === 'railing';

  return `<div class="card">
    <div class="card-head"><div class="card-title" style="display:flex;align-items:center;gap:6px"><img src="/img/weather/icon_weather_sunny.jpg" style="width:20px;height:20px;border-radius:50%;object-fit:cover" alt="阳光">光的两处</div><div class="note">${M.monthDay(S.today)}</div></div>

    <div class="spot-rows">
      <div class="spot-row">
        <div class="spot-name">走廊<span>现在在这儿</span></div>
        <div class="spot-val">DLI <b>${home.dli}</b><small>散射 · 透光 ${Math.round((site.corridorLight ?? 0.18) * 100)}%</small></div>
      </div>
      <div class="spot-row ${trip ? '' : 'off'}">
        <div class="spot-name">${esc(trip?.label || '西阳台')}<span>${trip?.label ? '白天外出台' : '未设置'}</span></div>
        <div class="spot-val">${trip
          ? (win
            ? `实照 <b>${tripSun.effectiveHours.toFixed(1)} h</b><small>${win.start}–${win.end} · 几何 ${win.hours} h · DLI ${tripSun.dli}</small>`
            : `<b>0 h</b><small>今天这边也没直射</small>`)
          : `<b>—</b><small>点下面启用</small>`}</div>
      </div>
    </div>

    ${win && trip ? `<div class="note" style="margin:2px 0 12px;padding:9px 11px;background:${tripSun.effectiveHours >= 1.5 ? 'var(--green-3)' : 'var(--paper-2)'};border-radius:10px">
      ${tripSun.effectiveHours >= 1.5
        ? `<b>今天值得搬：${win.start} 前后过去，${String(win.last + 1).padStart(2, '0')}:15 搬回来。</b>`
        : `<b>今天云太厚（实照只有 ${tripSun.effectiveHours.toFixed(1)} h），搬不搬差别不大。</b>`}
      ${railing ? '栏杆有缝隙，盆直接放地上就能晒到，不用垫高。' : '栏板实心，盆要垫到 55 cm 以上。'}
    </div>` : ''}

    <div class="field">
      <label>${esc(trip?.label || '外出台')}朝向：${trip?.azimuth ?? 270}°　<span style="color:var(--ink-2)">${compass(trip?.azimuth ?? 270)}</span></label>
      <input type="range" min="0" max="355" step="5" value="${trip?.azimuth ?? 270}" id="tripAz">
      <div class="hint">手机指南针贴着栏杆朝外测。西晒一般是 250–290°。</div>
    </div>
    <div class="grid2">
      <div class="field"><label>栏板类型</label><select id="tripParapet">
        <option value="solid" ${!railing ? 'selected' : ''}>实心矮墙（挡低角度阳光）</option>
        <option value="railing" ${railing ? 'selected' : ''}>栏杆有缝隙（基本不挡光）</option>
      </select></div>
      <div class="field"><label>外出台</label><select id="tripEnabled">
        <option value="1" ${trip ? 'selected' : ''}>启用</option>
        <option value="0" ${!trip ? 'selected' : ''}>关闭</option>
      </select></div>
    </div>
    <div class="actions"><button class="btn ghost sm" data-act="saveTrip">保存这两处</button></div>
    <div class="note" style="margin-top:8px">走廊是家，只有散射；${esc(trip?.label || '西阳台')}是白天能晒到的地方，每天搬一次。</div>
  </div>`;
}

const compass = (deg) => {
  const names = ['北', '东北偏北', '东北', '东北偏东', '东', '东南偏东', '东南', '东南偏南', '南', '西南偏南', '西南', '西南偏西', '西', '西北偏西', '西北', '西北偏北'];
  return names[Math.round(((deg % 360) / 22.5)) % 16];
};

/* ══════════════════════════════════════════════════════ 相册 */
function viewAlbum() {
  const photos = S.state.photos || [];
  if (!photos.length) {
    return `<div class="card"><div class="empty"><strong>还没有照片</strong>每周留一张，看黄化率、冠幅、花色的变化</div>
      <div class="actions" style="justify-content:center">
        ${S.state.plants.map((p) => `<button class="btn" data-act="photoFor" data-plant="${p.id}">${ICON.camera} 拍${esc(p.name)}</button>`).join('')}
      </div></div>`;
  }
  const byPlant = {};
  for (const ph of photos) (byPlant[ph.plantId] ||= []).push(ph);
  return `<div class="stack">
    ${Object.entries(byPlant).map(([pid, list]) => {
      const p = S.state.plants.find((x) => x.id === pid) || { id: pid, name: '未分类', emoji: '🌱' };
      return `<div class="card">
        <div class="card-head"><div class="card-title" style="display:flex;align-items:center;gap:8px">${plantAvatar(p, 24)} <span>${esc(p.name)} · ${list.length} 张</span></div>
        <button class="btn ghost sm" data-act="photoFor" data-plant="${pid}">${ICON.camera} 新增</button></div>
        <div class="grid">
          ${list.map((ph) => {
            const sc = ph.analysis?.score;
            const cls = sc == null ? 's-none' : sc >= 75 ? 's-good' : sc >= 55 ? 's-mid' : 's-bad';
            return `<button class="thumb" data-act="openPhoto" data-photo="${ph.id}">
              <img src="/photos/${esc(ph.file)}" loading="lazy" alt="">
              <div class="tagline">
                <span>${esc(localMD(ph.at))}</span>
                <span class="score-dot ${cls}">${sc ?? '·'}</span>
              </div>
            </button>`;
          }).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ══════════════════════════════════════════════════════ 设置 */
function viewSettings() {
  const st = S.state;
  const v = S.config?.vision || {};
  return `<div class="stack">
    ${S.readonly ? `<div class="card" style="border-color:var(--gold);background:#fdf7e8">
      <div class="card-head"><div class="card-title">只读模式</div><div class="note">这个地址没带口令</div></div>
      <div class="note" style="margin-bottom:10px">能看不能改。输入口令解锁，会记在这台设备上。</div>
      <div class="field"><label>口令</label><input id="tokIn" type="password" placeholder="在电脑的 .token 文件里"></div>
      <div class="actions"><button class="btn" data-act="saveToken">解锁</button></div>
    </div>` : ''}
    <div class="card">
      <div class="card-head"><div class="card-title">装到手机桌面</div></div>
      <div class="note" style="line-height:1.75">
        <b>iPhone</b>：用 Safari 打开 <span class="mono">https://<你的 tailnet 域名></span> → 底部「分享」→「添加到主屏幕」。<br>
        <b>安卓</b>：用 Chrome 打开同一地址 → 右上角菜单 →「安装应用」。<br>
        装完是从桌面直接进，没有地址栏，图标是「莳」。
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">位置</div></div>
      <div class="grid2">
        <div class="field"><label>名称</label><input id="locName" value="${esc(st.location.name)}"></div>
        <div class="field"><label>简称</label><input id="locShort" value="${esc(st.location.short)}"></div>
        <div class="field"><label>纬度</label><input id="locLat" type="number" step="0.0001" value="${st.location.lat}"></div>
        <div class="field"><label>经度</label><input id="locLon" type="number" step="0.0001" value="${st.location.lon}"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">阳台几何</div><div class="note">影响日照计算</div></div>
      <div class="field"><label>朝向（外法线方位角）</label>
        <div class="seg" id="azSeg">${[0, 90, 180, 270].map((a) => `<button data-az="${a}" class="${st.site.azimuth === a ? 'on' : ''}">${compass(a)}</button>`).join('')}</div>
        <input type="number" id="siteAz" value="${st.site.azimuth}" style="margin-top:8px">
      </div>
      <div class="grid2">
        <div class="field"><label>栏板高 cm</label><input id="siteParapet" type="number" value="${st.site.parapetCm}"></div>
        <div class="field"><label>盆面离地高 cm</label><input id="sitePotTop" type="number" value="${st.site.potTopCm}"></div>
        <div class="field"><label>盆到栏板进深 cm</label><input id="siteDepth" type="number" value="${st.site.depthCm}"></div>
        <div class="field"><label>栏板类型</label>
          <select id="siteParapetType">
            <option value="solid" ${(st.site.parapetType || 'solid') === 'solid' ? 'selected' : ''}>实心矮墙（挡低角度阳光）</option>
            <option value="railing" ${st.site.parapetType === 'railing' ? 'selected' : ''}>栏杆有缝隙（基本不挡光）</option>
          </select>
        </div>
        <div class="field"><label>上方有顶棚？</label>
          <select id="siteCovered"><option value="no" ${!st.site.covered ? 'selected' : ''}>没有（露天）</option><option value="yes" ${st.site.covered ? 'selected' : ''}>有（半封闭）</option></select>
        </div>
        <div class="field"><label>走廊透光率 %</label><input id="siteCorridor" type="number" step="1" value="${Math.round((st.site.corridorLight ?? 0.18) * 100)}">
          <span class="hint">实测：手机测光 App 屏幕朝上，分别量摆放点和阳台地面的照度，除一下就是它。<br>没实测时参考：紧贴门口 10–15%、门内 2 m 约 5%、3 m 或拐角 2–3%。</span></div>
      </div>
      <button class="btn" data-act="saveSite">保存几何</button>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">提醒节奏</div></div>
      <div class="grid2">
        <div class="field"><label>拍照间隔（天）</label><input id="setPhoto" type="number" value="${st.settings.photoEveryDays}"></div>
        <div class="field"><label>花期巡霉间隔（天）</label><input id="setBloom" type="number" value="${st.settings.bloomCheckEveryDays}"></div>
      </div>
      <div class="switch">
        <div><b style="font-size:13.5px">浏览器通知</b><div class="note">页面开着才会弹；关掉页面就靠 .ics 或看板。</div></div>
        <button class="btn ghost sm" data-act="notifyPerm">${('Notification' in window) && Notification.permission === 'granted' ? '已开启' : '开启'}</button>
      </div>
      <div class="actions"><button class="btn" data-act="saveSettings">保存节奏</button></div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">视觉模型</div><div class="note">${v.hasKey ? '已配置 ' + esc(v.keyHint || '') : '未配置'}</div></div>
      <div class="field"><label>服务商预设</label>
        <div class="seg">${[
          ['magpie', '本机'], ['qwen', '通义'], ['zhipu', '智谱'], ['openai', 'OpenAI'], ['custom', '自定义'],
        ].map(([k, n]) => `<button data-preset="${k}">${n}</button>`).join('')}</div>
      </div>
      <div class="field"><label>Base URL</label><input id="vBase" placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" value="${esc(v.baseUrl || '')}"></div>
      <div class="field"><label>模型名</label><input id="vModel" placeholder="qwen-vl-max" value="${esc(v.model || '')}"></div>
      <div class="grid2">
        <div class="field"><label>思考强度</label><select id="vEffort">
          ${['off', 'low', 'high', 'max'].map((e) => `<option value="${e}" ${(v.reasoningEffort || 'max') === e ? 'selected' : ''}>${e}</option>`).join('')}
        </select><span class="hint">max 一次约 20 秒、2.6k tokens</span></div>
        <div class="field"><label>max_tokens</label><input id="vMax" type="number" value="${v.maxTokens || 4000}">
          <span class="hint">max 档思考会吃掉额度，太小会返回空</span></div>
      </div>
      <div class="field"><label>API Key</label><input id="vKey" type="password" placeholder="${v.hasKey ? '已保存，留空则不修改' : 'sk-...'}">
        <span class="hint">只存在这台 Mac 的 data/config.json，不会下发到浏览器。</span></div>
      <div class="actions">
        <button class="btn ghost sm" data-act="testVision">测试连接</button>
        <button class="btn sm" data-act="saveVision">保存</button>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">数据</div></div>
      <div class="actions">
        <button class="btn ghost sm" data-act="exportJson">导出 JSON</button>
        <button class="btn ghost sm" data-act="importJson">导入 JSON</button>
        <button class="btn ghost sm" data-act="exportIcs">导出 .ics 日历</button>
      </div>
      <div class="note" style="margin-top:10px">照片在 <span class="mono">data/photos/</span>，state.json 里只存索引；备份整个 data 目录最稳。</div>
    </div>

    <div class="note" style="text-align:center;padding:10px 0 30px">莳花 · shì huā · 本机运行 · ${S.state.plants.length} 株 · v1</div>
  </div>`;
}

/* ══════════════════════════════════════════════════════ 浮层 */
function renderSheet() {
  const host = $('#sheetHost') || (() => {
    const el = document.createElement('div');
    el.id = 'sheetHost';
    document.body.appendChild(el);
    return el;
  })();
  if (!S.sheet) { host.innerHTML = ''; host.className = ''; host.onclick = null; return; }
  host.className = 'sheet-host';
  host.innerHTML = `<div class="sheet" style="position:relative">
      <button class="sheet-close" data-act="closeSheet" aria-label="关闭">${ICON.x}</button>
      ${S.sheet.html}
    </div>`;
  host.onclick = (e) => { if (e.target === host) closeSheet(); };
}

const closeSheet = () => { S.sheet = null; renderSheet(); };
const openSheet = (html) => { S.sheet = { html }; renderSheet(); };

/* ══════════════════════════════════════════════════════ 动作 */
const plantById = (id) => S.state.plants.find((p) => p.id === id);

async function toggleTask(id) {
  const task = S.tasks.find((t) => t.id === id);
  if (!task) return;
  const cur = S.state.tasksDone[id];
  if (cur?.done) {
    delete S.state.tasksDone[id];
  } else {
    S.state.tasksDone[id] = { done: true, at: iso() };
    if (task.kind === 'measure') {
      S.state.site.lightMeasured = true;
      openSheet(`<h3>测完了，把数填进去</h3>
        <p class="sub">走廊透过率 = 花盆处的照度 ÷ 户外开阔处的照度</p>
        <div class="field"><label>走廊透光率 %</label><input id="measuredPct" type="number" step="1" value="${Math.round((S.state.site.corridorLight ?? 0.18) * 100)}">
          <span class="hint">例：户外 20000 lux、花盆处 6000 lux → 填 30</span></div>
        <button class="btn wide" data-act="saveMeasured">保存并重算</button>`);
    }
    if (task.kind === 'water') {
      const p = plantById(task.plantId);
      p.care.lastWateredAt = iso();
      p.care.lastWaterMl = task.amountMl || S.plans[p.id].amount;
      (S.state.logs ||= []).unshift({ id: 'l' + Date.now(), plantId: p.id, type: '浇水', at: iso(), amountMl: p.care.lastWaterMl });
      toast(`${p.name} 浇水 ${p.care.lastWaterMl} ml 已记录`, 'ok');
    }
  }
  await saveState();
  compute();
  render();
}

function openSkip(taskId) {
  const reasons = ['还湿，不用浇', '已经干透了', '天气原因', '今天没空', '位置换了'];
  openSheet(`<h3>跳过这条</h3><p class="sub">跳过的原因会拿来校准模型</p>
    <div class="stack" style="gap:8px">
      ${reasons.map((r) => `<button class="btn ghost wide" data-act="skipReason" data-task="${esc(taskId)}" data-reason="${esc(r)}">${esc(r)}</button>`).join('')}
    </div>`);
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function applySoilReading(p, dry) {
  const plan = S.plans[p.id];
  const last = new Date(p.care.lastWateredAt).getTime();
  const days = Math.max(0.5, (Date.now() - last) / 86400000);
  const used = p.care.lastWaterMl || plan.amount;
  const observedRate = used / days;
  const modelRate = Math.max(1, plan.dailyUseToday);
  const ratio = clamp(observedRate / modelRate, 0.55, 1.8);
  const before = p.calibration.factor ?? 1;
  let after;
  if (dry) {
    p.care.lastSoilDryAt = iso();
    delete p.care.lastSoilWetAt;
    // 单次读数最多动 15%，避免一次异常把模型带偏
    after = clamp(before * clamp(0.5 + 0.5 * ratio, 0.85, 1.15), 0.45, 1.9);
  } else {
    p.care.lastSoilWetAt = iso();
    delete p.care.lastSoilDryAt;
    after = clamp(before * 0.85, 0.45, 1.9);
  }
  p.calibration.factor = after;
  p.calibration.samples = (p.calibration.samples || 0) + 1;
  p.calibration.lastAdjust = iso();
  (S.state.logs ||= []).unshift({
    id: 'l' + Date.now(), plantId: p.id, type: '探土',
    at: iso(), note: dry ? '干' : '湿', days: Math.round(days * 10) / 10,
  });
  return { before, after, days };
}

function openSoilSheet(plantId) {
  const p = plantById(plantId);
  const plan = S.plans[p.id];
  openSheet(`<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">${plantAvatar(p, 36)}<h3 style="margin:0">${esc(p.name)} 的土</h3></div>
    <p class="sub">插一根竹签到盆底，拔出来看下半截。${(() => { const d = (Date.now() - new Date(p.care.lastWateredAt)) / 86400000; return d < 0.5 ? '刚浇过' : `距上次浇水 ${Math.round(d)} 天`; })()}，模型认为还剩 ${plan.leftPct}%。</p>
    <div class="stack" style="gap:8px">
      <button class="btn wide" data-act="soilRecord" data-plant="${plantId}" data-dry="1">${ICON.check} 下半截是干的</button>
      <button class="btn ghost wide" data-act="soilRecord" data-plant="${plantId}" data-dry="0">下半截还带湿土</button>
    </div>
    <div class="note" style="margin-top:12px">记完马上重算：干的会立刻把这次浇水提到今天，湿的会往后推 2 天左右；同时按“这轮实际耗水速度”校正日耗系数。</div>`);
}

/** 竹签读数：干 / 湿。既记录，也校正模型 */
async function soilCheck(taskId, dry) {
  const task = S.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const p = plantById(task.plantId);
  const { before, after, days } = applySoilReading(p, dry);
  S.state.tasksDone[taskId] = { done: true, at: iso() };

  await saveState();
  compute();
  render();
  const d = after > before ? '↑' : after < before ? '↓' : '=';
  toast(`第 ${Math.round(days)} 天${dry ? '干' : '还湿'}：日耗系数 ${before.toFixed(2)} ${d} ${after.toFixed(2)}`, 'ok');
}

async function soilRecord(plantId, dry) {
  const p = plantById(plantId);
  const { before, after, days } = applySoilReading(p, dry);
  closeSheet();
  await saveState();
  compute();
  render();
  const d = after > before ? '↑' : after < before ? '↓' : '=';
  toast(`第 ${Math.round(days)} 天${dry ? '干' : '还湿'}：系数 ${before.toFixed(2)} ${d} ${after.toFixed(2)}`, 'ok');
}

async function skipTask(taskId, reason) {
  S.state.tasksDone[taskId] = { skipped: true, reason, at: iso() };
  const task = S.tasks.find((t) => t.id === taskId);
  const p = task && plantById(task.plantId);
  if (p && reason.includes('还湿')) {
    p.calibration.factor = Math.max(0.5, (p.calibration.factor ?? 1) * 0.88);
    p.calibration.samples = (p.calibration.samples || 0) + 1;
    p.calibration.lastAdjust = iso();
    toast('记下了：土还湿 → 模型调低耗水 12%');
  } else if (p && reason.includes('干透')) {
    p.calibration.factor = Math.min(1.8, (p.calibration.factor ?? 1) * 1.12);
    p.calibration.samples = (p.calibration.samples || 0) + 1;
    p.calibration.lastAdjust = iso();
    toast('记下了：干透得更早 → 模型调高耗水 12%');
  }
  closeSheet();
  await saveState();
  compute();
  render();
}

async function doWater(plantId, amountOverride) {
  const p = plantById(plantId);
  const amount = amountOverride ?? S.plans[plantId].amount;
  p.care.lastWateredAt = iso();
  p.care.lastWaterMl = amount;
  (S.state.logs ||= []).unshift({ id: 'l' + Date.now(), plantId, type: '浇水', at: iso(), amountMl: amount });
  await saveState();
  compute();
  render();
  toast(`${p.name}：${amount} ml 已记录`, 'ok');
}

function openWaterSheet(plantId) {
  const p = plantById(plantId);
  const plan = S.plans[plantId];
  const dr = p.pot.drainage;
  openSheet(`<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">${plantAvatar(p, 36)}<div><h3 style="margin:0">给 ${esc(p.name)} 浇水</h3></div></div>
    <p class="sub">盆容积 ${Math.round(M.potVolumeMl(p.pot))} ml · 满盆 ${plan.capacity} ml · 本次 ${plan.amount} ml ≈ ${plan.targetWetDays} 天的耗水</p>
    <div class="card tight" style="box-shadow:none;background:var(--paper-2);margin-bottom:14px">
      <div style="font-size:13px;line-height:1.6">
        ${dr === 'no'
          ? `无孔盆只能分次给：<b>${plan.amount} ml</b>（满盆的 ${Math.round(plan.refill * 100)}%），分 3 次沿盆边慢浇，间隔 5 分钟。真正的解法是套盆：连土球扣进有孔塑料盆，取出浇透 ${plan.capacity} ml、沥干、放回。`
          : dr === 'yes'
            ? (plan.amount < plan.capacity
              ? `有孔盆：分两遍慢浇共 <b>${plan.amount} ml</b>——这是"${plan.targetWetDays} 天的量"，不会出水，正常。若倒到一半盆底就开始出水，说明土还湿，停手。${p.pot.saucer ? '15 分钟内倒掉托盘水' : '没托盘就垫个盘子或搬到水槽'}。`
              : `有孔盆：分两遍慢浇共 <b>${plan.amount} ml</b>，盆底出水即停，${p.pot.saucer ? '15 分钟内倒掉托盘水' : '没托盘就垫个盘子或搬到水槽'}。`)
            : `排水还没确认，先按满盆的 ${Math.round(plan.refill * 100)}%（<b>${plan.amount} ml</b>）给：确认有孔就可浇到出水，没孔就只能这么多。`}
      </div>
    </div>
    <div class="field"><label>实际浇了多少 ml</label><input id="waterAmt" type="number" value="${plan.amount}"></div>
    ${dr === 'no' ? `<div class="note" style="margin-bottom:12px;padding:9px 11px;background:#eef4ef;border-radius:10px">
      换成有孔盆（或打一个孔）之后：<b>${Math.round(M.availableWaterMl(p) / 10) * 10} ml，约 ${Math.max(3, Math.round(M.availableWaterMl(p) / Math.max(1, plan.dailyUseToday)))} 天一次</b>。
      ${p.name}要的是"浇透再等干"，不是小口抿——现在这 80 ml 是被盆逼出来的，不是它想要的。</div>` : ''}
    <button class="btn wide" data-act="confirmWater" data-plant="${plantId}">确认浇水</button>`);
}

function openPlantDetail(plantId) {
  const p = plantById(plantId);
  openSheet(`<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">${plantAvatar(p, 36)}<div><h3 style="margin:0">${esc(p.name)}</h3><p class="sub" style="margin:0">${esc(p.species)}</p></div></div>
    <div class="grid2">
      <div class="field"><label>盆口内径 cm</label><input id="pdDia" type="number" step="0.5" value="${p.pot.diaCm}"></div>
      <div class="field"><label>盆底直径 cm</label><input id="pdBottom" type="number" step="0.5" value="${p.pot.bottomCm}"></div>
      <div class="field"><label>盆高 cm</label><input id="pdHeight" type="number" step="0.5" value="${p.pot.heightCm}"></div>
      <div class="field"><label>根球占盆比</label><input id="pdRoot" type="number" step="0.05" min="0.3" max="1" value="${p.pot.rootBallRatio ?? 1}"></div>
      <div class="field"><label>排水</label><select id="pdDrain">
        <option value="yes" ${p.pot.drainage === 'yes' ? 'selected' : ''}>有孔</option>
        <option value="no" ${p.pot.drainage === 'no' ? 'selected' : ''}>无孔</option>
        <option value="unknown" ${p.pot.drainage === 'unknown' ? 'selected' : ''}>待确认</option></select></div>
      <div class="field"><label>基质</label><select id="pdMedia">
        <option value="coir" ${p.pot.media === 'coir' ? 'selected' : ''}>椰糠/泥炭（保水强）</option>
        <option value="humus" ${p.pot.media === 'humus' ? 'selected' : ''}>腐叶土/园土</option>
        <option value="grit" ${p.pot.media === 'grit' ? 'selected' : ''}>颗粒土（透气好）</option></select></div>
      <div class="field"><label>基准日耗 ml（ET₀=1.3）</label><input id="pdUse" type="number" value="${p.traits.baseDailyMl}"></div>
      <div class="field"><label>夜间耐受线 ℃</label><input id="pdMinC" type="number" value="${p.traits.minNightC}"></div>
      <div class="field"><label>现在放在哪</label><select id="pdPlace">
        <option value="balcony" ${p.care.place === 'balcony' ? 'selected' : ''}>阳台（露天）</option>
        <option value="corridor" ${p.care.place === 'corridor' ? 'selected' : ''}>走廊（靠门/窗）</option>
        <option value="indoor" ${p.care.place === 'indoor' ? 'selected' : ''}>室内</option></select></div>
      <div class="field"><label>每次给水比例</label><select id="pdRefill">
        <option value="" ${!Number.isFinite(p.pot.refill) ? 'selected' : ''}>自动（有孔100% / 待确认60% / 无孔45%）</option>
        <option value="1" ${p.pot.refill === 1 ? 'selected' : ''}>100% 满盆浇透</option>
        <option value="0.75" ${p.pot.refill === 0.75 ? 'selected' : ''}>75%</option>
        <option value="0.6" ${p.pot.refill === 0.6 ? 'selected' : ''}>60%</option>
        <option value="0.45" ${p.pot.refill === 0.45 ? 'selected' : ''}>45%</option></select></div>
    </div>
    <div class="field"><label>备注</label><textarea id="pdNotes" rows="2">${esc(p.notes || '')}</textarea></div>
    <div class="note" style="margin-bottom:12px">满盆浇透 ${S.plans[p.id].capacity} ml；按当前设置每次给 ${S.plans[p.id].amount} ml，约 ${S.plans[p.id].daysLeft} 天一次。</div>
    <button class="btn wide" data-act="savePlant" data-plant="${plantId}">保存</button>`);
}

function openPhoto(photoId) {
  const ph = (S.state.photos || []).find((x) => x.id === photoId);
  if (!ph) return;
  const p = plantById(ph.plantId) || { name: '未分类' };
  const a = ph.analysis;
  openSheet(`<h3>${esc(p.name)} · ${esc(localYMD(ph.at))}</h3>
    <p class="sub">${esc(ph.note || '')}</p>
    <img src="/photos/${esc(ph.file)}" style="width:100%;border-radius:12px;border:1px solid var(--line)" alt="">
    ${a ? analysisHtml(a) : '<div class="note" style="margin-top:12px">还没有分析过。</div>'}
    <div class="actions" style="margin-top:14px">
      <button class="btn wide" data-act="analyze" data-photo="${ph.id}">${a ? '重新分析' : '让模型看看'}</button>
    </div>
    <div class="actions">
      <button class="btn ghost sm" data-act="delPhoto" data-photo="${ph.id}">删除这张</button>
    </div>`);
}

function analysisHtml(a) {
  const sc = a.score;
  const cls = sc == null ? 's-none' : sc >= 75 ? 's-good' : sc >= 55 ? 's-mid' : 's-bad';
  return `<div style="margin-top:14px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <span class="score-dot ${cls}" style="width:30px;height:30px;font-size:12px">${sc ?? '·'}</span>
      <div><b style="font-size:14px">${esc(a.summary || '（无结论）')}</b>
      <div class="note">${esc(a.model || '')} · ${esc(a.at ? localMDHM(a.at) : '')} · 置信 ${esc(a.confidence || '–')}</div></div>
    </div>
    ${a.findings?.length ? `<div class="analysis-block"><h4>看到的问题</h4>
      ${a.findings.map((f) => `<div class="kv" style="align-items:flex-start"><span style="flex:1">${esc(f.sign)}<br><span style="font-size:11px;color:var(--muted)">${esc(f.cause || '')}</span></span><b style="color:${f.severity === '高' ? 'var(--red)' : f.severity === '中' ? 'var(--gold)' : 'var(--muted)'}">${esc(f.severity)}</b></div>`).join('')}
    </div>` : ''}
    ${a.actions?.length ? `<div class="analysis-block"><h4>接下来怎么干</h4>
      ${a.actions.map((x) => `<div class="kv" style="align-items:flex-start"><span style="flex:none;color:var(--muted)">${esc(x.when)}</span><b style="flex:1;text-align:right;font-weight:500">${esc(x.do)}</b></div>`).join('')}
    </div>` : ''}
  </div>`;
}

/* ══════════════════════════════════════════════════════ 照片与 AI */
let pendingPlant = null;
const filePick = $('#filePick');

function pickPhoto(plantId) {
  pendingPlant = plantId;
  filePick.value = '';
  filePick.click();
}

filePick?.addEventListener('change', async () => {
  const f = filePick.files?.[0];
  if (!f || !pendingPlant) return;
  toast('正在上传压缩…');
  try {
    const dataUrl = await compress(f);
    await api('/api/photos', { method: 'POST', body: { plantId: pendingPlant, dataUrl, at: iso() } });
    await loadAll({ silent: true });
    toast('照片已存好，可以点开让模型看看', 'ok');
  } catch (e) {
    toast('上传失败：' + e.message, 'err');
  }
  pendingPlant = null;
});

async function compress(file, max = 1500, q = 0.84) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bitmap.width * scale);
  c.height = Math.round(bitmap.height * scale);
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

async function analyze(photoId) {
  const ph = (S.state.photos || []).find((x) => x.id === photoId);
  const p = plantById(ph.plantId) || S.state.plants[0];
  const plan = S.plans[p.id];
  const days = S.idx.dates.slice(0, 7).map((d) => S.idx.daily.get(d));
  const suns = S.idx.dates.slice(0, 7).map((d) => M.sunPlan(p, S.idx, S.state.site, d, S.state.location.lat, S.state.location.lon));
  const ctx = {
    plantName: p.name, species: p.species, cultivar: p.cultivar,
    lastWatered: p.care.lastWateredAt?.slice(0, 16).replace('T', ' '),
    lastWaterMl: p.care.lastWaterMl,
    daysSinceWater: Math.max(0, Math.round((Date.now() - new Date(p.care.lastWateredAt)) / 86400000)),
    waterLeftPct: plan.leftPct,
    tempMin7: Math.min(...days.map((d) => d.tmin)).toFixed(1),
    tempMax7: Math.max(...days.map((d) => d.tmax)).toFixed(1),
    rain7: days.reduce((a, d) => a + (d.precip || 0), 0).toFixed(1),
    et07: days.reduce((a, d) => a + (d.et0 || 0), 0).toFixed(2),
    place: p.care.place === 'corridor' ? '走廊' : '阳台',
    potDia: p.pot.diaCm,
    drainage: p.pot.drainage === 'yes' ? '有孔' : p.pot.drainage === 'no' ? '无孔' : '未知',
    sunHours7: suns.reduce((a, s) => a + s.directHours, 0),
    dli7: (suns.reduce((a, s) => a + s.dli, 0) / 7).toFixed(1),
    stage: p.traits.bloom && p.traits.stage === 'bloom' ? '花期（满苞）' : '营养生长',
    ts: ph.at?.slice(0, 16).replace('T', ' '),
    note: ph.note || '',
    prevSummary: ph.analysis?.summary || '',
  };
  toast('模型正在看…');
  const r = await api('/api/analyze', { method: 'POST', body: { photoId, context: ctx } });
  if (!r.ok) {
    if (r.code === 'NO_VISION') {
      toast('还没配置视觉模型，去设置里填', 'err');
      S.route = 'settings';
      location.hash = '#/settings';
      render();
    } else {
      toast('分析失败：' + r.error, 'err');
    }
    return;
  }
  await loadAll({ silent: true });
  openPhoto(photoId);
  toast('分析完成', 'ok');
}

/* ══════════════════════════════════════════════════════ 导出 */
function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function exportIcs() {
  const tasks = M.buildTasks({
    plants: S.state.plants, wIndex: S.idx, site: S.state.site, settings: S.state.settings,
    horizonDays: 14, photos: S.state.photos || [], doneMap: {},
  });
  const fmt = (date, time) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
  const esc2 = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const bytes = (str) => new TextEncoder().encode(str).length;
  const fold = (line) => {
    const out = [];
    let cur = line;
    while (bytes(cur) > 73) {
      let i = Math.min(73, cur.length);
      while (i > 1 && bytes(cur.slice(0, i)) > 73) i--;
      out.push(cur.slice(0, i));
      cur = ' ' + cur.slice(i);
    }
    out.push(cur);
    return out.join('\r\n');
  };
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//plant-care//CN', 'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Shanghai', 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800', 'TZOFFSETTO:+0800', 'TZNAME:CST', 'END:STANDARD', 'END:VTIMEZONE',
  ];
  for (const t of tasks) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${t.id.replace(/[|]/g, '-')}@plant-care`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      `DTSTART;TZID=Asia/Shanghai:${fmt(t.date, t.time)}`,
      fold(`SUMMARY:${esc2(t.title)}`),
      fold(`DESCRIPTION:${esc2((t.detail || '') + '\n' + (t.why || ''))}`),
      'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc2(t.title)}`), 'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  download('plant-care.ics', lines.join('\r\n'), 'text/calendar;charset=utf-8');
}

/* ══════════════════════════════════════════════════════ 事件 */
document.addEventListener('click', async (e) => {
  const go = e.target.closest('[data-go]');
  if (go) { S.route = go.dataset.go; location.hash = '#/' + S.route; render(); window.scrollTo(0, 0); return; }

  const az = e.target.closest('[data-az]');
  if (az) {
    S.state.site.azimuth = Number(az.dataset.az);
    S.state.site.azimuthVerified = true;
    compute();
    render();
    saveState();
    return;
  }

  const preset = e.target.closest('[data-preset]');
  if (preset) {
    const P = {
      magpie: ['http://127.0.0.1:3425/v1', 'commandcode-plan/deepseek/deepseek-v4.1-flash'],
      qwen: ['https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-vl-max'],
      zhipu: ['https://open.bigmodel.cn/api/paas/v4', 'glm-4v-plus'],
      moonshot: ['https://api.moonshot.cn/v1', 'moonshot-v1-8k-vision-preview'],
      openai: ['https://api.openai.com/v1', 'gpt-4o-mini'],
      custom: ['', ''],
    }[preset.dataset.preset];
    if (P) { $('#vBase').value = P[0]; $('#vModel').value = P[1]; }
    return;
  }

  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const WRITE = ['toggle','skip','skipReason','confirmWater','saveSite','saveSettings','savePlant','saveVision','testVision','exportIcs','calAdjust','createPlant','delPhoto','notifyPerm','saveAzimuth','analyze','saveMeasured'];
  if (S.readonly && WRITE.includes(act)) {
    toast('只读模式：先输入口令', 'err');
    openTokenSheet();
    return;
  }
  const plantId = btn.dataset.plant;

  switch (act) {
    case 'toggle': return toggleTask(btn.dataset.task);
    case 'skip': return openSkip(btn.dataset.task);
    case 'soil': return soilCheck(btn.dataset.task, btn.dataset.dry === '1');
    case 'soilRecord': return soilRecord(btn.dataset.plant, btn.dataset.dry === '1');
    case 'soilSheet': return openSoilSheet(btn.dataset.plant);
    case 'skipReason': return skipTask(btn.dataset.task, btn.dataset.reason);
    case 'water': return openWaterSheet(plantId);
    case 'confirmWater': {
      const amt = Number($('#waterAmt')?.value) || S.plans[plantId].amount;
      closeSheet();
      return doWater(plantId, amt);
    }
    case 'photoFor': return pickPhoto(plantId);
    case 'plantDetail': return openPlantDetail(plantId);
    case 'openPhoto': return openPhoto(btn.dataset.photo);
    case 'analyze': return analyze(btn.dataset.photo).catch((err) => toast(err.message, 'err'));
    case 'closeSheet': return closeSheet();
    case 'askToken': return openTokenSheet();
    case 'saveToken': {
      const v = ($('#tokInput')?.value || '').trim();
      if (v.length < 4) return toast('口令不对', 'err');
      return applyToken(v);
    }
    case 'wxSpot': { S.wxSpot = btn.dataset.spot; render(); return; }
    case 'saveTrip': {
      const site = S.state.site;
      const az = Number($('#tripAz').value);
      const parapet = $('#tripParapet').value;
      const enabled = $('#tripEnabled').value === '1';
      if (!enabled) {
        if (site.dayTrip) site.dayTrip.enabled = false;
      } else {
        site.dayTrip = {
          label: '西阳台', parapetCm: 110, potTopCm: 45, depthCm: 70,
          leadMin: 20, lagMin: 15, sideWallM: 2,
          ...(site.dayTrip || {}),
          enabled: true, azimuth: az, parapetType: parapet,
        };
      }
      await saveState(); compute(); render();
      toast(enabled ? `${site.dayTrip.label}已保存（${compass(az)}）` : '外出台已关闭', 'ok');
      return;
    }
    case 'saveAzimuth': {
      S.state.site.azimuthVerified = true;
      await saveState(); toast('朝向已保存', 'ok'); render(); return;
    }
    case 'saveMeasured': {
      const pct = Number($('#measuredPct').value);
      if (!Number.isFinite(pct) || pct < 1 || pct > 100) return toast('填 1–100 之间的数', 'err');
      S.state.site.corridorLight = Math.round(pct) / 100;
      S.state.site.lightMeasured = true;
      await saveState(); compute(); closeSheet(); render();
      toast(`走廊透光率已设为 ${Math.round(pct)}%，全部重算`, 'ok');
      return;
    }
    case 'saveSite': {
      const s = S.state.site;
      s.azimuth = Number($('#siteAz').value) || s.azimuth;
      s.parapetCm = Number($('#siteParapet').value) || s.parapetCm;
      s.potTopCm = Number($('#sitePotTop').value) || s.potTopCm;
      s.depthCm = Number($('#siteDepth').value) || s.depthCm;
      s.covered = $('#siteCovered').value === 'yes';
      s.parapetType = $('#siteParapetType')?.value || 'solid';
      const cl = Number($('#siteCorridor').value);
      if (Number.isFinite(cl) && cl > 0) s.corridorLight = Math.min(0.6, Math.max(0.03, cl / 100));
      s.azimuthVerified = true;
      await saveState(); compute(); toast('几何已保存', 'ok'); render(); return;
    }
    case 'saveSettings': {
      S.state.settings.photoEveryDays = Number($('#setPhoto').value) || 7;
      S.state.settings.bloomCheckEveryDays = Number($('#setBloom').value) || 3;
      const l = S.state.location;
      l.name = $('#locName')?.value || l.name;
      l.short = $('#locShort')?.value || l.short;
      l.lat = Number($('#locLat')?.value) || l.lat;
      l.lon = Number($('#locLon')?.value) || l.lon;
      await saveState(); await loadAll({ silent: true }); toast('已保存', 'ok'); return;
    }
    case 'savePlant': {
      const p = plantById(plantId);
      p.pot.diaCm = Number($('#pdDia').value) || p.pot.diaCm;
      p.pot.bottomCm = Number($('#pdBottom').value) || p.pot.bottomCm;
      p.pot.heightCm = Number($('#pdHeight').value) || p.pot.heightCm;
      p.pot.rootBallRatio = Math.min(1, Math.max(0.3, Number($('#pdRoot').value) || 1));
      p.pot.drainage = $('#pdDrain').value;
      p.pot.media = $('#pdMedia').value;
      p.traits.baseDailyMl = Number($('#pdUse').value) || p.traits.baseDailyMl;
      p.traits.minNightC = Number($('#pdMinC').value);
      const place = $('#pdPlace').value;
      p.care.place = place;
      p.care.rainExposed = place === 'balcony';
      const rf = $('#pdRefill').value;
      if (rf) p.pot.refill = Number(rf); else delete p.pot.refill;
      p.notes = $('#pdNotes').value;
      await saveState(); compute(); closeSheet(); toast('参数已更新', 'ok'); return;
    }
    case 'saveVision': {
      const body = { vision: { baseUrl: $('#vBase').value.trim(), model: $('#vModel').value.trim(), reasoningEffort: $('#vEffort').value, maxTokens: Number($('#vMax').value) || 4000 } };
      const k = $('#vKey').value.trim();
      if (k) body.vision.apiKey = k;
      await api('/api/config', { method: 'PUT', body });
      S.config = await api('/api/config');
      toast('视觉模型已保存', 'ok');
      render(); return;
    }
    case 'testVision': {
      const body = { vision: { baseUrl: $('#vBase').value.trim(), model: $('#vModel').value.trim(), reasoningEffort: $('#vEffort').value, maxTokens: Number($('#vMax').value) || 4000 } };
      const k = $('#vKey').value.trim();
      if (k) body.vision.apiKey = k;
      btn.innerHTML = '<span class="spin"></span> 测试中';
      const r = await api('/api/config/test', { method: 'POST', body });
      toast(r.ok ? '连接成功' : '连接失败：' + r.error, r.ok ? 'ok' : 'err');
      btn.innerHTML = '测试连接';
      return;
    }
    case 'notifyPerm': {
      if (!('Notification' in window)) return toast('这个浏览器不支持通知', 'err');
      const p = await Notification.requestPermission();
      toast(p === 'granted' ? '通知已开启' : '你拒绝了通知', p === 'granted' ? 'ok' : 'err');
      render(); return;
    }
    case 'exportJson': return download(`plant-care-${M.localDate()}.json`, JSON.stringify(S.state, null, 1));
    case 'importJson': {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json';
      inp.onchange = async () => {
        const f = inp.files[0];
        if (!f) return;
        try {
          const data = JSON.parse(await f.text());
          if (!Array.isArray(data.plants)) throw new Error('不是有效的备份');
          S.state = data;
          await saveState(); await loadAll({ silent: true }); toast('已导入', 'ok');
        } catch (err) { toast('导入失败：' + err.message, 'err'); }
      };
      inp.click(); return;
    }
    case 'exportIcs': return exportIcs();
    case 'saveToken': {
      const v = $('#tokIn')?.value.trim();
      if (!v) return toast('先填口令', 'err');
      localStorage.setItem('plant_token', v);
      toast('已记住，正在重载…', 'ok');
      setTimeout(() => location.reload(), 400);
      return;
    }
    case 'addPlant': return openSheet(`<h3>添加一株</h3><p class="sub">先建壳，参数之后再填</p>
      <div class="field"><label>名字</label><input id="npName" placeholder="绿萝"></div>
      <div class="field"><label>学名 / 品种</label><input id="npSpecies" placeholder="Epipremnum aureum"></div>
      <div class="grid2">
        <div class="field"><label>盆口 cm</label><input id="npDia" type="number" value="12"></div>
        <div class="field"><label>基准日耗 ml</label><input id="npUse" type="number" value="30"></div>
      </div>
      <button class="btn wide" data-act="createPlant">创建</button>`);
    case 'createPlant': {
      const id = 'p_' + Date.now().toString(36);
      S.state.plants.push({
        id, name: $('#npName').value || '新植物', species: $('#npSpecies').value || '', emoji: '🌱',
        pot: { diaCm: Number($('#npDia').value) || 12, bottomCm: (Number($('#npDia').value) || 12) * 0.77, heightCm: (Number($('#npDia').value) || 12) * 0.9, drainage: 'unknown', saucer: false, cachepot: false, media: 'coir', rootBallRatio: 0.85 },
        traits: { cam: false, baseDailyMl: Number($('#npUse').value) || 30, minNightC: 5, lightNeedDli: 8, lightMinDli: 4, anoxiaDays: 5, storageDays: 5, bloom: false, stage: 'veg', rainSensitive: true },
        schedule: { check: '07:00', prep: '21:00', water: '08:30', moveOut: '07:30', moveIn: '17:00' },
        care: { lastWateredAt: iso(), lastWaterMl: 0, place: 'balcony', rainExposed: true },
        calibration: { factor: 1, samples: 0 },
        notes: '', createdAt: iso(),
      });
      await saveState(); compute(); closeSheet(); toast('已添加', 'ok'); return;
    }
    case 'delPhoto': {
      const id = btn.dataset.photo;
      await api('/api/photos/' + id, { method: 'DELETE' });
      closeSheet();
      await loadAll({ silent: true });
      toast('已删除');
      return;
    }
    case 'calibrate': {
      const p = plantById(plantId);
      openSheet(`<h3>校准 ${esc(p.name)} 的耗水</h3>
        <p class="sub">现在的系数 ×${(p.calibration.factor ?? 1).toFixed(2)}（${p.calibration.samples || 0} 次校准）</p>
        <div class="note" style="margin-bottom:12px">下次浇水前用竹签确认：如果比模型说的更早干 → 调高；更晚干 → 调低。</div>
        <div class="stack" style="gap:8px">
          <button class="btn ghost wide" data-act="calAdjust" data-plant="${plantId}" data-dir="1">干得比预期快（+10%）</button>
          <button class="btn ghost wide" data-act="calAdjust" data-plant="${plantId}" data-dir="-1">干得比预期慢（−10%）</button>
          <button class="btn ghost wide" data-act="calAdjust" data-plant="${plantId}" data-dir="0">重置为 1.0</button>
        </div>`);
      return;
    }
    case 'calAdjust': {
      const p = plantById(plantId);
      const dir = Number(btn.dataset.dir);
      p.calibration.factor = dir === 0 ? 1 : Math.min(1.8, Math.max(0.5, (p.calibration.factor ?? 1) * (dir > 0 ? 1.1 : 0.9)));
      p.calibration.samples = (p.calibration.samples || 0) + (dir ? 1 : 0);
      p.calibration.lastAdjust = iso();
      await saveState(); compute(); closeSheet(); toast(`系数 ×${p.calibration.factor.toFixed(2)}`, 'ok'); return;
    }
    default: return;
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'azimuth') {
    S.state.site.azimuth = Number(e.target.value);
    S.state.site.azimuthVerified = true;
    compute();
    saveState();
  }
});

/* ══════════════════════════════════════════════════════ 图表交互 */
const CW = 340, CDOTS = 116;

function chartIndex(chartEl, clientX) {
  const svg = chartEl.querySelector('.csvg');
  const data = S.charts?.[chartEl.dataset.chart];
  if (!svg || !data) return -1;
  const r = svg.getBoundingClientRect();
  if (!r.width) return -1;
  const vb = ((clientX - r.left) / r.width) * CW;
  const n = data.vals.length;
  const step = (CW - 12) / Math.max(1, n - 1);
  let i = Math.round((vb - 6) / step);
  return Math.max(0, Math.min(n - 1, i));
}

function showChartTip(chartEl, i) {
  const data = S.charts?.[chartEl.dataset.chart];
  const svg = chartEl.querySelector('.csvg');
  const tip = chartEl.querySelector('.chart-tip');
  const dot = chartEl.querySelector(`.cdot[data-i="${i}"]`);
  if (!data || !svg || !tip || !dot) return;

  const r = svg.getBoundingClientRect();
  const cx = Number(dot.getAttribute('cx'));
  const cy = Number(dot.getAttribute('cy'));
  const px = (cx / CW) * r.width;
  const py = (cy / CDOTS) * r.height;

  const cross = chartEl.querySelector('.ccross');
  const crossDot = chartEl.querySelector('.ccrossdot');
  if (cross) { cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('opacity', '.5'); }
  if (crossDot) { crossDot.setAttribute('cx', cx); crossDot.setAttribute('cy', cy); crossDot.setAttribute('opacity', '1'); }

  const date = data.dates[i];
  const v = data.vals[i];
  tip.innerHTML = `<b>${M.monthDay(date)} ${M.weekdayCN(date)}</b><span>${Number.isFinite(v) ? data.fmt(v) : '–'}<i>${data.unit}</i></span>`;
  tip.hidden = false;

  const tw = tip.offsetWidth || 96;
  let left = px - tw / 2;
  left = Math.max(2, Math.min(r.width - tw - 2, left));
  tip.style.left = left + 'px';
  tip.style.top = Math.max(-6, py - tip.offsetHeight - 12) + 'px';
}

function hideChartTip(chartEl) {
  const tip = chartEl?.querySelector('.chart-tip');
  if (tip) tip.hidden = true;
  const cross = chartEl?.querySelector('.ccross');
  const crossDot = chartEl?.querySelector('.ccrossdot');
  if (cross) cross.setAttribute('opacity', '0');
  if (crossDot) crossDot.setAttribute('opacity', '0');
}

let activeChart = null;
document.addEventListener('pointermove', (e) => {
  const el = e.target.closest?.('.chart');
  if (!el) { if (activeChart) { hideChartTip(activeChart); activeChart = null; } return; }
  const i = chartIndex(el, e.clientX);
  if (i >= 0) { showChartTip(el, i); activeChart = el; }
}, { passive: true });

document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest?.('.chart');
  if (!el) return;
  const i = chartIndex(el, e.clientX);
  if (i >= 0) showChartTip(el, i);
}, { passive: true });

document.addEventListener('pointerleave', () => {
  if (activeChart) { hideChartTip(activeChart); activeChart = null; }
}, { passive: true });

// 朝向滑杆实时预览
document.addEventListener('input', (e) => {
  if (e.target.id === 'azimuth') {
    const v = Number(e.target.value);
    const label = e.target.parentElement.querySelector('label');
    const p0 = S.state.plants[0];
    const tmpSite = { ...S.state.site, azimuth: v };
    const cur = M.sunPlan(p0, S.idx, tmpSite, S.today, S.state.location.lat, S.state.location.lon);
    label.innerHTML = `外法线方位角：${v}°　<span style="color:var(--ink-2)">${compass(v)}</span> · 盆位直射 <b style="color:var(--green)">${cur.directHours} h</b>`;
    S.state.site.azimuth = v;
  }
});

/* ══════════════════════════════════════════════════════ 提示与轮询 */
function toast(msg, kind = '') {
  const host = $('#toast');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 320); }, 2600);
}

let firedThisHour = new Set();
let quietCatchUp = true;
function tick() {
  // 跨天了就整份重算，别让"今天"停在昨天
  if (S.state && M.localDate() !== S.today) {
    firedThisHour = new Set();
    quietCatchUp = true;
    loadAll({ silent: true });
    return;
  }
  const hm = nowHM();
  if (quietCatchUp && S.tasks.length) {
    for (const t of S.tasks) if (t.date === S.today && t.time <= hm) firedThisHour.add(t.id + '|' + t.time);
    quietCatchUp = false;
  }
  for (const t of S.tasks) {
    if (t.date !== S.today || t.state || t.time > hm) continue;
    const key = t.id + '|' + t.time;
    if (firedThisHour.has(key)) continue;
    firedThisHour.add(key);
    const msg = `${t.time} ${t.title}`;
    if ('Notification' in window && Notification.permission === 'granted' && window.isSecureContext) {
      try { new Notification('莳花', { body: msg, tag: key }); } catch { toast(msg); }
    } else {
      toast('⏰ ' + msg);
    }
  }
  const p = pendingTasks();
  if (p !== lastPending) { lastPending = p; render(); }
}
let lastPending = 0;

/* 前端文件更新了就自动刷新，避免一直跑旧逻辑 */
let appVer = null;
async function checkVersion() {
  try {
    const r = await fetch('/api/version', { cache: 'no-store' });
    const { v } = await r.json();
    if (appVer && v !== appVer) { location.reload(); return; }
    appVer = v;
  } catch { /* 忽略 */ }
}
checkVersion();
setInterval(checkVersion, 45000);

setInterval(tick, 30000);
setInterval(() => { if (!S.sheet && !document.activeElement?.matches('input,textarea,select')) loadAll({ silent: true }); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadAll({ silent: true }); });
function routeOf() {
  const r = (location.hash.replace('#/', '').split('?')[0]) || 'today';
  return ['today', 'plants', 'weather', 'album', 'settings'].includes(r) ? r : 'today';
}

window.addEventListener('hashchange', () => {
  const r = routeOf();
  if (['today', 'plants', 'weather', 'album', 'settings'].includes(r) && r !== S.route) { S.route = r; render(); }
});

/* ══════════════════════════════════════════════════════ 全局错误兜底 */
window.addEventListener('error', (e) => {
  document.documentElement.dataset.err = e.message;
  const t = document.getElementById('toast');
  if (t) {
    const el = document.createElement('div');
    el.className = 'toast err';
    el.textContent = '页面出错：' + e.message;
    t.appendChild(el);
  }
});
window.addEventListener('unhandledrejection', (e) => {
  document.documentElement.dataset.err = String(e.reason?.message || e.reason);
});

/* ══════════════════════════════════════════════════════ 口令输入与兜底 */
function openTokenSheet() {
  openSheet(`<h3>输入口令</h3>
    <p class="sub">这个页面现在是只读的。输入口令后才能打勾、记录浇水。</p>
    <div class="field"><label>口令</label>
      <input id="tokInput" inputmode="numeric" autocomplete="off" placeholder="10 位数字" value="${esc(SAVED_INPUT)}">
      <span class="hint">口令只存在本机浏览器里，不会发给别人。</span></div>
    <button class="btn wide" data-act="saveToken">确认</button>
    <div class="note" style="margin-top:10px">没有口令？在 Mac 上跑 <span class="mono">cat ~/Documents/杭电研/tian/plant-care/.token   # 项目根目录下的 .token</span></div>`);
}

async function applyToken(t) {
  try { localStorage.setItem('plant_token', t); } catch {}
  try { localStorage.setItem('plant_token_input', t); } catch {}
  // 同时让服务端种一个 cookie，之后即使 localStorage 被清也能自动恢复
  try { await fetch('/plant-token?t=' + encodeURIComponent(t), { mode: 'no-cors', credentials: 'same-origin' }); } catch {}
  location.reload();
}

async function bootstrapToken() {
  if (TOKEN) {
    try { await fetch('/plant-token?t=' + encodeURIComponent(TOKEN), { mode: 'no-cors', credentials: 'same-origin' }); } catch {}
  }
  const r = await api('/api/auth').catch(() => ({ protected: false, ok: true }));
  S.readonly = !!r.protected && !r.ok;
  render();
}

/* ══════════════════════════════════════════════════════ 启动 */
S.route = routeOf();
loadAll();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
bootstrapToken();
