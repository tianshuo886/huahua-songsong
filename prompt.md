# 植物管家 · 视觉出图提示词库 (prompt.md)

本文件整理了「植物管家 (Plant Care)」全站所需的手绘线条插画提示词，风格统一定制，可直接用于 AI 图像生成模型。

---

## 🎨 统一风格系统规范 (Base Style)

> **Style Guideline**:
> Minimalist hand-drawn doodle line art, clean single-weight round-cap monoline ink drawing (#2C5F45 dark forest green), on solid warm cream textured paper background (#F7F4EC). Limited restrained color palette: Forest Green (#2C5F45), Brass Gold (#B8871B), and Soft Misty Blue (#376A83). Warm, slightly wobbly charming hand-drawn feel (Scandinavian doodle / Japanese stationery illustration). Cute anthropomorphic touch where appropriate. Flat 2D vector appearance, no gradients, no 3D rendering, no shadows, no photorealism, no text or typography. Centered composition with generous white space.

---

## A 类｜天气与状态图标 (Weather & Status Icons)

### A1. 天气 9 种状态（带拟人表情）
| 文件名 | 对应状态 | 提示词 (Prompt) |
|---|---|---|
| `weather/icon_weather_sunny.png` | 晴天 (0) | A cute happy smiling sun icon in a simple minimalist hand-drawn monoline art style. Drawn entirely with a single-weight clean dark forest green outline (#2C5F45) on a solid warm cream background (#F7F4EC), subtle brass gold (#B8871B) tone. Sweet smiling face with two closed curved happy eyes and smiling mouth, surrounded by clean radiating hand-drawn rays. Charming and friendly doodle. Flat, no 3D, no text. |
| `weather/icon_weather_cloudy.png` | 少云 (1-2) | A cute hand-drawn monoline doodle icon of a partly cloudy sky. A soft fluffy cloud with a gentle smiling face peeking beside a small warm sun. Minimalist Scandinavian doodle art, drawn with clean dark forest green monoline outline (#2C5F45) on a solid warm cream paper background (#F7F4EC), subtle touch of brass gold (#B8871B) on the sun. Flat 2D vector style, charming round strokes, no 3D, no text. |
| `weather/icon_weather_overcast.png` | 阴天 (3) | A cute hand-drawn monoline doodle icon of an overcast cloud. A cozy chubby cloud with a cute sleepy or yawning face (shutting eyes peacefully). Minimalist Scandinavian doodle art, drawn with clean dark forest green monoline outline (#2C5F45) on a solid warm cream paper background (#F7F4EC), subtle touch of soft misty blue (#376A83). Flat 2D vector style, charming round strokes, no 3D, no text. |
| `weather/icon_weather_fog.png` | 雾天 (45-48) | A cute hand-drawn monoline doodle icon of mist and fog. A round little cloud blinking curiously, with wavy gentle horizontal fog lines below wrapping around it like a cozy scarf. Minimalist Scandinavian doodle art, dark forest green outline (#2C5F45) on warm cream background (#F7F4EC), accents of soft misty blue (#376A83). Flat, cute anthropomorphic face, no text. |
| `weather/icon_weather_drizzle.png` | 毛毛雨 (51-57) | A cute hand-drawn monoline doodle icon of gentle drizzle. A petite smiling cloud wearing a tiny shower cap or blinking shyly, with tiny dashed light raindrop dots drifting downwards. Minimalist Scandinavian doodle art, dark forest green outline (#2C5F45) on warm cream paper (#F7F4EC), soft misty blue (#376A83) dots. Flat 2D line art, no text. |
| `weather/icon_weather_rain.png` | 雨天 (61-67) | A cute hand-drawn monoline doodle icon of rainy weather. A chubby cloud with a cheerful or slightly drizzly face holding a tiny umbrella, with diagonal cute teardrop raindrops falling. Minimalist Scandinavian doodle art, clean dark forest green linework (#2C5F45) on warm cream paper (#F7F4EC), accents of soft blue (#376A83). Flat 2D line art, no 3D, no text. |
| `weather/icon_weather_shower.png` | 阵雨 (80-82) | A cute hand-drawn monoline doodle icon of a passing sun shower. A playful cloud and a peeking sun sharing a tiny cute puddle, energetic water splash droplets. Minimalist Scandinavian doodle art, clean dark forest green linework (#2C5F45) on warm cream paper (#F7F4EC), brass gold sun and misty blue droplets. Flat 2D vector doodle, no text. |
| `weather/icon_weather_snow.png` | 雪天 (71-77) | A cute hand-drawn monoline doodle icon of gentle snowfall. A cozy little cloud with rosy cheeks and a winter knit beanie hat, blowing out tiny delicate hand-drawn snowflake stars. Minimalist Scandinavian doodle art, clean dark forest green outline (#2C5F45) on warm cream background (#F7F4EC). Flat 2D vector line art, no text. |
| `weather/icon_weather_thunder.png` | 雷雨 (95+) | A cute hand-drawn monoline doodle icon of a thunderstorm. A little grumpy dramatic cloud with furrowed cute eyebrows, with a tiny hand-drawn zigzag lightning bolt striking downwards. Minimalist Scandinavian doodle art, dark forest green outline (#2C5F45) on warm cream background (#F7F4EC), brass gold lightning (#B8871B). Flat 2D doodle, charming expression, no text. |

### A2. 状态图标
| 文件名 | 用途 | 提示词 (Prompt) |
|---|---|---|
| `status/icon_status_night_lamp.png` | 夜温提示小夜灯 | A cute hand-drawn monoline doodle icon of a warm night lamp shaped like a crescent moon leaning on a cozy little cloud. Gentle comforting sleepy night light aesthetic. Minimalist Scandinavian doodle art, dark forest green outline (#2C5F45) on warm cream background (#F7F4EC), soft brass gold moonlight glow (#B8871B). Flat 2D line art, no text. |
| `status/icon_status_water_gauge.png` | 剩余水分状态 | A cute hand-drawn monoline doodle icon of a big plump water droplet with measuring tick marks on its side, showing water level half-full, with a cute smiling face on the droplet. Minimalist Scandinavian doodle art, dark forest green outline (#2C5F45) on warm cream background (#F7F4EC), soft misty blue (#376A83) fill. Flat 2D line art, no text. |
| `status/icon_status_sun_blocked.png` | 盆位零直射/栏板遮挡 | A humorous and cute hand-drawn monoline doodle icon representing zero direct sunlight on a balcony. A smiling cheerful sun peeking curiously from behind a solid red brick balustrade wall, but blocked from reaching a tiny potted plant below. Scandinavian doodle art, clean dark forest green lines (#2C5F45) on warm cream paper (#F7F4EC), terracotta brick texture. Flat 2D doodle, witty and charming, no text. |
| `status/icon_status_grow_light.png` | 增补光灯提示 | A cute hand-drawn monoline doodle icon of a hanging vintage grow light bulb illuminating a tiny happy sprouting plant leaf below with warm radiating light beams. Minimalist Scandinavian doodle art, dark forest green line (#2C5F45) on warm cream background (#F7F4EC), brass gold filament glow (#B8871B). Flat 2D vector doodle, no text. |

---

## B 类｜待办六个动作图标 (Todo Action Icons)

| 文件名 | 动作 | 提示词 (Prompt) |
|---|---|---|
| `actions/icon_action_soil_check.png` | 1. 探土 | A cute hand-drawn monoline doodle icon of soil checking. A slender wooden bamboo chopstick skewer inserted vertically into rich potted potting soil, with tiny cute soil particles and moisture sparkle indicators. Minimalist Scandinavian doodle art, dark forest green monoline outline (#2C5F45) on warm cream background (#F7F4EC). Flat 2D line art, no text. |
| `actions/icon_action_water_prep.png` | 2. 备水（静置去氯） | A cute hand-drawn monoline doodle icon of water aeration. A glass water pitcher or carafe resting peacefully overnight, with gentle tiny air bubbles rising to the surface and subtle sparkle stars around it. Minimalist Scandinavian doodle art, dark forest green linework (#2C5F45) on warm cream background (#F7F4EC), misty blue water tint (#376A83). Flat 2D, no text. |
| `actions/icon_action_watering.png` | 3. 浇水 | A cute hand-drawn monoline doodle icon of plant watering. A retro long-necked slender spout watering can in sage green, pouring a delicate gentle arc of falling water droplets down onto the earth. Minimalist Scandinavian doodle art, dark forest green outline (#2C5F45) on warm cream background (#F7F4EC), touches of soft green and blue. Flat 2D line art, no text. |
| `actions/icon_action_move.png` | 4. 搬进/搬出 | A cute hand-drawn monoline doodle icon of carrying a potted plant. A pair of caring, gentle cartoon hands holding and lifting a small potted plant, with subtle curved movement arrows indicating relocation. Minimalist Scandinavian doodle art, clean dark forest green monoline (#2C5F45) on warm cream background (#F7F4EC). Flat 2D vector line art, no text. |
| `actions/icon_action_mold_check.png` | 5. 查灰霉 | A cute hand-drawn monoline doodle icon of botanical inspection. A classic round magnifying glass inspecting a cluster of flower petals closely, with tiny sparkle clarity stars. Minimalist Scandinavian doodle art, dark forest green monoline outline (#2C5F45) on warm cream background (#F7F4EC), brass gold rim (#B8871B). Flat 2D line art, no text. |
| `actions/icon_action_photo.png` | 6. 拍照记录 | A cute hand-drawn monoline doodle icon of taking a photo of a flower. A minimalist smartphone screen with camera focus brackets targeting a cute blooming flower blossom, capturing a snapshot. Minimalist Scandinavian doodle art, dark forest green linework (#2C5F45) on warm cream background (#F7F4EC). Flat 2D line art, no text. |

---

## C 类｜植株角色设定图 (Plant Characters & Avatars)

### 1. 长寿花 (Kalanchoe blossfeldiana 'Yellow Calandiva')
- **真实植物特征**：浅灰蓝竖条纹陶瓷花盆（套盆），扇形肥厚深绿多肉质对生叶片、锯齿圆叶缘，顶端簇拥一团繁茂的重瓣金黄色小花及密密麻麻圆润米白色花苞群。

| 文件名 | 规格 | 提示词 (Prompt) |
|---|---|---|
| `plants/plant_kalanchoe_avatar.png` | 1:1 圆形头像 | A cute hand-drawn monoline botanical character avatar of a Yellow Double-flowered Kalanchoe plant. Centered round composition. The plant sits in a light grey-blue vertical fluted ribbed ceramic pot. Thick fleshy scalloped green succulent leaves that look like cute friendly waving hands. Blooming clusters of double-petal bright yellow miniature flowers and dense creamy-white flower buds. Sweet charming facial expression on the pot or foliage. Minimalist Scandinavian doodle art, dark forest green outline (#2C5F45) on warm cream background (#F7F4EC), brass gold petals (#B8871B), muted slate blue pot (#376A83). Flat 2D line art, no text. |
| `plants/plant_kalanchoe_full.png` | 3:4 全身立绘 | A charming full-body hand-drawn line art illustration of a Yellow Kalanchoe pot plant. Placed in a stylish light grey-blue vertically ribbed ceramic pot. Lush compact succulent foliage with scalloped fleshy leaves, crowned by a rich canopy of double-petal golden yellow blossoms and tight rounded flower buds. Cozy botanical illustration, hand-drawn ink line art (#2C5F45) on warm cream paper background (#F7F4EC), tasteful yellow and pale blue accents. Clean, airy composition with ample margin, no text. |

### 2. 罗汉松 (Podocarpus macrophyllus var. maki)
- **真实植物特征**：黄边白底带小花托盘陶盆，常绿小灌木姿态，直立细密枝条，互生辐射状狭长扁平翠绿针状叶片。

| 文件名 | 规格 | 提示词 (Prompt) |
|---|---|---|
| `plants/plant_podocarpus_avatar.png` | 1:1 圆形头像 | A cute hand-drawn monoline botanical character avatar of a miniature Podocarpus pine tree (Buddhist Pine). In a clean white ceramic pot with a cheerful lemon-yellow rim and small matching saucer. Radiant slender elongated dark green leaves arranged like a cheerful little evergreen tree. A subtle cute happy personality. Minimalist Scandinavian doodle line art, dark forest green outline (#2C5F45) on solid warm cream background (#F7F4EC), lemon/brass yellow accent on rim (#B8871B). Flat 2D vector style, charming, no text. |
| `plants/plant_podocarpus_full.png` | 3:4 全身立绘 | A graceful full-body hand-drawn line art illustration of a miniature Podocarpus pine plant in a pot with a bright yellow rim and saucer. Delicate woody stem with slender radiating dark green needle-like leaves, disciplined bonsai-like evergreen posture. Minimalist Japanese / Scandinavian doodle style, clean dark forest green lines (#2C5F45) on warm cream paper (#F7F4EC), warm yellow rim accent. Clean, serene botanical line drawing, no text. |

### 3. 空白 / 添加新植物占位
| 文件名 | 规格 | 提示词 (Prompt) |
|---|---|---|
| `plants/plant_sprout_avatar.png` | 1:1 头像 | A cute hand-drawn monoline doodle icon of a tiny fresh green sprout popping out of a small mound of soil, with two baby cotyledon leaves opening upwards enthusiastically. Minimalist Scandinavian doodle art, dark forest green monoline outline (#2C5F45) on warm cream background (#F7F4EC), tender green accent. Pure and lively, no text. |

---

## D 类｜页面级场景插画 (Page Scene Illustrations)

| 文件名 | 规格 | 用途 | 提示词 (Prompt) |
|---|---|---|---|
| `scenes/scene_balcony_hero.png` | 16:9 横版 | 今日页顶部 Header | A poetic and cozy hand-drawn line art banner illustration of a campus balcony in Hangzhou in late autumn. In the foreground, a terracotta red brick balustrade ledge with two potted plants: a flowering yellow kalanchoe in a ribbed blue pot and a little podocarpus pine in a yellow-rim pot, next to a vintage green long-spout watering can and a quiet red fire extinguisher box in the corner. In the background, soft hazy silhouettes of college campus buildings and subtle golden ginkgo trees under a cool, humid, overcast autumn sky. Restrained Scandinavian / magazine line art style, dark forest green linework (#2C5F45) on warm cream paper (#F7F4EC), muted brick red and gold accents. Serene, peaceful mood, no text. |
| `scenes/scene_empty_state.png` | 1:1 或 4:3 | 待办全清空状态 | A cute and whimsical hand-drawn monoline doodle illustration of an empty task state. A happy little potted flower comfortably stretching its leafy arms, yawning and enjoying a peaceful sunny afternoon nap on a garden stool with zero worries. Minimalist Scandinavian doodle art, dark forest green monoline (#2C5F45) on warm cream background (#F7F4EC), subtle brass gold sunshine rays. Relaxed, tranquil vibe, no text. |
| `scenes/scene_weather_theater.png` | 16:9 横版 | 天气页长卷剧场 | A charming horizontal panoramic hand-drawn line art comic strip / mini theater showing three weather vignettes in a row: first a happy sun stretching under clear sky, then a cloudy sky with a gentle drizzle cloud floating, and finally a plant cozying up under a night lamp. Minimalist Scandinavian line art, dark forest green lines (#2C5F45) on warm cream paper (#F7F4EC), soft brass and blue accents. Storybook feel, no text. |
| `scenes/scene_album_polaroid.png` | 4:3 | 相册页空态/头部 | A cozy hand-drawn monoline illustration of botanical photo memories. A natural jute twine string hanging with wooden clothespin clips, holding several blank cute Polaroid photo frames, with dried botanical leaves and pressed yellow flower blossoms pinned alongside. Minimalist Scandinavian doodle art, dark forest green line (#2C5F45) on warm cream paper background (#F7F4EC). Nostalgic scrapbook aesthetic, no text. |
| `scenes/scene_compass.png` | 1:1 | 设置页朝向设置 | A cute hand-drawn monoline doodle illustration of a delicate vintage brass navigational pocket compass, with a tiny leafy plant sprout pointing as the compass needle towards the south, surrounded by subtle orientation ticks (N, S, E, W markers styled purely with decorative dots). Minimalist Scandinavian doodle art, dark forest green line (#2C5F45) on warm cream background (#F7F4EC), brass gold accents (#B8871B). Thoughtful and precise, no text. |

---

## E 类｜徽章与彩蛋 (Badges & Extras)

| 文件名 | 规格 | 提示词 (Prompt) |
|---|---|---|
| `badges/badge_health_82.png` | 1:1 图章 | A cute hand-drawn vintage sticker badge celebrating plant health. An organic circular scalloped ribbon seal with the number '82' boldly drawn in cute rounded hand-lettered numerals, encircled by a tiny delicate olive branch wreath and a little happy blooming flower. Hand-drawn stamp / sticker aesthetic, clean dark forest green lines (#2C5F45) on warm cream paper background (#F7F4EC), brass gold accents (#B8871B). Cheerful milestone reward badge. |
