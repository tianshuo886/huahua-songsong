/**
 * 花花和松松 · Sites Worker
 *
 * 本地版仍由 server.js 提供；这里给 Sites 提供同一套 /api 行为。
 * 状态、配置、天气缓存和照片都放在 D1，浏览器不需要知道后端在哪里。
 */

const MAX_BODY = 14 * 1024 * 1024;
const MAX_PHOTO_BYTES = 900 * 1024;
const WEATHER_TTL = 20 * 60 * 1000;
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

let schemaReady = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS plant_state (
    id TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    revised_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS plant_config (
    id TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS plant_photos (
    id TEXT PRIMARY KEY,
    file TEXT NOT NULL UNIQUE,
    plant_id TEXT,
    at TEXT NOT NULL,
    note TEXT NOT NULL,
    analysis_json TEXT,
    content_type TEXT NOT NULL,
    bytes BLOB NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS plant_photos_at ON plant_photos (at DESC)`,
  `CREATE TABLE IF NOT EXISTS plant_weather (
    cache_key TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  )`,
];

function json(code, value, extra = {}) {
  return new Response(JSON.stringify(value), {
    status: code,
    headers: { ...JSON_HEADERS, ...extra },
  });
}

function stamp() {
  return new Date().toISOString();
}

function randomPhotoId() {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  return 'ph_' + Date.now().toString(36) + id;
}

function cookieOf(request) {
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)plant_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function bytesToBase64(bytes) {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function readJson(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY) {
    const error = new Error('请求体过大');
    error.status = 413;
    throw error;
  }
  const text = await request.text();
  if (!text) return {};
  if (new TextEncoder().encode(text).byteLength > MAX_BODY) {
    const error = new Error('请求体过大');
    error.status = 413;
    throw error;
  }
  return JSON.parse(text);
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('Sites 没有绑定 D1 数据库');
  if (!schemaReady) {
    schemaReady = env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql))).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

/* ------------------------------------------------------------------ 初始数据 */

// 与 server.js 的 seedState() 保持同步；这里只放首次运行需要的安全默认值。
function seedState() {
  const iso = stamp();
  return {
    version: 1,
    revisedAt: iso,
    location: {
      name: '杭州电子科技大学 · 钱塘区',
      short: '下沙',
      lat: 30.2745,
      lon: 120.352,
      tz: 'Asia/Shanghai',
    },
    site: {
      label: '阳台',
      azimuth: 0,
      azimuthVerified: true,
      parapetCm: 110,
      potTopCm: 45,
      depthCm: 70,
      covered: false,
      corridorLight: 0.18,
    },
    settings: {
      notify: true,
      photoEveryDays: 7,
      bloomCheckEveryDays: 3,
      fertEveryDays: 14,
      et0Ref: 1.3,
    },
    plants: [
      {
        id: 'p_kalanchoe',
        name: '长寿花',
        species: 'Kalanchoe blossfeldiana',
        cultivar: '重瓣黄花',
        emoji: '🌼',
        accent: '#c99a1e',
        pot: {
          diaCm: 13,
          bottomCm: 10,
          heightCm: 12,
          drainage: 'unknown',
          saucer: false,
          cachepot: true,
          media: 'coir',
          rootBallRatio: 1,
        },
        traits: {
          cam: true,
          baseDailyMl: 40,
          minNightC: 8,
          lightNeedDli: 10,
          lightMinDli: 5,
          anoxiaDays: 2.5,
          storageDays: 14,
          targetWetDays: 6,
          bloom: true,
          stage: 'bloom',
          rainSensitive: true,
          windSensitive: true,
        },
        schedule: { check: '07:00', prep: '21:00', water: '08:30', moveOut: '07:30', moveIn: '17:00' },
        care: {
          lastWateredAt: iso,
          lastWaterMl: 210,
          place: 'corridor',
          rainExposed: false,
        },
        calibration: { factor: 1, samples: 0, lastAdjust: null },
        notes: '根球满盆；无孔陶瓷盆必须套盆才谈得上浇透。花期不能等叶片发软。',
        createdAt: iso,
      },
      {
        id: 'p_podocarpus',
        name: '罗汉松',
        species: 'Podocarpus macrophyllus var. maki',
        cultivar: '小叶罗汉松',
        emoji: '🌿',
        accent: '#2f6b4f',
        pot: {
          diaCm: 11,
          bottomCm: 9,
          heightCm: 10.5,
          drainage: 'yes',
          saucer: true,
          cachepot: false,
          media: 'humus',
          rootBallRatio: 0.75,
        },
        traits: {
          cam: false,
          baseDailyMl: 24,
          minNightC: -3,
          lightNeedDli: 7,
          lightMinDli: 3.5,
          anoxiaDays: 7,
          storageDays: 4,
          targetWetDays: 10,
          bloom: false,
          stage: 'veg',
          rainSensitive: false,
          windSensitive: false,
        },
        schedule: { check: '07:00', prep: '21:00', water: '08:30', moveOut: '07:30', moveIn: '17:00' },
        care: {
          lastWateredAt: iso,
          lastWaterMl: 170,
          place: 'corridor',
          rainExposed: false,
        },
        calibration: { factor: 1, samples: 0, lastAdjust: null },
        notes: '缺水信号滞后 1–2 周，只能用竹签/秤判断；浇水要分两遍慢浇。',
        createdAt: iso,
      },
    ],
    logs: [],
    photos: [],
    tasksDone: {},
  };
}

/* ------------------------------------------------------------------ 持久化 */

async function readState(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT json FROM plant_state WHERE id = ?').bind('main').first();
  if (!row?.json) {
    const next = seedFromEnvironment(env) || seedState();
    await writeState(env, next);
    return next;
  }
  return JSON.parse(row.json);
}

function seedFromEnvironment(env) {
  if (!env.SEED_STATE_JSON) return null;
  try {
    const parsed = JSON.parse(env.SEED_STATE_JSON);
    if (!parsed || !Array.isArray(parsed.plants)) return null;
    // 本地照片不进环境变量；首次上线后由站点自己维护照片库。
    parsed.photos = [];
    return parsed;
  } catch (error) {
    console.error('[state] SEED_STATE_JSON 解析失败', error);
    return null;
  }
}

async function writeState(env, state) {
  await ensureSchema(env);
  const revisedAt = state.revisedAt || stamp();
  await env.DB.prepare(
    `INSERT INTO plant_state (id, json, revised_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       json = excluded.json,
       revised_at = excluded.revised_at,
       updated_at = excluded.updated_at`,
  ).bind('main', JSON.stringify(state), revisedAt, stamp()).run();
}

function emptyConfig() {
  return {
    vision: {
      baseUrl: '',
      model: '',
      apiKey: '',
      reasoningEffort: 'max',
      maxTokens: 4000,
      verifiedAt: null,
    },
  };
}

async function readConfig(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT json FROM plant_config WHERE id = ?').bind('main').first();
  if (!row?.json) return emptyConfig();
  const parsed = JSON.parse(row.json);
  return { ...emptyConfig(), ...parsed, vision: { ...emptyConfig().vision, ...(parsed.vision || {}) } };
}

async function writeConfig(env, config) {
  await ensureSchema(env);
  await env.DB.prepare(
    `INSERT INTO plant_config (id, json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       json = excluded.json,
       updated_at = excluded.updated_at`,
  ).bind('main', JSON.stringify(config), stamp()).run();
}

/* ------------------------------------------------------------------ 天气 */

/** 三家全球模式：单个模式对本地夜间低温常常偏冷，取中位数压掉极值 */
const TEMP_MODELS = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless'];

const median = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? Math.round(v[m] * 10) / 10 : Math.round(((v[m - 1] + v[m]) / 2) * 10) / 10;
};

async function fetchTempMedian(lat, lon, tz) {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude', lat);
  u.searchParams.set('longitude', lon);
  u.searchParams.set('timezone', tz || 'Asia/Shanghai');
  u.searchParams.set('forecast_days', '14');
  u.searchParams.set('daily', 'temperature_2m_min,temperature_2m_max');
  u.searchParams.set('models', TEMP_MODELS.join(','));
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(u, { signal: ctl.signal });
    if (!r.ok) throw new Error('open-meteo models ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

/**
 * 给主线数据补上 tminMed / tmaxMed（多模式中位数）。
 * best_match 在这片区域比中央气象台低 4℃ 左右（实测），夜间低温被高估会误判"太冷不能放阳台"。
 */
async function withTempMedian(data, lat, lon, tz) {
  try {
    const mm = await fetchTempMedian(lat, lon, tz);
    const at = new Map((mm.daily?.time || []).map((d, i) => [d, i]));
    const dates = data.daily?.time || [];
    if (!dates.length || !at.size) return data;
    const pick = (field, date) => {
      const i = at.get(date);
      if (i == null) return null;
      return median(TEMP_MODELS.map((m) => mm.daily?.[`${field}_${m}`]?.[i]));
    };
    data.daily.tminMed = dates.map((d) => pick('temperature_2m_min', d));
    data.daily.tmaxMed = dates.map((d) => pick('temperature_2m_max', d));
  } catch { /* 取不到就退回单模型，别让首页卡住 */ }
  return data;
}

async function fetchWeather(lat, lon, tz) {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude', lat);
  u.searchParams.set('longitude', lon);
  u.searchParams.set('timezone', tz || 'Asia/Shanghai');
  u.searchParams.set('forecast_days', '14');
  u.searchParams.set('daily', [
    'weather_code', 'temperature_2m_max', 'temperature_2m_min',
    'precipitation_sum', 'precipitation_probability_max',
    'et0_fao_evapotranspiration', 'sunshine_duration',
    'shortwave_radiation_sum', 'wind_speed_10m_max',
    'relative_humidity_2m_mean', 'apparent_temperature_max',
  ].join(','));
  u.searchParams.set('hourly', [
    'temperature_2m', 'relative_humidity_2m', 'cloud_cover',
    'precipitation', 'shortwave_radiation', 'wind_speed_10m', 'wind_direction_10m',
  ].join(','));

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const response = await fetch(u, { signal: ctl.signal });
    if (!response.ok) throw new Error('open-meteo ' + response.status);
    return withTempMedian(await response.json(), lat, lon, tz);
  } finally {
    clearTimeout(timer);
  }
}

async function readWeatherCache(env, key) {
  await ensureSchema(env);
  const row = await env.DB.prepare(
    'SELECT json, fetched_at FROM plant_weather WHERE cache_key = ?',
  ).bind(key).first();
  if (!row?.json) return null;
  return { data: JSON.parse(row.json), at: Number(row.fetched_at) };
}

async function writeWeatherCache(env, key, data) {
  await ensureSchema(env);
  await env.DB.prepare(
    `INSERT INTO plant_weather (cache_key, json, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET
       json = excluded.json,
       fetched_at = excluded.fetched_at`,
  ).bind(key, JSON.stringify(data), Date.now()).run();
}

async function getWeather(env, ctx, lat, lon, tz) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const hit = await readWeatherCache(env, key);
  if (hit && Date.now() - hit.at < WEATHER_TTL) return { ...hit.data, cached: true };

  const refresh = () => fetchWeather(lat, lon, tz)
    .then(async (data) => {
      await writeWeatherCache(env, key, data);
      return data;
    });

  if (hit) {
    const pending = refresh().catch((error) => console.error('[weather] 后台刷新失败', error));
    if (ctx?.waitUntil) ctx.waitUntil(pending);
    return { ...hit.data, cached: true, stale: true };
  }
  try {
    return await refresh();
  } catch (error) {
    const old = await readWeatherCache(env, key).catch(() => null);
    if (!old) throw error;
    return {
      ...old.data,
      cached: true,
      stale: true,
      staleNote: '实时天气取不到，用的是上次成功的预报',
    };
  }
}

/* ------------------------------------------------------------------ 视觉模型 */

function visionPrompt(ctx) {
  return `请诊断这张植物照片的健康状况。
【植物】${ctx.plantName || '未知'}（${ctx.species || '未注明'}）
【养护数据】
- 上次浇水：${ctx.lastWatered || '未知'}，水量 ${ctx.lastWaterMl || '?'} ml
- 距今 ${ctx.daysSinceWater ?? '?'} 天，模型估计盆土剩余水分 ${ctx.waterLeftPct ?? '?'}%
- 近 7 天：气温 ${ctx.tempMin7 ?? '?'}~${ctx.tempMax7 ?? '?'}℃，累计降水 ${ctx.rain7 ?? '?'} mm，累计 ET0 ${ctx.et07 ?? '?'} mm
- 摆放位置：${ctx.place || '阳台'}；盆口径 ${ctx.potDia ?? '?'} cm，${ctx.drainage || '排水情况未知'}
- 光照：近 7 天估算有效日照 ${ctx.sunHours7 ?? '?'} 小时，DLI≈${ctx.dli7 ?? '?'} mol/m²/d
- 物候：${ctx.stage || '营养生长'}
【拍摄】${ctx.ts || ''}；用户备注：${ctx.note || '无'}
【历史】上一次诊断：${ctx.prevSummary || '无'}

只根据照片能看到的和上面给出的数据推断，看不清就说看不清，不要编造。
严格输出 JSON（不要代码块、不要多余文字）：
{"score":0-100整数,"summary":"一句话结论","findings":[{"sign":"观察到的具体征象","severity":"低|中|高","cause":"最可能的原因"}],"actions":[{"when":"今天|本周|长期","do":"具体动作（含数值）"}],"confidence":"高|中|低"}`;
}

function extractJson(text) {
  if (!text) return null;
  const s = String(text).replace(/```json/gi, '```').trim();
  const fenced = s.match(/```([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : s;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}

async function callVision(env, dataUrl, ctx) {
  const config = await readConfig(env);
  const { baseUrl, model, apiKey, reasoningEffort, maxTokens } = config.vision || {};
  if (!baseUrl || !model || !apiKey) {
    const error = new Error('视觉模型未配置');
    error.code = 'NO_VISION';
    throw error;
  }
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const attempt = async (effort, budget) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 200000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: budget,
          ...(effort && effort !== 'off' ? { reasoning_effort: effort } : {}),
          messages: [
            { role: 'system', content: '你是一位严谨的园艺诊断师，只依据图像与给定数据判断，输出严格的 JSON。' },
            {
              role: 'user',
              content: [
                { type: 'text', text: visionPrompt(ctx) },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
      });
      let text;
      try {
        text = await response.text();
      } catch (error) {
        if (String(error).includes('aborted')) throw new Error('模型超时（200 秒还没答完）');
        throw error;
      }
      if (!response.ok) throw new Error(`模型接口 ${response.status}: ${text.slice(0, 240)}`);
      const payload = JSON.parse(text);
      const message = payload.choices?.[0]?.message?.content;
      const content = Array.isArray(message)
        ? message.map((part) => (typeof part === 'string' ? part : part.text || '')).join('\n')
        : String(message || '');
      return { parsed: extractJson(content), content };
    } finally {
      clearTimeout(timer);
    }
  };

  const budget = Number(maxTokens) || 4000;
  let lastError = null;
  const plan = [
    [reasoningEffort || 'max', budget],
    [reasoningEffort === 'off' ? 'low' : 'high', Math.max(4000, Math.round(budget * 0.6))],
  ];
  for (const [effort, tokens] of plan) {
    try {
      const { parsed, content } = await attempt(effort, tokens);
      if (parsed) return { parsed, raw: content, model, effort, budget: tokens };
      lastError = new Error(`模型没按 JSON 格式回答（${effort}/${tokens}）：${content.slice(0, 160) || '空回复'}`);
    } catch (error) {
      lastError = error;
      const message = String(error.message || '');
      if (/超时|abort|ENOTFOUND|ECONNREFUSED|fetch failed/i.test(message)) throw error;
    }
  }
  throw lastError || new Error('模型没有给出结果');
}

/* ------------------------------------------------------------------ 路由 */

async function handleToken(request, env, url) {
  const token = String(env.PLANT_TOKEN || '').trim();
  const supplied = url.searchParams.get('t') || '';
  if (!token || supplied !== token) {
    return new Response('bad token', {
      status: 401,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return new Response(null, {
    status: 204,
    headers: {
      'set-cookie': `plant_token=${encodeURIComponent(token)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
      'cache-control': 'no-store',
    },
  });
}

async function servePhoto(env, url) {
  const name = decodeURIComponent(url.pathname.slice('/photos/'.length));
  if (!name || name.includes('/') || name.includes('\\')) return new Response('not found', { status: 404 });
  await ensureSchema(env);
  const row = await env.DB.prepare(
    'SELECT content_type, bytes FROM plant_photos WHERE file = ?',
  ).bind(name).first();
  if (!row) return new Response('not found', { status: 404 });
  return new Response(row.bytes, {
    status: 200,
    headers: {
      'content-type': row.content_type || 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}

async function assetVersion(env, request) {
  try {
    const response = await env.ASSETS.fetch(new Request(new URL('/version.json', request.url)));
    if (!response.ok) return { v: 'sites' };
    const data = await response.json();
    return { v: String(data.v || 'sites') };
  } catch {
    return { v: 'sites' };
  }
}

async function handleApi(request, env, ctx, url) {
  const p = url.pathname;
  const method = request.method;
  const token = String(env.PLANT_TOKEN || '').trim();

  if (p === '/api/auth') {
    const supplied = request.headers.get('x-plant-token') || url.searchParams.get('t') || cookieOf(request);
    return json(200, { protected: !!token, ok: !token || supplied === token });
  }

  const needsAuth = token && (method !== 'GET' || p === '/api/config');
  if (needsAuth) {
    const supplied = request.headers.get('x-plant-token') || url.searchParams.get('t') || cookieOf(request);
    if (supplied !== token) return json(401, { error: '只读模式：需要口令', code: 'AUTH' });
  }

  if (p === '/api/version' && method === 'GET') {
    return json(200, await assetVersion(env, request));
  }

  if (p === '/api/state' && method === 'GET') {
    return json(200, await readState(env));
  }

  if (p === '/api/state' && method === 'PUT') {
    const body = await readJson(request);
    if (!body || !Array.isArray(body.plants)) return json(400, { error: 'state 结构不对' });
    const next = { ...body, revisedAt: stamp() };
    await writeState(env, next);
    return json(200, { ok: true, revisedAt: next.revisedAt });
  }

  if (p === '/api/weather' && method === 'GET') {
    const state = await readState(env);
    const lat = Number(url.searchParams.get('lat')) || state.location.lat;
    const lon = Number(url.searchParams.get('lon')) || state.location.lon;
    try {
      return json(200, await getWeather(env, ctx, lat, lon, state.location.tz));
    } catch (error) {
      return json(502, { error: '取天气失败：' + error.message });
    }
  }

  if (p === '/api/config' && method === 'GET') {
    const config = await readConfig(env);
    const v = config.vision || {};
    return json(200, {
      vision: {
        baseUrl: v.baseUrl || '',
        model: v.model || '',
        reasoningEffort: v.reasoningEffort || 'max',
        maxTokens: v.maxTokens || 4000,
        hasKey: !!v.apiKey,
        keyHint: v.apiKey ? v.apiKey.slice(0, 3) + '••••' + v.apiKey.slice(-4) : '',
        verifiedAt: v.verifiedAt || null,
      },
    });
  }

  if (p === '/api/config' && method === 'PUT') {
    const body = await readJson(request);
    const current = await readConfig(env);
    const v = body.vision || {};
    const vision = {
      baseUrl: String(v.baseUrl || '').trim(),
      model: String(v.model || '').trim(),
      apiKey: v.apiKey ? String(v.apiKey).trim() : (current.vision?.apiKey || ''),
      reasoningEffort: String(v.reasoningEffort || current.vision?.reasoningEffort || 'max'),
      maxTokens: Number(v.maxTokens || current.vision?.maxTokens || 4000),
      verifiedAt: v.verifiedAt ?? current.vision?.verifiedAt ?? null,
    };
    await writeConfig(env, { vision });
    return json(200, {
      ok: true,
      vision: { baseUrl: vision.baseUrl, model: vision.model, hasKey: !!vision.apiKey },
    });
  }

  if (p === '/api/config/test' && method === 'POST') {
    const current = await readConfig(env);
    const body = await readJson(request);
    const { baseUrl, model, apiKey } = { ...current.vision, ...(body.vision || {}) };
    if (!baseUrl || !model || !apiKey) return json(400, { error: '三项都要填' });
    try {
      const response = await fetch(baseUrl.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({
          model,
          max_tokens: 8,
          messages: [{ role: 'user', content: '回复 ok' }],
        }),
      });
      const text = await response.text();
      if (!response.ok) return json(200, { ok: false, error: `HTTP ${response.status}: ${text.slice(0, 300)}` });
      return json(200, { ok: true, echo: text.slice(0, 200) });
    } catch (error) {
      return json(200, { ok: false, error: error.message });
    }
  }

  if (p === '/api/photos' && method === 'POST') {
    const body = await readJson(request);
    const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(body.dataUrl || ''));
    if (!match) return json(400, { error: '需要 data:image/... base64' });
    let bytes;
    try {
      bytes = base64ToBytes(match[2]);
    } catch {
      return json(400, { error: '照片 base64 解析失败' });
    }
    if (bytes.byteLength > MAX_PHOTO_BYTES) {
      return json(413, { error: '照片太大：单张请控制在 900 KB 以内' });
    }

    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const contentType = match[1] === 'jpeg' ? 'image/jpeg' : `image/${match[1]}`;
    const id = randomPhotoId();
    const file = `${id}.${ext}`;
    const rec = {
      id,
      file,
      plantId: body.plantId || null,
      at: body.at || stamp(),
      note: body.note || '',
      analysis: null,
    };
    await ensureSchema(env);
    await env.DB.prepare(
      `INSERT INTO plant_photos (id, file, plant_id, at, note, analysis_json, content_type, bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      rec.id,
      rec.file,
      rec.plantId,
      rec.at,
      rec.note,
      JSON.stringify(rec.analysis),
      contentType,
      bytes,
    ).run();
    const state = await readState(env);
    state.photos = [rec, ...(state.photos || [])];
    state.revisedAt = stamp();
    await writeState(env, state);
    return json(200, { ok: true, photo: rec });
  }

  const delPhoto = /^\/api\/photos\/([\w-]+)$/.exec(p);
  if (delPhoto && method === 'DELETE') {
    const state = await readState(env);
    const rec = (state.photos || []).find((item) => item.id === delPhoto[1]);
    if (!rec) return json(404, { error: '没有这张照片' });
    await env.DB.prepare('DELETE FROM plant_photos WHERE id = ?').bind(rec.id).run();
    state.photos = state.photos.filter((item) => item.id !== rec.id);
    state.revisedAt = stamp();
    await writeState(env, state);
    return json(200, { ok: true });
  }

  if (p === '/api/analyze' && method === 'POST') {
    const { photoId, context } = await readJson(request);
    const state = await readState(env);
    const rec = (state.photos || []).find((item) => item.id === photoId);
    if (!rec) return json(404, { error: '没有这张照片' });
    const row = await env.DB.prepare(
      'SELECT content_type, bytes FROM plant_photos WHERE id = ?',
    ).bind(rec.id).first();
    if (!row) return json(404, { error: '照片文件丢了' });
    const dataUrl = `data:${row.content_type};base64,${bytesToBase64(row.bytes)}`;
    try {
      const { parsed, raw, model } = await callVision(env, dataUrl, context || {});
      rec.analysis = {
        at: stamp(),
        model,
        raw,
        score: Number.isFinite(parsed.score) ? parsed.score : null,
        summary: parsed.summary || '',
        findings: Array.isArray(parsed.findings) ? parsed.findings : [],
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        confidence: parsed.confidence || '',
      };
      state.revisedAt = stamp();
      await ensureSchema(env);
      await env.DB.prepare(
        'UPDATE plant_photos SET analysis_json = ? WHERE id = ?',
      ).bind(JSON.stringify(rec.analysis), rec.id).run();
      await writeState(env, state);
      return json(200, { ok: true, analysis: rec.analysis });
    } catch (error) {
      const refused = /ECONNREFUSED|fetch failed|ENOTFOUND|connect/i.test(error.message || '');
      return json(200, {
        ok: false,
        code: error.code || (refused ? 'GATEWAY_DOWN' : 'ERR'),
        error: refused
          ? `连不上 ${(await readConfig(env)).vision.baseUrl || '模型服务'}：云端 Worker 不能访问 127.0.0.1，请在设置里换成可公网访问的 OpenAI 兼容接口`
          : error.message,
      });
    }
  }

  return json(404, { error: '没有这个接口' });
}

function acceptsHtml(request) {
  return request.headers.get('accept')?.includes('text/html');
}

async function serveStatic(request, env, url) {
  if (url.pathname === '/health') return new Response('ok');

  const response = await env.ASSETS.fetch(request);
  if (
    response.status === 404
    && acceptsHtml(request)
    && ['GET', 'HEAD'].includes(request.method)
  ) {
    const indexUrl = new URL('/index.html', request.url);
    indexUrl.search = '';
    return env.ASSETS.fetch(new Request(indexUrl, request));
  }
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/plant-token') return await handleToken(request, env, url);
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, ctx, url);
      if (url.pathname.startsWith('/photos/')) return await servePhoto(env, url);
      return await serveStatic(request, env, url);
    } catch (error) {
      console.error('[sites]', request.method, url.pathname, error);
      if (url.pathname.startsWith('/api/')) {
        return json(error.status || 500, { error: error.message || '服务端错误' });
      }
      return new Response('服务端错误', {
        status: error.status || 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  },
};
