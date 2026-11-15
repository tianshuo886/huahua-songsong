// 太阳位置（NOAA 低精度算法，误差 <0.05°，够用来算阳台遮挡）
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** 把角度归一化到 [0,360) */
export const norm360 = (d) => ((d % 360) + 360) % 360;

/** 两个方位角之间的最小夹角（带符号，-180..180） */
export function angDiff(a, b) {
  let d = norm360(a) - norm360(b);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * 太阳位置
 * @param {number} ms  时间戳（UTC 毫秒）
 * @param {number} lat 纬度
 * @param {number} lon 经度
 * @returns {{alt:number, az:number}} 高度角/方位角（度）；方位角自正北顺时针
 */
export function sunPosition(ms, lat, lon) {
  const jd = ms / 86400000 + 2440587.5;
  const n = jd - 2451545.0;

  const L = norm360(280.46 + 0.9856474 * n);
  const g = norm360(357.528 + 0.9856003 * n) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;

  const sinDec = Math.sin(eps) * Math.sin(lambda);
  const dec = Math.asin(sinDec);
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) * DEG;

  const gmst = norm360(280.46061837 + 360.98564736629 * n);
  let H = norm360(gmst + lon - ra);
  if (H > 180) H -= 360;
  H *= RAD;

  const latR = lat * RAD;
  const alt = Math.asin(
    Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(H),
  ) * DEG;

  const azS = Math.atan2(
    Math.sin(H),
    Math.cos(H) * Math.sin(latR) - Math.tan(dec) * Math.cos(latR),
  ) * DEG;

  return { alt, az: norm360(azS + 180) };
}

/**
 * 一天的日照几何：阳台栏板遮挡后的直射小时数
 * @param {object} o
 * @param {Array<{ms:number, cloud:number}>} o.samples 逐小时样本
 * @param {number} o.lat
 * @param {number} o.lon
 * @param {number} o.azimuth 阳台朝向（外法线方位角）
 * @param {number} o.parapetCm 栏板高
 * @param {number} o.potTopCm 盆土面离地高
 * @param {number} o.depthCm 盆中心到栏板内侧的水平距离
 */
export function sunExposure({ samples, lat, lon, azimuth, parapetCm, potTopCm, depthCm, parapetType, sideWallM }) {
  const opts = { parapetType };
  const depthM = Math.max(0.12, depthCm / 100);
  // 两侧有墙时，可见方位窗口会收窄：atan(到侧墙的距离 / 进深)
  const maxAz = Number(sideWallM) > 0
    ? Math.min(92, Math.atan(sideWallM / depthM) * DEG)
    : 92;
  // 实心栏板会挡住低角度阳光；栏杆有缝隙时基本不挡，只剩方位角限制
  const railing = !!opts.parapetType && opts.parapetType === 'railing';
  const clearance = railing ? 0 : Math.max(0, (parapetCm - potTopCm) / 100); // m
  const depth = Math.max(0.12, depthCm / 100); // m
  const minTan = railing ? 0 : clearance / depth;

  let directHours = 0;      // 几何上能晒到的小时（未打折）
  let effectiveHours = 0;   // 按云量打折后的等效小时
  let daylightHours = 0;
  let best = { alt: -90 };
  const trace = [];

  for (const s of samples) {
    const pos = sunPosition(s.ms, lat, lon);
    if (pos.alt <= 0) continue;
    daylightHours += 1;
    if (pos.alt > best.alt) best = pos;

    const dAz = angDiff(pos.az, azimuth);
    const facing = Math.abs(dAz) <= maxAz;
    // 阳光斜射时，栏板阴影在"垂直栏板"方向上的投影会缩短：乘 cos(斜角)
    const oblique = Math.max(0.2, Math.cos(Math.abs(dAz) * RAD));
    const clearsParapet = Math.tan(pos.alt * RAD) >= minTan * oblique;
    const lit = facing && clearsParapet;
    const cloud = Math.max(0, Math.min(100, s.cloud ?? 50));
    const directFactor = 1 - 0.75 * (cloud / 100);

    if (lit) {
      directHours += 1;
      effectiveHours += directFactor;
    }
    trace.push({ hour: s.hour ?? new Date(s.ms).getHours(), alt: pos.alt, az: pos.az, lit, cloud });
  }

  return {
    maxAz: Math.round(maxAz),
    directHours: Math.round(directHours * 10) / 10,
    effectiveHours: Math.round(effectiveHours * 10) / 10,
    daylightHours,
    noonAlt: best.alt > -90 ? Math.round(best.alt) : null,
    noonAz: best.az ?? null,
    minTan: Math.round(minTan * 100) / 100,
    trace,
  };
}

/**
 * 由日辐射总量粗估 DLI（mol/m²/d）：1 MJ/m² 全辐射 ≈ 2.1 mol PAR
 * 再用遮挡/散射透过率折算到盆的位置
 */
export function estimateDli({ radiationMJ, directHours, daylightHours, covered, diffuseIn, directIn }) {
  const dliOut = 2.1 * (radiationMJ || 0);
  const day = Math.max(1, daylightHours);
  const sunFrac = Math.min(1, directHours / day);
  // 散射透过率：默认值只是经验数，实测后可以由调用方传进来校准
  const diffuse = Number.isFinite(diffuseIn) ? diffuseIn : (covered ? 0.22 : 0.32);
  // 有直射时一定比纯散射更亮；露天阳台无玻璃无遮挡，两者都可接近 1
  const direct = Number.isFinite(directIn)
    ? Math.max(directIn, diffuse)
    : Math.max(covered ? 0.62 : 0.85, diffuse + 0.05);
  const trans = diffuse + (direct - diffuse) * sunFrac;
  return Math.round(dliOut * Math.min(1, trans) * 10) / 10;
}
