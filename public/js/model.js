// 养护模型：盆容积 → 一次水量 → 耗水 → 下次浇水日；日照；每日任务
import { sunExposure, estimateDli } from './solar.js';

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');

/* ------------------------------------------------------------ 日期工具 */

export function localDate(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

export function diffDays(a, b) {
  return Math.round((parseDate(a) - parseDate(b)) / DAY);
}

export const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export const monthDay = (s) => `${Number(s.slice(5, 7))}月${Number(s.slice(8, 10))}日`;
export const weekdayCN = (s) => WEEK_CN[parseDate(s).getDay()];

/* ------------------------------------------------------------ 盆与水量 */

/** 圆台盆容积（mL ≈ cm³） */
export function potVolumeMl(pot) {
  const D = Number(pot.diaCm) || 12;
  const d = Number(pot.bottomCm) || D * 0.77;
  const h = Number(pot.heightCm) || D * 0.9;
  return (Math.PI * h) / 12 * (D * D + D * d + d * d);
}

/** 盆容积能"从该浇了到饱和"提供的水（满盆浇透量） */
export function availableWaterMl(plant) {
  const root = potVolumeMl(plant.pot) * (plant.pot.rootBallRatio ?? 1);
  return Math.round((root * 0.28) / 10) * 10;
}

/**
 * 每次实际给多少比例。
 * 根系缺氧耐受差的、盆不透气的，只能给半盆水（少量多次），
 * 否则底半部长期饱和 → 烂根；代价是淋洗不足、需要定期彻底浇透一次。
 */
export function refillFraction(plant) {
  if (Number.isFinite(plant.pot?.refill)) return Math.max(0.3, Math.min(1, plant.pot.refill));
  return { yes: 1, no: 0.45, unknown: 0.6 }[plant.pot?.drainage] ?? 0.6;
}

/**
 * 这次真正该倒进去的水量。
 * 上限是盆能装多少（capacity × 给水比例），
 * 目标是"灌下去后 6–8 天正好干回该浇的状态"——由植物的耐湿天数决定，而不是由盆有多大决定。
 */
export function waterAmountMl(plant, dailyUse) {
  const cap = availableWaterMl(plant) * refillFraction(plant);
  const target = plant.traits?.targetWetDays || 7;
  if (!Number.isFinite(dailyUse) || dailyUse <= 0) {
    return Math.max(20, Math.round(cap / 10) * 10);
  }
  const byDemand = dailyUse * target;
  return Math.max(20, Math.round(Math.min(byDemand, cap) / 10) * 10);
}

/** 场地系数：走廊没有风、没有直射、湿度高，蒸发比露天慢得多 */
export const PLACE_FACTOR = { balcony: 1, corridor: 0.65, indoor: 0.5 };
export const placeFactor = (place) => PLACE_FACTOR[place] ?? 1;

/** 盆口面积（m²），用于估算降雨补充 */
export function potAreaM2(pot) {
  const r = (Number(pot.diaCm) || 12) / 100 / 2;
  return Math.PI * r * r;
}

/** 当日耗水（mL）：基准 × ET0/参考ET0 × 校准系数 × 场地系数 */
export function dailyUseMl(plant, et0, settings) {
  const ref = settings?.et0Ref || 1.3;
  const base = plant.traits.baseDailyMl || 30;
  const f = plant.calibration?.factor ?? 1;
  const e = Number.isFinite(et0) ? Math.max(0.15, et0) : ref;
  return base * (e / ref) * f * placeFactor(plant.care?.place);
}

/* ------------------------------------------------------------ 天气索引 */

export function indexWeather(weather) {
  const off = (weather.utc_offset_seconds ?? 28800) * 1000;
  const toMs = (s) => Date.parse(s + 'Z') - off;
  const daily = new Map();
  const d = weather.daily || {};
  (d.time || []).forEach((date, i) => {
    daily.set(date, {
      date,
      code: d.weather_code?.[i] ?? 0,
      tmax: d.temperature_2m_max?.[i],
      tmin: d.temperature_2m_min?.[i],
      precip: d.precipitation_sum?.[i] ?? 0,
      pop: d.precipitation_probability_max?.[i] ?? 0,
      et0: d.et0_fao_evapotranspiration?.[i] ?? 0,
      sunSec: d.sunshine_duration?.[i] ?? 0,
      rad: d.shortwave_radiation_sum?.[i] ?? 0,
      wind: d.wind_speed_10m_max?.[i] ?? 0,
      rh: d.relative_humidity_2m_mean?.[i] ?? 70,
      feels: d.apparent_temperature_max?.[i] ?? null,
    });
  });

  const hourly = new Map(); // date -> [{ms,hour,cloud,...}]
  const h = weather.hourly || {};
  (h.time || []).forEach((t, i) => {
    const date = t.slice(0, 10);
    const hour = Number(t.slice(11, 13));
    if (!hourly.has(date)) hourly.set(date, []);
    hourly.get(date).push({
      ms: toMs(t),
      hour,
      temp: h.temperature_2m?.[i],
      rh: h.relative_humidity_2m?.[i],
      cloud: h.cloud_cover?.[i] ?? 50,
      precip: h.precipitation?.[i] ?? 0,
      rad: h.shortwave_radiation?.[i] ?? 0,
      wind: h.wind_speed_10m?.[i] ?? 0,
    });
  });

  const dates = (d.time || []).slice();
  return { daily, hourly, dates, toMs, lat: weather.latitude, lon: weather.longitude };
}

/* ------------------------------------------------------------ 水分收支 */

function dayOverlapFraction(dateStr, startMs, endMs) {
  const s = parseDate(dateStr).getTime();
  const e = s + DAY;
  const a = Math.max(s, startMs);
  const b = Math.min(e, endMs);
  return Math.max(0, Math.min(1, (b - a) / DAY));
}

/**
 * 水分收支：从上次浇水推到今天，再往后推下次浇水日
 */
export function waterPlan(plant, wIndex, settings, now = Date.now()) {
  const capacity = availableWaterMl(plant);
  const refill = refillFraction(plant);
  const et0Today = wIndex.daily.get(localDate(new Date(now)))?.et0;
  const amount = waterAmountMl(plant, dailyUseMl(plant, et0Today, settings));
  const capDose = Math.round((capacity * refill) / 10) * 10;
  const last = plant.care?.lastWateredAt ? new Date(plant.care.lastWateredAt).getTime() : now;
  const lastDose = plant.care?.lastWaterMl ?? amount;
  const startMs = Number.isFinite(last) ? last : now;
  const place = plant.care?.place || 'balcony';
  const rainOK = place === 'balcony' && !!plant.care?.rainExposed;
  const potA = potAreaM2(plant.pot);

  const et0At = (date) => {
    const d = wIndex.daily.get(date);
    if (d) return d.et0;
    const vals = [...wIndex.daily.values()].map((x) => x.et0).filter(Number.isFinite);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : settings?.et0Ref || 1.3;
  };

  const dayCost = (date) => dailyUseMl(plant, et0At(date), settings);
  const dayRain = (date) => {
    if (!rainOK) return 0;
    const d = wIndex.daily.get(date);
    if (!d || !d.precip) return 0;
    return Math.round(potA * d.precip * 1000 * 0.6);
  };

  // 1) 已发生：从上次浇水到现在
  let consumed = 0;
  let rain = 0;
  const startDate = localDate(new Date(Math.min(startMs, now)));
  const today = localDate(new Date(now));
  for (let d = startDate; diffDays(today, d) >= 0; d = addDays(d, 1)) {
    const f = dayOverlapFraction(d, startMs, now);
    if (f <= 0) continue;
    consumed += dayCost(d) * f;
    rain += dayRain(d) * f;
  }
  const startCredit = Math.min(amount, Math.max(0, lastDose || amount));
  let raw = startCredit - consumed + rain;

  // 竹签观测比模型更可信：说干了就当干了，说还湿就往后压
  const dryAt = plant.care?.lastSoilDryAt ? new Date(plant.care.lastSoilDryAt).getTime() : 0;
  const wetAt = plant.care?.lastSoilWetAt ? new Date(plant.care.lastSoilWetAt).getTime() : 0;
  const observedDry = dryAt > startMs && dryAt <= now;
  const observedWet = wetAt > startMs && wetAt <= now && wetAt > dryAt;
  if (observedDry) raw = Math.min(raw, 0);
  if (observedWet) raw = Math.max(raw, amount * 0.35);
  const remaining = Math.max(0, raw);
  const leftPct = Math.round((remaining / amount) * 100);
  const overdueDays = raw < 0
    ? Math.round((-raw / Math.max(4, dayCost(today))) * 10) / 10
    : 0;

  // 2) 预测
  let nextDate = today;
  const curve = [{ date: today, pct: Math.max(0, Math.min(100, leftPct)) }];
  if (remaining > 0) {
    let c = remaining;
    for (let i = 0; i < 45; i++) {
      const d = addDays(today, i);
      const cost = dayCost(d) - dayRain(d) * 0.5;
      const frac = i === 0 ? 1 - (now - parseDate(today).getTime()) / DAY : 1;
      c -= cost * Math.max(0.04, frac);
      nextDate = addDays(today, i + 1);
      curve.push({ date: nextDate, pct: Math.round(Math.max(0, c) / amount * 100) });
      if (c <= 0) break;
    }
  }

  const daysLeft = diffDays(nextDate, today);
  return {
    capacity, refill, amount, capDose,
    targetWetDays: plant.traits?.targetWetDays || 7,
    consumed: Math.round(consumed),
    rain: Math.round(rain),
    remaining: Math.round(remaining),
    leftPct: Math.max(0, Math.min(100, leftPct)),
    nextDate, daysLeft, curve, overdueDays, observedDry, observedWet,
    dailyUseToday: Math.round(dayCost(today)),
    overdue: remaining <= 0,
  };
}

/* ------------------------------------------------------------ 日照 */

/** 补光灯：PPFD(µmol/m²/s) → 每天新增 DLI(mol/m²/d) */
export function lampPpfd(lamp) {
  if (!lamp || !lamp.enabled) return 0;
  if (Number(lamp.ppfd) > 0) return Number(lamp.ppfd);
  const w = Number(lamp.watts) || 0;
  const r = Math.max(0.08, (Number(lamp.cm) || 30) / 100);
  return Math.round((0.54 * w) / (r * r)); // 经验式：100W 在 30cm ≈ 600 µmol
}

export function lampDli(lamp) {
  const ppfd = lampPpfd(lamp);
  if (!ppfd) return 0;
  const hours = Math.max(0, Math.min(18, Number(lamp.hours) || 10));
  return Math.round((ppfd * 3600 * hours) / 1e6 * 10) / 10;
}

export function sunPlan(plant, wIndex, site, date, lat, lon) {
  const day = wIndex.daily.get(date) || {};
  const need = plant.traits.lightNeedDli || 8;
  const min = plant.traits.lightMinDli || need * 0.5;
  const place = plant.care?.place || 'balcony';

  // 走廊 / 室内：没有直射，只有散射；透过门/窗的比例由 site 配置
  if (place !== 'balcony') {
    const outdoor = 2.1 * (day.rad || 0);
    const f = place === 'corridor' ? (site.corridorLight ?? 0.18) : (site.indoorLight ?? 0.1);
    const base = Math.round(outdoor * f * 10) / 10;
    const add = lampDli(site.lamp);
    const dli = Math.round((base + add) * 10) / 10;
    return {
      directHours: 0, effectiveHours: 0, daylightHours: 10,
      baseDli: base, lampDli: add, dli, need, min, indoor: true, place,
      verdict: dli >= need ? '充足' : dli >= min ? '勉强' : '不足',
      note: place === 'corridor' ? '走廊散射光' : '室内散射光',
      date,
    };
  }

  const samples = (wIndex.hourly.get(date) || []).filter((s) => s.hour >= 5 && s.hour <= 20);
  const geo = sunExposure({
    samples, lat, lon,
    azimuth: site.azimuth,
    parapetCm: site.parapetCm,
    potTopCm: site.potTopCm,
    depthCm: site.depthCm,
    parapetType: site.parapetType || 'solid',
    sideWallM: site.sideWallM,
  });
  const base = estimateDli({
    radiationMJ: day.rad,
    directHours: geo.effectiveHours,
    daylightHours: Math.max(9, geo.daylightHours),
    covered: !!site.covered,
  });
  const add = lampDli(site.lamp);
  const dli = Math.round((base + add) * 10) / 10;
  const verdict = dli >= need ? '充足' : dli >= min ? '勉强' : '不足';
  return { ...geo, baseDli: base, lampDli: add, dli, need, min, verdict, indoor: false, date };
}

/** 某个位置在某天的直射窗口（整点），返回 null 表示全天无直射 */
export function sunWindow({ spot, wIndex, date, lat, lon }) {
  if (!spot) return null;
  const samples = (wIndex.hourly.get(date) || []).filter((s) => s.hour >= 5 && s.hour <= 20);
  if (!samples.length) return null;
  const la = lat ?? wIndex.lat, lo = lon ?? wIndex.lon;
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  const geo = sunExposure({
    samples, lat: la, lon: lo,
    azimuth: spot.azimuth,
    parapetCm: spot.parapetCm ?? 110,
    potTopCm: spot.potTopCm ?? 45,
    depthCm: spot.depthCm ?? 70,
    parapetType: spot.parapetType || 'solid',
    sideWallM: spot.sideWallM,
  });
  const lit = (geo.trace || []).filter((t) => t.lit).map((t) => t.hour);
  if (!lit.length) return null;
  return {
    first: lit[0],
    last: lit[lit.length - 1],
    hours: lit.length,
    start: `${pad(lit[0])}:00`,
    end: `${pad(lit[lit.length - 1] + 1)}:00`,
  };
}

const clampHM = (h, m) => {
  const total = Math.max(6 * 60, Math.min(19 * 60, h * 60 + m));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

/* ------------------------------------------------------------ 任务 */

const KIND_ORDER = { moveOut: 1, check: 2, water: 3, prep: 5, bloom: 6, photo: 7, fert: 8 };

export function buildTasks({ plants, wIndex, site, settings, now = Date.now(), horizonDays = 7, doneMap = {}, photos = [] }) {
  const today = localDate(new Date(now));
  const nd = new Date(now);
  const nowHM = `${pad(nd.getHours())}:${pad(nd.getMinutes())}`;
  const tasks = [];

  // ── 先算"白天外出台"（每天一条，两盆一起去），并记下日期 ──
  const trip = site && site.dayTrip && site.dayTrip.enabled ? site.dayTrip : null;
  const tripDays = new Map();
  if (trip && plants.length) {
    const strictNight = Math.max(...plants.map((x) => x.traits.minNightC ?? 5));
    for (let i = 0; i < horizonDays; i++) {
      const date = addDays(today, i);
      const day = wIndex.daily.get(date) || {};
      const win = sunWindow({ spot: trip, wIndex, date });
      if (!win || win.hours < 1) continue;
      const hrs = (wIndex.hourly.get(date) || [])
        .filter((h) => h.hour >= win.first && h.hour < win.last + 1);
      const wet = hrs.reduce((acc, h) => acc + (h.precip || 0), 0);
      const squall = hrs.some((h) => (h.precip || 0) >= 1.2);
      if (squall || wet >= 2.5) continue;
      if ((day.tmax ?? 20) < 8) continue;
      const coldNight = (day.tmin ?? 12) < strictNight;
      tripDays.set(date, {
        win, coldNight,
        goAt: clampHM(win.first, -(trip.leadMin ?? 20)),
        backAt: clampHM(win.last + 1, trip.lagMin ?? 15),
      });
    }
  }

  for (const plant of plants) {
    const plan = waterPlan(plant, wIndex, settings, now);
    const sch = plant.schedule || {};
    const t = (k, def) => sch[k] || def;
    const minNight = plant.traits.minNightC ?? 5;

    // 先判断每一天"该不该待在室内"
    const risk = [];
    for (let i = 0; i <= horizonDays; i++) {
      const d = wIndex.daily.get(addDays(today, i)) || {};
      const cold = (d.tmin ?? 12) < minNight;
      const rain = plant.traits.rainSensitive !== false
        && ((d.precip ?? 0) >= 1.5 || (d.pop ?? 0) >= 70);
      const gale = plant.traits.windSensitive === true && (d.wind ?? 0) >= 34;
      risk.push({ cold, rain, gale, any: cold || rain || gale, day: d });
    }

    const onBalcony = (plant.care?.place || 'balcony') === 'balcony';
    let inside = !onBalcony;

    for (let i = 0; i < horizonDays; i++) {
      const date = addDays(today, i);
      const day = wIndex.daily.get(date) || {};
      const tmax = day.tmax ?? 20;
      const r = risk[i];

      const push = (kind, time, title, detail, why, extra = {}) => {
        // 今天的任务过期了也留着，标红提示，别让漏做的事静默消失
        const id = `${plant.id}|${date}|${kind}`;
        tasks.push({
          id, plantId: plant.id, plantName: plant.name, emoji: plant.emoji,
          date, time, kind, title, detail, why,
          state: doneMap[id] || null,
          ...extra,
        });
      };

      // ── 走廊 → 房间：夜里低于耐受线就搬进屋 ──
      const place = plant.care?.place || 'balcony';
      if (place === 'corridor' && !tripDays.has(date)) {
        const prevCold = i > 0 ? risk[i - 1].cold : false;
        if (r.cold) {
          push('moveIn', '17:00', `把${plant.name}搬进房间过夜`,
            '先进屋，白天再挪回走廊；别放在暖气或空调出风口正下方。',
            `今夜最低 ${day.tmin ?? 12}℃，低于它的耐受线 ${minNight}℃。`);
        } else if (prevCold) {
          push('moveOut', '08:00', `把${plant.name}搬回走廊`,
            '最冷的那晚过去了，搬回走廊晒太阳（虽然只有散射）。',
            `今夜最低 ${day.tmin ?? 12}℃，回到耐受线以上。`);
        }
      }

      // 早上出屋 / 傍晚进屋（只记状态变化）——不在阳台就不产生搬动任务
      // 有"外出台"的日子跳过，由外出台统一安排进出
      if (tripDays.has(date)) { /* handled by trip */ }
      else if (!onBalcony) { /* 走廊/室内：无搬动任务 */ }
      else if (inside && !r.any) {
        push('moveOut', t('moveOut', '07:30'), `把${plant.name}搬回阳台`,
          '放回原位、朝向不变（别转盆）；垫高 40–60 cm 才吃得到栏板以上的光。',
          '危险天气过去了，回去晒太阳。');
        inside = false;
      }
      if (!tripDays.has(date) && onBalcony && !inside && r.any) {
        const why = r.cold
          ? `今夜最低 ${(day.tmin ?? 12)}℃，低于耐受线 ${minNight}℃`
          : r.rain
            ? `预计降水 ${day.precip ?? 0} mm（概率 ${day.pop ?? 0}%）`
            : `阵风 ${Math.round(day.wind ?? 0)} km/h`;
        push('moveIn', r.cold && !r.rain ? t('moveIn', '17:00') : '07:00',
          `把${plant.name}搬进走廊`,
          '避风避雨处，垫高离地，别贴灭火器箱（留 60 cm 开箱空间）。',
          why + '，提前搬比淋湿了再救有效。');
        inside = true;
      }

      // 浇水 / 备水 / 探土
      if (date === plan.nextDate) {
        push('water', t('water', '08:30'), `给${plant.name}浇水 ${plan.amount} ml`,
          drainageHint(plant, plan.amount),
          `盆土可利用水 ${plan.avail} ml，按 ET0 ${(day.et0 ?? 0).toFixed(2)} mm 估算已耗完；水量 = 盆容积×0.28。`,
          { amountMl: plan.amount });
      }
      if (date === addDays(plan.nextDate, -1)) {
        push('prep', t('prep', '21:00'), `接 ${plan.amount} ml 自来水放着回温`,
          '敞口放阳台/窗台，明早用；水温接近室温再浇，低于 10℃ 会伤根。',
          '提前一夜备水，避免早晨拿冰水直接浇。', { amountMl: plan.amount });
        push('check', t('check', '07:00'), `摸一下${plant.name}的土`,
          '插到底再拔出来看下半截：带湿土就点「还湿」，干爽就点「干了」——点一下就会改模型。',
          '模型只是按天气推算，竹签才是事实。');
      }

      // 每月彻底浇透一次：只在“平时没浇透”的情况下才需要
      if (plant.pot?.drainage === 'yes' && plan.amount < plan.capacity * 0.95) {
        const born = plant.createdAt ? localDate(new Date(plant.createdAt)) : today;
        const dayIdx = diffDays(date, born);
        if (dayIdx > 0 && dayIdx % 30 === 0) {
          push('leach', '10:00', `给${plant.name}彻底浇透一次`,
            `分三次共给 ${capacityOf(plant)} ml，每次都等出水再给下一次，让水从底孔流走——把三个月攒下的盐冲掉，也让下层根喝到水。`,
            '平时按“几天的量”给，下层根长期喝不到；每月冲一次就不至于空根。');
        }
      }

      // 花期巡霉
      if (plant.traits.bloom && plant.traits.stage === 'bloom') {
        const every = settings.bloomCheckEveryDays || 3;
        if (diffDays(date, today) % every === 0) {
          push('bloom', '18:30', `扒开${plant.name}的花苞查灰霉`,
            '看花苞基部有没有褐变、发软、灰毛；有就立刻摘掉并开窗对流。',
            '湿度 >80% 又不通风是灰霉的温床，发现晚了整串花报废。');
        }
      }

      // 拍照
      const lastPhoto = photos.filter((x) => x.plantId === plant.id)
        .map((x) => localDate(x.at)).sort().pop();
      const everyPhoto = settings.photoEveryDays || 7;
      if (!lastPhoto ? i === 0 : (diffDays(date, lastPhoto) === everyPhoto
        || (i === 0 && diffDays(date, lastPhoto) > everyPhoto))) {
        push('photo', '18:00', `给${plant.name}拍一张`,
          '同一角度、同一高度、自然光下拍，方便和上一张对比。',
          `每 ${everyPhoto} 天留一张档案照。`);
      }

      // 施肥（花期停）
      if (!(plant.traits.bloom && plant.traits.stage === 'bloom')) {
        const everyF = settings.fertEveryDays || 14;
        if (diffDays(date, today) % everyF === 0 && tmax > 12 && tmax < 28) {
          push('fert', '10:00', `给${plant.name}施一次稀薄肥`,
            '1000 倍液，先浇清水再施肥，别在干土上施肥。',
            '生长期 2 周一次；花期不施肥。');
        }
      }
    }
  }

  // ── 还没实测透光率时，明天提醒测一次 ──
  if (site && site.lightMeasured !== true) {
    const date = today;
    const id = `measure|${date}|light`;
    const t2 = '13:30';
    tasks.push({
      id, plantId: null, plantName: site.label || '走廊', emoji: '🔦',
      date, time: t2, kind: 'measure',
      title: '测光照：户外 / 走廊 / 西阳台',
      detail: '手机平放、屏幕朝上，三个点各测一次：①走廊外无遮挡处 ②花盆旁边盆土面高度 ③西阳台盆位。同一分钟内测完，来回跑 3 趟取中位数，记下 lux。',
      why: '走廊透光率现在是猜的 18%，实测完浇水量和日照判断都会跟着重算。',
      state: doneMap[id] || null,
    });
  }

  // ── 生成外出台任务 ──
  if (tripDays.size && plants.length) {
    const names = plants.map((x) => x.name).join('和');
    const homeName = site.label || '阳台';
    const spotName = trip.label || '向阳的位置';
    for (const [date, td] of tripDays) {
      const dest = td.coldNight ? '房间' : homeName;
      const pushTrip = (kind, time, title, detail, why) => {
        const id = `trip|${date}|${kind}`;
        tasks.push({
          id, plantId: null, plantName: spotName, emoji: '☀️',
          date, time, kind, title, detail, why,
          state: doneMap[id] || null,
        });
      };
      const homeWhy = site.homeKind === 'corridor'
        ? `${homeName}里只有散射，${spotName}下午能晒到直射。`
        : `${homeName}朝${compassWord(site.azimuth)}，这个季节盆位零直射；${spotName}下午能晒到。`;
      pushTrip('toSun', td.goAt, `把${names}搬到${spotName}晒太阳`,
        `${td.win.start}–${td.win.end} 有直射 ${td.win.hours} 小时，${td.backAt} 搬回${dest}。`,
        homeWhy);
      pushTrip('toHome', td.backAt, `把${names}搬回${dest}`,
        td.coldNight ? '今夜最低会低于耐受线，直接放房间，别留在阳台或走廊。' : '搬回固定位置，朝向别乱换。',
        td.coldNight ? '夜里冷，阳台过夜有风险。' : `日落后${spotName}只剩散射，留着没意义。`);
    }
  }

  return tasks.sort((a, b) => (a.date === b.date
    ? (a.time || '').localeCompare(b.time || '') || (KIND_ORDER[a.kind] || 9) - (KIND_ORDER[b.kind] || 9)
    : a.date.localeCompare(b.date)));
}

/** 这个朝向/进深下，盆要垫到多高才有 targetHours 小时直射 */
export function heightForSun({ plant, wIndex, site, date, lat, lon, targetHours = 2 }) {
  const samples = (wIndex.hourly.get(date) || []).filter((s) => s.hour >= 5 && s.hour <= 20);
  let best = null;
  for (let h = 0; h <= 120; h += 5) {
    if ((site.parapetType || 'solid') === 'railing') {
      // 栏杆不挡光，垫高没意义
      const g0 = sunExposure({ samples, lat, lon, azimuth: site.azimuth, parapetCm: site.parapetCm, potTopCm: site.potTopCm, depthCm: site.depthCm, parapetType: 'railing' });
      return g0.directHours >= targetHours ? { heightCm: site.potTopCm, hours: g0.directHours, already: true } : null;
    }
    const g = sunExposure({ samples, lat, lon, azimuth: site.azimuth, parapetCm: site.parapetCm, potTopCm: h, depthCm: site.depthCm, parapetType: 'solid' });
    if (g.directHours >= targetHours) { best = { heightCm: h, hours: g.directHours }; break; }
  }
  return best;
}

const capacityOf = (plant) => Math.round(availableWaterMl(plant) / 10) * 10;

export function compassWord(deg) {
  const n = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  return n[Math.round((((Number(deg) || 0) % 360) / 45)) % 8];
}

function drainageHint(plant, amount) {
  const dr = plant.pot?.drainage;
  if (dr === 'no') {
    return `无孔盆：就给这 ${amount} ml，分 3 次沿盆边慢浇（间隔 5 分钟）；想浇透必须套盆取出来浇。`;
  }
  if (dr === 'unknown') {
    return `分 3 次沿盆边慢浇共 ${amount} ml；一旦确认盆底有孔，就可以浇到出水再停。`;
  }
  const tray = plant.pot?.saucer ? '15 分钟内倒掉托盘水' : '这只盆没有托盘，浇之前垫个盘子或搬到水槽，别让水淌一地';
  const cap = Math.round(availableWaterMl(plant) / 10) * 10;
  return amount < cap
    ? `分两遍慢浇共 ${amount} ml（这是"几天的量"，不会出水，正常）。如果倒到一半盆底就开始出水，说明土还湿，停手。${tray}。`
    : `分两遍慢浇共 ${amount} ml，盆底出水即停，${tray}。`;
}

/* ------------------------------------------------------------ 状态文案 */

export function plantVerdict(plant, plan, sun, day) {
  const out = [];
  if (plan.overdue) out.push({ tone: 'warn', text: `盆土水已耗尽约 ${plan.overdueDays || 1} 天，尽快浇 ${plan.amount} ml` });
  else if (plan.daysLeft === 0) out.push({ tone: 'due', text: `今天该浇 ${plan.amount} ml` });
  else if (plan.daysLeft === 1) out.push({ tone: 'soon', text: `明早浇 ${plan.amount} ml，今晚把水接好` });
  else out.push({ tone: 'ok', text: `还有 ${plan.daysLeft} 天（${monthDay(plan.nextDate)}）才需要浇` });

  if (sun) {
    if (sun.indoor) {
      if (sun.verdict === '不足') out.push({ tone: 'warn', text: `${sun.note} DLI≈${sun.dli}，只到${plant.name}需要的 ${sun.need} 的 ${Math.round((sun.dli / sun.need) * 100)}%，长期这样${plant.traits.bloom ? '会掉苞' : '会徒长、叶色变淡'}` });
      else if (sun.verdict === '勉强') out.push({ tone: 'soon', text: `${sun.note} DLI≈${sun.dli}，勉强够，别再往暗处挪` });
      else out.push({ tone: 'ok', text: `${sun.note} DLI≈${sun.dli}，够用` });
    } else if (sun.verdict === '不足') out.push({ tone: 'warn', text: `今天盆位日照只有 ${sun.directHours} h、DLI≈${sun.dli}，低于${plant.name}需要的 ${sun.need}` });
    else if (sun.verdict === '勉强') out.push({ tone: 'soon', text: `日照 ${sun.directHours} h 偏少，能晒到的时段别错过` });
    else out.push({ tone: 'ok', text: `日照 ${sun.directHours} h / DLI≈${sun.dli}，够用` });
  }
  if (day) {
    const tmin = day.tmin ?? 12;
    const gap = tmin - (plant.traits.minNightC ?? 5);
    if (gap < 0) out.push({ tone: 'warn', text: `今夜 ${tmin}℃，低于耐受线 ${Math.abs(Math.round(gap))}℃，要搬` });
    else if (gap < 3) out.push({ tone: 'soon', text: `今夜 ${tmin}℃，接近耐受线，留意` });
  }
  return out;
}

export function rainOutlook(wIndex, date) {
  const d = wIndex.daily.get(date);
  if (!d) return null;
  if ((d.precip ?? 0) >= 0.5) return { tone: 'rain', text: `今天有雨 ${d.precip} mm（${d.pop}%）` };
  if ((d.pop ?? 0) >= 50) return { tone: 'maybe', text: `可能有雨（概率 ${d.pop}%）` };
  return { tone: 'dry', text: '今天不下雨' };
}

export function weatherWord(code) {
  const c = Number(code);
  if (c === 0) return '晴';
  if (c <= 2) return '少云';
  if (c === 3) return '阴';
  if (c >= 45 && c <= 48) return '雾';
  if (c >= 51 && c <= 57) return '毛毛雨';
  if (c >= 61 && c <= 67) return '雨';
  if (c >= 71 && c <= 77) return '雪';
  if (c >= 80 && c <= 82) return '阵雨';
  if (c >= 95) return '雷雨';
  return '多云';
}
