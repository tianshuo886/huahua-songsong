# 花花和松松 · 给后续 Agent 的交接说明

本地运行的植物养护看板：一盆长寿花（花花）、一盆小叶罗汉松（松松）。
零依赖 Node 服务 + 原生 JS 前端，数据全在本机。

## 启动与重启

服务由 launchd 托管（`~/Library/LaunchAgents/com.shentianshuo.plantcare.plist`），
开机自启、退出终端也不会停。

```bash
# 改了 server.js 之后重启
launchctl kickstart -k gui/$(id -u)/com.shentianshuo.plantcare

# 改了 public/ 下的任何文件：不用重启，静态直出，刷新即生效
```

地址：
- 本机 `http://127.0.0.1:7788`
- 局域网 `http://<本机局域网 IP>:7788`（同一 WiFi）
- 外网 `https://<你的 tailnet 域名>`（Tailscale serve，需要 Tailscale 在跑）

## 口令与数据

- 写操作要口令：根目录 `.token`。请求头 `x-plant-token`，或 URL `?t=`，浏览器会记在 localStorage 的 `plant_token`。
- `data/` **不进 Git**：`state.json`（植株/任务/记录）、`photos/`、`config.json`（含视觉模型 API key）。
- 备份 = 拷 `data/` 整个目录。

## 图片约定

```
public/img/<组>/          产品图（压过，进 Git）
public/img/_source/<组>/  原始大图（不进 Git，仅留底）
```

- 新增图片：先按 `prompt.md` 生成 1024 方图（场景 1376×768），**原图先放进
  `public/img/_source/<组>/`**，再跑 `python3 tools/reencode-img.py <组>` 生成产品图，
  最后改 `public/js/app.js` 里的映射：天气 `weatherIconImg()`、植株 `PLANT_ASSETS`、
  校园画卷 `CAMPUS_BANNERS`（节日/节气要写 `match: (m,d)=>...`）。
- 压图口径（`tools/reencode-img.py` 已固化，别手工压）：
  - 场景图、植株图：**原尺寸不缩，q85**。横幅大屏容器约 782px 宽，Mac 高清屏要 1564px，
    原图 1376px 本来就不够，所以绝不缩小。
  - 图标（weather/status/actions）：缩到 **384px 正方形**，q85。页面最大 48px 显示，
    DPR2 只要 96px，384 留足余量又不浪费；换图标时**必须保持正方形**（页面用 50% 圆角裁切）。
  - 场景图里只按小尺寸显示的（`scene_empty_state.jpg`，空状态 96px）也走 384，别整张 1024 塞进页面；
    名单在 `tools/reencode-img.py` 的 `SMALL_SCENES`。
  - 用 **Pillow** 编码，别用 `sips`：`sips -s formatOptions` 会把质量档合并
    （q80/82/84 输出同样字节，q85–90 也一样），压不出真正的 q85。
  - 编码参数 `optimize=True, progressive=True`：渐进式先出轮廓，弱网观感更好。
- 自查：`python3 tools/reencode-img.py --dry-run` 只看体积变化，不写文件。
- 缺图不会显示裂图：天气图标有「借近似图 → emoji」的兜底。

## 代码地图

| 文件 | 职责 |
|---|---|
| `server.js` | 静态文件 + `/api/state` `/api/photos` `/api/weather`（代理 open-meteo，先给缓存后台刷新）/ `/api/analyze`（视觉模型代理，key 只在服务端） |
| `public/js/model.js` | 浇水（盆容积→能存多少水→日耗→下次浇水日**与钟点**）、光照、每日任务生成。纯函数，无 DOM，可在 node 里直接测 |
| `public/js/solar.js` | 太阳位置（NOAA）与栏板遮挡几何 |
| `public/js/app.js` | 全部界面与交互 |
| `public/css/app.css` | 样式，桌面断点 900 / 1100px |
| `tools/reencode-img.py` | 按统一口径从 `_source/` 重出产品图（场景/植株 q85 不缩，图标 384px q85） |
| `worker/index.js` | Sites 线上版 Worker：同一套 `/api`，状态/照片/配置/天气缓存落 D1 |
| `scripts/prepare-sites-build.mjs` | 生成 `dist/client`、`dist/server/index.js`、`dist/.openai/hosting.json` |

几个关键模型参数：`traits.targetWetDays`（想让它几天干一次，只用来反解 kTrans）、`pot.refill`
（**只对无孔盆有意义**；有孔盆一律浇透）、`site.corridorLight`（走廊相对北阳台的透光率，实测 0.37）、
`site.waterWindow`（人能到现场的时间窗，默认 08:00–19:00，浇水钟点只在里面挑）、
`site.dayTrip`（每天的西阳台外出台：窗口、栏板、**有顶棚 4 m**——散射 0.65 / 直射 1.0，见下）。

光照和耗水的口径：`sunPlan()` 把「走廊时段 × 走廊透光率 + 西阳台时段 × 露天光」按逐小时辐射
拼成当天的今日总光量；时段优先取 `site.moveLog`（搬完点按钮 / 勾搬动任务记录的实际时间），
没有记录时才回落到 `tripDayInfo()` 的计划窗口。`dailyUseMl()` 的蒸腾项直接用这个值。
天气页「未来 9 天」的表格仍用 `{ withTrip: false }` 按单个地点算，下面的总光量曲线才是合计。
外出台是否成立由 `tripDayInfo()` 判定，任务生成和计划兜底共用同一套规则。

周末位置：`weekendPlacement()`（model.js）只回答两件事——**原地待着**，还是**急降温搬进房间**。
周末人不来，就不比"哪个位置更好"：两盆停在哪（走廊 / 西阳台）就在那儿待两天，**一条任务都不生成**。
唯一例外是温度：按它们现在待的地方折算夜里温度（阳台 = 露天那档 `BALCONY_WARM_C=0`，走廊 = 半室内 +5℃），
低于 `roomLine()`（耐受线再下 `site.roomMoveBelowC`、默认 5℃、接近冰点）才周五下班搬进房间、周一搬回。预报没跟上、临时发现要冻，
同样是这条触发（温度一变，第二天就会提示）。

- 判冷：`corridorNightC()`（走廊 +`site.corridorWarmC`）和阳台（`BALCONY_WARM_C`，就是露天）**分别算**，
  `coldLine(place, minNight, site)` 统一取 `roomLine(minNight, site)`。阳台比走廊冷是常态，别拿一个数套三个地方。
  界面上的判冷（`plantVerdict`、日期面板、天气卡）也必须走这两个函数，别再写 `tmin < 8` 这种硬编码。
- 工作日：走廊为主；有直射窗口的下午去西阳台（`tripDayInfo()`），傍晚搬回走廊；走廊夜里低于 `roomLine()`
  才搬进实验室（`moveIn` 17:00），回暖那天 08:00 搬回走廊。
- 外出台按 `currentMovePlace()` 接着算：开场就在外面，就不再排早上"搬出去"，只排傍晚"搬回来"；
  周五碰上"周末原地待着"不生成收工任务；西阳台过周末的周一也不早上搬，傍晚收工那趟一起回来。
- 周末不生成外出台：`tripDayInfo()` 对周六周日直接返回 null（真要搬，设 `dayTrip.onWeekend=true`）。
- 光：走廊走 `sunPlan({withTrip:false})`，西阳台走 `sunPlan()` 的逐小时拼接——**西阳台不是露天**：
  有顶棚、只有栏杆那面敞口，散射按 `dayTrip.diffuse` 折损，直射只在 `shinedAt()` 判定真能斜射进来时才算
  （实测顶棚约 4 m 高，几乎不挡直射；起作用的是一面敞口和侧墙方位）。
- 风向 `wind_direction_10m` 由 server 一起向 open-meteo 要，老缓存没这个字段时按无风处理。

天气口径：`server.js` / `worker/index.js` 的 `withTempMedian()` 会再拉一次
`models=ecmwf_ifs025,gfs_seamless,icon_seamless`，把日最低/最高温的**中位数**写进 `daily.tminMed/tmaxMed`，
`indexWeather()` 优先用它。单靠 `best_match` 时这片区域比中央气象台低 4℃ 左右（11/20 夜间 3.5 vs 官方 7），
会误判"阳台太冷不能放"。判冷时阳台按露天算（`BALCONY_WARM_C=0`）、走廊 +5℃，别混用。

待办历史：`state.taskHistory`（`{ 'YYYY-MM-DD': { 任务id: {kind,title,time,plantId,bf?} } }`）是每天的任务快照，
`recordTaskHistory()`（app.js，每次 `loadAll` 跑一次）写入、只留 120 天；完成状态不复制，仍只认 `tasksDone`。
`backfillHistory()` 把老 `tasksDone` 的 id（id 里带日期）回填成历史，并打 `bf:1`——`dayIsKnown()` 为假的日子
不判欠账、不标红点（只代表"勾过的那些"，缺的不等于没做）。日历圆点和「以前没做完的」卡片都读这份快照，
完成概况统一走 `M.dayTally()`，别在界面里各算一套。
日历圆点只给**已经过去且还有没做完**的日子（`date < today && tally.missed > 0`），未来的不标。
空日子要分清是哪一种空，走 `emptyDayText()`：看板还没开始记 / **周末本来就不排任务** / 还没算到 / 那天没记下来——
别一律说成「历史没记到」。
日弹窗（`openDaySheet`）直接用 `taskRow(t, { history: date })` 画，和「今日」同一套行（图标、徽章、勾选）——
别再另写一套 `hist-row`。老回填记录只存过 `kind`，标题由 `kindTitle()` 补（「搬去晒」那种是类型名，不是任务名）。
`recordTaskHistory()` 对**还没过去**的日子会在每次重算后刷新（钟点、文案会变），过去的日期写进去就不再覆盖。
清单可以补勾（`toggleDay` → `toggleHistoryTask`）：历史任务不在 `S.tasks` 里，要用当天快照造一个再走
`applyTaskState()`；补勾过去的浇水按**那天的日期**记账（只往前推、不回拨），别写成今天。

## Sites 云站点

- 线上地址：`https://<你的站点域名>`；Sites 项目 ID 在 `.openai/hosting.json`。
- Sites 项目复用这套前端；`worker/index.js` 与 `server.js` 的接口契约要保持一致，改 `/api` 时两边一起改。
- 发布前跑 `npm run build:sites`。产物是 `dist/client`、`dist/server/index.js`、`dist/.openai/hosting.json`。
- `dist/`、`site.tar.gz` 不进版本库；`data/` 仍是本地运行时数据，不随站点发布。
- 线上持久化在 D1，不读写本地 `data/`。站点第一次初始化可读 Sites 环境变量 `SEED_STATE_JSON`，之后以 D1 为准。
- `.openai/hosting.json` 只放 `project_id` 与逻辑 `d1`/`r2` 绑定；密钥和运行时变量只在 Sites 环境配置。
- Sites 源码仓库：`https://<Sites 源码仓库>`，发布分支 `main`。
- 更新发布：`npm run build:sites` → 以 Sites 远端 `main` 为父提交做源码快照并推送 → `npm run package:sites` →
  `save_version_and_deploy_private` 同一 `project_id` → 轮询 `get_deployment_status`。不要把短时写入凭据写进远程 URL 或 Git 配置。

## 浇水口径（2026-11 改）

- **浇到底孔出水 = 浇透**，任务和弹窗里不再写「倒 N ml」。`availableWaterMl()` 那个数是
  「这盆土吸饱后能给根用多少水」，只用来算**隔几天再浇**，不是让人照着倒。
- `watersToDrain(plant)`：有孔/待确认一律 true；无孔盆 false（物理上浇不到出水，走套盆或按 `refill` 给）。
- 记账：`care.lastWaterToDrain=true` + `lastWaterMl=capacity` 才算「浇透」；没浇透的旧记录按 `pourEfficiency` 折算。
- 下次浇水日 = 盆里存水按天气逐日扣到 0 的那天（不是第二天）；`intervalDays = capacity / 预报期平均日耗`。
- 浇水钟点由 `wateringTime()` 算，不写死 8:30，**按当天最高温分三档**（`HOT_REGIME_C=28` / `COLD_REGIME_C=14`）：
  热天 → 傍晚（`15:30–日落前半小时`，越晚越好，热天不再要求 2.5 h 干燥窗口，只要求别浇到天黑）；
  冷天 → 上午（`08:30–11:00`，挑 09:30–10:30 最暖的那半小时，浇完留足排水回温时间）；
  温和天 → 早上（5–9 点口径）。三档里再按逐小时土温（24 h 气温 EMA，τ=8 h）、气温、辐射、
  外出台落地 1 h、雨后 3 h 降水、`site.waterWindow` 一起打分。
  盆已经在西阳台（`currentMovePlace` 是 trip）时按"就在那儿浇"算：土温不再加走廊的温差，
  「先在家浇完再搬」那条理由也不出现。
  依据写在 model.js「浇水钟点」那段注释里（ISU Extension 5–9 点、RHS 凉爽时段、根区 10–12℃）。
  `schedule.waterMode='fixed'` 时才用 `schedule.water`。
- 勾任务记浇水：当天/以后 → 记 `now`；**补勾过去的日子 → 记那天的日期**（只往前推、不回拨），别写成今天。
- **重设起点**：探土弹窗里第三条「土已经干透 · 从下一次浇透重新记账」（`resetToDry`，app.js）只写
  `care.lastSoilDryAt` + `baselineResetAt`、**不动** `calibration.factor`——上次没浇透时拿旧账去校正耗水
  只会越算越歪。remains 归零后 × 到岗日顺延，下一次浇透就是新基准。
- 2026-11-15 起两盆的基准都重设过（11/12 那次花花只有 340 ml、没浇透），正式基准 = **11/16 周一 08:00 浇透**。

休息日：周六周日不在实验室，`buildTasks` 那两天**不生成任何"需要人到场"的任务**——巡霉、拍照、施肥、
测光、走廊↔房间的搬动、外出台全部跳过。有截止日的（浇水/备水/探土、拍照周期）用 `isRestDay()` 判断，
`workdayOnOrBefore()` 把落在周末的到期日提前到周五（"本来周日到期，改到周五"写进 why），
`workdayOnOrAfter()` 把已经过期的顺延到下一个到岗日，别让该做的事静默消失。任务 id 跟着挪后的日期走。

## 约定

- 注释写中文；不引第三方前端依赖；改完跑 `node --check` 对应文件。
- 别动 `data/`、`.token`、`img/_source/`——它们是运行时数据和备份，不进版本库。
- 提交信息用 `feat/fix/chore(scope): 说明` 格式。
