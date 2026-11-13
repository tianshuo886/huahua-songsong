#!/usr/bin/env node
/**
 * 花花和松松 · 本机服务
 *   - 数据落盘在 ./data（state.json / config.json / photos/）
 *   - 手机与电脑连同一个 WiFi 即可同时访问、实时同步
 *   - 视觉模型 API Key 只存在服务端，永不下发到浏览器
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readFile, writeFile, mkdir, rename, unlink, stat, readdir,
} from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const PHOTO_DIR = path.join(DATA, 'photos');
const STATE_FILE = path.join(DATA, 'state.json');
const CONFIG_FILE = path.join(DATA, 'config.json');
const PORT = Number(process.env.PORT || 7788);
// 设了 PLANT_TOKEN 就开启写保护：GET 随便看，改数据要口令
const TOKEN = (() => {
  const env = String(process.env.PLANT_TOKEN || '').trim();
  if (env) return env;
  try { return String(readFileSync(path.join(ROOT, '.token'), 'utf8')).trim(); } catch { return ''; }
})();
const MAX_BODY = 14 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/* ------------------------------------------------------------------ 初始数据 */

function seedState() {
  const now = new Date();
  const iso = now.toISOString();
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

let state = null;
let config = { vision: { baseUrl: '', model: '', apiKey: '', verifiedAt: null } };

async function ensureDirs() {
  await mkdir(DATA, { recursive: true });
  await mkdir(PHOTO_DIR, { recursive: true });
}

async function loadAll() {
  await ensureDirs();
  try {
    state = JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    state = seedState();
    await saveState();
  }
  try {
    config = { ...config, ...JSON.parse(await readFile(CONFIG_FILE, 'utf8')) };
  } catch { /* 首次运行 */ }
}

let saveTimer = null;
async function saveState() {
  const tmp = STATE_FILE + '.tmp';
  await writeFile(tmp, JSON.stringify(state, null, 1));
  await rename(tmp, STATE_FILE);
}
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveState().catch((e) => console.error('[state] 写入失败', e));
  }, 120);
}
async function saveConfig() {
  const tmp = CONFIG_FILE + '.tmp';
  await writeFile(tmp, JSON.stringify(config, null, 1), { mode: 0o600 });
  await rename(tmp, CONFIG_FILE);
}

/* ------------------------------------------------------------------ 工具 */

const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
};

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

const stamp = () => new Date().toISOString();

/* ------------------------------------------------------------------ 天气 */

const weatherCache = new Map();
const WEATHER_TTL = 20 * 60 * 1000;

async function getWeather(lat, lon, tz) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const hit = weatherCache.get(key);
  if (hit && Date.now() - hit.at < WEATHER_TTL) return { ...hit.data, cached: true };

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
    'precipitation', 'shortwave_radiation', 'wind_speed_10m',
  ].join(','));

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(u, { signal: ctl.signal });
    if (!r.ok) throw new Error('open-meteo ' + r.status);
    const data = await r.json();
    weatherCache.set(key, { at: Date.now(), data });
    return { ...data, cached: false };
  } finally {
    clearTimeout(t);
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

async function callVision(dataUrl, ctx) {
  const { baseUrl, model, apiKey, reasoningEffort, maxTokens } = config.vision || {};
  if (!baseUrl || !model || !apiKey) {
    const e = new Error('视觉模型未配置');
    e.code = 'NO_VISION';
    throw e;
  }
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const attempt = async (effort, budget) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 200000);
    try {
      const r = await fetch(url, {
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
      try { text = await r.text(); }
      catch (err) {
        if (String(err).includes('aborted')) throw new Error('模型超时（200 秒还没答完）');
        throw err;
      }
      if (!r.ok) throw new Error(`模型接口 ${r.status}: ${text.slice(0, 240)}`);
      const payload = JSON.parse(text);
      const msg = payload.choices?.[0]?.message?.content;
      const content = Array.isArray(msg)
        ? msg.map((p) => (typeof p === 'string' ? p : p.text || '')).join('\n')
        : String(msg || '');
      const parsed = extractJson(content);
      return { parsed, content, payload };
    } finally {
      clearTimeout(timer);
    }
  };

  // 主尝试：按配置的思考强度；如果思考把额度吃光（返回空），降档重试一次
  const budget = Number(maxTokens) || 8000;
  let lastErr = null;
  const plan = [
    [reasoningEffort || 'max', budget],
    [reasoningEffort === 'off' ? 'low' : 'high', Math.max(4000, Math.round(budget * 0.6))],
  ];
  for (const [effort, tk] of plan) {
    try {
      const { parsed, content } = await attempt(effort, tk);
      if (parsed) return { parsed, raw: content, model, effort, budget: tk };
      lastErr = new Error(`模型没按 JSON 格式回答（${effort}/${tk}）：${content.slice(0, 160) || '空回复'}`);
    } catch (e) {
      lastErr = e;
      const msg = String(e.message || '');
      if (/超时|abort|ENOTFOUND|ECONNREFUSED|fetch failed/i.test(msg)) throw e;
    }
  }
  throw lastErr || new Error('模型没有给出结果');
}

/* ------------------------------------------------------------------ 路由 */

const RESOLVE_PATH = '/plant-token';

async function handleApi(req, res, url) {
  const p = url.pathname;

  const HEADER = 'x-plant-token';
  const RESOLVE = RESOLVE_PATH;

  const cookieOf = () => {
    const m = (req.headers.cookie || '').match(/(?:^|;\s*)plant_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  };

  if (p === '/api/auth') {
    const t = req.headers[HEADER] || url.searchParams.get('t') || cookieOf();
    return json(res, 200, { protected: !!TOKEN, ok: !TOKEN || t === TOKEN });
  }

  // 在 Private Network Access 下，公网页面对私网地址发请求会被预检，浏览器可能不带自定义头。
  // 用一个同源、无自定义头的 GET 跳转接口兜底：命中口令就下发 cookie。只允许 GET，不能改数据。
  if (p === RESOLVE) {
    const t = url.searchParams.get('t') || '';
    if (!TOKEN || t !== TOKEN) { res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('bad token'); }
    res.writeHead(204, {
      'set-cookie': `plant_token=${encodeURIComponent(TOKEN)}; Path=/; Max-Age=31536000; SameSite=Lax`,
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    });
    return res.end();
  }

  const needsAuth = TOKEN && (req.method !== 'GET' || p === '/api/config');
  if (needsAuth) {
    const t = req.headers[HEADER] || url.searchParams.get('t') || cookieOf();
    if (t !== TOKEN) return json(res, 401, { error: '只读模式：需要口令', code: 'AUTH' });
  }

  if (p === '/api/version') {
    const files = ['public/js/app.js', 'public/js/model.js', 'public/js/solar.js', 'public/css/app.css'];
    const vers = [];
    for (const f of files) {
      try { vers.push(String((await stat(path.join(ROOT, f))).mtimeMs)); } catch { vers.push('0'); }
    }
    return json(res, 200, { v: vers.join('-') });
  }

  if (p === '/api/state' && req.method === 'GET') {
    return json(res, 200, state);
  }

  if (p === '/api/state' && req.method === 'PUT') {
    const body = await readJson(req);
    if (!body || !Array.isArray(body.plants)) return json(res, 400, { error: 'state 结构不对' });
    state = { ...body, revisedAt: stamp() };
    await saveState();
    return json(res, 200, { ok: true, revisedAt: state.revisedAt });
  }

  if (p === '/api/weather' && req.method === 'GET') {
    const lat = Number(url.searchParams.get('lat')) || state.location.lat;
    const lon = Number(url.searchParams.get('lon')) || state.location.lon;
    try {
      const data = await getWeather(lat, lon, state.location.tz);
      return json(res, 200, data);
    } catch (e) {
      return json(res, 502, { error: '取天气失败：' + e.message });
    }
  }

  if (p === '/api/config' && req.method === 'GET') {
    const v = config.vision || {};
    return json(res, 200, {
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

  if (p === '/api/config' && req.method === 'PUT') {
    const body = await readJson(req);
    const v = body.vision || {};
    config.vision = {
      baseUrl: String(v.baseUrl || '').trim(),
      model: String(v.model || '').trim(),
      apiKey: v.apiKey ? String(v.apiKey).trim() : (config.vision?.apiKey || ''),
      reasoningEffort: String(v.reasoningEffort || config.vision?.reasoningEffort || 'max'),
      maxTokens: Number(v.maxTokens || config.vision?.maxTokens || 4000),
      verifiedAt: v.verifiedAt ?? config.vision?.verifiedAt ?? null,
    };
    await saveConfig();
    return json(res, 200, {
      ok: true,
      vision: {
        baseUrl: config.vision.baseUrl,
        model: config.vision.model,
        hasKey: !!config.vision.apiKey,
      },
    });
  }

  if (p === '/api/config/test' && req.method === 'POST') {
    const { baseUrl, model, apiKey } = { ...config.vision, ...(await readJson(req)).vision };
    if (!baseUrl || !model || !apiKey) return json(res, 400, { error: '三项都要填' });
    try {
      const r = await fetch(baseUrl.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({
          model,
          max_tokens: 8,
          messages: [{ role: 'user', content: '回复 ok' }],
        }),
      });
      const t = await r.text();
      if (!r.ok) return json(res, 200, { ok: false, error: `HTTP ${r.status}: ${t.slice(0, 300)}` });
      return json(res, 200, { ok: true, echo: t.slice(0, 200) });
    } catch (e) {
      return json(res, 200, { ok: false, error: e.message });
    }
  }

  if (p === '/api/photos' && req.method === 'POST') {
    const body = await readJson(req);
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(body.dataUrl || '');
    if (!m) return json(res, 400, { error: '需要 data:image/... base64' });
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const id = 'ph_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const file = `${id}.${ext}`;
    await writeFile(path.join(PHOTO_DIR, file), Buffer.from(m[2], 'base64'));
    const rec = {
      id,
      file,
      plantId: body.plantId || null,
      at: body.at || stamp(),
      note: body.note || '',
      analysis: null,
    };
    state.photos = [rec, ...(state.photos || [])];
    state.revisedAt = stamp();
    await saveState();
    return json(res, 200, { ok: true, photo: rec });
  }

  const delPhoto = /^\/api\/photos\/([\w-]+)$/.exec(p);
  if (delPhoto && req.method === 'DELETE') {
    const rec = (state.photos || []).find((x) => x.id === delPhoto[1]);
    if (!rec) return json(res, 404, { error: '没有这张照片' });
    try { await unlink(path.join(PHOTO_DIR, rec.file)); } catch { /* 已删 */ }
    state.photos = state.photos.filter((x) => x.id !== rec.id);
    state.revisedAt = stamp();
    await saveState();
    return json(res, 200, { ok: true });
  }

  if (p === '/api/analyze' && req.method === 'POST') {
    const { photoId, context } = await readJson(req);
    const rec = (state.photos || []).find((x) => x.id === photoId);
    if (!rec) return json(res, 404, { error: '没有这张照片' });
    let buf;
    try { buf = await readFile(path.join(PHOTO_DIR, rec.file)); }
    catch { return json(res, 404, { error: '照片文件丢了' }); }
    const ext = rec.file.split('.').pop();
    const dataUrl = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buf.toString('base64')}`;
    try {
      const { parsed, raw, model } = await callVision(dataUrl, context || {});
      state.revisedAt = stamp();
      rec.analysis = {
        at: stamp(), model, raw,
        score: Number.isFinite(parsed.score) ? parsed.score : null,
        summary: parsed.summary || '',
        findings: Array.isArray(parsed.findings) ? parsed.findings : [],
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        confidence: parsed.confidence || '',
      };
      await saveState();
      return json(res, 200, { ok: true, analysis: rec.analysis });
    } catch (e) {
      const refused = /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(e.message || '');
      return json(res, 200, {
        ok: false,
        code: e.code || (refused ? 'GATEWAY_DOWN' : 'ERR'),
        error: refused
          ? `连不上 ${config.vision?.baseUrl || '模型服务'}：本地网关可能没开（这个模型走 magpie 的 127.0.0.1:3425，需要 DSH/magpie 在跑）`
          : e.message,
      });
    }
  }

  return json(res, 404, { error: '没有这个接口' });
}

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  if (rel === '/health') { res.writeHead(200); return res.end('ok'); }

  // 照片直出
  if (rel.startsWith('/photos/')) {
    const name = path.basename(rel);
    const full = path.join(PHOTO_DIR, name);
    try {
      const body = await readFile(full);
      res.writeHead(200, {
        'content-type': MIME[path.extname(full)] || 'application/octet-stream',
        'content-length': body.length,
        'cache-control': 'public, max-age=31536000, immutable',
      });
      return res.end(body);
    } catch { res.writeHead(404); return res.end('not found'); }
  }

  const full = path.join(PUB, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(PUB)) { res.writeHead(403); return res.end('forbidden'); }
  try {
    const s = await stat(full);
    if (s.isDirectory()) throw new Error('dir');
    const body = await readFile(full);
    res.writeHead(200, {
      'content-type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-cache',
    });
    return res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('404');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  try {
    if (url.pathname === RESOLVE_PATH) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (e) {
    console.error('[error]', req.method, url.pathname, e);
    if (!res.headersSent) json(res, 500, { error: e.message });
    else res.end();
  }
});

function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

await loadAll();
server.listen(PORT, '0.0.0.0', () => {
  const ips = lanIps();
  console.log('');
  console.log('  花花和松松 已启动');
  console.log('  ─────────────────────────────');
  console.log(`  电脑：http://127.0.0.1:${PORT}`);
  for (const ip of ips) console.log(`  手机：http://${ip}:${PORT}   (需连同一个 WiFi)`);
  console.log('  ─────────────────────────────');
  console.log(`  数据目录：${DATA}`);
  if (TOKEN) console.log(`  写保护：已开启（口令 ${TOKEN.slice(0, 4)}••••，带 ?t= 打开才有写权限）`);
  console.log('');
});
