// 养护模型：盆容积 → 能存多少水 → 耗水 → 下次浇水日与钟点；日照；每日任务
import { sunExposure, estimateDli, sunPosition, angDiff } from './solar.js';

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

/** 休息日：周六周日不在实验室，凡是"需要人到场"的任务都不该出现在这两天 */
export const isRestDay = (date) => {
  const w = parseDate(date).getDay();
  return w === 0 || w === 6;
};

/** 截止日落在休息日 → 提前到最近的到岗日（周五） */
export function workdayOnOrBefore(date) {
  let d = date;
  for (let i = 0; i < 3 && isRestDay(d); i++) d = addDays(d, -1);
  return d;
}

/** 截止日已经过去 → 顺延到下一个到岗日（周一），别让该做的事静默消失 */
export function workdayOnOrAfter(date) {
  let d = date;
  for (let i = 0; i < 3 && isRestDay(d); i++) d = addDays(d, 1);
  return d;
}

/* ------------------------------------------------------------ 盆与水量 */

/** 盆内容积（mL ≈ cm³）：有实测值就直接用，否则按圆台估算 */
export function potVolumeMl(pot) {
  if (Number(pot.volumeMl) > 0) return Number(pot.volumeMl);
  const D = Number(pot.diaCm) || 12;
  const d = Number(pot.bottomCm) || D * 0.77;
  const h = Number(pot.heightCm) || D * 0.9;
  return (Math.PI * h) / 12 * (D * D + D * d + d * d);
}

/**
 * 浇透之后，这一盆能给根用的水（mL）。
 *
 * 水量 = 盆内容积 × (1 − 土面下沉) × 基质有效水率 × 允许用掉的比例 × 根球占比
 * 这是「它能留住多少水」，用来算隔几天再浇；不是让人照着倒的数字。
 *
 * 依据 Rutgers Cooperative Extension FS812《Fundamentals of Container Media Management》
 * 表 2（浇透沥干后实测，体积%）：泥炭-珍珠岩 含水量73/有效水48；泥炭-蛭石 81/60；
 * 泥炭-砂木屑 62/44；理想基质要求有效水 ≥30。
 * https://extension.rutgers.edu/fs812
 */
export const SUBSTRATE_AVW = { coir: 0.48, humus: 0.44, grit: 0.30 };
export const USABLE_FRACTION = 0.65; // 只用掉 65%，留 35% 缓冲，不逼到永久萎蔫点

export function availableWaterMl(plant) {
  const V = potVolumeMl(plant.pot);
  const soilFill = Number(plant.pot.soilFill) || 0.88;   // 土面比盆口低约 12%
  const avw = Number(plant.pot.avw) || SUBSTRATE_AVW[plant.pot.media] || 0.48;
  const root = plant.pot.rootBallRatio ?? 1;
  const ml = V * soilFill * avw * USABLE_FRACTION * root;
  return Math.round(ml / 5) * 5;
}

/**
 * 浇水口径：有孔的盆一律「浇到底孔出水」。
 *
 * 浇到底孔出水 = 把基质重新灌到持水量（container capacity），之后土里存的水量只由
 * 盆＋基质决定，跟你这次倒进去多少毫升无关——倒多了只是从底孔流走。
 * 所以 2026-11 之后不再让人「倒 580 ml」：给多少水是浇的过程，存多少水才是模型要算的东西。
 * 无孔盆（或套盆没取出）物理上浇不到出水，只能按比例给，见 refillFraction。
 */
export function watersToDrain(plant) {
  return plant.pot?.drainage !== 'no';
}

/**
 * 无孔盆每次最多给多少比例。
 * 根系缺氧耐受差的、盆不透气的，只能给半盆水（少量多次），否则底半部长期饱和 → 烂根。
 * 有孔盆一律 1（浇透），改这个字段不影响浇透口径。
 */
export function refillFraction(plant) {
  if (Number.isFinite(plant.pot?.refill)) return Math.max(0.3, Math.min(1, plant.pot.refill));
  return { yes: 1, no: 0.45, unknown: 1 }[plant.pot?.drainage] ?? 1;
}

/**
 * 干土浇透、到盆底刚出水，大概要倒多少（只是备水参考，不再是任务里的指令）。
 * 盆底有孔，"倒进去的量"≠"留下的量"：干透的泥炭/椰糠会形成通道从盆边短路，
 * 所以要多给 25–30%，浇到底孔出水为止，托盘里的水倒掉。
 */
export function pourAmountMl(plant, amount = availableWaterMl(plant)) {
  const eff = Number(plant.traits.pourEfficiency) || 0.78;
  return Math.round(amount / eff / 10) * 10;
}

/** 场地系数：走廊没有风、没有直射、湿度高，蒸发比露天慢得多 */
export const PLACE_FACTOR = { balcony: 1, corridor: 0.65, indoor: 0.5 };
export const placeFactor = (place) => PLACE_FACTOR[place] ?? 1;

/** 盆口面积（m²），用于估算降雨补充 */
export function potAreaM2(pot) {
  const r = (Number(pot.diaCm) || 12) / 100 / 2;
  return Math.PI * r * r;
}

/** 饱和水汽压（kPa），Tetens 公式 */
export function satVpd(tempC) {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

/** 实际水汽压差 VPD（kPa） */
export function vpdKpa(tempC, rh) {
  return Math.max(0, satVpd(tempC) * (1 - Math.max(0, Math.min(100, rh)) / 100));
}

/** 某天的日间平均 VPD（只看 8–18 点） */
export function dayVpd(wIndex, date) {
  const hrs = (wIndex.hourly.get(date) || []).filter((h) => h.hour >= 8 && h.hour <= 18);
  if (!hrs.length) {
    const d = wIndex.daily.get(date) || {};
    const tMean = ((d.tmax ?? 20) + (d.tmin ?? 12)) / 2;
    return vpdKpa(tMean, d.rh ?? 70);
  }
  const vals = hrs.map((h) => vpdKpa(h.temp ?? 20, h.rh ?? 70));
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** 盆口面积（cm²），用于算土面蒸发 */
export function potAreaCm2(pot) {
  const r = (Number(pot.diaCm) || 12) / 2;
  return Math.PI * r * r;
}

/**
 * 没显式写 kTrans 时的默认蒸腾系数。
 *
 * 反解自这株花自己的目标：在它需要的光照下，一次的水正好 targetWetDays 天喝完。
 * 否则小盆、慢生植物会沿用大盆的 6 ml/mol，一搬到西阳台就把 100 ml 的盆两天抽干。
 */
export function defaultKTrans(plant) {
  const need = Number(plant.traits?.lightNeedDli) || 8;
  const target = Math.max(2, Number(plant.traits?.targetWetDays) || 7);
  const amount = availableWaterMl(plant) * refillFraction(plant);
  const kBase = Number(plant.traits?.kBase) || 2.5;
  const kTrans = (amount / target - kBase) / Math.max(1, need);
  return Math.round(Math.max(0.4, kTrans) * 100) / 100;
}

/** 当日耗水（mL）：基准 × ET0/参考ET0 × 校准系数 × 场地系数 */
/**
 * 当日耗水（mL）= 蒸腾 + 土面蒸发，两者都随当天天气变
 *
 *   蒸腾 = kTrans × DLI        （光合驱动，光越强气孔开得越久）
 *   蒸发 = kEvap  × VPD × 盆口面积 （空气越干、温度越高，土面失水越快）
 *
 * kTrans/kEvap 是经验系数，会随着"称重记录"自动校准（plant.calibration.factor）。
 * DLI 用的是"当天实际作息"：走廊散射 + 白天搬到西阳台那几个小时（见 sunPlan）。
 */
export function dailyUseMl(plant, wIndex, date, settings, site) {
  const f = plant.calibration?.factor ?? 1;
  const place = plant.care?.place || 'balcony';

  // 光量：放在阳台/走廊，DLI 完全不同；有外出台时按小时拼合
  let dli;
  try {
    dli = site ? sunPlan(plant, wIndex, site, date).dli : Number(plant.__dli) || 6;
  } catch { dli = Number(plant.__dli) || 6; }

  const vpd = dayVpd(wIndex, date);
  const kTrans = Number(plant.traits.kTrans) || defaultKTrans(plant); // ml / (mol·m⁻²·d⁻¹)
  const kEvap = Number(plant.traits.kEvap) || 0.08;     // ml / (cm²·kPa·d)
  const area = potAreaCm2(plant.pot) * (place === 'balcony' ? 1 : 0.55); // 室内风速低，蒸发慢
  // 基础失水：角质层蒸腾 + 气孔夜间微开，跟光无关，但没有它黑暗里就变成零
  const kBase = Number(plant.traits.kBase) || 2.5;
  const trans = kTrans * dli + kBase;
  const evap = kEvap * vpd * area;
  return Math.max(0.5, (trans + evap) * f);
}

/** 把当日耗水拆开，便于在界面上解释 */
export function useBreakdown(plant, wIndex, date, site) {
  const day = wIndex.daily.get(date) || {};
  let dli = 0;
  try { dli = site ? sunPlan(plant, wIndex, site, date).dli : 0; } catch { dli = 0; }
  const vpd = dayVpd(wIndex, date);
  const kTrans = Number(plant.traits.kTrans) || defaultKTrans(plant);
  const kEvap = Number(plant.traits.kEvap) || 0.08;
  const place = plant.care?.place || 'balcony';
  const area = potAreaCm2(plant.pot) * (place === 'balcony' ? 1 : 0.55);
  return {
    dli, vpd: Math.round(vpd * 100) / 100,
    trans: Math.round(kTrans * dli * 10) / 10,
    evap: Math.round(kEvap * vpd * area * 10) / 10,
    temp: day.tmax, rh: day.rh,
  };
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
      // 多模式中位数优先：单模型对本地夜间低温偏冷明显（见 server.js withTempMedian）
      tmax: d.tmaxMed?.[i] ?? d.temperature_2m_max?.[i],
      tmin: d.tminMed?.[i] ?? d.temperature_2m_min?.[i],
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
      windDir: h.wind_direction_10m?.[i], // 风的来向（度，自正北顺时针）
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
 * 水分收支：从上次浇水推到今天，再往后推下次浇水日与浇水钟点。
 *
 * 记账口径（2026-11 起）：
 *   浇水 = 浇到底孔出水 = 土回到持水量，所以一次「浇透」记进土里的水就是这个盆的
 *   capacity（能给根用的那部分）。之后每天按天气扣，扣到 0 的那天就是要浇的日子。
 *   也就是说：ml 只是「这盆能留住多少水」，用来算间隔；人只管浇到底孔出水。
 */
export function waterPlan(plant, wIndex, settings, now = Date.now(), site = null) {
  const capacity = availableWaterMl(plant);
  const toDrain = watersToDrain(plant);
  const refill = refillFraction(plant);
  const today = localDate(new Date(now));
  // 浇透 → 记满盆；无孔盆装不下这么多，只能按比例（套盆法除外，模型这里保守一点）
  const amount = toDrain ? capacity : Math.round((capacity * refill) / 10) * 10;
  const pour = pourAmountMl(plant, amount);
  const last = plant.care?.lastWateredAt ? new Date(plant.care.lastWateredAt).getTime() : now;
  const lastDose = plant.care?.lastWaterMl ?? amount;
  const startMs = Number.isFinite(last) ? last : now;
  const place = plant.care?.place || 'balcony';
  const rainOK = place === 'balcony' && !!plant.care?.rainExposed;
  const potA = potAreaM2(plant.pot);

  const horizonCosts = [...wIndex.daily.keys()]
    .map((d0) => dailyUseMl(plant, wIndex, d0, settings, site))
    .filter((x) => x > 0);
  const avgCost = horizonCosts.length
    ? horizonCosts.reduce((a, b) => a + b, 0) / horizonCosts.length
    : (plant.traits.baseDailyMl || 20);
  // 预报只有 14 天，之后用预报期均值外推，避免被当成 0
  const dayCost = (date) => (wIndex.daily.has(date)
    ? dailyUseMl(plant, wIndex, date, settings, site)
    : avgCost);
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
  for (let d = startDate; diffDays(today, d) >= 0; d = addDays(d, 1)) {
    const f = dayOverlapFraction(d, startMs, now);
    if (f <= 0) continue;
    consumed += dayCost(d) * f;
    rain += dayRain(d) * f;
  }
  // 浇透（底孔出过水）→ 土是满的；没浇透 → 只有倒进去的一部分留得下
  const eff = Number(plant.traits.pourEfficiency) || 0.78;
  const fullDose = plant.care?.lastWaterToDrain !== false && lastDose >= amount * 0.85;
  const retained = fullDose ? amount : Math.max(0, lastDose) * eff;
  const startCredit = Math.min(amount, Math.max(0, retained || amount));
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

  // 2) 预测：哪天把盆里这点水用光，就那天浇
  let nextDate = today;
  const curve = [{ date: today, pct: Math.max(0, Math.min(100, leftPct)) }];
  if (remaining > 0) {
    let c = remaining;
    for (let i = 0; i < 45; i++) {
      const d = addDays(today, i);
      const cost = dayCost(d) - dayRain(d) * 0.5;
      const frac = i === 0 ? 1 - (now - parseDate(today).getTime()) / DAY : 1;
      c -= cost * Math.max(0.04, frac);
      nextDate = addDays(today, i);
      curve.push({ date: addDays(today, i + 1), pct: Math.round(Math.max(0, c) / amount * 100) });
      if (c <= 0) break;
    }
  }

  // 安全帽：再省水也不建议拖这么久（基质板结、盐分累积、根毛退化）
  const maxGap = Number(plant.traits.maxGapDays) || 21;
  if (diffDays(nextDate, today) > maxGap) nextDate = addDays(today, maxGap);
  const daysLeft = diffDays(nextDate, today);

  // 3) 那天几点浇：按土温/气温/辐射/日落/雨，见 wateringTime()
  // 到期日落在周末（人不在实验室）就往前提/往后顺到到岗日，钟点跟着那天重算
  const dutyDate = (() => {
    const back = workdayOnOrBefore(nextDate);
    return back >= today ? back : workdayOnOrAfter(today);
  })();
  const wtRaw = wateringTime({ plant, wIndex, site, date: nextDate, now });
  const wt = dutyDate === nextDate
    ? wtRaw
    : wateringTime({ plant, wIndex, site, date: dutyDate, now });
  const intervalDays = Math.max(1, Math.round(amount / Math.max(0.5, avgCost)));

  return {
    capacity, refill, amount, pour, toDrain,
    targetWetDays: plant.traits?.targetWetDays || 7,
    intervalDays, avgDailyUse: Math.round(avgCost * 10) / 10,
    consumed: Math.round(consumed),
    rain: Math.round(rain),
    remaining: Math.round(remaining),
    leftPct: Math.max(0, Math.min(100, leftPct)),
    nextDate, daysLeft, curve, overdueDays, observedDry, observedWet,
    nextTime: wtRaw.time, nextWindow: wtRaw.window, nextTimeWhy: wtRaw.reasons,
    nextTimeBasis: wtRaw.basis, nextAtSpot: wtRaw.atSpot, nextSoilC: wtRaw.soilC,
    dutyDate, dutyDaysLeft: diffDays(dutyDate, today), dutyShifted: dutyDate !== nextDate,
    dutyTime: wt.time, dutyWindow: wt.window, dutyWhy: wt.reasons,
    dutyAtSpot: wt.atSpot, dutySoilC: wt.soilC,
    dailyUseToday: Math.round(dayCost(today) * 10) / 10,
    breakdown: useBreakdown(plant, wIndex, today, site),
    overdue: remaining <= 0,
  };
}

/* ------------------------------------------------------------ 浇水钟点 */

/*
 * 为什么浇水要挑钟点，依据（都是园艺推广/生理学的通行结论，不是拍脑袋）：
 *
 * ① 早晨最好：Iowa State University Extension 明确给的是 5:00–9:00——
 *    浇完叶面/土表当天能自己干，真菌病压得住；正午蒸发最快最浪费；傍晚浇完湿着过夜，
 *    病害风险最高（只走滴灌、不淋叶时才不受这条限制）。
 *    https://yardandgarden.extension.iastate.edu/faq/when-best-time-water-garden
 * ② 凉爽时段浇，盆面蒸发少：RHS《How to water containers》原话是
 *    "Plan to water early morning or early evening"——凉的时候水更多留给根。
 *    https://www.rhs.org.uk/container-gardening/how-to-water-containers
 * ③ 根区温度：盆栽根在 10–12℃ 以下吸水速率明显下降（低温下根的水力导度低、黏滞度高），
 *    所以冬天要挑一天里土温最高的那段（通常 12:00–14:00），别在清晨拿 8℃ 的土和 12℃ 的水对撞。
 * ④ 温差：水前一晚接好回温，就是让水温和土温接近；温差控制在 ~8℃ 内，根不会骤冷。
 * ⑤ 外出台当天：刚搬出去的盆土还没回暖，落地 1 小时内不浇；在家浇完再搬更省事。
 * ⑥ 露天又要下雨：浇完 3 小时内下雨等于白浇，还可能把表层养分冲走。
 *
 * 这些条件都写在 hourly 天气里，所以钟点是可以算的；算不出来（预报缺失）才回落到 06:30。
 */

const WATER_EARLIEST = 5.5;        // 再早人没起，土也最冷
const WATER_LATEST = 19;           // 傍晚之后不浇（湿着过夜）
const DRY_BEFORE_NIGHT_H = 2.5;    // 温和天：浇完到日落至少留这么久，让土面和托盘干掉
const ROOT_MIN_C = 12;             // 根区低于这个温度，吸水速率明显下降

/*
 * 热天 / 冷天两套时段：
 *
 *   热天（白天 ≥28℃）→ 傍晚浇。理由：白天太阳最狠时浇，一半的水从盆面和土表蒸发掉；
 *     盆土在太阳下能到 40℃，冷水一下去根区骤降，根吸水反而停。傍晚土还温着、辐射已经降下来，
 *     水整夜慢慢渗，第二天一早盆是满的。灰霉要的是凉湿（RHS：潮湿不通风才猖獗），
 *     热天的夜里温度高、水汽不容易长时间挂在叶面，风险低。
 *   冷天（白天 <14℃）→ 上午浇。理由正相反：浇完还有大半天排水回温，不让它带着湿土过夜；
 *     夜里又冷又湿是烂根的标准组合。时段取上午里最暖的一段（10–12 点），
 *     这样水温、土温都上来了，根吸得动。
 *   温和天（14–28℃）→ 早上浇。ISU Extension 的 5–9 点口径，浇完当天能干。
 *
 * 出处：ISU Extension（早浇最好；傍晚只适合不淋叶面的浇法）、RHS（清晨或傍晚，凉的时候蒸发少；
 * 灰霉在潮湿不通风时最凶）。我们的浇法本来就不淋叶面，所以傍晚是安全的。
 */
export const HOT_REGIME_C = 28;    // 白天最高到这个温度以上，按热天处理
export const COLD_REGIME_C = 14;   // 白天最高不到这个温度，按冷天处理

const hmOf = (h) => {
  let m = Math.round(h * 60);
  m = Math.max(0, Math.min(23 * 60 + 59, m));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};
const hmToH = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? ''));
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
};

const hourRec = (wIndex, date, hour) => {
  const list = wIndex?.hourly?.get(date);
  return list ? (list.find((x) => x.hour === hour) || null) : null;
};

/** 预报缺小时数据时，用当天最高/最低温糊一条日变化曲线 */
function dayTempGuess(wIndex, date, hour) {
  const d = wIndex?.daily?.get(date) || {};
  const tmin = Number.isFinite(d.tmin) ? d.tmin : 12;
  const tmax = Number.isFinite(d.tmax) ? d.tmax : tmin + 8;
  const h = ((hour % 24) + 24) % 24;
  if (h <= 6 || h >= 22) return tmin;
  if (h >= 14) return tmax - (tmax - tmin) * (h - 14) / 8;
  return tmin + (tmax - tmin) * (h - 6) / 8;
}

/** 某个钟点（可带小数）的气温/湿度/辐射/降水，按前后整点线性插值 */
function sampleAt(wIndex, date, hour) {
  const h0 = Math.floor(hour);
  const f = hour - h0;
  const a = hourRec(wIndex, date, h0);
  const b = hourRec(wIndex, date, (h0 + 1) % 24);
  const d = wIndex?.daily?.get(date) || {};
  const pick = (key, fb) => {
    const va = Number.isFinite(a?.[key]) ? a[key] : fb;
    const vb = Number.isFinite(b?.[key]) ? b[key] : fb;
    return va + (vb - va) * f;
  };
  return {
    temp: pick('temp', dayTempGuess(wIndex, date, hour)),
    rh: pick('rh', d.rh ?? 70),
    rad: Math.max(0, pick('rad', 0)),
    precip: pick('precip', 0),
    wind: pick('wind', 0),
  };
}

/**
 * 根区温度近似：过去 24 小时气温的指数滑动平均（时间常数 8 h）。
 * 土有热惯性，早晨的土温≈昨夜气温，正午的土温比气温低——这个近似刚好够判「冷不冷」。
 */
function soilTempC(wIndex, date, hour, { place = 'balcony', site = null } = {}) {
  let sum = 0;
  let wsum = 0;
  for (let k = 0; k <= 24; k++) {
    const hh = hour - k;
    const d2 = hh < 0 ? addDays(date, -1) : date;
    const h2 = ((hh % 24) + 24) % 24;
    const rec = hourRec(wIndex, d2, h2);
    const t = Number.isFinite(rec?.temp) ? rec.temp : dayTempGuess(wIndex, date, h2);
    const w = Math.exp(-k / 8);
    sum += t * w;
    wsum += w;
  }
  const base = sum / wsum;
  // 走廊是有顶有墙的半室内，夜里比露天暖；土温按同一口径补一点，别把走廊判成冰窖
  const warm = place === 'corridor' ? (Number(site?.corridorWarmC) || 5) * 0.5 : 0;
  return base + warm;
}

/** 日落/日出（真太阳高度角穿过 -0.83°，含大气折射和太阳视半径） */
function sunCrossHour(wIndex, date, { rise }) {
  const lat = wIndex?.lat;
  const lon = wIndex?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return rise ? 6.5 : 17.5;
  const base = parseDate(date).getTime();
  const from = rise ? 3 : 12;
  const to = rise ? 12 : 22;
  for (let h = from; h <= to; h += 0.05) {
    const alt = sunPosition(base + h * 3600000, lat, lon).alt;
    if (rise ? alt > -0.83 : alt < -0.83) return h;
  }
  return rise ? 6.5 : 17.5;
}

/**
 * 算「那天几点浇水」。
 *
 * 返回 { time, window, reasons, basis, atSpot, soilC, ... }：
 *   time    建议钟点（HH:MM）
 *   window  同样好的时段（±，HH:MM 起止），弹窗里给个范围，别太死
 *   reasons 为什么是这个点（带真实读数，直接显示给人看）
 *   basis   依据出处
 */
export function wateringTime({ plant, wIndex, site = null, date, now = Date.now() }) {
  const day = wIndex?.daily?.get(date) || {};
  const place = plant.care?.place || 'balcony';
  const trip = site?.dayTrip?.enabled ? tripDayInfo({ site, wIndex, date, plants: [plant] }) : null;
  const goAt = trip ? hmToH(trip.goAt) : null;
  // 那天一开始盆就在西阳台（前几天搬出去没搬回来）：那就不是"先在家浇完再搬"，
  // 土温也别按走廊加温算——它是露天（有顶棚）的土。
  const startsOut = !!(site?.dayTrip?.enabled
    && currentMovePlace(site, parseDate(date).getTime()) === 'trip');
  const soilOpts = startsOut ? { place: 'balcony', site } : { place, site };

  const sunrise = sunCrossHour(wIndex, date, { rise: true });
  const sunset = sunCrossHour(wIndex, date, { rise: false });
  // 能到现场的时间窗：人不在，算得再准也浇不了。默认 08:00–19:00，可在 site.waterWindow 改。
  const awayFrom = hmToH(site?.waterWindow?.from) ?? 8;
  const awayTo = hmToH(site?.waterWindow?.to) ?? WATER_LATEST;
  // 冷/热两档的判定只用当天最高温，跟任务生成那边一致
  const regime = (Number.isFinite(day.tmax) ? day.tmax : 20) >= HOT_REGIME_C
    ? 'hot'
    : (Number.isFinite(day.tmax) ? day.tmax : 20) < COLD_REGIME_C ? 'cold' : 'mild';

  let from;
  let to;
  if (regime === 'hot') {
    // 热天：傍晚到入夜前，越接近日落越凉
    from = Math.max(awayFrom, 15.5, sunset - 3);
    to = Math.min(awayTo, WATER_LATEST, sunset - 0.5);
  } else if (regime === 'cold') {
    // 冷天：上午里最暖的一段，浇完还有大半天排水回温
    from = Math.max(awayFrom, sunrise + 1, 8.5);
    to = Math.min(awayTo, 11);
  } else {
    from = Math.max(WATER_EARLIEST, sunrise + 0.5, awayFrom);
    to = Math.min(WATER_LATEST, sunset - DRY_BEFORE_NIGHT_H, awayTo);
  }
  if (to < from) {
    // 窗口被日出日落/作息挤没了：退回当天一段可用的时间，别算出个空数组
    from = Math.max(sunrise + 1, awayFrom);
    to = Math.max(from, Math.min(from + 2, sunset - 0.5, awayTo));
  }
  const slots = [];
  for (let h = from; h <= to + 1e-9; h += 0.5) slots.push(Math.round(h * 2) / 2);

  const hrs = wIndex?.hourly?.get(date) || [];
  const peakRad = Math.max(1, ...hrs.map((x) => x.rad || 0));
  const rainAhead = (h) => hrs
    .filter((x) => x.hour >= Math.floor(h) && x.hour <= Math.floor(h) + 3)
    .reduce((a, x) => a + (x.precip || 0), 0);

  const tmaxDay = Number.isFinite(day.tmax) ? day.tmax : 20;
  const scored = slots.map((h) => {
    const s = sampleAt(wIndex, date, h);
    const soil = soilTempC(wIndex, date, h, soilOpts);
    let score = 0;

    // ① 蒸发：用绝对辐射（700 W/m² 当"很晒"），阴天就几乎不扣分（RHS：凉的时候浇）
    score += Math.min(1.5, s.rad / 700) * 2.2;
    // ② 时段偏好：温和天上午（ISU 5–9 点口径）；热天越晚越凉；冷天在上午里挑最暖的 10:30 前后
    if (regime === 'hot') score += Math.max(0, (sunset - 1) - h) * 0.55;
    else if (regime === 'cold') score += Math.abs(h - 9.75) * 0.35;
    else score += Math.max(0, h - 9.5) * 0.55;
    // ③ 冷天在上午这段里挑最暖的时刻；6℃ 以下是真的不该浇
    if (regime === 'cold') score += Math.max(0, tmaxDay - s.temp) * 0.45;
    score += Math.max(0, 6 - s.temp) * 0.8;
    score += Math.max(0, ROOT_MIN_C - soil) * 0.35;   // 土温太低：稍微往后压，等土回暖
    // ④ 热天：28℃ 以上蒸发猛、水温土温差大
    score += Math.max(0, s.temp - 28) * 0.45;
    // ⑤ 湿着过夜：温和/冷天要留 2.5 h 让它干；热天夜温高不挂湿，只要求别浇到摸黑
    score += Math.max(0, (regime === 'hot' ? 0.5 : DRY_BEFORE_NIGHT_H) - (sunset - h)) * 8;
    // ⑥ 露天＋马上要下雨：白浇
    if (place === 'balcony' && plant.care?.rainExposed) score += Math.min(3, rainAhead(h) * 1.2);
    // ⑦ 外出台：刚搬出去 1 小时内不浇（土没回暖、盆还滴水）；已经在外面的不受这条
    if (goAt != null && !startsOut && h >= goAt && h < goAt + 1) score += 6;

    return { h, score, s, soil, rain: rainAhead(h) };
  });

  const fallbackH = Math.round(Math.min(Math.max((from + to) / 2, 7), 12) * 2) / 2;
  const best = scored.length
    ? scored.reduce((a, b) => (b.score < a.score - 1e-9 ? b : a), scored[0])
    : {
      h: fallbackH,
      score: 0,
      s: sampleAt(wIndex, date, fallbackH),
      soil: soilTempC(wIndex, date, fallbackH, soilOpts),
      rain: 0,
    };

  const good = scored.filter((x) => x.score <= best.score + 0.45);
  const window = {
    start: hmOf(good.length ? good[0].h : best.h),
    end: hmOf((good.length ? good[good.length - 1].h : best.h) + 0.5),
  };

  const soilTxt = best.soil.toFixed(1);
  const airTxt = best.s.temp.toFixed(1);
  const radShare = Math.round((best.s.rad / peakRad) * 100);
  const hToSunset = (sunset - best.h).toFixed(1);
  const reasons = [];

  // 主因：时段本身
  if (regime === 'hot') {
    reasons.push(`${hmOf(best.h)} 气温 ${airTxt}℃、土温 ${soilTxt}℃，今天最高 ${tmaxDay}℃——热天把水放到太阳落下去之后再浇：中午浇一半会被蒸掉，冷水进被晒热的土还容易激到根。`);
    reasons.push(`此时辐射 ${Math.round(best.s.rad)} W/m²（峰值 ${Math.round(peakRad)} W/m²），已经降下来了；水整夜慢慢渗，第二天一早盆里是满的。`);
    reasons.push(`离日落（${hmOf(sunset)}）还有 ${hToSunset} h，天还亮着：浇完顺手把托盘水倒掉，别让它泡着过夜。`);
  } else if (regime === 'cold') {
    reasons.push(`${hmOf(best.h)} 气温 ${airTxt}℃、土温 ${soilTxt}℃，今天最高才 ${tmaxDay}℃——冷天放上午浇：挑土回暖的这几小时，浇完还有大半天排水回温，不带着湿土过夜。`);
    reasons.push(`辐射 ${Math.round(best.s.rad)} W/m²（这天峰值 ${Math.round(peakRad)}）——冷天宁可亮一点也要等土回暖，根能吸水比省那点蒸发重要。`);
    reasons.push(`离日落（${hmOf(sunset)}）还有 ${hToSunset} h，水来得及排下去、土来得及回温。`);
  } else {
    reasons.push(`${hmOf(best.h)} 气温 ${airTxt}℃、土温 ${soilTxt}℃，水前一晚接好已回到室温，温差不大，根不会受激。`);
    if (Math.round(best.s.rad) <= 150) {
      reasons.push(`辐射只有 ${Math.round(best.s.rad)} W/m²，阴/弱光，蒸发可以忽略；挑这个点是为了留足白天自己干的时间。`);
    } else if (radShare <= 35) {
      reasons.push(`此时辐射 ${Math.round(best.s.rad)} W/m²，只有午后峰值（${Math.round(peakRad)} W/m²）的 ${Math.max(1, radShare)}%，浇下去的水几乎全进土里。`);
    } else {
      reasons.push(`此时辐射 ${Math.round(best.s.rad)} W/m²（峰值的 ${radShare}%），再往后拖只会更费水。`);
    }
    reasons.push(`离日落（${hmOf(sunset)}）还有 ${hToSunset} h，土面和托盘的余水当天就干，不带着夜潮过夜。`);
  }

  // 更早/更晚为什么不行（只在差异明显时说）
  if (scored.length > 2) {
    const earlier = scored[0];
    const later = scored[scored.length - 1];
    if (regime === 'hot' && best.h - earlier.h >= 1) {
      reasons.push(`再早到 ${hmOf(earlier.h)}，气温还有 ${earlier.s.temp.toFixed(1)}℃、辐射 ${Math.round(earlier.s.rad)} W/m²，正是最费水的时候。`);
    } else if (regime === 'cold' && best.h - earlier.h >= 1 && earlier.s.temp < best.s.temp - 1.5) {
      reasons.push(`再早到 ${hmOf(earlier.h)}，气温只有 ${earlier.s.temp.toFixed(1)}℃、土温 ${earlier.soil.toFixed(1)}℃，冷水进冷土，根几乎不吸水。`);
    } else if (regime === 'mild' && later.h - best.h >= 1.5 && later.s.temp > best.s.temp + 2.5 && tmaxDay >= 22) {
      reasons.push(`再拖到 ${hmOf(later.h)}，气温升到 ${later.s.temp.toFixed(1)}℃，蒸发和土温都上来了。`);
    }
  }
  if (plant.traits?.cam) {
    reasons.push(regime === 'hot'
      ? `${plant.name}是 CAM 植物，气孔到晚上才开，傍晚浇正好赶上它真正开始吸水的时候。`
      : `${plant.name}是 CAM 植物（白天关气孔、蒸腾慢），水浇进土里存着慢慢喝就行。`);
  }
  if (startsOut) {
    reasons.push(`盆已经在${trip?.label || site?.dayTrip?.label || '西阳台'}了，就在那儿浇。`);
  } else if (trip && goAt != null && best.h < goAt) {
    reasons.push(`今天 ${trip.goAt} 要搬去${trip.label || site?.dayTrip?.label || '西阳台'}，先在家浇完再搬，路上不滴水。`);
  } else if (trip && goAt != null && best.h >= goAt) {
    reasons.push(`已经搬到${trip.label || site?.dayTrip?.label || '西阳台'}，等盆土回暖 1 小时后再浇。`);
  }
  if (place === 'balcony' && plant.care?.rainExposed && best.rain > 0.5) {
    reasons.push(`往后 3 小时有 ${best.rain.toFixed(1)} mm 雨，先浇也白浇，模型已把这段往后挪。`);
  }

  return {
    time: hmOf(best.h),
    window,
    hour: best.h,
    score: Math.round(best.score * 100) / 100,
    soilC: Math.round(best.soil * 10) / 10,
    airC: Math.round(best.s.temp * 10) / 10,
    rad: Math.round(best.s.rad),
    peakRad: Math.round(peakRad),
    sunrise: hmOf(sunrise),
    sunset: hmOf(sunset),
    atSpot: startsOut || (goAt != null && best.h >= goAt),
    reasons,
    basis: [
      `热天（最高 ≥${HOT_REGIME_C}℃）傍晚浇：避开正午蒸发高峰、不拿冷水激热土`,
      `冷天（最高 <${COLD_REGIME_C}℃）上午浇：浇完还有大半天排水回温，不带着湿土过夜`,
      '温和天早上浇：ISU Extension 的 5–9 点口径，叶面/土表当天能干',
      'RHS《How to water containers》：清晨或傍晚，凉的时候盆面蒸发少',
      '浇完离日落至少留 2.5 h（热天收窄到 0.5 h，夜里不冷）',
      `只在你到得了现场的时间窗（${hmOf(awayFrom)}–${hmOf(awayTo)}）里挑`,
    ],
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

/** 逐小时辐射 → DLI 增量：1 W/m² 照 1 小时 = 0.00756 mol/m²（1 MJ 全辐射 ≈ 2.1 mol PAR） */
const HOUR_DLI = (3600 / 1e6) * 2.1;

/** 这个地点（走廊/室内）全天只有散射时，相对室外的透光率 */
const homeTransmission = (site, place) => {
  const base = Number.isFinite(site?.diffuse)
    ? site.diffuse
    : (site?.covered ? 0.22 : 0.32);
  const f = place === 'corridor'
    ? (site?.corridorLight ?? 0.37)
    : (site?.indoorLight ?? 0.2);
  return Math.max(0, base * f);
};

/**
 * 西阳台的透过率：**不是露天**——有顶棚、只有一面（栏杆）敞口。
 *
 * 所以散射要打折（顶棚和侧墙挡掉大半天空），直射只要太阳在开口那一侧、
 * 高度角低到能从顶棚下缘斜射进来，就基本照满（穿过栏杆）。
 * 默认值：散射 0.65（西阳台顶棚约 4 m，很高，挡得少；比北阳台的实心矮墙透空）、直射 1.0。
 */
export const TRIP_DIFFUSE = 0.65;
export const TRIP_DIRECT = 1;

/** 某一小时阳光能不能从顶棚下缘斜射到盆面 */
function shinedAt({ ms, lat, lon, spot }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const pos = sunPosition(ms, lat, lon);
  if (!(pos.alt > 0)) return false;
  const td = spot || {};
  const clearM = Math.max(0.3, ((td.roofHeightCm ?? 230) - (td.potTopCm ?? 45)) / 100);
  const depthM = Math.max(0.2, (td.depthCm ?? 70) / 100);
  const clearsRoof = Math.tan((pos.alt * Math.PI) / 180) <= clearM / depthM;
  // 侧墙会收窄可见的方位窗口，和 sunExposure 用同一把尺子
  const maxAz = Number(td.sideWallM) > 0
    ? Math.min(92, (Math.atan(Number(td.sideWallM) / depthM) * 180) / Math.PI)
    : 92;
  const facing = Math.abs(angDiff(pos.az, td.azimuth ?? 270)) <= maxAz;
  return clearsRoof && facing;
}

/* ------------------------------------------------------------ 搬动记录 */

/**
 * 实际的搬动记录：`site.moveLog = [{ at: ISO 时间, to: 'trip' | 'home' }]`
 *
 * 用户每次搬完点一下，搬去西阳台就记 `trip`，搬回走廊就记 `home`。
 * 光照按"人在哪儿 × 那段时间的辐射"积分，不再按固定计划窗口猜；
 * 计划窗口只在某天完全没有记录时兜底（比如未来几天、或还没开始点的时候）。
 */
export function moveLogOf(site) {
  const raw = Array.isArray(site?.moveLog) ? site.moveLog : [];
  return raw
    .map((e) => ({ at: e.at, to: e.to, src: e.src, ms: new Date(e.at).getTime() }))
    .filter((e) => Number.isFinite(e.ms) && (e.to === 'trip' || e.to === 'home'))
    .sort((a, b) => a.ms - b.ms);
}

/** 到 now 为止，最后待的地方是西阳台还是走廊 */
export function currentMovePlace(site, now = Date.now()) {
  let place = 'home';
  for (const e of moveLogOf(site)) {
    if (e.ms > now) break;
    place = e.to;
  }
  return place;
}

/**
 * 某天实际待在西阳台的时段（毫秒）。
 * 前一天最后一条记录决定今天开始时在哪；没有记录返回 []，由调用方回落到计划窗口。
 */
export function actualTripSpans(site, date) {
  const dayStart = parseDate(date).getTime();
  const dayEnd = dayStart + DAY;
  const spans = [];
  let place = 'home';
  let open = null;
  for (const e of moveLogOf(site)) {
    if (e.ms <= dayStart) { place = e.to; continue; }
    if (e.ms >= dayEnd) break;
    if (e.to === 'trip' && place !== 'trip') {
      open = e.ms;
      place = 'trip';
    } else if (e.to === 'home' && place === 'trip') {
      spans.push({ start: open ?? dayStart, end: e.ms });
      open = null;
      place = 'home';
    }
  }
  // 只点了"搬去"、还没点"搬回"：先开一个到日落的开口时段
  if (place === 'trip') spans.push({ start: open ?? dayStart, end: null });
  return spans;
}

/** 某个整点小时落在若干时段里的比例（0–1），用来处理"9:05 才搬过去"这种零头 */
function spanFraction(ms, spans) {
  const end = ms + 3600000;
  let f = 0;
  for (const s of spans) {
    const a = Math.max(ms, s.start);
    const b = Math.min(end, s.end);
    if (b > a) f += (b - a) / 3600000;
  }
  return Math.min(1, f);
}

export function sunPlan(plant, wIndex, site, date, lat, lon, opts = {}) {
  const day = wIndex.daily.get(date) || {};
  const need = plant.traits.lightNeedDli || 8;
  const min = plant.traits.lightMinDli || need * 0.5;
  const place = plant.care?.place || 'balcony';
  const add = lampDli(site.lamp);
  const samples = (wIndex.hourly.get(date) || []).filter((s) => s.hour >= 5 && s.hour <= 20);
  // 不传经纬度时用天气索引里的坐标（任务生成那边就是这种情况），免得算出 NaN
  const la = Number.isFinite(lat) ? lat : wIndex.lat;
  const lo = Number.isFinite(lon) ? lon : wIndex.lon;

  // 露天阳台：全天都在外面，按当天全辐射算
  if (place === 'balcony') {
    const geo = sunExposure({
      samples, lat: la, lon: lo,
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
      diffuseIn: site.diffuse,
      directIn: site.direct,
    });
    const dli = Math.round((base + add) * 10) / 10;
    const verdict = dli >= need ? '充足' : dli >= min ? '勉强' : '不足';
    return { ...geo, baseDli: base, lampDli: add, dli, need, min, verdict, indoor: false, date };
  }

  // 走廊 / 室内：基础是散射（相对北阳台的口径，见 README）
  const geo = sunExposure({
    samples, lat: la, lon: lo,
    azimuth: site.azimuth,
    parapetCm: site.parapetCm,
    potTopCm: site.potTopCm,
    depthCm: site.depthCm,
    parapetType: site.parapetType || 'solid',
    sideWallM: site.sideWallM,
  });
  const northDli = estimateDli({
    radiationMJ: day.rad,
    directHours: geo.effectiveHours,
    daylightHours: Math.max(9, geo.daylightHours),
    covered: !!site.covered,
    diffuseIn: site.diffuse,
    directIn: site.direct,
  });
  const f = place === 'corridor' ? (site.corridorLight ?? 0.37) : (site.indoorLight ?? 0.2);
  const homeDli = Math.round(northDli * f * 10) / 10;

  // 当天在西阳台的时段：实际搬动优先，没有记录才用计划窗口
  const withTrip = opts.withTrip !== false;
  const nowMs = Number(opts.now) || Date.now();
  const isToday = date === localDate(new Date(nowMs));
  const dayStartMs = parseDate(date).getTime();
  const planned = withTrip ? tripDayInfo({ site, wIndex, date }) : null;
  const rawSpans = withTrip ? actualTripSpans(site, date) : [];
  let spans = [];
  let tripSource = null;       // 'actual' | 'plan'
  let tripOpen = false;
  let tripFromStart = false;   // 今天 0 点就在外面（周末没搬回来）

  if (rawSpans.length) {
    tripSource = 'actual';
    // 只点了"搬去"没点"搬回"：今天按计划搬回时间（或现在）估到日落，
    // 免得白天的总光量被当成 0，日耗也跟着算低
    const planWin = planned?.win
      || (site.dayTrip?.enabled ? sunWindow({ spot: site.dayTrip, wIndex, date }) : null);
    const radSamples = samples.filter((s) => (Number(s.rad) || 0) > 0);
    const duskMs = radSamples.length
      ? radSamples[radSamples.length - 1].ms + 3600000
      : dayStartMs + 18 * 3600000;
    const planEndMs = planWin ? dayStartMs + (planWin.last + 1) * 3600000 : duskMs;
    // 今天 0 点就在外面、而且到现在都没搬回来，才算「一直在外面」
    if (rawSpans.length === 1 && rawSpans[0].end == null && rawSpans[0].start <= dayStartMs + 60000) {
      tripFromStart = true;
    }
    spans = rawSpans.map((s) => {
      if (s.end != null) return { start: s.start, end: s.end };
      tripOpen = true;
      const guessEnd = Math.min(duskMs, isToday ? Math.max(nowMs, planEndMs) : planEndMs);
      return { start: s.start, end: Math.max(s.start + 5 * 60000, guessEnd) };
    });
  } else if (planned) {
    tripSource = 'plan';
    spans = [{
      start: dayStartMs + planned.win.first * 3600000,
      end: dayStartMs + (planned.win.last + 1) * 3600000,
    }];
  }

  let dli = homeDli;
  let homeRouteDli = homeDli;
  let tripHours = 0;
  let tripDli = 0;
  let tripWin = null;
  let tripSpans = [];
  const hm = (ms) => {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  if (spans.length) {
    const homeTrans = homeTransmission(site, place);
    const td = site.dayTrip || {};
    const tripDiffuse = Number.isFinite(td.diffuse) ? td.diffuse : TRIP_DIFFUSE;
    const tripDirect = Number.isFinite(td.direct) ? td.direct : TRIP_DIRECT;
    let sumHome = 0;
    let sumTrip = 0;
    let sumRad = 0;
    for (const s of samples) {
      const rad = Math.max(0, Number(s.rad) || 0);
      if (!rad) continue;
      const frac = spanFraction(s.ms, spans);
      sumRad += rad;
      sumHome += rad * (1 - frac);
      // 西阳台：有顶棚、一面敞口。散射按 tripDiffuse 折，直射只在太阳真能照进来时给满。
      // 全球辐射 = 散射 + 直射。顶棚挡掉大半天空，所以散射要乘天空可见度（tripDiffuse）；
      // 直射只在太阳真能从开口斜射进来时才算（shinedAt），否则那部分完全被挡掉。
      const cloud = Math.max(0, Math.min(100, Number(s.cloud) || 0));
      const diffFrac = 0.25 + 0.5 * (cloud / 100);   // 阴天全是散射，晴天约四分之一
      const lit = frac > 0 && shinedAt({ ms: s.ms, lat: la, lon: lo, spot: td });
      const trans = diffFrac * tripDiffuse + (lit ? (1 - diffFrac) * tripDirect : 0);
      sumTrip += rad * frac * trans;
      tripHours += frac;
    }
    tripHours = Math.round(tripHours * 10) / 10;
    if (sumRad > 0) {
      // 逐小时拼：在家的小时按走廊透过率，在西阳台的小时按上面那一套（已含顶棚/直射）
      homeRouteDli = Math.round(sumHome * HOUR_DLI * homeTrans * 10) / 10;
      tripDli = Math.round(sumTrip * HOUR_DLI * 10) / 10;
      dli = Math.round((homeRouteDli + tripDli) * 10) / 10;
    } else {
      // 预报缺逐小时辐射时，按两个地点全天的结果和在外时长加权兜底
      const span = Math.max(9, geo.daylightHours || 10);
      const share = Math.min(0.8, tripHours / span);
      const fullTrip = Math.round(estimateDli({
        radiationMJ: day.rad,
        directHours: geo.effectiveHours,
        daylightHours: span,
        covered: true,
        diffuseIn: Number.isFinite(site.dayTrip?.diffuse) ? site.dayTrip.diffuse : TRIP_DIFFUSE,
        directIn: Number.isFinite(site.dayTrip?.direct) ? site.dayTrip.direct : TRIP_DIRECT,
      }) * 10) / 10;
      homeRouteDli = Math.round(homeDli * (1 - share) * 10) / 10;
      tripDli = Math.round(fullTrip * share * 10) / 10;
      dli = Math.round((homeRouteDli + tripDli) * 10) / 10;
    }
    if (tripSource === 'plan') {
      tripWin = planned.win;
    } else {
      const first = spans[0];
      const last = spans[spans.length - 1];
      tripWin = {
        start: hm(first.start),
        end: hm(last.end),
        first: new Date(first.start).getHours(),
        last: new Date(Math.max(first.start, last.end - 1)).getHours(),
        hours: tripHours,
      };
    }
    // 一天可能搬出去好几趟：界面按段显示，别把两段拼成一个长区间
    tripSpans = spans.map((s) => ({ start: hm(s.start), end: hm(s.end) }));
  }
  const total = Math.round((dli + add) * 10) / 10;
  const verdict = total >= need ? '充足' : total >= min ? '勉强' : '不足';
  const placeName = place === 'corridor' ? '走廊' : '室内';
  const tripName = site.dayTrip?.label || '外出台';
  return {
    directHours: 0, effectiveHours: tripHours,
    daylightHours: geo.daylightHours || 10,
    baseDli: homeDli, homeDli, homeRouteDli, northDli,
    tripHours, tripDli, tripWin, tripSpans,
    tripActual: tripSource === 'actual',
    tripFromStart,
    tripOpen,
    tripSkipped: withTrip && !spans.length && !!site.dayTrip?.enabled,
    tripLabel: tripName,
    lampDli: add, dli: total, need, min,
    indoor: true, place, mixed: !!tripHours,
    verdict,
    note: tripSource === 'actual'
      ? `${placeName} + ${tripName}（按实际搬动）`
      : tripHours
        ? `${placeName}散射 + ${tripName} ${tripHours} h`
        : `${placeName}散射光`,
    date,
  };
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

/**
 * 走廊夜里比室外暖多少度。
 *
 * 拿室外最低温直接判「走廊会不会冻着」会大错：走廊是有顶有墙的半室内，夜里比露天暖一大截。
 * 这里给它兜一个温差（site.corridorWarmC，默认 5℃），只有折算之后仍低于耐受线才叫「极度寒冷」，
 * 才值得搬进房间。工作日的「夜里冷就搬进房间」和周末选位共用这一把尺子。
 */
export const CORRIDOR_WARM_C = 5;
export function corridorNightC(site, tmin) {
  const gap = Number(site?.corridorWarmC);
  const add = Number.isFinite(gap) ? gap : CORRIDOR_WARM_C;
  return Math.round(((tmin ?? 12) + add) * 10) / 10;
}

/**
 * 真正值得往实验室搬的线：比耐受线再低 5℃，也就是接近冰点的天气。
 * 耐受线是「待着舒服」的线，不是冻伤线；为了几度就搬进屋、第二天再搬出来，折腾的代价更大。
 */
export const ROOM_MOVE_BELOW_C = 5;
export const roomLine = (minNightC, site = null) => {
  const below = Number(site?.roomMoveBelowC);
  const gap = Number.isFinite(below) && below > 0 ? below : ROOM_MOVE_BELOW_C;
  return Math.round((minNightC - gap) * 10) / 10;
};

/**
 * 阳台和露天差多少度。
 * **阳台比走廊冷**：顶棚只挡一面，夜里基本等于露天（0），走廊是半室内（+5）。
 * 所以判冷一律按「它们在哪个地方」取温度，别用一个数套所有位置。
 */
export const BALCONY_WARM_C = 0;
/** 夜里「必须搬」的线：三个位置同一把尺子，位置差异已经算进温度里了 */
export const coldLine = (place, minNight, site = null) => roomLine(minNight, site);

/**
 * 「家」叫什么：就是工位旁边那个固定摆放点。
 * 按植株实际记得的位置推——两盆都记在走廊就是「走廊」；别用 site.label，那是北阳台「参照点」的名字，
 * 早先当成了家的名字，任务里就会出现「从西阳台搬回北阳台」这种和你实际放的地方对不上的指令。
 */
export function homeLabel(plants = [], site = null) {
  if (plants.length && plants.every((p) => (p.care?.place || 'balcony') === 'corridor')) return '走廊';
  return site?.label || '走廊';
}

/**
 * 某天到底去不去西阳台。
 *
 * 判断口径和任务生成完全共用：有直射窗口、窗口内不下大雨、白天不太冷、而且人在工位。
 * 返回 null 表示今天不搬（不是"忘了"，是天气/太阳/周末不配合）。
 */
export function tripDayInfo({ site, wIndex, date, plants = [] }) {
  const trip = site?.dayTrip?.enabled ? site.dayTrip : null;
  if (!trip) return null;
  // 周末人不在工位，没人搬：外出台默认只在周一到周五（真要周末也搬，设 dayTrip.onWeekend=true）
  const dow = parseDate(date).getDay();
  if ((dow === 0 || dow === 6) && trip.onWeekend !== true) return null;
  // 外出台是最近才开始的：以前的日期不追溯，免得把历史浇水量算歪
  const since = trip.since || site?.measured?.at?.slice(0, 10) || localDate(new Date());
  if (date < since) return null;
  const win = sunWindow({ spot: trip, wIndex, date });
  if (!win || win.hours < 1) return null;
  const day = wIndex.daily.get(date) || {};
  const hrs = (wIndex.hourly.get(date) || [])
    .filter((h) => h.hour >= win.first && h.hour <= win.last);
  const wet = hrs.reduce((acc, h) => acc + (h.precip || 0), 0);
  const squall = hrs.some((h) => (h.precip || 0) >= 1.2);
  if (squall || wet >= 2.5) return null;
  if ((day.tmax ?? 20) < 8) return null;
  const strictNight = plants.length
    ? Math.max(...plants.map((x) => x.traits?.minNightC ?? 5))
    : 5;
  return {
    win, wet, squall,
    // 傍晚是搬回走廊（半室内），所以按折算后的走廊温度判，不是室外温度
    coldNight: corridorNightC(site, day.tmin ?? 12) < coldLine('corridor', strictNight, site),
    goAt: clampHM(win.first, -(trip.leadMin ?? 20)),
    backAt: clampHM(win.last + 1, trip.lagMin ?? 15),
  };
}

/* ------------------------------------------------------------ 周末放哪儿 */

/**
 * 周末放哪儿：只有两种结果——**原地待着**，或者**急降温搬进房间**。
 *
 * 周末人不来，就不做"哪个位置更好"的决策：两盆停在哪（走廊 / 西阳台）就在那儿待两天。
 * 唯一需要动的是温度：按「它们现在待的地方」算夜里温度（阳台=露天那档，走廊=半室内 +5℃），
 * 低于 `roomLine()`（耐受线再下 5℃，也就是接近冰点）才搬进房间，周一搬回。
 * 这条也兜住"预报没跟上、临时发现要冻"的急降温——预报一变，第二天就会提示。
 */
export function weekendPlacement({ plants = [], wIndex, site, now = Date.now() }) {
  const today = localDate(new Date(now));
  // 从今天起算的第一个周五（周五当天就是本周末；周六周日算下个周五）
  const dow = parseDate(today).getDay();
  const start = dow === 5 ? today : addDays(today, (5 - dow + 7) % 7);
  const back = addDays(start, 3);
  const end = addDays(start, 2); // 最后一晚是周日
  const days = [0, 1, 2, 3].map((i) => addDays(start, i)); // 周五～周一
  const daily = days.map((d) => wIndex.daily.get(d)).filter(Boolean);
  const strayDays = plants.filter((p) => p.care?.stray).map((p) => p.name);
  const base = { start, end, back, days, strayDays, stray: strayDays.length > 0 };
  if (!daily.length) return { ...base, choice: null, options: [], nights: [] };

  const minNight = plants.length ? Math.max(...plants.map((x) => x.traits?.minNightC ?? 5)) : 5;
  const line = roomLine(minNight, site);
  const outside = currentMovePlace(site, now) === 'trip';
  const atCorridor = plants.length > 0 && plants.every((p) => (p.care?.place || 'balcony') === 'corridor');
  const stayKey = outside ? 'west' : (atCorridor ? 'corridor' : 'balcony');
  const stayName = outside ? (site?.dayTrip?.label || '西阳台') : (atCorridor ? '走廊' : (site?.label || '阳台'));

  // 夜里温度按"现在待的地方"算：阳台就是露天那档，走廊再加半室内那几度
  const nights = [start, addDays(start, 1), addDays(start, 2)].map((d) => {
    const tmin = Math.round((wIndex.daily.get(d)?.tmin ?? 12) * 10) / 10;
    const at = Math.round((outside ? tmin + BALCONY_WARM_C : corridorNightC(site, tmin)) * 10) / 10;
    return { date: d, tmin, at, cold: at < line };
  });
  const cold = nights.find((n) => n.cold) || null;

  const choice = cold
    ? {
      key: 'room', name: '房间', cls: 'room', stay: false,
      why: `${monthDay(cold.date)}夜里${outside ? '阳台' : '走廊'}约 ${cold.at}℃，已经接近冰点（线在 ${line}℃），`
        + '周末没人看着，搬进房间最稳',
    }
    : { key: stayKey, name: stayName, cls: 'stay', stay: true, why: `周末不搬，${stayName}原地待着` };

  return {
    ...base,
    minNight, line, nights, outside, stayKey, stayName,
    choice, options: [choice],
  };
}

/** 两个日期之间差几天（至少 1 天，用来写"待了 N 天"） */
const daysBetween = (a, b) => Math.max(1, diffDays(b, a));

/* ------------------------------------------------------------ 任务 */

const KIND_ORDER = { moveOut: 1, check: 2, water: 3, prep: 5, bloom: 6, photo: 7, fert: 8 };

/**
 * 一天里要做什么。
 * 三条口径：① 需要人到场的任务只在周一到周五；② 有截止日的（浇水/拍照）落在周末就挪到到岗日；
 * ③ 外出台按"现在在哪儿"接着算——已经在外面待着的日子只生成傍晚"搬回来"，不再生成早上"搬出去"。
 */
export function buildTasks({ plants = [], wIndex, site, settings = {}, now = Date.now(), horizonDays = 7, doneMap = {}, photos = [], reminders = [] }) {
  const today = localDate(new Date(now));
  const tasks = [];

  // ── 外出台（周一到周五；周末人不在，tripDayInfo 自己会挡掉） ──
  const trip = site && site.dayTrip && site.dayTrip.enabled ? site.dayTrip : null;
  const tripDays = new Map();
  if (trip && plants.length) {
    for (let i = 0; i < horizonDays; i++) {
      const date = addDays(today, i);
      const info = tripDayInfo({ site, wIndex, date, plants });
      if (info) tripDays.set(date, info);
    }
  }

  // ── 周末：默认原地不动，只有急降温才搬进房间 ──
  const weekend = site && plants.length ? weekendPlacement({ plants, wIndex, site, now }) : null;
  const nowPlace = currentMovePlace(site, now);
  // 开场就在外面：从今天到"第一个到岗日"（那天傍晚才收工回来）都算在外面
  const backDay = (() => {
    if (nowPlace !== 'trip') return null;
    for (let i = 0; i < horizonDays; i++) {
      const d = addDays(today, i);
      if (!isRestDay(d)) return d;
    }
    return null;
  })();
  const corridorCold = (d) => {
    const tmin = wIndex.daily.get(d)?.tmin ?? 12;
    const worst = plants.length ? Math.max(...plants.map((x) => x.traits?.minNightC ?? 5)) : 5;
    return corridorNightC(site, tmin) < roomLine(worst, site);
  };

  for (const plant of plants) {
    const plan = waterPlan(plant, wIndex, settings, now, site);
    const sch = plant.schedule || {};
    const t = (k, def) => sch[k] || def;
    // 浇水钟点：默认按天气算，显式选了「固定时刻」才用手填的
    const fixedHM = sch.waterMode === 'fixed' && /^\d{1,2}:\d{2}$/.test(sch.water || '') ? sch.water : null;
    const waterHM = fixedHM || plan.dutyTime || plan.nextTime;

    // 到岗日：截止日落在周末就提前到周五，已经过了就在下一个到岗日补
    const onDutyDay = (d) => {
      const back = workdayOnOrBefore(d);
      return back >= today ? back : workdayOnOrAfter(today);
    };
    const waterDay = plan.dutyDate || onDutyDay(plan.nextDate);
    // 前一晚得真的在前一天，才有"今晚备水/摸土"的意义
    const prepDay = workdayOnOrBefore(addDays(waterDay, -1));
    const canPrep = prepDay >= today && addDays(prepDay, 1) === waterDay;

    const minNight = plant.traits?.minNightC ?? 5;
    const place = plant.care?.place || 'balcony';

    // 每天该不该待在室内
    const risk = [];
    for (let i = 0; i <= horizonDays; i++) {
      const d = wIndex.daily.get(addDays(today, i)) || {};
      const rawNight = d.tmin ?? 12;
      // 位置不同温度不同：阳台就是露天那档，走廊是半室内
      const nightC = place === 'corridor' ? corridorNightC(site, rawNight) : rawNight + BALCONY_WARM_C;
      const cold = nightC < coldLine(place, minNight, site);
      const rain = plant.traits?.rainSensitive !== false
        && ((d.precip ?? 0) >= 1.5 || (d.pop ?? 0) >= 70);
      const gale = plant.traits?.windSensitive === true && (d.wind ?? 0) >= 34;
      risk.push({ cold, rain, gale, any: cold || rain || gale, day: d, nightC });
    }

    const onBalcony = place === 'balcony';
    let inside = !onBalcony;
    // 这两天的位置由周末安排统一管，走廊那套搬进搬出先不算
    const weekendGap = (d) => !!weekend && d >= weekend.start && d < weekend.end;

    for (let i = 0; i < horizonDays; i++) {
      const date = addDays(today, i);
      const day = wIndex.daily.get(date) || {};
      const tmax = day.tmax ?? 20;
      const r = risk[i];
      // 开场就在外面（西阳台过周末 / 昨天没搬回来）：走廊那套搬进搬出这几天都不算
      const awayToday = !!backDay && date <= backDay;

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

      // ── 走廊 → 实验室：夜里真扛不住才搬进屋 ──
      if (place === 'corridor' && !isRestDay(date) && !awayToday && !tripDays.has(date) && !weekendGap(date)) {
        const prevCold = i > 0 ? risk[i - 1].cold : false;
        if (r.cold) {
          push('moveIn', '17:00', `把${plant.name}搬进实验室过夜`,
            '先进屋，白天再挪回走廊；别放在暖气或空调出风口正下方。',
            `今夜走廊约 ${r.nightC}℃（室外 ${day.tmin ?? 12}℃），低于它的耐受线 ${minNight}℃。`);
        } else if (prevCold) {
          push('moveOut', '08:00', `把${plant.name}搬回走廊`,
            '最冷的那晚过去了，搬回走廊。',
            `今夜走廊约 ${r.nightC}℃，回到耐受线以上。`);
        }
      }

      // ── 阳台植株的搬进搬出（走廊那两盆用不到） ──
      if (isRestDay(date) || tripDays.has(date) || weekendGap(date)) { /* 休息日 / 外出台 / 周末统一安排 */ }
      else if (!onBalcony) { /* 走廊：没有搬动任务 */ }
      else if (inside && !r.any) {
        push('moveOut', t('moveOut', '07:30'), `把${plant.name}搬回阳台`,
          '放回原位、朝向不变（别转盆）；垫高 40–60 cm 才吃得到栏板以上的光。',
          '危险天气过去了，回去晒太阳。');
        inside = false;
      }
      if (!isRestDay(date) && !tripDays.has(date) && !weekendGap(date) && onBalcony && !inside && r.any) {
        const why = r.cold
          ? `今夜 ${r.nightC}℃，低于耐受线 ${minNight}℃`
          : r.rain
            ? `预计降水 ${day.precip ?? 0} mm（概率 ${day.pop ?? 0}%）`
            : `阵风 ${Math.round(day.wind ?? 0)} km/h`;
        push('moveIn', r.cold && !r.rain ? t('moveIn', '17:00') : '07:00',
          `把${plant.name}搬进走廊`,
          '避风避雨处，垫高离地，别贴灭火器箱（留 60 cm 开箱空间）。',
          why + '，提前搬比淋湿了再救有效。');
        inside = true;
      }

      // ── 浇水 / 备水 / 探土 ──
      if (date === waterDay) {
        const shifted = waterDay !== plan.nextDate
          ? `按盆土算本来是 ${monthDay(plan.nextDate)}（${weekdayCN(plan.nextDate)}）到期，那天不在实验室，改到 ${monthDay(waterDay)}。`
          : '';
        push('water', waterHM, `给${plant.name}浇透（浇到底孔出水）`,
          wateringHowTo(plant),
          `盆里能给根用的 ${plan.capacity} ml 水按这几天的光、风、温度算已经用完（每天约 ${plan.dailyUseToday} ml），`
            + `浇透后大约 ${plan.intervalDays} 天后再浇。${shifted}${plan.dutyWhy?.[0] || plan.nextTimeWhy?.[0] || ''}`,
          { waterToDrain: plan.toDrain, amountMl: plan.amount, waterTime: waterHM });
      }
      if (canPrep && date === prepDay) {
        push('prep', t('prep', '21:00'), '接一壶水放着回温',
          `敞口放在窗台，${monthDay(waterDay)}早上 ${waterHM} 用；水温接近室温再浇，低于 10℃ 会伤根。`,
          '提前一夜备水，免得清晨拿冰水管里的水直接浇。');
        push('check', t('check', '07:00'), `摸一下${plant.name}的土`,
          '插到底再拔出来看下半截：带湿土就点「还湿」，干爽就点「干了」——点一下就会改模型。',
          `模型只是按天气推算（${monthDay(waterDay)} ${waterHM} 打算浇），竹签才是事实。`);
      }

      // ── 花期巡霉：需要人到场，周末不排 ──
      if (plant.traits?.bloom && plant.traits.stage === 'bloom') {
        const every = settings.bloomCheckEveryDays || 3;
        if (!isRestDay(date) && diffDays(today, date) % every === 0) {
          push('bloom', '18:30', `扒开${plant.name}的花苞查灰霉`,
            '看花苞基部有没有褐变、发软、灰毛；有就立刻摘掉并开窗对流。',
            '湿度 >80% 又不通风是灰霉的温床，发现晚了整串花报废。');
        }
      }

      // ── 拍照：周期对齐到到岗日，别让"每 7 天"正好落在周六就断了 ──
      const lastPhoto = photos.filter((x) => x.plantId === plant.id)
        .map((x) => localDate(x.at)).sort().pop();
      const everyPhoto = settings.photoEveryDays || 7;
      const photoDay = lastPhoto ? onDutyDay(addDays(lastPhoto, everyPhoto)) : onDutyDay(today);
      if (date === photoDay && !isRestDay(date)) {
        push('photo', '18:00', `给${plant.name}拍一张`,
          '同一角度、同一高度、自然光下拍，方便和上一张对比。',
          `每 ${everyPhoto} 天留一张档案照。`);
      }

      // ── 施肥：只在真正的生长季，花期停，周末不排 ──
      if (!(plant.traits?.bloom && plant.traits.stage === 'bloom')) {
        const everyF = settings.fertEveryDays || 14;
        const mon = Number(date.slice(5, 7));
        const tminD = day.tmin ?? 12;
        const growing = mon >= 3 && mon <= 10 && tmax >= 15 && tmax <= 30 && tminD >= 8;
        const slow = plant.traits?.slowRelease;
        const step = slow ? everyF * 3 : everyF;
        if (growing && !isRestDay(date) && diffDays(today, date) % step === 0) {
          push('fert', '10:00', `给${plant.name}施一次稀薄肥`,
            slow
              ? '1000 倍水溶肥或 1:10 饼肥水，浇透即可；第二天回一次清水。'
              : '1000 倍水溶肥，先浇清水润土再施肥，别在干土上下肥。',
            slow ? '罗汉松不耐浓肥，生长季一两个月一次就够，秋冬停。' : '生长期两周一次；花期和冬季停。');
        }
      }
    }
  }

  // ── 还没实测透光率时，到岗日提醒测一次 ──
  if (site && site.lightMeasured !== true && !isRestDay(today)) {
    const id = `measure|${today}|light`;
    tasks.push({
      id, plantId: null, plantName: site.label || '走廊', emoji: '🔦',
      date: today, time: '13:30', kind: 'measure',
      title: '测光照：户外 / 走廊 / 西阳台',
      detail: '手机平放、屏幕朝上，三个点各测一次：①走廊外无遮挡处 ②花盆旁边盆土面高度 ③西阳台盆位。同一分钟内测完，来回跑 3 趟取中位数，记下 lux。',
      why: '走廊透光率现在是猜的 18%，实测完浇水量和日照判断都会跟着重算。',
      state: doneMap[id] || null,
    });
  }

  // ── 自定义提醒（一次性/手加的） ──
  for (const r of reminders || []) {
    if (!r) continue;
    // 支持每年重复（如"8 月底开始遮光"）：只写月日，年份自动往后滚
    let date = r.date;
    if (r.annual && r.md) {
      const y = Number(today.slice(0, 4));
      date = `${y}-${r.md}`;
      if (diffDays(date, today) < -3) date = `${y + 1}-${r.md}`;
    }
    if (!date) continue;
    const gap = diffDays(date, today);
    if (gap < -3 || gap >= horizonDays) continue;   // 过期 3 天内还留着提醒
    const id = `rem|${r.id || date}-${date}`;
    tasks.push({
      id, plantId: r.plantId || null, plantName: r.plantName || '', emoji: r.emoji || '📌',
      date, time: r.time || '09:00', kind: 'reminder',
      title: r.title || '提醒', detail: r.detail || '', why: r.why || '',
      state: doneMap[id] || null,
    });
  }

  // ── 外出台：按天走一遍，顺便把"是不是还在外面"传下去 ──
  if (plants.length && (tripDays.size || nowPlace === 'trip')) {
    const names = plants.map((x) => x.name).join('和');
    const homeName = homeLabel(plants, site);
    const spotName = trip?.label || '西阳台';
    const ch = weekend?.choice || null;
    const pushTrip = (date, kind, time, title, detail, why) => {
      const id = `trip|${date}|${kind}`;
      if (tasks.some((x) => x.id === id)) return;
      tasks.push({
        id, plantId: null, plantName: spotName, emoji: '☀️',
        date, time, kind, title, detail, why,
        state: doneMap[id] || null,
      });
    };
    const homeWhy = site?.homeKind === 'corridor'
      ? `${homeName}里只有散射，${spotName}下午能晒到直射。`
      : `${homeName}朝${compassWord(site?.azimuth)}，这个季节盆位零直射；${spotName}下午能晒到。`;

    let outside = nowPlace === 'trip';
    for (let i = 0; i < horizonDays; i++) {
      const date = addDays(today, i);
      if (isRestDay(date)) continue;
      const td = tripDays.get(date) || null;
      const eveOfWeekend = !!weekend && date === weekend.start;
      const weekendRoom = !!ch && ch.key === 'room' && eveOfWeekend;
      const dest = weekendRoom || td?.coldNight || corridorCold(date) ? '房间' : homeName;

      if (outside) {
        // 周五又碰上"周末原地待着"：这两天就留在外面，别周五晚上再搬一趟
        if (eveOfWeekend && !weekendRoom) continue;
        pushTrip(date, 'toHome', td?.backAt || '17:15', `把${names}从${spotName}搬回${dest}`,
          td ? '已经在外面待着，早上不用再搬一趟；这个点收工搬回来。' : '今天没有可以搬出去晒的窗口，傍晚照样收回来。',
          `日落后${spotName}只剩散射，留着没意义。`);
        outside = false;
        continue;
      }
      if (!td) continue;
      pushTrip(date, 'toSun', td.goAt, `把${names}搬到${spotName}晒太阳`,
        `${td.win.start}–${td.win.end} 有直射 ${td.win.hours} 小时，${td.backAt} 搬回${dest}。`,
        homeWhy);
      if (weekendRoom) continue;   // 周末要搬进房间，收工那步交给 weekendOut
      pushTrip(date, 'toHome', td.backAt, `把${names}搬回${dest}`,
        td.coldNight ? '今夜走廊会低于耐受线，直接放房间。' : '搬回固定位置，朝向别乱换。',
        td.coldNight ? '夜里冷，别留在阳台。' : `日落后${spotName}只剩散射，留着没意义。`);
    }
  }

  // ── 周末：只有急降温才生成搬动，平时原地不动、一条任务都没有 ──
  if (weekend && plants.length && weekend.choice?.key === 'room') {
    const names = plants.map((x) => x.name).join('和');
    const cold = weekend.nights.find((n) => n.cold) || weekend.nights[0];
    const outId = `weekend|${weekend.start}|weekendOut`;
    tasks.push({
      id: outId, plantId: null, plantName: '房间', emoji: '🏠',
      date: weekend.start, time: '17:30', kind: 'weekendOut',
      title: `下班前把${names}搬进房间（${monthDay(cold.date)}夜里 ${cold.at}℃）`,
      detail: '周末没人看着，房间是唯一有墙有暖气的地方：放窗边，别贴暖气或空调出风口。',
      why: weekend.choice.why,
      state: doneMap[outId] || null,
      weekendStart: weekend.start, weekendEnd: weekend.back, weekendPlace: 'room',
    });
    const backId = `weekend|${weekend.start}|weekendBack`;
    tasks.push({
      id: backId, plantId: null, plantName: '房间', emoji: '🏢',
      date: weekend.back, time: '08:40', kind: 'weekendBack',
      title: `把${names}从房间搬回走廊`,
      detail: '先看叶面有没有积灰、水渍、虫，再插竹签到底摸下半截土，然后点「探土」。',
      why: `在房间待了 ${daysBetween(weekend.start, weekend.back)} 天，回来先检查一遍再归位。`,
      state: doneMap[backId] || null,
      weekendStart: weekend.start, weekendEnd: weekend.back, weekendPlace: 'room',
    });
  }

  return tasks.sort((a, b) => (a.date === b.date
    ? (a.time || '').localeCompare(b.time || '') || (KIND_ORDER[a.kind] || 9) - (KIND_ORDER[b.kind] || 9)
    : a.date.localeCompare(b.date)));
}

/* ------------------------------------------------------------ 待办历史 */

/** 任务 id → { owner, date, kind }。周末那几条 id 挂在那一周的起点上，不一定是任务当天 */
export function taskIdParts(id) {
  const [owner = '', date = '', kind = ''] = String(id || '').split('|');
  return { owner, date, kind };
}

/**
 * 某一天的完成概况，日历上的点、历史清单都用它。
 * 跳过算"处理过"，不算欠账；过了这一天还没勾的才算 missed。
 */
export function dayTally(items = [], doneMap = {}, date, today) {
  let done = 0;
  let skipped = 0;
  let missed = 0;
  let pending = 0;
  for (const it of items) {
    const st = doneMap?.[it.id];
    if (st?.done) done++;
    else if (st?.skipped) skipped++;
    else if (date < today) missed++;
    else pending++;
  }
  return { total: items.length, done, skipped, missed, pending, closed: done + skipped };
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

export function compassWord(deg) {
  const n = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  return n[Math.round((((Number(deg) || 0) % 360) / 45)) % 8];
}

/**
 * 「怎么浇」的说明：只讲动作，不讲毫升。
 * 浇到底孔出水 = 土回到持水量，这是唯一的标准；倒进去多少由盆和土决定，不用数。
 */
export function wateringHowTo(plant) {
  const dr = plant.pot?.drainage;
  const tray = plant.pot?.saucer
    ? '托盘里的水 15 分钟内倒掉'
    : '没托盘就垫个盘子，别让水淌到地上';
  if (dr === 'no') {
    return '无孔盆浇不到底孔出水：连土球扣进有孔的盆里，浇透、沥干，再放回无孔盆（套盆法）。'
      + '做不到就分 3 次沿盆边慢浇、每次间隔 5 分钟，别让盆底积水。';
  }
  return '沿盆边慢慢浇，先浇一遍等水渗下去，停 5 分钟再浇第二遍，一直浇到盆底开始出水为止'
    + '——底下流走的那点是正常的，土吸饱了才会漏。只浇土，别淋花苞和叶面；'
    + `${tray}。`;
}

/* ------------------------------------------------------------ 状态文案 */

export function plantVerdict(plant, plan, sun, day, site = null) {
  const out = [];
  const wt = plan.dutyTime || plan.nextTime;
  const wd = plan.dutyDate || plan.nextDate;
  const dl = Number.isFinite(plan.dutyDaysLeft) ? plan.dutyDaysLeft : plan.daysLeft;
  if (plan.overdue) out.push({ tone: 'warn', text: `盆土水已耗尽约 ${plan.overdueDays || 1} 天，尽快浇透（底孔出水）` });
  else if (dl === 0) out.push({ tone: 'due', text: `今天 ${wt} 浇透（浇到底孔出水）` });
  else if (dl === 1) out.push({ tone: 'soon', text: `明天 ${wt} 浇透，今晚把水接好` });
  else out.push({ tone: 'ok', text: `还有 ${dl} 天（${monthDay(wd)} ${wt}）才需要浇` });

  if (sun) {
    if (sun.indoor) {
      const pct = Math.max(0, Math.round((sun.dli / sun.need) * 100));
      const route = sun.tripHours
        ? `走廊 ${sun.homeRouteDli} + ${sun.tripLabel} ${sun.tripHours} 小时 ${sun.tripDli}`
        : sun.note;
      if (sun.tripHours) {
        if (sun.verdict === '充足') out.push({ tone: 'ok', text: `${route}，今日总光量 ${sun.dli}，够了（${plant.name}需要 ${sun.need}）` });
        else if (sun.verdict === '勉强') out.push({ tone: 'soon', text: `${route}，今日总光量 ${sun.dli}，勉强够（需要 ${sun.need}）；阴雨天搬不出去时会掉到走廊那一档` });
        else out.push({ tone: 'warn', text: `${route}，今日总光量只有 ${sun.dli}，只到需要的 ${pct}%，得再想办法补光` });
      } else if (sun.tripSkipped) {
        out.push({
          tone: sun.verdict === '不足' ? 'soon' : 'ok',
          text: `${sun.note}，今日总光量 ${sun.dli}，今天没搬出去（没有直射窗口或天气不允许），只到需要的 ${pct}%`,
        });
      } else if (sun.verdict === '不足') {
        out.push({ tone: 'warn', text: `${sun.note}，今日总光量 ${sun.dli}，只到${plant.name}需要的 ${sun.need} 的 ${pct}%，长期这样${plant.traits.bloom ? '会掉苞' : '会徒长、叶色变淡'}` });
      } else if (sun.verdict === '勉强') {
        out.push({ tone: 'soon', text: `${sun.note}，今日总光量 ${sun.dli}，勉强够，别再往暗处挪` });
      } else {
        out.push({ tone: 'ok', text: `${sun.note}，今日总光量 ${sun.dli}，够用` });
      }
    } else if (sun.verdict === '不足') out.push({ tone: 'warn', text: `今天盆位日照只有 ${sun.directHours} h、DLI≈${sun.dli}，低于${plant.name}需要的 ${sun.need}` });
    else if (sun.verdict === '勉强') out.push({ tone: 'soon', text: `日照 ${sun.directHours} h 偏少，能晒到的时段别错过` });
    else out.push({ tone: 'ok', text: `日照 ${sun.directHours} h / DLI≈${sun.dli}，够用` });
  }
  if (day) {
    // 判冷按"它现在待的地方"折算，只有接近冰点（roomLine）才提示搬；普通凉夜不出声
    const tmin = day.tmin ?? 12;
    const at = (plant.care?.place || 'balcony') === 'corridor' ? corridorNightC(site, tmin) : tmin + BALCONY_WARM_C;
    const line = roomLine(plant.traits?.minNightC ?? 5, site);
    if (at < line) {
      out.push({ tone: 'warn', text: `今夜${plant.care?.place === 'corridor' ? '走廊' : '阳台'}约 ${at}℃（室外 ${tmin}℃），接近冰点，搬进实验室` });
    }
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
