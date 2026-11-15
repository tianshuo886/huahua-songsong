import * as M from './model.js';
import { sunPosition } from './solar.js';

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
  route: 'today', plans: {}, suns: {}, tasks: [], today: M.localDate(), calMonth: null,
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

/** 老数据只剩 kind 时，用它补一句像样的标题，别把「搬去晒」当成任务名 */
function kindTitle(kind, plantId) {
  const name = (plantId && plantByIdSafe(plantId)?.name) || '花';
  const map = {
    water: `给${name}浇透（浇到底孔出水）`,
    prep: '接一壶水放着回温',
    check: `摸一下${name}的土`,
    moveOut: '把两盆搬回阳台',
    moveIn: '把两盆搬进走廊',
    toSun: '把两盆搬到西阳台晒太阳',
    toHome: '把两盆搬回走廊',
    bloom: `扒开${name}的花苞查灰霉`,
    photo: `给${name}拍一张`,
    fert: `给${name}施一次稀薄肥`,
    leach: `给${name}彻底浇透冲盐`,
    measure: '测一下走廊和两个阳台的光照',
    light: '测一下走廊和两个阳台的光照',
    weekendOut: '下班前看一眼周末放哪儿',
    weekendBack: '周一搬回工位前先看一遍',
    weekendPrep: '周末前把水接好',
    reminder: '提醒',
  };
  return map[kind] || (KIND_META[kind]?.label ? `${KIND_META[kind].label}` : '完成过');
}

/** 历史记录里可能引用已删掉的植株，别让它抛错 */
function plantByIdSafe(id) {
  return (S.state?.plants || []).find((p) => p.id === id) || null;
}

const KIND_META = {
  water: { label: '浇水', cls: 'green', icon: 'drop', img: '/img/actions/icon_action_watering.jpg' },
  prep: { label: '备水', cls: 'blue', icon: 'drop', img: '/img/actions/icon_action_water_prep.jpg' },
  check: { label: '探土', cls: '', icon: 'drop', img: '/img/actions/icon_action_soil_check.jpg' },
  moveIn: { label: '搬进屋', cls: 'blue', icon: 'move', img: '/img/actions/icon_action_move.jpg' },
  moveOut: { label: '晒太阳', cls: 'gold', icon: 'sun', img: '/img/actions/icon_action_sun.jpg' },
  bloom: { label: '查灰霉', cls: 'gold', icon: 'flower' },
  photo: { label: '拍照', cls: '', icon: 'camera' },
  fert: { label: '施肥', cls: '', icon: 'flask' },
  leach: { label: '冲盐', cls: 'blue', icon: 'drop' },
  waterManual: { label: '浇水', cls: 'green', icon: 'drop', img: '/img/actions/icon_action_watering.jpg' },
  measure: { label: '测光', cls: 'blue', icon: 'sun', img: '/img/actions/icon_action_sun.jpg' },
  light: { label: '测光', cls: 'blue', icon: 'sun', img: '/img/actions/icon_action_sun.jpg' },
  toSun: { label: '搬去晒', cls: 'gold', icon: 'sun', img: '/img/actions/icon_action_sun.jpg' },
  toHome: { label: '搬回来', cls: '', icon: 'move', img: '/img/actions/icon_action_move.jpg' },
  weekendOut: { label: '周末寄放', cls: 'blue', icon: 'move', img: '/img/actions/icon_action_move.jpg' },
  weekendBack: { label: '搬回工位', cls: '', icon: 'move', img: '/img/actions/icon_action_move.jpg' },
  weekendPrep: { label: '周末准备', cls: 'blue', icon: 'drop', img: '/img/actions/icon_action_water_prep.jpg' },
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

const WX_EMOJI = { 晴: '☀️', 少云: '🌤', 阴: '☁️', 雾: '🌫', 毛毛雨: '🌦', 雨: '🌧', 雪: '🌨', 阵雨: '🌧', 雷雨: '⛈', 多云: '⛅' };

function weatherIconImg(code, size = 20) {
  const c = Number(code);
  let file = 'sunny';
  if (c === 0) file = 'sunny';
  else if (c <= 2) file = 'cloudy';
  else if (c === 3) file = 'overcast';
  else if (c >= 45 && c <= 48) file = 'fog';
  else if (c >= 51 && c <= 57) file = 'drizzle';
  else if (c >= 61 && c <= 67) file = 'rain';
  else if (c >= 71 && c <= 77) file = 'snow';
  else if (c >= 80 && c <= 82) file = 'shower';
  else if (c >= 95) file = 'thunder';
  else file = 'overcast';

  const word = M.weatherWord(code);
  const emoji = WX_EMOJI[word] || '☁️';
  // 新图还没生成时先借用最接近的一张；再不行才退回 emoji，绝不留裂图
  const backup = ['rain', 'shower'].includes(file) ? 'drizzle' : 'overcast';
  const onerr = `if(this.dataset.fb){this.remove()}else{this.dataset.fb=1;this.src='/img/weather/icon_weather_${backup}.jpg'}`;
  return `<span class="wx-icon-wrap" style="width:${size}px;height:${size}px">
    <span class="wx-emoji" aria-hidden="true">${emoji}</span>
    <img class="wx-icon-img" src="/img/weather/icon_weather_${file}.jpg" alt="${word}" style="width:${size}px;height:${size}px" onerror="${onerr}">
  </span>`;
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
    // 待办历史：老数据从 tasksDone 回填一次，往后每次加载都把新算出来的任务记下来
    const filled = backfillHistory();
    const recorded = recordTaskHistory();
    if (!S.readonly && (filled || recorded)) saveState();
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

/**
 * 把"勾任务"也当成一次搬动：trip|日期|toSun / toHome 的完成时间就是搬动时间。
 * 这样旧的勾选习惯不用改，光照直接按真实时间算；取消勾选也会把记录撤掉。
 */
function syncMoveLog(st) {
  const site = st?.site;
  if (!site) return;
  const log = Array.isArray(site.moveLog) ? site.moveLog : (site.moveLog = []);
  const wanted = new Map();
  for (const [id, v] of Object.entries(st.tasksDone || {})) {
    const m = /^trip\|(\d{4}-\d{2}-\d{2})\|(toSun|toHome)$/.exec(id);
    if (!m || !v?.done || !v.at) continue;
    const at = new Date(v.at).getTime();
    if (!Number.isFinite(at)) continue;
    wanted.set(id, { at: v.at, to: m[2] === 'toSun' ? 'trip' : 'home' });
  }
  // 任务被取消勾选 → 对应的搬动记录也撤掉
  for (let i = log.length - 1; i >= 0; i--) {
    const src = log[i]?.src;
    if (typeof src === 'string' && src.startsWith('task:') && !wanted.has(src.slice(5))) log.splice(i, 1);
  }
  const have = new Set(log.map((e) => e?.src).filter(Boolean));
  for (const [id, mv] of wanted) {
    if (have.has('task:' + id)) continue;
    const at = new Date(mv.at).getTime();
    // 手动点过同一趟（±10 分钟、同方向）就不重复记
    const dup = log.some((e) => e?.to === mv.to
      && Number.isFinite(new Date(e.at).getTime())
      && Math.abs(new Date(e.at).getTime() - at) < 10 * 60000);
    if (!dup) log.push({ ...mv, src: 'task:' + id });
  }
  log.sort((a, b) => new Date(a.at) - new Date(b.at));
  site.moveLog = log.slice(-500);
}

function compute() {
  const st = S.state;
  S.today = M.localDate();
  syncMoveLog(st);
  S.plans = {};
  S.suns = {};
  for (const p of st.plants) {
    S.plans[p.id] = M.waterPlan(p, S.idx, st.settings, Date.now(), st.site);
    S.suns[p.id] = M.sunPlan(p, S.idx, st.site, S.today, st.location.lat, st.location.lon);
  }
  S.tasks = M.buildTasks({
    plants: st.plants, wIndex: S.idx, site: st.site,
    settings: st.settings, horizonDays: 7,
    photos: st.photos || [], doneMap: st.tasksDone || {}, reminders: st.reminders || [],
  });
}

async function saveState() {
  if (!S.state) return;
  syncMoveLog(S.state);
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
    app.innerHTML = `<div class="boot" style="flex-direction:column;gap:14px">
      <div style="display:flex;align-items:center;gap:10px"><span class="boot-dot"></span>${S.err ? '连不上服务：' + esc(S.err) : '正在读取花况…'}</div>
      ${S.err ? '<button class="btn ghost sm" id="retryBoot">重试</button>' : ''}
      ${S.err ? '<div class="note" style="font-size:11px;text-align:center;line-height:1.7">一直失败的话：先确认手机的 Tailscale 已连接，<br>或改用同一 WiFi 下的局域网地址</div>' : ''}
    </div>`;
    const rb = document.getElementById('retryBoot');
    if (rb) rb.onclick = () => { S.err = ''; render(); loadAll(); };
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

/* ══════════════════════════════════════════════════════ 今日与杭电四季画卷 */
const CAMPUS_BANNERS = [
  // ── 秋季 ──
  {
    id: 'au_10th_bldg',
    season: 'autumn',
    src: '/img/scenes/scene_au_10th_bldg.jpg',
    tag: '10教秋景 · 杭电',
    sub: '秋木斑斓 · 远眺圆孔综合楼',
  },
  {
    id: 'au_wentian_ginkgo',
    season: 'autumn',
    src: '/img/scenes/scene_au_wentian_ginkgo.jpg',
    tag: '问天广场 · 银杏金雨',
    sub: '三省石柱 · 金叶漫卷大草坪',
  },
  {
    id: 'au_brick_balcony',
    season: 'autumn',
    src: '/img/scenes/scene_au_brick_balcony.jpg',
    tag: '红砖秋阳 · 阳台花语',
    sub: '红砖实壁 · 漫天银杏与温润斜阳',
  },
  {
    id: 'balcony_classic',
    season: 'autumn',
    src: '/img/scenes/scene_balcony_hero.jpg',
    tag: '钱塘 · 下沙',
    sub: '红砖栏板 · 走廊与阳台的花',
  },
  // ── 冬季 ──
  {
    id: 'wi_10th_bldg',
    season: 'winter',
    src: '/img/scenes/scene_wi_10th_bldg.jpg',
    tag: '10教冬眺 · 杭电',
    sub: '晨雾红砖 · 长寿花爆花傲立',
  },
  {
    id: 'wi_corridor_haven',
    season: 'winter',
    src: '/img/scenes/scene_wi_corridor_haven.jpg',
    tag: '实验走廊 · 机械温室',
    sub: '精密齿轮旁的温暖避寒角',
  },
  {
    id: 'wi_snow_wentian',
    season: 'winter',
    src: '/img/scenes/scene_wi_snow_wentian.jpg',
    tag: '问天初雪 · 杭电',
    sub: '石碑落雪 · 草坪白雪皑皑',
  },
  // ── 春季 ──
  {
    id: 'sp_10th_bldg',
    season: 'spring',
    src: '/img/scenes/scene_sp_10th_bldg.jpg',
    tag: '10教春眺 · 杭电',
    sub: '新绿抽芽 · 窗台水培绿根嫩',
  },
  {
    id: 'sp_moon_lake',
    season: 'spring',
    src: '/img/scenes/scene_sp_moon_lake.jpg',
    tag: '月雅春影 · 月雅湖',
    sub: '雅湖云影 · 垂柳桃花伴水廊',
  },
  {
    id: 'sp_gate_rainbow',
    season: 'spring',
    src: '/img/scenes/scene_sp_gate_rainbow.jpg',
    tag: '长虹揽月 · 南大门',
    sub: '巨拱擎天 · 迎宾花带与春风',
  },
  // ── 夏季 ──
  {
    id: 'su_ufo_gym',
    season: 'summer',
    src: '/img/scenes/scene_su_ufo_gym.jpg',
    tag: '巨碟邀星 · 体育馆',
    sub: 'UFO飞碟 · 樟树浓荫吃西瓜',
  },
  {
    id: 'su_library_lotus',
    season: 'summer',
    src: '/img/scenes/scene_su_library_lotus.jpg',
    tag: '书海风荷 · 图书馆',
    sub: '荷池粉荷 · 书香风荷水波漾',
  },
  {
    id: 'su_wentian_lawn',
    season: 'summer',
    src: '/img/scenes/scene_su_wentian_lawn.jpg',
    tag: '问天盛夏 · 问天广场',
    sub: '三省问天 · 绿茵烈日 HELLO HDU',
  },
  // ── 节日与节气 ──
  {
    id: 'fe_new_year',
    type: 'festival',
    src: '/img/scenes/scene_fe_new_year.jpg',
    tag: '元旦迎新 · 杭电',
    sub: '日历翻开新篇章 · 新年快乐',
    match: (m, d) => m === 1 && (d >= 1 && d <= 3),
  },
  {
    id: 'fe_spring_festival',
    type: 'festival',
    src: '/img/scenes/scene_fe_spring_festival.jpg',
    tag: '新春祥瑞 · 杭电',
    sub: '大红灯笼高高挂 · 舞狮迎春',
    match: (m, d) => (m === 1 && d >= 25) || (m === 2 && d <= 12),
  },
  {
    id: 'fe_lantern_festival',
    type: 'festival',
    src: '/img/scenes/scene_fe_lantern_festival.jpg',
    tag: '元宵佳节 · 月雅湖',
    sub: '水漾花灯 · 热气腾腾小汤圆',
    match: (m, d) => m === 2 && (d >= 13 && d <= 17),
  },
  {
    id: 'fe_dragon_boat',
    type: 'festival',
    src: '/img/scenes/scene_fe_dragon_boat.jpg',
    tag: '端午安康 · 杭电',
    sub: '五彩丝线系长嘴 · 软萌小绿粽',
    match: (m, d) => (m === 5 && d >= 25) || (m === 6 && d <= 10),
  },
  {
    id: 'fe_qixi',
    type: 'festival',
    src: '/img/scenes/scene_fe_qixi.jpg',
    tag: '七夕相会 · 杭电星汉',
    sub: '银河脉脉 · 枝叶轻触心相印',
    match: (m, d) => (m === 8 && d >= 15 && d <= 25),
  },
  {
    id: 'fe_mid_autumn',
    type: 'festival',
    src: '/img/scenes/scene_fe_mid_autumn.jpg',
    tag: '中秋佳节 · 杭电月圆',
    sub: '月穿圆孔楼 · 并坐品饼赏清辉',
    match: (m, d) => (m === 9 && d >= 15 && d <= 25) || (m === 10 && d <= 5),
  },
  {
    id: 'fe_commencement',
    type: 'festival',
    src: '/img/scenes/scene_fe_commencement.jpg',
    tag: '毕业迎新 · 杭电逐梦',
    sub: '学士帽彩带 · 迎新草坪逐梦启程',
    match: (m, d) => (m === 6 && d >= 15 && d <= 30) || (m === 9 && d >= 1 && d <= 15),
  },
  {
    id: 'ts_spring_begins',
    type: 'solarterm',
    src: '/img/scenes/scene_ts_spring_begins.jpg',
    tag: '立春迎新 · 万物苏萌',
    sub: '草坪破土嫩芽初探 · 春阳微醺',
    match: (m, d) => m === 2 && (d >= 3 && d <= 5),
  },
  {
    id: 'ts_autumn_equinox',
    type: 'solarterm',
    src: '/img/scenes/scene_ts_autumn_equinox.jpg',
    tag: '秋分平分 · 昼夜均半',
    sub: '半树金黄半树绿 · 金风送爽',
    match: (m, d) => m === 9 && (d >= 22 && d <= 24),
  },
  {
    id: 'ts_frost_descent',
    type: 'solarterm',
    src: '/img/scenes/scene_ts_frost_descent.jpg',
    tag: '霜降初寒 · 露结为霜',
    sub: '红砖晶莹小初霜 · 添衣入室',
    match: (m, d) => m === 10 && (d >= 23 && d <= 24),
  },
  {
    id: 'ts_winter_solstice',
    type: 'solarterm',
    src: '/img/scenes/scene_ts_winter_solstice.jpg',
    tag: '冬至温情 · 日南之至',
    sub: '热饺初熟 · 长寿花爆花迎春',
    match: (m, d) => m === 12 && (d >= 21 && d <= 23),
  },
];

function currentSeason(dateStr = S.today || M.localDate()) {
  const m = Number(String(dateStr).slice(5, 7));
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

const SEASON_CN = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

/** 本季的画卷池：四季图才有 season，节日/节气图不在池子里，换一张不会跳到它们 */
function seasonPool(season = currentSeason()) {
  return CAMPUS_BANNERS.filter((b) => b.season === season);
}

function getCurrentBanner() {
  if (S.bannerIdx != null && CAMPUS_BANNERS[S.bannerIdx]) {
    return CAMPUS_BANNERS[S.bannerIdx];
  }
  const dateStr = S.today || M.localDate();
  const m = Number(dateStr.slice(5, 7));
  const d = Number(dateStr.slice(8, 10));

  const special = CAMPUS_BANNERS.find((b) => b.match && b.match(m, d));
  if (special) return special;

  const seasonal = seasonPool(currentSeason(dateStr));
  if (seasonal.length) {
    return seasonal[d % seasonal.length];
  }
  return CAMPUS_BANNERS[0];
}

function heroBanner() {
  const b = getCurrentBanner();
  // 正在看哪一季，就在哪一季里换；节日/节气图没有 season，回落到日历季节
  const season = b.season || currentSeason();
  const pool = seasonPool(season);
  return `<div class="hero-banner" data-act="nextBanner" title="点击切换${SEASON_CN[season]}季校园画卷（${pool.length} 幅）" style="cursor:pointer">
    <img src="${b.src}" alt="${esc(b.tag)}">
    <div class="hero-bar">
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        <span class="hero-tag">${esc(b.tag)}</span>
        <span class="hero-sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.sub)}</span>
      </div>
      <span class="hero-switch-hint" style="flex:none;font-size:10.5px;opacity:.9;background:rgba(255,255,255,.18);backdrop-filter:blur(4px);padding:3px 8px;border-radius:6px;transition:.15s">⇄ 换一张</span>
    </div>
  </div>`;
}

function sunTimes(dateStr) {
  const base = new Date(dateStr + 'T00:00:00+08:00').getTime();
  const { lat, lon } = S.state.location;
  let rise = null, set = null, prev = null;
  for (let m = 0; m <= 1440; m += 10) {
    const pos = sunPosition(base + m * 60000, lat, lon);
    if (prev) {
      if (prev.alt <= 0 && pos.alt > 0 && rise == null) rise = m;
      if (prev.alt > 0 && pos.alt <= 0 && rise != null) set = m;
    }
    prev = pos;
  }
  const hm = (v) => (v == null ? '–' : `${pad(Math.floor(v / 60))}:${pad(v % 60)}`);
  return { rise: hm(rise), set: hm(set) };
}

/* ══════════════════════════════════════════════════════ 待办历史与日历 */

/**
 * 历史表：{ 'YYYY-MM-DD': { 任务id: {kind,title,time,plantId,emoji} } }。
 * 只记「那天有什么任务」，完成与否仍然只认 tasksDone，一个真相源。
 */
const historyMap = () => (S.state.taskHistory ||= {});

/** 把当前算出来的任务记进历史（今天 + 未来几天）；只留最近 120 天 */
function recordTaskHistory() {
  if (!S.state || !S.tasks.length) return false;
  const hist = historyMap();
  let changed = false;
  for (const t of S.tasks) {
    const day = (hist[t.date] ||= {});
    const next = {
      kind: t.kind, title: t.title, time: t.time,
      plantId: t.plantId || null, emoji: t.emoji || '',
      detail: t.detail || '', why: t.why || '',
    };
    const prev = day[t.id];
    // 同一天的任务会被反复重算（钟点、文案会变），以最后一次为准；
    // 过去的日期不在 S.tasks 里，写进去的就不会再被覆盖
    if (prev && ['kind', 'title', 'time', 'detail', 'why'].every((k) => prev[k] === next[k])) continue;
    day[t.id] = { ...prev, ...next };
    changed = true;
  }
  const dates = Object.keys(hist).sort();
  if (dates.length > 120) {
    const keep = new Set(dates.slice(-120));
    for (const d of dates) if (!keep.has(d)) delete hist[d];
    changed = true;
  }
  return changed;
}

/** 老数据只有 tasksDone（id 里带日期），把还没进历史的补成一条，别让日历一片空白 */
function backfillHistory() {
  if (!S.state) return false;
  const hist = historyMap();
  let changed = false;
  for (const [id, v] of Object.entries(S.state.tasksDone || {})) {
    const p = M.taskIdParts(id);
    if (!p.date) continue;
    // 周末那几条的 id 挂在那周起点上；搬回工位是起点 +3 天
    const date = p.owner === 'weekend' && p.kind === 'weekendBack' ? M.addDays(p.date, 3) : p.date;
    if (date > S.today) continue;
    const day = (hist[date] ||= {});
    if (day[id]) continue;
    const plantId = String(p.owner).startsWith('p_') ? p.owner : null;
    day[id] = {
      kind: p.kind || 'done',
      title: kindTitle(p.kind, plantId),
      time: v?.at ? localHM(v.at) : '',
      plantId,
      emoji: '',
      detail: '',
      bf: 1,   // 回填：只知道「做过」，不知道那天还有没有别的；别拿去判欠账
    };
    changed = true;
  }
  return changed;
}

/** 某一天的任务：先用现在算出来的，没有就翻历史 */
function dayItems(date) {
  const live = S.tasks.filter((t) => t.date === date);
  if (live.length) return live;
  const hist = historyMap()[date];
  if (!hist) return [];
  return Object.entries(hist).map(([id, v]) => ({
    id, date, kind: v.kind,
    // 回填的老记录只存过 kind，标题是按类型补的；真记过的用当时的标题
    title: v.bf ? kindTitle(v.kind, v.plantId) : (v.title || kindTitle(v.kind, v.plantId)),
    time: v.time || '', detail: v.detail || '', why: v.why || '',
    plantId: v.plantId || null, emoji: v.emoji || '', bf: v.bf || 0,
    state: S.state.tasksDone?.[id] || null,
  }));
}

/**
 * 这天是不是「完整记录」。
 * 老数据回填出来的只代表"勾过的那些"，缺的不等于没做——这种日子不判欠账、不标红点。
 */
const dayIsKnown = (items) => items.some((t) => !t.bf);

/**
 * 空日子到底是哪一种空——别把「周末本来就不排任务」说成「历史没记到」。
 *   early  看板还没开始记账（taskHistory 最早那天之前）
 *   rest   周六周日不在实验室，本来就不生成任务
 *   future 还没算到（任务只排今天往后 7 天）
 *   gap    那天看板没开着，任务没进历史（不代表没做）
 */
function emptyDayText(date) {
  const dates = Object.keys(historyMap()).sort();
  const start = dates[0] || S.today;
  if (date < start) {
    return {
      title: '那天还没开始记',
      note: `看板从 ${M.monthDay(start)}（${M.weekdayCN(start)}）才开始记每天有哪些任务，更早的日子只剩你当时勾过的「完成过」记录。`,
    };
  }
  if (M.isRestDay(date)) {
    return {
      title: '周末不排任务',
      note: '周六周日人不在实验室，模型这两天不生成任何要到场的任务——两盆就留在原地，周一上班再看。',
    };
  }
  if (date > M.addDays(S.today, 6)) {
    return { title: '还没算到这天', note: '任务只排今天往后 7 天，靠近了会自己算出来。' };
  }
  return {
    title: '这天没有任务',
    note: '那天看板没开着，任务没进历史——不代表没做。',
  };
}

/** 日历当前显示哪个月（默认这个月） */
function calMonthInfo() {
  const [y, m] = (S.calMonth || S.today.slice(0, 7)).split('-').map(Number);
  return { y, m, key: `${y}-${pad(m)}` };
}

const shiftMonth = (key, delta) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

/** 点日历 / 点历史欠账：看那天的任务与完成情况（只读，改了历史就对不上了） */
function openDaySheet(date) {
  const items = dayItems(date);
  const known = dayIsKnown(items);
  const tally = M.dayTally(items, S.state.tasksDone || {}, date, S.today);
  // 和「今日」用同一套任务行（图标、徽章、勾选都一样），只是勾选记到那一天
  const row = (t) => taskRow({ ...t, date }, { history: date });
  const empty = items.length ? null : emptyDayText(date);
  const sum = empty
    ? empty.title
    : !known
      ? `只有 ${tally.done} 件完成记录（那天没开过页面，记不全）`
      : `共 ${tally.total} 件：完成 ${tally.done}`
        + (tally.skipped ? ` · 跳过 ${tally.skipped}` : '')
        + (tally.missed ? ` · <b style="color:var(--red)">没做 ${tally.missed}</b>` : '')
        + (tally.pending ? ` · 待办 ${tally.pending}` : '');
  openSheet(`<h3>${M.monthDay(date)} ${M.weekdayCN(date)}</h3>
    <p class="sub">${sum}</p>
    ${items.length
      ? `<div class="tasklist">${items.map(row).join('')}</div>
         ${!S.readonly ? '<div class="note" style="margin-top:10px">那天其实做了、只是忘了点？点右边的圆圈补上，日历上的红点就消了。</div>' : ''}`
      : `<div class="note">${empty.note}</div>`}
  `);
}

/** 「以前没做完的」：过了日子也没勾的，别静默消失 */
function overdueCard() {
  const days = Object.keys(historyMap()).filter((d) => d < S.today).sort().reverse();
  const rows = [];
  for (const d of days) {
    const items = dayItems(d);
    if (!dayIsKnown(items)) continue;   // 只有回填记录：缺的不算没做
    for (const t of items) {
      const st = S.state.tasksDone?.[t.id];
      if (st?.done || st?.skipped) continue;
      rows.push({ ...t, date: d });
    }
    if (rows.length >= 8) break;
  }
  if (!rows.length) return '';
  const row = (r) => `<button class="hist-row miss overdue" data-act="calDay" data-date="${r.date}">
    <span class="hist-time">${M.monthDay(r.date)}</span>
    <span class="hist-main"><b>${esc(r.title)}</b><span>${esc(KIND_META[r.kind]?.label || '')}${r.time ? ` · ${esc(r.time)}` : ''}</span></span>
    <span class="hist-tag">${M.diffDays(S.today, r.date)} 天前</span>
  </button>`;
  return `<div class="card">
    <div class="card-head"><div class="card-title">以前没做完的</div><div class="note">${rows.length} 件 · 点开看那天</div></div>
    <div class="hist-list">${rows.map(row).join('')}</div>
  </div>`;
}

function datePanel() {
  const d = S.idx?.daily.get(S.today) || {};
  const rain = M.rainOutlook(S.idx, S.today);
  const dt = M.parseDate(S.today);
  const y = dt.getFullYear(), mo = dt.getMonth(), todayD = dt.getDate();
  // 小日历：有没做完的日子标红点，全做完的标绿点，点开看那天
  const cm = calMonthInfo();
  const firstDow = new Date(cm.y, cm.m - 1, 1).getDay();
  const ndays = new Date(cm.y, cm.m, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push('<b class="pad"></b>');
  for (let i = 1; i <= ndays; i++) {
    const date = `${cm.key}-${pad(i)}`;
    const items = dayItems(date);
    const known = dayIsKnown(items);
    const tally = known ? M.dayTally(items, S.state.tasksDone || {}, date, S.today) : null;
    // 只给"已经过去、而且有没做完的"日子标红点；未来的日子还没发生，不标
    const dot = tally && date < S.today && tally.missed > 0 ? 'missed' : '';
    const tip = tally
      ? (date > S.today
        ? `${tally.total} 件待办`
        : `${tally.done}/${tally.total} 完成${tally.missed ? `，${tally.missed} 件没做（点开可以补勾）` : ''}`)
      : items.length ? `只有 ${items.length} 件完成记录` : emptyDayText(date).title;
    cells.push(`<b class="cal-day ${date === S.today ? 'on' : ''} ${dot}" data-act="calDay" data-date="${date}" title="${esc(tip)}">${i}</b>`);
  }
  const { rise, set } = sunTimes(S.today);
  const todays = S.tasks.filter((t) => t.date === S.today);
  const done = todays.filter((t) => t.state?.done || t.state?.skipped).length;
  const sun = S.suns[S.state.plants[0]?.id];
  const coldNight = (d.tmin ?? 99) < M.roomLine(Math.max(...S.state.plants.map((p) => p.traits?.minNightC ?? 5)), S.state.site);

  return `<div class="card day-panel">
    <div class="dp-top">
      <div class="dp-date">${todayD}<span>${mo + 1}月</span></div>
      <div class="dp-top-right">
        <div class="dp-week">${M.weekdayCN(S.today)}<small>${y}</small></div>
        ${weatherIconImg(d.code, 54)}
      </div>
    </div>

    <div class="dp-cal-head">
      <button data-act="calPrev" aria-label="上个月">‹</button>
      <b>${cm.y} 年 ${cm.m} 月</b>
      <button data-act="calNext" aria-label="下个月">›</button>
    </div>
    <div class="dp-cal">
      ${['日', '一', '二', '三', '四', '五', '六'].map((w) => `<i>${w}</i>`).join('')}
      ${cells.join('')}
    </div>

    <div class="dp-rows">
      <div class="dp-row"><span>日出 / 日落</span><b>${rise} · ${set}</b></div>
      <div class="dp-row"><span>最高 / 最低</span><b>${Math.round(d.tmax)}° / ${Math.round(d.tmin)}°</b></div>
      <div class="dp-row"><span>天气</span><b>${M.weatherWord(d.code)} · 湿 ${Math.round(d.rh ?? 70)}%</b></div>
      <div class="dp-row"><span>总光量</span><b>${sun ? sun.dli : '–'} mol${sun?.tripHours ? `（含${sun.tripLabel} ${sun.tripHours}h）` : ''}</b></div>
      <div class="dp-row"><span>降水</span><b>${rain && rain.tone !== 'dry' ? `${num(d.precip, 1)} mm` : '无'}</b></div>
    </div>

    ${coldNight ? `<div class="dp-alert"><img src="/img/status/icon_status_night_lamp.jpg" alt=""><span>今夜 ${Math.round(d.tmin)}℃，怕冷的要收回屋</span></div>` : ''}

    <div class="dp-foot">今日任务 ${done}/${todays.length}${todays.length ? '' : ' · 清空'} · 红点是那天没做完的</div>
  </div>`;
}

function viewToday() {
  const st = S.state;
  const d = S.idx?.daily.get(S.today) || {};
  const rain = M.rainOutlook(S.idx, S.today);
  const todays = S.tasks.filter((t) => t.date === S.today);
  const later = S.tasks.filter((t) => t.date !== S.today).slice(0, 4);

  return `<div class="stack">
    <div class="hero-row">
      ${heroBanner()}
      ${datePanel()}
    </div>
    <div class="cols">
      <div class="stack">
        ${st.plants.map((p) => plantCard(p)).join('')}
        ${sunCard()}
        ${explainCard()}
      </div>
      <div class="stack">
        ${taskCard(todays)}
        ${overdueCard()}
        ${later.length ? `<div class="card">
          <div class="card-head"><div class="card-title">接下来</div><button class="linkbtn" data-act="laterAll">全部</button></div>
          <div class="tasklist">${later.map((t) => taskRow(t, true)).join('')}</div>
        </div>` : ''}
      </div>
    </div>
  </div>`;
}

function wxCard(d, rain) {
  const sun = S.suns[S.state.plants[0]?.id];
  const coldNight = (d.tmin ?? 99) < M.roomLine(Math.max(...S.state.plants.map((p) => p.traits?.minNightC ?? 5)), S.state.site);
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
        ? (sun.tripHours
          ? `<div><b>${sun.tripHours}<i>h</i></b><span>${esc(sun.tripLabel)}直射</span></div>`
          : `<div><b>散射</b><span>走廊·无直射</span></div>`)
        : `<div><b>${sun ? sun.directHours : 0}<i>h</i></b><span>盆位直射</span></div>`}
      <div><b>${sun ? sun.dli : '–'}</b><span>${sun?.indoor ? '今日总光量' : 'DLI mol'}</span></div>
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
  const coldLine = M.roomLine(Math.max(...S.state.plants.map((p) => p.traits?.minNightC ?? 5)), S.state.site);
  if ((d.tmin ?? 99) < coldLine) bits.push('夜里接近冰点，记得搬进实验室。');
  if (sun?.indoor) {
    if (sun.tripHours) {
      bits.push(`${sun.tripActual ? '你点的' : '计划'} ${tripSpanText(sun)} 在${sun.tripLabel}，走廊 ${sun.homeRouteDli} + 西阳台 ${sun.tripDli}，今日总光量 ${sun.dli}。`);
    } else if (sun.tripSkipped) {
      bits.push('今天西阳台没有可搬的直射窗口（或有雨/大风），全天走廊散射。');
    } else {
      bits.push(north ? `朝北阳台${Number(S.today.slice(5, 7))}月本来就没直射，走廊只吃散射，别指望晒太阳。` : '走廊里只有散射光，靠门口或补光才管用。');
    }
  } else if (sun && sun.verdict === '不足') {
    bits.push(north ? `朝北阳台${Number(S.today.slice(5, 7))}月零直射，垫高也没用，只能补光。` : '盆位晒不到太阳，垫高试试。');
  }
  if (!bits.length) bits.push('天气平稳，按计划走就行。');
  return esc(bits.join(' '));
}

function plantCard(p) {
  const plan = S.plans[p.id];
  const sun = S.suns[p.id];
  const d = S.idx?.daily.get(S.today) || {};
  const v = M.plantVerdict(p, plan, sun, d, S.state.site);
  const barCls = plan.leftPct <= 15 ? 'crit' : plan.leftPct <= 40 ? 'low' : '';
  const left = Number.isFinite(plan.dutyDaysLeft) ? plan.dutyDaysLeft : plan.daysLeft;
  const whenDate = plan.dutyDate || plan.nextDate;
  const whenTime = plan.dutyTime || plan.nextTime;
  const due = left <= 0;
  return `<div class="card">
    <div class="plant-head">
      ${plantAvatar(p, 52)}
      <div style="min-width:0">
        <div class="plant-name">${esc(p.name)}</div>
        <div class="plant-sub">${esc(p.fullName || (p.species + (p.cultivar ? ' · ' + p.cultivar : '')))}</div>
      </div>
      <div class="right">
        <div class="big-day ${due ? 'due' : ''}">${due ? (plan.overdueDays ? `−${plan.overdueDays}` : '今天') : left}${due && !plan.overdueDays ? '' : due ? '<small>天</small>' : '<small>天后</small>'}</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:2px">${due ? `${whenTime} 浇透` : `${M.monthDay(whenDate)} ${whenTime} 浇`}</div>
      </div>
    </div>

    <div class="bar"><i class="${barCls}" style="width:${Math.max(3, plan.leftPct)}%"></i></div>
    <div class="bar-row">
      <span class="pct" style="display:inline-flex;align-items:center;gap:4px">
        <img src="/img/status/icon_status_water_gauge.jpg" alt="" style="width:16px;height:16px;border-radius:50%;object-fit:cover">
        还剩 ${plan.leftPct}%
      </span>
      <span>·</span>
      <span>盆里存 ${plan.capacity} ml</span>
      <span style="margin-left:auto">浇透一次 ≈ ${plan.intervalDays} 天</span>
    </div>

    <dl class="metrics">
      <div class="metric"><dt>今日耗水</dt><dd>${plan.dailyUseToday}<small>ml</small></dd></div>
      <div class="metric"><dt>${sun?.indoor ? '今日总光量' : '直射'}</dt><dd>${sun?.indoor ? sun.dli : (sun ? sun.directHours : 0)}<small>${sun?.indoor ? 'mol' : 'h'}</small></dd></div>
      <div class="metric"><dt>下次</dt><dd>${left <= 0 ? '今天' : M.monthDay(whenDate).replace('月', '/').replace('日', '')} <small>${whenTime}</small></dd></div>
    </dl>

    <div class="verdicts">
      ${v.map((x) => `<div class="vline ${x.tone}"><i class="dot"></i><span>${esc(x.text)}</span></div>`).join('')}
    </div>

    ${S.readonly ? '' : `<div class="actions">
      ${due
        ? `<button class="btn wide" data-act="water" data-plant="${p.id}">${ICON.drop} 浇透（底孔出水）</button>`
        : `<button class="btn ghost" data-act="water" data-plant="${p.id}">提前浇透</button>`}
      <button class="btn ghost" data-act="soilSheet" data-plant="${p.id}">${ICON.drop} 探土</button>
      <button class="btn ghost" data-act="photoFor" data-plant="${p.id}">${ICON.camera} 拍照</button>
      <button class="btn ghost" data-act="plantDetail" data-plant="${p.id}">参数</button>
    </div>`}
  </div>`;
}

function tripSpanText(sun) {
  const spans = sun?.tripSpans || [];
  if (spans.length) return spans.map((s) => `${s.start}–${s.end}`).join('、');
  return sun?.tripWin ? `${sun.tripWin.start}–${sun.tripWin.end}` : '';
}

function sunCard() {
  const p0 = S.state.plants[0];
  if (!p0) return '';
  const sun = S.suns[p0.id];
  if (!sun) return '';

  if (sun.indoor) {
    const pct = Math.min(100, Math.round((sun.dli / sun.need) * 100));
    const trip = S.state.site.dayTrip?.enabled ? S.state.site.dayTrip : null;
    const win = sun.tripWin;
    const ratio = sun.homeDli > 0.05 ? sun.dli / sun.homeDli : 0;
    const cmpText = ratio
      ? `今天合计是全天待在走廊（${sun.homeDli}）的 ${ratio.toFixed(1)} 倍。`
      : `走廊几乎没光（${sun.homeDli}），合计基本都靠这一段。`;
    // 现在人在哪儿：按最后一条搬动记录（两盆一起搬，所以记在场地上）
    const nowPlace = M.currentMovePlace(S.state.site);
    const lastOut = M.moveLogOf(S.state.site)
      .filter((e) => e.to === 'trip' && M.localDate(new Date(e.at)) === S.today)
      .pop();
    const placeText = nowPlace === 'trip'
      ? `现在在${esc(sun.tripLabel)}${lastOut ? `（${new Date(lastOut.at).toTimeString().slice(0, 5)} 起）` : ''}`
      : `现在在${esc(M.homeLabel(S.state.plants, S.state.site))}`;
    const nextTo = nowPlace === 'trip' ? 'home' : 'trip';
    return `<div class="card">
      <div class="card-head">
        <div class="card-title" style="display:flex;align-items:center;gap:6px"><img src="/img/weather/icon_weather_sunny.jpg" style="width:20px;height:20px;border-radius:50%;object-fit:cover" alt="阳光">今天的光</div>
        <div class="note">${sun.tripHours
          ? (sun.tripFromStart
            ? `一直待在${esc(sun.tripLabel)}（没搬）`
            : `${sun.tripActual ? '按你点的搬动时间' : '按计划窗口'} · 走廊 + ${esc(sun.tripLabel)}`)
          : `${sun.note} · 透过率 ${Math.round((S.state.site.corridorLight ?? 0.18) * 100)}%`}</div>
      </div>
      <div class="dli-gauge">
        <div class="dli-fill" style="width:${pct}%"></div>
        <i style="left:${Math.min(100, Math.round((sun.min / sun.need) * 100))}%"></i>
      </div>
      <div class="bar-row" style="margin-top:6px">
        <span class="pct">今日总光量 ${sun.dli}</span>
        <span>·</span>
        <span>${p0.name}需要 ${sun.need}</span>
        <span style="margin-left:auto">${pct}%</span>
      </div>
      <div class="cmp" style="margin-top:10px">
        <div class="cmp-row"><span>走廊（其余时间）</span><b>${sun.homeRouteDli}</b></div>
        ${sun.tripHours
          ? `<div class="cmp-row hi"><span>${esc(sun.tripLabel)} ${sun.tripFromStart ? '全天' : tripSpanText(sun)}${sun.tripOpen ? '（还没搬回）' : ''}</span><b>${sun.tripDli}</b></div>
        <div class="cmp-row"><span>今日总光量</span><b>${sun.dli}</b></div>`
          : (trip ? `<div class="cmp-row"><span>${esc(sun.tripLabel)}</span><b>0</b></div>` : '')}
      </div>
      <div class="sun-blocked-box">
        <img src="/img/status/icon_status_sun_blocked.jpg" alt="栏板遮挡">
        <div class="note" style="margin:0;font-size:12px;color:var(--ink)">
          ${sun.tripHours
            ? (sun.tripFromStart
              ? `<b>今天一整天都在${esc(sun.tripLabel)}</b>：昨天就放在那儿、没搬回来，所以没有走廊时段；${cmpText}`
              : `<b>走廊只占小头</b>：${sun.tripActual ? `你点的 ${tripSpanText(sun)} 这 ${sun.tripHours} 小时` : `计划里的 ${sun.tripHours} 小时`}在${esc(sun.tripLabel)}，${cmpText}`)
            : `<b>今天全在走廊</b>：${trip ? '西阳台没有可搬的直射窗口，或窗口内有雨/大风。' : '还没设置外出台。'}只有散射 ${sun.homeDli}。`}
        </div>
      </div>
      ${S.readonly || !trip ? '' : `<div class="actions" style="margin-top:12px;align-items:center">
        <button class="btn ghost sm" data-act="move" data-to="${nextTo}">${ICON.move} ${nextTo === 'trip' ? `搬到${esc(sun.tripLabel)}` : '搬回走廊'}</button>
        <button class="linkbtn" data-act="moveTime" style="margin-left:auto;font-size:11.5px">${placeText}</button>
      </div>`}
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
          <img src="/img/scenes/scene_empty_state.jpg" alt="待办清空" style="width:96px;height:96px;border-radius:18px;margin-bottom:10px;box-shadow:0 4px 16px rgba(44,95,69,0.12);object-fit:cover">
          <div><strong>清空，去晒晒太阳</strong></div>
          <div style="margin-top:2px">明天要做什么会自己算出来</div>
        </div>`}
    ${open.length ? `<div class="note" style="margin-top:10px">没做的会一直留着；漏太久会标红提醒。</div>` : ''}
  </div>`;
}

function taskRow(t, opts) {
  const o = opts && typeof opts === 'object' ? opts : { compact: !!opts };
  const compact = !!o.compact;
  const hist = o.history || null;   // 传日期 = 历史行：勾选走 toggleDay，不显示「跳过」
  const meta = KIND_META[t.kind] || { label: t.kind, cls: '' };
  const st = t.state;
  const done = st?.done;
  const skipped = st?.skipped;
  const late = !st && t.date === S.today && t.time < nowHM();
  const lateDay = !st && t.date < S.today;
  const isSunTask = t.kind === 'moveOut' || t.kind === 'toSun';
  const isHomeTask = t.kind === 'toHome' || t.kind === 'moveIn';
  const rowIcon = isSunTask
    ? '<img class="task-sun-icon" src="/img/actions/icon_action_sun.jpg" alt="晒太阳" title="晒太阳">'
    : isHomeTask
      ? '<img class="task-home-icon" src="/img/status/icon_status_night_lamp.jpg" alt="收回" title="搬回去">'
      : '';
  return `<div class="task ${done || skipped ? 'done' : ''} ${late || lateDay ? 'late' : ''}">
    <div class="task-time">${esc(t.time)}${lateDay ? '<div style="font-size:9.5px;color:var(--red)">逾期</div>' : ''}</div>
    <div class="task-main">
      <div class="task-title" style="display:flex;align-items:center;gap:6px">
        ${t.plantId
          ? plantBadge(t.plantId, t.emoji, 18)
          : (rowIcon || (t.emoji ? `<span class="task-emoji">${t.emoji}</span>` : ''))}
        <span>${esc(t.title)}</span>
      </div>
      ${compact
        ? `<div class="task-detail">${M.monthDay(t.date)} ${M.weekdayCN(t.date)} ${esc(t.time)}</div>`
        : (t.detail ? `<div class="task-detail">${esc(t.detail)}</div>` : '')}
      ${compact || !t.why ? '' : `<div class="task-why">${esc(t.why)}</div>`}
      <div class="task-meta">
        <span class="badge ${meta.cls}">${meta.img ? `<img src="${meta.img}" alt="" style="width:12px;height:12px;margin-right:3px">` : ''}${meta.label}</span>
        ${skipped ? `<span class="badge">已跳过${st.reason ? '·' + esc(st.reason) : ''}</span>` : ''}
        ${done ? `<span class="badge green">完成 ${st.at ? localHM(st.at) : ''}</span>` : ''}
        ${!compact && !hist && !done && !skipped && !S.readonly ? `<button class="linkbtn" data-act="skip" data-task="${t.id}">跳过</button>` : ''}
      </div>
    </div>
    <div class="task-side">
      ${compact || S.readonly ? '' : `<button class="tick ${done ? 'on' : ''}" ${hist
        ? `data-act="toggleDay" data-task="${esc(t.id)}" data-date="${esc(hist)}" aria-label="补勾"`
        : `data-act="toggle" data-task="${esc(t.id)}" aria-label="完成"`}>${ICON.check}</button>`}
    </div>
  </div>`;
}

function explainCard() {
  return `<div class="card tight">
    <details>
      <summary>这些数字是怎么来的</summary>
      <div class="body">
        <p><b>怎么浇</b>：一律浇到底孔出水，不用数毫升。出水说明基质已经回到持水量，再倒只是从底孔流走；顺便把攒下的盐冲掉，下层根也喝得到。</p>
        <p style="margin-top:6px"><b>毫升数是干嘛的</b>：盆土吸饱后能给根用的水 = 盆容积 × 基质有效水率 × 只用 65%（留点缓冲，不逼到永久萎蔫点）。这个数决定「下次隔多久」，不是你这次该倒多少。</p>
        <p style="margin-top:6px"><b>多久浇</b>：日耗 = kTrans × 今日总光量 + 土面蒸发（VPD × 盆口面积），再乘校准系数；累计耗完这盆存水的那天就是要浇的日子。雨天按盆口面积折算补水。</p>
        <p style="margin-top:6px"><b>几点浇</b>：按当天的天气分三档算，不是写死的 8:30。</p>
        <p style="margin-top:4px">· <b>热天（最高 ≥28℃）→ 傍晚</b>：等太阳落下去再浇。中午浇一半会被蒸掉，盆土被晒到 40℃ 时冷水下去还会激根；傍晚土还温着、辐射已经降了，水整夜慢慢渗，第二天一早盆是满的。夜里热，不担心湿着过夜。花花是 CAM，气孔晚上才开，傍晚浇正好。</p>
        <p style="margin-top:4px">· <b>冷天（最高 &lt;14℃）→ 上午 10–11 点</b>：挑上午里土回暖的那段，浇完还有大半天排水回温，不带着湿土过夜——夜里又冷又湿是烂根的标准组合。</p>
        <p style="margin-top:4px">· <b>温和天（14–28℃）→ 早上</b>：ISU Extension 的 5–9 点口径，浇完叶面/土表当天能干；RHS 也说凉的时候浇盆面蒸发少。</p>
        <p style="margin-top:4px">另外几条一直有效：浇完离日落留够时间（温和/冷天 2.5 h，热天 0.5 h）；外出台当天落地 1 小时内不浇；露天且后 3 小时要下雨就往后挪；只在你到得了现场的时间窗（默认 08:00–19:00）里挑。</p>
        <p style="margin-top:6px"><b>今日总光量</b>：走廊时间按走廊透光率、西阳台时间按露天光，逐小时拼成当天的 DLI。今天用你点「搬到西阳台 / 搬回走廊」的时间算，没点过的日期才用计划窗口——所以早上就搬过去，光量会从早上开始算。</p>
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
            <div class="kv"><span>浇透能存</span><b>${plan.capacity} ml</b></div>
            <div class="kv"><span>下次</span><b>${M.monthDay(plan.dutyDate || plan.nextDate)} ${plan.dutyTime || plan.nextTime}</b></div>
            <div class="kv"><span>上次浇透</span><b>${p.care?.lastWaterToDrain ? M.monthDay(localYMD(p.care.lastWateredAt)) : '还没浇透过（待重设）'}</b></div>
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
        ${logs.length ? logs.map((l) => `<div class="kv"><span>${esc(localYMD(l.at))} · ${esc(l.type)}${l.note ? '（' + esc(l.note) + '）' : ''}</span><b>${l.amountMl ? `存水 ${l.amountMl} ml` : (l.days ? l.days + ' 天' : '')}</b></div>`).join('')
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
    label: M.homeLabel(S.state.plants, site),
    note: `${M.homeLabel(S.state.plants, site)} · 只有散射，直射恒为 0`,
    plant: p0,
    site,
  };
}

function viewWeather() {
  const dates = S.idx.dates.slice(0, 9);
  const ctx = wxContext();
  const p0 = S.state.plants[0];
  const trip = S.state.site.dayTrip?.enabled ? S.state.site.dayTrip : null;
  // 这一页的表格按"单个地点"横向比，不把每天的搬动拼进来
  const sunAt = (date) => M.sunPlan(ctx.plant, S.idx, ctx.site, date, S.state.location.lat, S.state.location.lon, { withTrip: false });
  // 曲线看的是每天的总光量：走廊时段 + 西阳台时段（今天按实际搬动，未来按计划）
  const routeAt = (date) => M.sunPlan(p0, S.idx, S.state.site, date, S.state.location.lat, S.state.location.lon);

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
  const dlis = dates.map((x) => routeAt(x).dli);

  return `<div class="stack">
    <div class="card" style="padding:0;overflow:hidden;border:none;background:transparent;box-shadow:none">
      <img src="/img/scenes/scene_weather_theater.jpg" alt="天气剧场" style="width:100%;display:block;border-radius:14px;border:1px solid var(--border)">
    </div>
    <div class="card">
      <div class="card-head" style="align-items:flex-start">
        <div>
          <div class="card-title">未来 9 天</div>
          <div class="note" style="margin-top:3px">${esc(ctx.note)}</div>
        </div>
        ${trip ? `<div class="seg mini">
          <button data-act="wxSpot" data-spot="home" class="${ctx.key === 'home' ? 'on' : ''}">${esc(M.homeLabel(S.state.plants, S.state.site))}</button>
          <button data-act="wxSpot" data-spot="trip" class="${ctx.key === 'trip' ? 'on' : ''}">${esc(trip.label)}</button>
        </div>` : ''}
      </div>
      <div style="overflow-x:auto">
      <table class="tbl">
        <thead><tr><th>日期</th><th style="text-align:left">天</th><th>气温</th><th>雨 mm</th><th class="col-hide">ET₀</th><th class="col-hide">日照 h</th><th>实照 h</th><th class="col-hide">单点 DLI</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="note" style="margin-top:10px">“实照”是按云量折算后的有效直射小时（几何上晒得到 × 晴天比例），全阴天会掉到 1 h 以下${trip ? `；想看走廊的点上面那颗按钮` : ''}。上面这张表按<b>单个地点</b>算，没把每天搬来搬去拼进来；走廊 + 西阳台的合计看下面的总光量曲线。</div>
    </div>
    <div class="cols even">
      <div class="card">
        <div class="card-head"><div class="card-title">蒸发需求 ET₀</div><div class="note">mm/天 · 点击查看数值</div></div>
        ${chartWidget('et0', { vals: et0s, dates, color: '#376a83', unit: 'mm/天', fmt: (v) => v.toFixed(2) })}
        <div class="note" style="margin-top:8px">ET₀ 高 = 盆干得快。模型直接用这个数缩放日耗水。</div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">今日总光量</div><div class="note">走廊 + ${esc(trip?.label || '西阳台')} · mol/m²/d</div></div>
        ${chartWidget('dli', { vals: dlis, dates, color: '#b8871b', unit: 'mol/m²/d', fmt: (v) => v.toFixed(1), threshold: p0.traits.lightNeedDli || 10, thresholdLabel: '花花需 ' + (p0.traits.lightNeedDli || 10) })}
        <div class="note" style="margin-top:8px">每天的总光量 = 走廊时段 × 走廊透光率 + ${esc(trip?.label || '西阳台')}时段 × 露天光。<b>今天按你点的搬动时间算，往后几天按计划窗口</b>；花花要 ≥${p0.traits.lightNeedDli}、松松 ≥${S.state.plants[1]?.traits.lightNeedDli ?? 6} 才够。</div>
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
  const trip = site.dayTrip?.enabled ? site.dayTrip : null;
  const p0 = S.state.plants[0];
  const lat = S.state.location.lat, lon = S.state.location.lon;
  const home = M.sunPlan(p0, S.idx, site, S.today, lat, lon, { withTrip: false });
  const route = S.suns[p0.id] || home;
  const win = route.tripWin || (trip ? M.sunWindow({ spot: trip, wIndex: S.idx, date: S.today }) : null);
  const ratio = home.dli > 0.05 ? route.dli / home.dli : 0;
  const worth = !!route.tripHours && route.tripDli >= Math.max(2, home.dli);
  const railing = trip?.parapetType !== 'solid';
  const nowPlace = M.currentMovePlace(site);

  return `<div class="card">
    <div class="card-head"><div class="card-title">今天的光</div><div class="note">${M.monthDay(S.today)} · ${route.tripActual ? '按你点的搬动' : '按计划作息'}</div></div>
    <div class="place"><div><b>走廊（全天不动）</b><span>只有散射</span></div><em>${home.dli}</em></div>
    ${trip ? `<div class="place"><div><b>${esc(trip.label)}</b><span>${win ? `${tripSpanText(route)} 在那边${route.tripOpen ? '（还没搬回）' : ''}` : '今天这边没有直射'}</span></div><em>${route.tripDli}</em></div>
    <div class="place"><div><b>今天合计</b><span>走廊 ${route.homeRouteDli} + ${esc(trip.label)} ${route.tripHours || 0} h</span></div><em>${route.dli}</em></div>` : ''}
    <div class="note" style="margin-top:10px">${trip
      ? (route.tripActual
        ? `已按你点的 ${tripSpanText(route) || '搬动时间'} 算：西阳台 ${route.tripDli}、走廊 ${route.homeRouteDli}，今日总光量 ${route.dli}${ratio ? `，是全天待在走廊（${home.dli}）的 ${ratio.toFixed(1)} 倍` : ''}。`
        : (worth
          ? `<b>今天值得搬：${win.start} 前后过去，${win.end} 搬回来。</b> 这 ${route.tripHours} 小时拿到 ${route.tripDli}；今日总光量 ${route.dli}${ratio ? `，是全天待在走廊（${home.dli}）的 ${ratio.toFixed(1)} 倍` : ''}。${railing ? '栏杆有缝，盆放地上就能晒到。' : ''}`
          : (route.tripHours
            ? `今天西阳台这 ${route.tripHours} 小时只有 ${route.tripDli}，跟走廊一整天（${home.dli}）差不多，搬不搬都行。`
            : `今天不搬：西阳台没有直射窗口，或窗口里有雨/大风。全天在走廊，只有 ${home.dli}。`)))
      : '还没设外出台，除了走廊没有别的地方可去。'}</div>
    <div class="actions"><button class="btn ghost sm" data-go="settings">改地点</button>${S.readonly || !trip ? '' : `<button class="btn ghost sm" data-act="move" data-to="${nowPlace === 'trip' ? 'home' : 'trip'}">${ICON.move} ${nowPlace === 'trip' ? '搬回走廊' : `搬到${esc(trip.label)}`}</button>`}</div>
  </div>`;
}

const compass = (deg) => {
  const names = ['北', '东北偏北', '东北', '东北偏东', '东', '东南偏东', '东南', '东南偏南', '南', '西南偏南', '西南', '西南偏西', '西', '西北偏西', '西北', '西北偏北'];
  return names[Math.round(((deg % 360) / 22.5)) % 16];
};

/* ══════════════════════════════════════════════════════ 相册与校园画廊 */
function campusGalleryCard() {
  const cur = getCurrentBanner();
  return `<div class="card">
    <div class="card-head">
      <div>
        <div class="card-title">杭电校园四季与节日长卷</div>
        <div class="note" style="margin-top:2px">已生成 ${CAMPUS_BANNERS.length} 幅 · 顶部「换一张」只在当前这一季里轮换，节日/节气图不进轮换；点下面任意一张可手动指定</div>
      </div>
      <button class="btn ghost sm" data-act="nextBanner">本季换一张</button>
    </div>
    <div class="campus-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(210px, 1fr));gap:10px;margin-top:8px">
      ${CAMPUS_BANNERS.map((b, idx) => {
        const active = cur.id === b.id;
        return `<div class="campus-card" data-act="setBanner" data-idx="${idx}" style="cursor:pointer;border-radius:10px;overflow:hidden;border:1.5px solid ${active ? 'var(--gold)' : 'var(--line)'};background:var(--paper-2);transition:.15s;position:relative">
          <div style="aspect-ratio:16/9;position:relative;overflow:hidden">
            <img src="${b.src}" alt="${esc(b.tag)}" style="width:100%;height:100%;object-fit:cover;display:block">
            ${active ? '<span style="position:absolute;top:6px;right:6px;background:var(--gold);color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600">展示中</span>' : ''}
          </div>
          <div style="padding:7px 9px">
            <div style="font-weight:600;font-size:12px;color:var(--ink)">${esc(b.tag)}</div>
            <div style="font-size:10.5px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.sub)}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function viewAlbum() {
  const photos = S.state.photos || [];
  const gallery = campusGalleryCard();
  if (!photos.length) {
    return `<div class="stack">
      ${gallery}
      <div class="card"><div class="empty"><strong>还没有植物打分照片</strong>每周留一张，看黄化率、冠幅、花色的变化</div>
        <div class="actions" style="justify-content:center">
          ${S.state.plants.map((p) => `<button class="btn" data-act="photoFor" data-plant="${p.id}">${ICON.camera} 拍${esc(p.name)}</button>`).join('')}
        </div></div>
    </div>`;
  }
  const byPlant = {};
  for (const ph of photos) (byPlant[ph.plantId] ||= []).push(ph);
  return `<div class="stack">
    ${gallery}
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
  const _p0 = st.plants[0];
  const _at = (siteLike, place = 'balcony') =>
    M.sunPlan({ ..._p0, care: { ..._p0.care, place } }, S.idx, siteLike, S.today, st.location.lat, st.location.lon, { withTrip: false }).dli;
  const places = {
    north: _at(st.site),
    corridor: M.sunPlan(_p0, S.idx, st.site, S.today, st.location.lat, st.location.lon, { withTrip: false }).dli,
    trip: st.site.dayTrip?.enabled ? _at({ ...st.site, ...st.site.dayTrip }) : null,
    win: st.site.dayTrip?.enabled ? M.sunWindow({ spot: st.site.dayTrip, wIndex: S.idx, date: S.today }) : null,
    route: S.suns[_p0.id],
  };
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
        <b>iPhone</b>：用 Safari 打开 <span class="mono">${esc(location.origin)}</span> → 底部「分享」→「添加到主屏幕」。<br>
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
      <div class="card-head"><div class="card-title">地点与今天的作息</div><div class="note">今日总光量</div></div>

      <div class="place"><div><b>北阳台</b><span>参照点 · 顶棚很高，接近露天</span></div><em>${places.north}</em></div>
      <div class="place"><div><b>走廊</b><span>现在的家 · 只有散射</span></div><em>${places.corridor}</em></div>
      ${places.trip != null ? `<div class="place"><div><b>${esc(st.site.dayTrip?.label || '西阳台')}</b><span>${places.win ? '下午直射 ' + places.win.start + '–' + places.win.end : '今天这边没直射'} · 如果整天都待在那儿</span></div><em>${places.trip}</em></div>` : ''}
      ${places.trip != null && places.route ? `<div class="place"><div><b>今日总光量</b><span>${places.route.tripActual ? '按你点的搬动' : '按计划'} · 走廊 ${places.route.homeRouteDli} + ${esc(st.site.dayTrip?.label || '西阳台')} ${places.route.tripHours || 0} h ${places.route.tripDli}</span></div><em>${places.route.dli}</em></div>` : ''}

      <div class="field" style="margin-top:14px"><label>走廊透光率 %（相对北阳台）</label>
        <input id="siteCorridor" type="number" step="1" value="${Math.round((st.site.corridorLight ?? 0.37) * 100)}">
        <span class="hint">你在北阳台地面和走廊摆放点各量一次，相除就是它。实测 ${st.site.measured ? Math.round((st.site.measured.ratioCorridorToNorth ?? 0.37) * 100) + '%（' + st.site.measured.corridorLux + ' / ' + st.site.measured.northLux + ' lux）' : '还没测'}。</span>
      </div>
      <div class="field"><label>夜里叶面光照 lux</label>
        <input id="siteNightLux" type="number" step="1" value="${st.site.nightLux ?? ''}" placeholder="没测过就留空">
        <span class="hint">关灯后手机贴叶面朝光源量。<b>&lt;50</b> 不用管；<b>50–150</b> 明年 9 月前开始遮；<b>&gt;150</b> 现在就该遮。你现在填的是 ${st.site.nightLux ?? '空'}。</span>
      </div>
      <div class="grid2">
        <div class="field"><label>能在现场的最早时间</label>
          <input id="siteWaterFrom" type="time" value="${esc(st.site.waterWindow?.from || '08:00')}"></div>
        <div class="field"><label>最晚时间</label>
          <input id="siteWaterTo" type="time" value="${esc(st.site.waterWindow?.to || '19:00')}"></div>
      </div>
      <div class="note" style="margin-top:-6px;margin-bottom:12px">浇水钟点只在这个窗口里挑：人不在，算得再准也浇不了。窗口内还会按土温、辐射、日落、雨再筛一遍。</div>

      <details style="margin-bottom:12px">
        <summary>朝向与栏板尺寸</summary>
        <div class="body">
          <div class="grid2">
            <div class="field"><label>北阳台朝向</label><input id="siteAz" type="number" value="${st.site.azimuth}"></div>
            <div class="field"><label>栏板类型</label>
              <select id="siteParapetType">
                <option value="solid" ${(st.site.parapetType || 'solid') === 'solid' ? 'selected' : ''}>实心矮墙</option>
                <option value="railing" ${st.site.parapetType === 'railing' ? 'selected' : ''}>栏杆有缝隙</option>
              </select>
            </div>
            <div class="field"><label>栏板高 cm</label><input id="siteParapet" type="number" value="${st.site.parapetCm}"></div>
            <div class="field"><label>盆面离地 cm</label><input id="sitePotTop" type="number" value="${st.site.potTopCm}"></div>
            <div class="field"><label>盆到栏杆 cm</label><input id="siteDepth" type="number" value="${st.site.depthCm}"></div>
            <div class="field"><label>上方顶棚</label>
              <select id="siteCovered"><option value="no" ${!st.site.covered ? 'selected' : ''}>没有 / 很高</option><option value="yes" ${st.site.covered ? 'selected' : ''}>有，压得低</option></select>
            </div>
            <div class="field"><label>西阳台朝向</label><input id="tripAz" type="number" value="${st.site.dayTrip?.azimuth ?? 270}"></div>
            <div class="field"><label>西阳台栏板</label>
              <select id="tripParapet">
                <option value="railing" ${(st.site.dayTrip?.parapetType || 'railing') === 'railing' ? 'selected' : ''}>栏杆有缝隙</option>
                <option value="solid" ${st.site.dayTrip?.parapetType === 'solid' ? 'selected' : ''}>实心墙</option>
              </select>
            </div>
            <div class="field"><label>西阳台顶棚高 cm</label><input id="tripRoof" type="number" value="${st.site.dayTrip?.roofHeightCm ?? 230}"></div>
            <div class="field"><label>西阳台散射透过率 %</label><input id="tripDiffuse" type="number" step="5" value="${Math.round((st.site.dayTrip?.diffuse ?? 0.6) * 100)}"></div>
          </div>
          <div class="note" style="margin:-4px 0 10px">西阳台不是露天的：有顶棚、只有栏杆这一面敞口。所以散射要打折，直射只在太阳从开口斜射进来时才算——这两项错了，日耗会差一倍。</div>
          <div class="field"><label>外出台</label>
            <select id="tripEnabled"><option value="1" ${st.site.dayTrip?.enabled ? 'selected' : ''}>启用</option><option value="0" ${!st.site.dayTrip?.enabled ? 'selected' : ''}>关闭</option></select>
          </div>
        </div>
      </details>

      <button class="btn" data-act="savePlaces">保存三个地点</button>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">搬动与判冷</div><div class="note">什么时候才值得搬</div></div>
      <div class="note" style="margin:0 0 10px">
        周末人不在，<b>原地待着</b>（走廊 / 西阳台都行），不生成搬动任务；只有夜里降到接近冰点，才周五下班搬进房间、周一搬回。<br>
        工作日：走廊为主 → 下午有直射窗口去西阳台 → 傍晚回走廊；走廊夜里也到冰点附近才进实验室。
      </div>
      <div class="grid2">
        <div class="field"><label>走廊比室外暖 ℃</label>
          <input id="wkWarm" type="number" step="1" value="${st.site.corridorWarmC ?? 5}">
          <span class="hint">走廊是半室内，判冷时先给室外温度加这么多；阳台不加（就是露天那档）。</span></div>
        <div class="field"><label>比耐受线再低 ℃ 才搬房间</label>
          <input id="wkRoomBelow" type="number" step="1" value="${st.site.roomMoveBelowC ?? 5}">
          <span class="hint">最怕冷的是 ${Math.round(Math.max(...st.plants.map((p) => p.traits?.minNightC ?? 5)))}℃，所以现在走廊要跌到 ${M.roomLine(Math.max(...st.plants.map((p) => p.traits?.minNightC ?? 5)), st.site)}℃ 才搬。</span></div>
      </div>
      <div class="actions"><button class="btn" data-act="saveWeekend">保存</button></div>
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

async function recordMove(to) {
  const site = S.state.site;
  if (!site) return;
  const nowPlace = M.currentMovePlace(site);
  if (nowPlace === to) {
    toast(to === 'trip' ? '现在就在西阳台' : '现在就在走廊', 'err');
    return;
  }
  const at = iso();
  const log = Array.isArray(site.moveLog) ? site.moveLog : (site.moveLog = []);
  log.push({ at, to, src: 'manual' });
  // 顺手把今天的搬动任务勾掉，任务列表不用再点一次
  const taskId = `trip|${S.today}|${to === 'trip' ? 'toSun' : 'toHome'}`;
  if (S.tasks.some((t) => t.id === taskId) && !S.state.tasksDone[taskId]?.done) {
    S.state.tasksDone[taskId] = { done: true, at };
  }
  await saveState();
  compute();
  render();
  const label = to === 'trip' ? (site.dayTrip?.label || '西阳台') : M.homeLabel(S.state.plants, site);
  toast(`已记下：${nowHM()} 到${label}`, 'ok');
}

/** 补记/修正最后一条搬动时间：记晚了会让"今天的光"从头到尾都算错 */
function openMoveTimeSheet() {
  const log = Array.isArray(S.state.site?.moveLog) ? S.state.site.moveLog : [];
  if (!log.length) return toast('还没记过搬动', 'err');
  const last = log[log.length - 1];
  const d = new Date(last.at);
  const p2 = (n) => String(n).padStart(2, '0');
  const local = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
  openSheet(`<h3>改一下搬动时间</h3>
    <p class="sub">最后一条：${last.to === 'trip' ? `搬到${esc(S.state.site.dayTrip?.label || '西阳台')}` : '搬回走廊'}。
      光量、耗水都按这个时间算——记晚了（比如早上搬的、中午才点）就改一下。</p>
    <div class="field"><label>什么时候搬的</label><input id="moveAtIn" type="datetime-local" value="${local}">
      <span class="hint">改完今天的 DLI 和下次浇水日会跟着重算。</span></div>
    <div class="actions"><button class="btn wide" data-act="saveMoveTime">保存</button></div>`);
}

/** 勾/取消勾一件事的副作用（不负责保存和重渲染） */
async function applyTaskState(task) {
  const id = task.id;
  const cur = S.state.tasksDone[id];
  if (cur?.done) {
    delete S.state.tasksDone[id];
    return;
  }
  S.state.tasksDone[id] = { done: true, at: iso() };
  if (task.kind === 'measure') {
    openSheet(`<h3>测完了，把数填进去</h3>
      <p class="sub">走廊透过率 = 花盆处的照度 ÷ 户外开阔处的照度</p>
      <div class="field"><label>走廊透光率 %</label><input id="measuredPct" type="number" step="1" value="${Math.round((S.state.site.corridorLight ?? 0.18) * 100)}">
        <span class="hint">例：户外 20000 lux、花盆处 6000 lux → 填 30</span></div>
      <div class="actions" style="margin-top:2px">
        <button class="btn ghost sm" data-act="dismissMeasure">先不填</button>
      </div>
      <button class="btn wide" data-act="saveMeasured" style="margin-top:8px">保存并重算</button>`);
  }
  if (task.kind === 'water') {
    const p = plantById(task.plantId);
    if (!p) return;
    // 补勾过去的日子：用「那天该浇的时间」记账（不是现在），否则耗水会被算歪；
    // 而且只允许把基准往后推，补勾更早的日子不会把 lastWateredAt 往回拨
    const at = task.date < S.today ? `${task.date}T${task.time || '08:00'}:00` : iso();
    const prev = p.care?.lastWateredAt ? new Date(p.care.lastWateredAt).getTime() : 0;
    if (new Date(at).getTime() >= prev) {
      const cap = S.plans[p.id].capacity;
      p.care.lastWateredAt = at;
      p.care.lastWaterMl = cap;
      p.care.lastWaterToDrain = true;
      (S.state.logs ||= []).unshift({
        id: 'l' + Date.now(), plantId: p.id, type: '浇透', at, amountMl: cap,
        backfill: task.date < S.today,
      });
      toast(task.date < S.today
        ? `${p.name}：${M.monthDay(task.date)} 那次补上了，重算`
        : `${p.name} 浇透了，这次的水够它用几天会重新算`, 'ok');
    }
  }
}

async function toggleTask(id) {
  const task = S.tasks.find((t) => t.id === id);
  if (!task) return;
  await applyTaskState(task);
  await saveState();
  compute();
  render();
}

/** 历史清单里的补勾：任务不在 S.tasks 里，用当天的快照造一个 */
async function toggleHistoryTask(id, date) {
  const items = dayItems(date);
  const found = items.find((x) => x.id === id);
  const kind = found?.kind || M.taskIdParts(id).kind || '';
  await applyTaskState(found || { id, date, kind, time: '' });
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
  const used = p.care.lastWaterMl || plan.capacity;
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
      <button class="btn ghost wide" data-act="resetToDry" data-plant="${plantId}">土已经干透 · 从下一次浇透重新记账</button>
    </div>
    <div class="note" style="margin-top:12px">前两条记完马上重算：干的会立刻把这次浇水提到最近一个到岗日，湿的会往后推；同时按“这轮实际耗水速度”校正日耗系数。<br>
    第三条只记「现在土是干的」、把起点重设，<b>不动</b>耗水系数——上次没浇透、或者刚开始用这个看板时点它，之后第一次浇透就是新基准。</div>`);
}

/**
 * 重设起点：只认「现在土干了」，把盆里剩水清零，下一次浇透当成正式基准。
 * 不碰 calibration.factor —— 之前那轮可能根本没浇透，拿它去校正耗水只会越算越歪。
 */
async function resetToDry(plantId) {
  const p = plantById(plantId);
  p.care.lastSoilDryAt = iso();
  delete p.care.lastSoilWetAt;
  p.care.baselineResetAt = iso();
  (S.state.logs ||= []).unshift({
    id: 'l' + Date.now(), plantId, type: '探土', at: iso(), note: '干 · 重设起点',
  });
  closeSheet();
  await saveState();
  compute();
  render();
  const plan = S.plans[plantId];
  toast(`${p.name}：按干透记，下一次浇透 ${M.monthDay(plan.dutyDate)} ${plan.dutyTime}，从那天重新算`, 'ok');
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

async function doWater(plantId) {
  const p = plantById(plantId);
  const amount = S.plans[plantId].capacity;   // 浇透后土里能存给根用的水
  p.care.lastWateredAt = iso();
  p.care.lastWaterMl = amount;
  p.care.lastWaterToDrain = true;
  (S.state.logs ||= []).unshift({ id: 'l' + Date.now(), plantId, type: '浇透', at: iso(), amountMl: amount });
  await saveState();
  compute();
  render();
  const next = S.plans[plantId];
  toast(`${p.name}：浇透了，按这几天的天气约 ${next.intervalDays} 天后再浇`, 'ok');
}

function openWaterSheet(plantId) {
  const p = plantById(plantId);
  const plan = S.plans[plantId];
  const store = `盆土吸饱后能存住约 <b>${plan.capacity} ml</b> 给根用，够 ${plan.intervalDays} 天`;
  const wt = plan.dutyTime || plan.nextTime;
  const wd = plan.dutyDate || plan.nextDate;
  const wl = Number.isFinite(plan.dutyDaysLeft) ? plan.dutyDaysLeft : plan.daysLeft;
  const when = wl <= 0
    ? `这盆水已经用完，今天（${wt}）就该浇`
    : `现在还剩 ${plan.leftPct}%，预计 ${M.monthDay(wd)} ${wt} 再浇${plan.dutyShifted ? '（到期日不在实验室，已挪到最近一个到岗日）' : ''}`;
  openSheet(`<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">${plantAvatar(p, 36)}<div><h3 style="margin:0">给 ${esc(p.name)} 浇水</h3></div></div>
    <p class="sub">浇到底孔出水就行，不用数毫升。${store}；${when}。</p>
    <div class="card tight" style="box-shadow:none;background:var(--paper-2);margin-bottom:14px">
      <div style="font-size:13px;line-height:1.6">${M.wateringHowTo(p)}</div>
    </div>
    <div class="note" style="margin-bottom:12px;padding:9px 11px;background:#eef4ef;border-radius:10px;font-size:12.5px;line-height:1.65">
      <b>为什么这个点浇：${wt}</b>（${(plan.dutyWindow || plan.nextWindow).start}–${(plan.dutyWindow || plan.nextWindow).end} 之间都行）
      <div style="margin-top:4px">${(plan.dutyWhy || plan.nextTimeWhy || []).slice(0, 5).map((r) => `· ${esc(r)}`).join('<br>')}</div>
    </div>
    <button class="btn wide" data-act="confirmWater" data-plant="${plantId}">浇透了（盆底出过水）</button>
    <div class="note" style="margin-top:8px;text-align:center">点一下 = 记一次「浇透」，模型按盆里存住的水重新算下次</div>`);
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
      <div class="field"><label>浇水钟点</label><select id="pdWaterMode">
        <option value="auto" ${p.schedule?.waterMode !== 'fixed' ? 'selected' : ''}>按天气算（推荐）</option>
        <option value="fixed" ${p.schedule?.waterMode === 'fixed' ? 'selected' : ''}>固定时刻</option></select></div>
      <div class="field"><label>固定时刻</label><input id="pdWaterTime" type="time" value="${esc(p.schedule?.water || S.plans[p.id].nextTime)}">
        <span class="hint">选了「固定时刻」才用这个</span></div>
      <div class="field"><label>无孔盆给水比例</label><select id="pdRefill">
        <option value="" ${!Number.isFinite(p.pot.refill) ? 'selected' : ''}>自动（有孔一律浇透 / 无孔 45%）</option>
        <option value="1" ${p.pot.refill === 1 ? 'selected' : ''}>100% 满盆</option>
        <option value="0.75" ${p.pot.refill === 0.75 ? 'selected' : ''}>75%</option>
        <option value="0.6" ${p.pot.refill === 0.6 ? 'selected' : ''}>60%</option>
        <option value="0.45" ${p.pot.refill === 0.45 ? 'selected' : ''}>45%</option></select></div>
    </div>
    <div class="field"><label>备注</label><textarea id="pdNotes" rows="2">${esc(p.notes || '')}</textarea></div>
    <div class="note" style="margin-bottom:12px">浇透后盆里能存 ${S.plans[p.id].capacity} ml（≈ ${S.plans[p.id].intervalDays} 天的耗水）；下次 ${M.monthDay(S.plans[p.id].dutyDate || S.plans[p.id].nextDate)} ${S.plans[p.id].dutyTime || S.plans[p.id].nextTime}。浇到底孔出水即可，不用数毫升。</div>
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
    lightRoutine: suns[0]?.tripHours
      ? `走廊散射，${suns[0].tripActual ? '按实际搬动' : '按计划'} ${tripSpanText(suns[0])} 在${suns[0].tripLabel}（今日总光量 ${suns[0].dli}）`
      : '走廊散射，没有直射',
    potDia: p.pot.diaCm,
    drainage: p.pot.drainage === 'yes' ? '有孔' : p.pot.drainage === 'no' ? '无孔' : '未知',
    sunHours7: suns.reduce((a, s) => a + (s.tripHours || s.directHours), 0),
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
  const nb = e.target.closest('[data-act="nextBanner"]');
  if (nb) {
    const cur = getCurrentBanner();
    // 节日/节气图没有 season，就回到日历季节；四季图则留在它自己那一季里换
    const pool = seasonPool(cur.season || currentSeason());
    if (pool.length) {
      const i = pool.findIndex((b) => b.id === cur.id);
      S.bannerIdx = CAMPUS_BANNERS.indexOf(pool[(i + 1) % pool.length]);
      render();
    }
    return;
  }

  const sb = e.target.closest('[data-act="setBanner"]');
  if (sb) {
    S.bannerIdx = Number(sb.dataset.idx);
    render();
    return;
  }

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
  const WRITE = ['toggle','skip','skipReason','confirmWater','saveSite','saveSettings','saveWeekend','savePlant','saveVision','testVision','exportIcs','calAdjust','createPlant','delPhoto','notifyPerm','saveAzimuth','analyze','saveMeasured','dismissMeasure','move','resetToDry','saveMoveTime'];
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
    case 'resetToDry': return resetToDry(btn.dataset.plant);
    case 'soilSheet': return openSoilSheet(btn.dataset.plant);
    case 'skipReason': return skipTask(btn.dataset.task, btn.dataset.reason);
    case 'water': return openWaterSheet(plantId);
    case 'confirmWater': {
      closeSheet();
      return doWater(plantId);
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
    case 'calPrev': S.calMonth = shiftMonth(calMonthInfo().key, -1); render(); return;
    case 'calNext': S.calMonth = shiftMonth(calMonthInfo().key, 1); render(); return;
    case 'calDay': return openDaySheet(btn.dataset.date);
    case 'toggleDay': {
      const date = btn.dataset.date;
      await toggleHistoryTask(btn.dataset.task, date);
      openDaySheet(date);
      return;
    }
    case 'laterAll': {
      const rows = S.tasks.filter((t) => t.date > S.today);
      openSheet(`<h3>接下来要做的事</h3><p class="sub">未来 ${Math.max(1, new Set(rows.map((r) => r.date)).size)} 天 · 共 ${rows.length} 件</p>
        <div class="hist-list">${rows.map((r) => `<div class="hist-row">
          <span class="hist-time">${M.monthDay(r.date).replace('月', '/').replace('日', '')}</span>
          <span class="hist-main"><b>${esc(r.title)}</b><span>${M.weekdayCN(r.date)} ${esc(r.time)} · ${esc(KIND_META[r.kind]?.label || '')}</span></span>
        </div>`).join('') || '<div class="note">没有排到的事</div>'}</div>`);
      return;
    }
    case 'move': return recordMove(btn.dataset.to);
    case 'moveTime': return openMoveTimeSheet();
    case 'saveMoveTime': {
      const v = $('#moveAtIn')?.value;
      const at = new Date(v || '');
      if (!v || !Number.isFinite(at.getTime())) return toast('时间不对', 'err');
      const log = S.state.site?.moveLog || [];
      const last = log[log.length - 1];
      if (!last) return;
      last.at = at.toISOString();
      await saveState(); compute(); closeSheet(); render();
      toast('搬动时间已改，光量重算了', 'ok');
      return;
    }
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
    case 'dismissMeasure': {
      S.state.site.lightMeasured = true;
      await saveState(); closeSheet(); compute(); render();
      toast('好，测光提醒不再出现；想填随时去设置里改走廊透光率');
      return;
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
    case 'savePlaces': {
      const site = S.state.site;
      const num = (id, def) => { const v = Number($('#' + id)?.value); return Number.isFinite(v) ? v : def; };
      site.corridorLight = clamp(num('siteCorridor', 37) / 100, 0.03, 0.8);
      site.azimuth = num('siteAz', site.azimuth);
      site.parapetCm = num('siteParapet', site.parapetCm);
      site.potTopCm = num('sitePotTop', site.potTopCm);
      site.depthCm = num('siteDepth', site.depthCm);
      site.parapetType = $('#siteParapetType')?.value || 'solid';
      site.covered = $('#siteCovered')?.value === 'yes';
      const wf = ($('#siteWaterFrom')?.value || '').trim();
      const wto = ($('#siteWaterTo')?.value || '').trim();
      site.waterWindow = {
        from: /^\d{1,2}:\d{2}$/.test(wf) ? wf : '08:00',
        to: /^\d{1,2}:\d{2}$/.test(wto) ? wto : '19:00',
      };
      site.azimuthVerified = true;
      const enabled = $('#tripEnabled')?.value === '1';
      if (!enabled) {
        if (site.dayTrip) site.dayTrip.enabled = false;
      } else {
        site.dayTrip = {
          label: '西阳台', parapetCm: 110, potTopCm: 45, depthCm: 70,
          leadMin: 20, lagMin: 15, sideWallM: 2,
          ...(site.dayTrip || {}),
          enabled: true,
          covered: true,
          azimuth: num('tripAz', 270),
          parapetType: $('#tripParapet')?.value || 'railing',
          roofHeightCm: num('tripRoof', 230),
          diffuse: clamp(num('tripDiffuse', 60) / 100, 0.05, 1),
          direct: 1,
        };
      }
      await saveState(); compute(); render();
      toast('三个地点已保存', 'ok');
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
      const nl = Number($('#siteNightLux')?.value);
      s.nightLux = Number.isFinite(nl) && nl >= 0 ? nl : null;
      const cl = Number($('#siteCorridor').value);
      if (Number.isFinite(cl) && cl > 0) s.corridorLight = Math.min(0.6, Math.max(0.03, cl / 100));
      s.azimuthVerified = true;
      await saveState(); compute(); toast('几何已保存', 'ok'); render(); return;
    }
    case 'saveWeekend': {
      const site = S.state.site;
      const warm = Number($('#wkWarm')?.value);
      if (Number.isFinite(warm)) site.corridorWarmC = Math.max(0, Math.min(15, warm));
      const below = Number($('#wkRoomBelow')?.value);
      if (Number.isFinite(below) && below >= 0) site.roomMoveBelowC = Math.max(0, Math.min(12, below));
      // 老的周末几何参数已经没人用了，顺手清掉
      if (site.weekend) delete site.weekend.places;
      await saveState(); compute(); render();
      toast(`判冷已更新：走廊 +${site.corridorWarmC ?? 5}℃，低于耐受线 ${site.roomMoveBelowC ?? 5}℃ 才搬房间`, 'ok');
      return;
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
      p.schedule = p.schedule || {};
      p.schedule.waterMode = $('#pdWaterMode').value === 'fixed' ? 'fixed' : 'auto';
      const wt = ($('#pdWaterTime').value || '').trim();
      if (/^\d{1,2}:\d{2}$/.test(wt)) p.schedule.water = wt;
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
        schedule: { check: '07:00', prep: '21:00', waterMode: 'auto', moveOut: '07:30', moveIn: '17:00' },
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

/* 前端文件更新了，提示一下就够——不强制刷新，避免编辑中被反复打断 */
let appVer = null;
let verWarned = false;
async function checkVersion() {
  try {
    const r = await fetch('/api/version', { cache: 'no-store' });
    const { v } = await r.json();
    if (appVer && v !== appVer && !verWarned) {
      verWarned = true;
      const host = document.getElementById('toast');
      if (host) {
        const el = document.createElement('div');
        el.className = 'toast ok';
        el.style.cursor = 'pointer';
        el.textContent = '程序更新了，点这里刷新';
        el.onclick = () => location.reload();
        host.appendChild(el);
      }
      return;
    }
    if (!appVer) appVer = v;
  } catch { /* 忽略 */ }
}
setTimeout(checkVersion, 8000);
setInterval(checkVersion, 120000);

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
    <div class="note" style="margin-top:10px">没有口令？在 Mac 上跑 <span class="mono">cat ~/Code/花花和松松/.token   # 项目根目录下的 .token</span></div>`);
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
