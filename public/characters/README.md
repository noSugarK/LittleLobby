# 角色规范 / Character spec

每个角色是一个独立文件夹，网页版直接读取，原生应用可在「角色图鉴」里下载，局域网主机会把下载过的角色一起提供给朋友的手机。

Each character is one self-contained folder. The web build reads it directly, the native app downloads it from the 角色图鉴 / Characters page, and a LAN host serves its downloaded characters to friends' phones.

```
public/characters/
  index.json              清单：characters 决定顺序；builtin 是原生应用内置的角色
  <id>/
    character.json        文案与配色（多语言）
    atlas.png             平时的精灵表
    full-atlas.png        「吃吐吐」里含着队友的大肚肚精灵表
```

## 加一个角色 / Adding a character

1. 起一个 id：小写字母、数字和连字符，最多 32 个字符（如 `nailong`）。
2. 按下面的规范写 `character.json`，画好两张精灵表，放进 `public/characters/<id>/`。
3. 把 id 加进 `index.json` 的 `characters`（排在哪里，角色列表里就显示在哪里）。只有要随离线应用一起安装的角色才加进 `builtin`，其余角色在应用里按需下载。
4. 运行 `npm test`：测试会逐个检查清单里的角色文件夹是否符合规范。

## character.json

```json
{
  "id": "nailong",
  "accent": "#f7cf4f",
  "name":        { "zh-CN": "奶龙", "zh-TW": "奶龍", "en": "Nailong" },
  "subtitle":    { "zh-CN": "黄色小恐龙 · 绿眼睛", "zh-TW": "黃色小恐龍 · 綠眼睛", "en": "Yellow baby dino · green eyes" },
  "description": { "zh-CN": "…", "zh-TW": "…", "en": "…" },
  "origin":      { "zh-CN": "「奶龙」", "zh-TW": "「奶龍」", "en": "Nailong" },
  "look": "butter-yellow baby dinosaur, huge smooth gumdrop head …"
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 与文件夹同名 |
| `accent` | 是 | 角色主题色 `#rrggbb`，用于选中描边、名单圆点和图鉴里的柔光 |
| `name` | 是 | 名字，最多 12 个字 |
| `subtitle` | 是 | 写成「种类 · 一个特点」，下拉列表里显示「·」后面的特点 |
| `description` | 是 | 一两句性格 / 来历，图鉴卡片最多显示三行 |
| `origin` | 是 | 出处：作品名用「」或《》，自己设计的写「原创」/ Original |
| `look` | 是 | 英文外形描述，生成精灵表时直接填进提示词（见下文） |

文案字段都是多语言对象：`zh-CN` 和 `en` 必填，`zh-TW` 可省略（省略时用 `zh-CN`）。界面按当前语言显示，搜索会匹配所有语言。

All text fields are language maps: `zh-CN` and `en` are required, `zh-TW` falls back to `zh-CN`.

## 精灵表 / Sprite atlas

两张图规格相同：**1024 × 1280 的 RGBA PNG，透明背景**，切成 8 列 × 8 行、每格 128 × 160。提交前压成带透明的 256 色调色板 PNG（如 `pngquant --quality 80-95`），每张约 150–200 KB，联网时其他玩家的角色才出得快。

| 行 | 动作 | 帧数 | 朝向 |
| --- | --- | --- | --- |
| 0 | 待机 idle（第 3 帧眨眼） | 4 | 正面 |
| 1 | 跑步 run（循环） | 8 | 朝右 |
| 2 | 起跳 jump | 2 | 朝右 |
| 3 | 下落 fall | 2 | 朝右 |
| 4–7 | 第 0–3 行逐格水平翻转（朝左） | 同上 | 朝左 |

- 每帧从格子左侧开始排，空着的格子保持透明。
- **脚底统一落在 y = 146**（格子内坐标），跳跃 / 下落帧也一样，角色的位置由游戏控制。
- 角色高约 110–125 px、宽不超过 122 px；以头部为准水平居中，摆臂迈腿时身体不要左右晃。
- 8 帧跑步要首尾相接：右脚着地 → 下沉 → 交错 → 上推 → 左脚着地 → 下沉 → 交错 → 上推。步子小、头的高度只差几个像素，相邻两帧变化要小，否则看起来卡顿。
- 手臂和腿反向摆动：右腿在前时右手在后、左手在前，第 1 帧和第 5 帧两只手正好交换位置。手一直停在同一个位置的跑步看起来会很僵。
- `full-atlas.png` 是同样的布局，只是肚子鼓成半透明的大圆球、里面隐约有个小伙伴的影子，双手抱着肚子。游戏里会把它放大 1.2 倍画，所以整个角色要比平时小一圈，头和脚与平时一样大。

## 生成提示词模板 / Prompt templates

项目里的角色用 gpt-image 生成，再切成精灵表。下面的模板里 `{look}` 换成 `character.json` 的 `look`。参考图越准越好：给模型「风格参考图」（现有角色的待机帧拼在一起）和「角色参考图」（官方立绘、三视图）。

### 1. 定稿设计（两视图）

> The FIRST attached image is ONLY an art-style reference (flat 2D kawaii sticker style: thick dark-brown rounded outline, flat soft fill colors with very light shading, clean simple shapes). The OTHER attached image(s) show the ACTUAL CHARACTER to draw. Redraw that exact character faithfully in the style of the first image: keep its real silhouette, body proportions, colors, face and expression from the character reference; do NOT turn it into a generic big-head chibi, do NOT copy any character from the style image. Draw two full-body views side by side on a plain white background, same height: LEFT = front view standing, RIGHT = side view facing right, mid walking step. No text, no shadows.
> Character: {look}

原创角色没有参考图时，把现有角色的定稿图当作参考，说明要「属于同一套角色、同样的画风、颜色和现有角色区分开」。

### 2. 精灵表

> Create a 2D game SPRITE SHEET of exactly the character shown in the attached reference image (same design, colors, proportions, face, flat 2D sticker style with thick dark-brown outline). Transparent background. Every sprite is the full body at the SAME scale, separated by generous empty space; nothing touches or overlaps; no text, no grid lines, no shadows, no ground.
> Exactly 4 horizontal rows, all side-scroller poses FACING RIGHT except the idle row:
> Row 1 — IDLE: 4 frames, front view standing, gentle breathing bob; frame 3 has eyes closed (blink).
> Row 2 — RUN: 8 frames, a smooth looping run cycle viewed from the side facing right: 1 right leg forward heel contact, 2 weight down, 3 legs passing, 4 push up, 5 left leg forward heel contact, 6 weight down, 7 legs passing, 8 push up. Arms swing OPPOSITE to the legs like a real runner: when the right leg is forward the right arm is back and the left arm is forward, and the arms clearly trade places between frames 1 and 5. Short quick steps; head and body keep the same size and almost the same height in every frame.
> Row 3 — JUMP: 2 frames facing right: crouched takeoff, then rising in the air with legs tucked and arms up.
> Row 4 — FALL: 2 frames facing right: falling with arms raised and legs dangling, then bracing to land.
> Rows 1, 3, 4 are left-aligned and leave the rest of the row empty.

### 3. 大肚肚精灵表（以第 2 步的结果为参考图）

> Redraw this exact sprite sheet with the SAME layout: the same 4 rows, the same number of frames in each row (4, 8, 2, 2), the same poses and facing, the same character design and flat sticker style, transparent background, sprites well separated. The ONLY change: in every frame the character has just swallowed a friend, so its belly is hugely inflated into a big round glossy balloon-like belly (about twice as wide as before) in a paler, slightly translucent version of the belly color, with a faint soft silhouette of a small round-eared buddy visible inside, and the character's arms are hugging its big belly. Head, face and feet stay the same size as before. No text.

### 4. 局部修改（以现有精灵表为参考图）

只改一处时明确「其余保持不变」，例如：

> Edit this sprite sheet: keep EVERYTHING exactly the same (layout, number of frames, poses, sizes, colors, transparent background) and change ONLY the eyes: big round glossy friendly eyes with a small white highlight, no heavy eyelids, no frown. In the blink frame the eyes are happy closed arcs.

只修跑步手臂时：

> Edit this sprite sheet: keep EVERYTHING exactly the same (layout, number of frames, the idle / jump / fall rows, the legs, sizes, colors, transparent background) and change ONLY the arms in the 8-frame RUN row so they swing opposite to the legs like a real runner: when the right leg is forward the right arm is back and the left arm is forward; in frames 1–4 the near arm swings from back to front and in frames 5–8 from front to back, so the two arms clearly trade places. Keep the hands the same shape and color.

## 切图 / Packing

生成的整张图要切成上面的格子：按透明区域找出每个角色，按行分组（4 / 8 / 2 / 2 帧），所有帧用同一个缩放比例，以头部的水平重心居中、脚底对齐 y = 146，再把第 0–3 行水平翻转填进第 4–7 行。生成图偶尔带一圈半透明光晕，切之前把 alpha < 64 的像素清掉。切完放进游戏里看一遍跑步是否顺畅，再跑 `npm test`。
