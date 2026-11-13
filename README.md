# 花花和松松

> 一盆重瓣黄的长寿花，一盆小叶罗汉松，住在钱塘的一间朝北走廊里。

一个替它们看天、算水、记花事的本机小站。手绘插画由另一条会话生成，前端做了尺寸适配。

一个跑在自己 Mac 上的小型养护看板。手机连同一个 WiFi 就能打开，两端的记录实时同步。
不是通用园艺 App，是专门按**你这几盆花**的真实参数（盆径、根球占比、排水、阳台几何）算出来的。

```
电脑：http://127.0.0.1:7788
手机：http://<这台 Mac 的局域网 IP>:7788
```

---

## 一、怎么启动

```bash
cd ~/Documents/杭电研/tian/plant-care
node server.js
```

或者双击 `start.command`（会自动打开终端并启动）。
关掉终端窗口服务就停；想让它常驻，可以 `nohup node server.js > /tmp/plant.log 2>&1 &`。

启动后终端会打印两个地址，手机用**局域网那个**（需要同一个 WiFi，且 macOS 防火墙放行 node）。

## 二、它到底在算什么

### 1）一次浇多少 ml

```
盆容积 V = π·h/12 · (D² + Dd + d²)      // 圆台，D 盆口、d 盆底、h 盆高
满盆浇透 = V × 根球占盆比 × 0.28         // 从"该浇了"到"饱和"之间的那部分
本次给水 = 满盆 × 给水比例                 // 有孔 100% / 待确认 60% / 无孔 45%
```

| 植物 | 盆 | V | 满盆 | 比例 | 本次 | 日耗(走廊) | 间隔 |
|---|---|---|---|---|---|---|---|
| 长寿花 | 13×10×12 | 1253 ml | 350 ml | 60% | **210 ml** | 30 ml | ≈7 天 |
| 罗汉松 | 11×9×10.5 | 827 ml | 170 ml | 100% | **170 ml** | 18 ml | ≈9 天 |

**"满盆"和"本次"不是一回事。** 满盆是把整盆土从近干浇到饱和的量；但长寿花须根缺氧 48 h 就褐变，
盆又不透气，所以只能分次给（60%），靠缩短间隔补回来——两者每天的总水量是一样的
（210÷7 ≈ 350÷13 ≈ 30 ml/天）。想一次浇透，必须先套盆换成有孔盆。

### 场地系数

`dailyUse = 基准 × ET₀/1.3 × 校准 × 场地系数`（阳台 1.0 / 走廊 0.65 / 室内 0.5）。
走廊没风、没直射、湿度高，蒸发明显慢。降雨补偿只在"阳台 + 露天"时计入。

### 2）多久浇一次

```
日耗 = 基准日耗 × (今天 ET₀ / 1.3) × 校准系数
```

`ET₀` 直接来自天气预报（FAO 参考蒸散量），所以晴天浇得勤、阴雨天自动拉长。
下雨且盆在露天时，按盆口面积把雨水折算成补水（打 6 折，叶冠会截留）。

**校准**：跳过一次浇水任务，选"还湿"→ 系数 ×0.88；选"已经干透了"→ ×1.12。
每株单独记录，越快用越准。

### 3）晒到多少太阳

用太阳方位角/高度角 + 栏板高度 + 盆位进深算遮挡，斜射时用 `cos(斜角)` 修正阴影投影。
输出「盆位直射小时数」和 DLI（mol/m²/d），并直接反解**要垫多高才够 3 小时**。

这一项对输入极其敏感：**朝向设错，结果全错**。
朝南 180° 配 110 cm 栏板 + 70 cm 进深，11 月盆放地上只有 0 小时，垫到 50 cm 才有 3 小时。
**朝北（0°）则整个 11 月零直射**，垫多高都没用。

放在走廊/室内时不算直射，只算散射：`DLI = 室外 DLI × 走廊透光率`（默认 18%，可调）。
测法：手机测光 App 同时量门口和阳台的照度，比值就是透光率。

## 三、必须填对的三个参数

设置页 → 阳台几何 / 植株参数：

1. **阳台朝向**（手机指南针贴栏板朝外测）
2. **盆口内径**（尺子量，直接决定 ml）
3. **是否有排水孔**（决定能不能浇透）

这三项没填对，数字就是错的。其余都有合理默认值。

## 四、拍照与 AI 诊断

照片存在 `data/photos/`，浏览器上传前会压到 1500 px JPEG。
点「让模型看看」时，服务端把照片 + 当时的养护数据（几天没浇、剩余水分、7 天温湿度/ET₀/日照）
一起发给视觉模型，要求按固定 JSON 返回健康分、征象、处置建议。

**Key 只存在这台 Mac 的 `data/config.json`，不会下发到浏览器。**

**当前配置的是本机 magpie 网关**（和这个对话同一个模型、同样 `reasoning_effort: max`）：

| 项 | 值 |
|---|---|
| Base URL | `http://127.0.0.1:3425/v1` |
| 模型 | `commandcode-plan/deepseek/deepseek-v4.1-flash` |
| 口令 | `magpie`（本地网关的固定口令） |
| 思考强度 | `max`，max_tokens 4000 |

⚠️ 这个网关只在 **magpie / DSH 运行时**存在。DSH 关掉后照片分析会报"连不上网关"，
但浇水、光照、任务这些计算全在本地，照常工作。

⚠️ `max` 档的思考会吃满输出额度：实测一次约 1.6k 思考 token + 0.2k 输出。
`max_tokens` 给 1000 会返回空内容，所以设成 4000。一次约 20 秒。

设置页也有其它服务商预设：

| 服务商 | Base URL | 常用模型 |
|---|---|---|
| 本机 magpie | `http://127.0.0.1:3425/v1` | `commandcode-plan/deepseek/deepseek-v4.1-flash` |
| 通义 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-vl-max` |
| 智谱 | `https://open.bigmodel.cn/api/paas/v4` | `glm-4v-plus` |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k-vision-preview` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |

只要是 OpenAI 兼容的 `/chat/completions` + 支持 `image_url` 的模型都能接。

## 五、提醒的边界（说清楚）

- 浏览器通知只在**页面开着**时弹。手机走 `http://局域网IP` 属于非安全上下文，
  iOS/Chrome 不会给通知权限——所以真正靠得住的是：**每天早上打开看板** + **导出的 .ics**。
- `.ics` 里有 14 天任务和提前 10 分钟的闹钟，导进手机日历就是系统级提醒。
- 逾期的任务不会消失，会标红一直留着。

## 六、数据与备份

```
data/
  state.json      全部状态（植株、记录、任务完成情况、照片索引）
  config.json     视觉模型的 baseUrl/model/key（0600 权限）
  photos/         照片原图
```

备份整个 `data/` 目录即等于备份全部。设置页也能导出/导入 JSON（不含照片文件）。

## 七、目录

```
server.js            零依赖 Node 服务：静态文件 + state/photos/weather/analyze
public/index.html
public/css/app.css
public/js/solar.js   太阳位置与遮挡几何（NOAA 算法）
public/js/model.js   盆容积、水分收支、日照、任务生成（纯函数，可单测）
public/js/app.js     界面与交互
```

`model.js` 和 `solar.js` 没有任何 DOM 依赖，可以直接 `node --input-type=module -e` 调着算。

## 八、写保护（可选）

设了 `PLANT_TOKEN` 环境变量、或项目根目录放了 `.token` 文件，就会开启写保护：
GET 随便读，改数据要口令。带口令打开一次后浏览器会记住：

```
http://127.0.0.1:7788/?t=你的口令
```

不想要就删掉 `.token` 再重启。

## 九、常见问题

**手机打不开？**
1. 确认同一个 WiFi（宿舍/教研室的路由器，不是访客网络）；
2. 校园网常常开启**客户端隔离**，手机和 Mac 互相 ping 不通——这种情况用手机热点给 Mac 连，或换个路由器；
3. macOS 首次运行会弹"是否允许 node 接受传入连接"，要允许。

**数字看起来不对？**
先检查这三项：阳台朝向、盆口内径、有没有排水孔。改完立刻重算。
另外 `11 月 12 日 ET₀=1.32`，一盆 13 cm 的长寿花日耗约 41 ml，可存 350 ml，所以 9 天才浇——这是秋天该有的节奏，
不是模型偷懒。到了 6 月 ET₀ 会到 4–5，同一盆就变成 2–3 天一次。

**照片会占空间吗？**
上传前压到 1500 px JPEG，一张 200–400 KB，一年 100 张也就 40 MB。

**能不能换城市？**
设置页改经纬度即可，天气和日照会跟着变。

## 九、让别人也能打开（公网访问）

本机跑的服务，别人打不开是正常的——你家/学校网络没有公网 IP。三种做法：

### A. 临时公网隧道（已配好，双击就能用）

```bash
./share.command
```

它会依次启动服务、建 Cloudflare 隧道，然后打印两个链接：

- `https://xxx.trycloudflare.com/?t=<口令>` —— **自己用**，能改数据
- `https://xxx.trycloudflare.com` —— **发给别人**，只读

特点：Mac 必须开着；关闭后地址失效，重开会拿到**新地址**；免费、无需注册。

### B. 固定地址（推荐长期用）

1. 有域名的话，`cloudflared tunnel login` → `cloudflared tunnel create plant`
   → `cloudflared tunnel route dns plant plant.你的域名.com`
   → 用 `config.yml` 跑命名隧道，地址就固定了。
2. 或者买台最便宜的云服务器（轻量 24 元/月），把整个目录扔上去跑 `node server.js`，
   前面挂 Caddy 做 HTTPS。国内服务器走 IP:端口不需要备案，用域名 80/443 要备案。

### C. 纯静态只读（不需要 Mac 开机）

把当前状态导成一个静态站点丢到 Netlify / GitHub Pages，只能看不能改。
适合“就想给大家看看我的花”，不适合打卡。

### 写保护是怎么做的

`server.js` 里有个 `TOKEN`（从 `.token` 文件读）。设了以后：
- `GET` 全部放行——谁都能看；
- 写操作（改状态、上传照片、调模型）必须带 `x-plant-token` 头或 `?t=` 参数，否则 401。

浏览器第一次用 `?t=口令` 打开会把口令存在 localStorage，并自动把地址栏里的 `?t=` 抹掉，
免得你截图分享时把口令漏出去。别人打开就是干净的只读页面。

改口令：编辑 `.token`（随便一串），重启服务即可。

## 十、Tailscale 私网访问（自己用，已配好）

这台 Mac 已在 tailnet 里：

- 主机名 `5988`，IPv4 `100.x.y.z`
- 花花和松松：`http://<你的 tailnet 域名>:7788`（推荐）或 `http://100.x.y.z:7788`

手机装 Tailscale、登同一个账号（erren364@gmail.com），任何网络下都能直接打开，
不需要公网暴露、不需要域名、不需要开着 Cloudflare 隧道。

**登录自启**：`~/Library/LaunchAgents/com.shentianshuo.plantcare.plist` 已写好，
下次登录会自动 `node server.js`。想立刻启用：

```bash
# 先停掉手动跑的那个，再加载
pkill -f "node server.js"
launchctl load -w ~/Library/LaunchAgents/com.shentianshuo.plantcare.plist
```

**出口节点**（让手机流量走 Mac）：

```bash
sudo /Applications/Tailscale.app/Contents/MacOS/Tailscale up --advertise-exit-node --accept-dns=true
```

然后去 https://login.tailscale.com/admin/machines → 这台机器 → ⋯ → Edit route settings
→ 勾选 **Use as exit node**；手机 Tailscale App 里选它为 Exit node。
