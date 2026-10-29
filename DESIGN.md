# Design

Scope: the home page (`src/pages/home.ts`, `src/pages/home.css`) and the characters and guide pages, which reuse it (`src/pages/characters.ts`, `src/pages/characters.css`, `src/pages/guide.ts`, `src/pages/guide.css`). Game pages keep their own fullscreen language (`src/style.css`, `.play`).

## Direction

The category standard for party-game sites (bar: Jackbox, AirConsole, Kahoot!), executed straight. The first viewport is the product: **Join a room** (room-code entry) and **Host a room** sit side by side with equal weight, because hosts and joiners are equally common. Everything else (public lobby, games, guide) follows below.

## Tokens (`.site.home`)

Palette follows the logo (`public/brand/mark.svg`): brand teal, coral for actions, warm cream.

| Role | Light | Dark |
|---|---|---|
| Ground `--h-bg` | `#f7f2e8` | `#0b1e1d` |
| Panel `--h-panel` | `#ffffff` | `#132e2c` |
| Ink `--h-ink` | `#10302f` | `#fbf7ef` |
| Muted `--h-mu` | `#5b6e6b` | `#a9bdb8` |
| Line `--h-line` | `#e6dfd2` | `#24423f` |
| Brand / links `--h-brand`, `--h-link` | `#0f5c5a` | `#8ed8cf` |
| Action buttons `--h-ac` (white text ≈ 5:1) | `#d9502f` | `#d9502f` |
| Rings, badges, selection `--h-ring` | `#ff7a59` | `#ff8a6b` |
| Join field `--h-join` / text `--h-join-ink` | `#0f5c5a` / `#fbf7ef` | `#0f6e69` / `#fbf7ef` |
| Game art grounds | turf `#dcf1e3`, buddy `#ffe4d4` | `#15301f`, `#3a2620` |

## Type

System CJK sans (PingFang SC → Hiragino Sans GB → Microsoft YaHei → Noto Sans CJK SC). Chinese web fonts are multi-MB and Google Fonts is unavailable in mainland China, the main audience. Display 36–60px / 850 weight / -0.02em; panel titles 24–28px; body 15–17px. Room-code digits use the monospace stack with tabular numerals.

## Components

Restraint first: thin-bordered panels on the cream ground, one coral action (加入), one ink action (大屏开房); everything else is an underlined text link. No gradients, glows, pills or decorative art beyond the two game thumbnails.

- **Header**: wordmark (mark + 小聚场) left; download, theme and language as bare icons right.
- **Headline**: the slogan as one left-aligned headline, no subline.
- **Join panel**: five outlined code boxes (76px, 60px on phones) with a transparent input over them, coral "加入" button, "扫描大屏二维码" text link.
- **Host panel**: game picker as two radio rows (120×72 art thumbnail + name + players; checked = coral border on accent-soft); collapsible 房间设置 (public lobby switch, PIN) that opens itself when the PIN is invalid; ink "大屏开房" button and a "手机开房" text link.
- **Lobby**: title, a muted status line ("正在找公开房间…" / "暂时没有公开房间"), a 刷新 link; the thin-bordered table only appears when there are rooms.
- **More line**: under a hairline, offline download links (Windows / macOS / Linux / Android, pointing at the latest release's installers, falling back to the releases page; web only) and the tutorial and characters links.
- **Header download**: on the web, the download icon opens a popover listing the latest release's installers, with this device's platform first in coral marked 推荐. In the native app the icon is hidden unless the latest release differs from the app's own version; then it shows with a small coral-red dot and the popover heads with "发现新版本 vX" and "当前版本 vY". Never shown on LAN pages.

## Characters page (`#/characters`)

Same tokens, header and footer as the home page; the header adds a `›` crumb with the page title next to the wordmark.

- **Toolbar**: search field (searches every language of name, trait and origin) and, in the native app, a segmented filter 全部 / 已拥有 / 可下载 with counts.
- **Cards**: auto-fill grid (5 across on desktop, 2 on phones). Each card has the idle sprite on a soft radial glow in the character's `accent`, name, muted origin, description clamped to three lines, and a status footer.
- **Status footer**: web and LAN pages show "可直接使用". The native app shows 内置 (outline pill), 已下载 with a check icon plus a 移除 text link, "联网可直接用" plus a 下载离线用 text link in online mode, or a coral 下载 button that turns into a thin coral progress bar while downloading.
- **Entry points**: the home guide row, the adventure page's "打开角色图鉴" line, and the link at the bottom of every character picker.

## Guide page (`#/guide`)

Same tokens, header (with the `›` crumb) and footer as the characters page; Read mode, hairline lists, no section numbers.

- **Three steps**: one bordered panel split into 开房 / 加入 / 横屏开玩, each an icon, a bold label and one muted sentence.
- **Game tabs**: a segmented control 开踢 / 软乎乎冒险 (ink fill when selected) switches the pane below; it opens on `?game=` or the last game picked on the home page.
- **Controls**: a pad drawing in the game's own palette (stick left; Y top, X left, B right, A bottom; unused keys as dashed slots) beside a hairline list of key → name → what it does, then the desktop keys as a muted line.
- **Rules**: two-column hairline entries, bold name first (football: rules, match modes, party rules; adventure: the four modes and the co-op note).
- **Tips**: a hairline list last, including that a backgrounded host pauses the game.

## Rules

No eyebrow labels, no section numbers, no emoji as icons (icons come from `src/ui/site.ts`), no gradient text, no hard offset shadows. Layout collapses to one column at 860px; phone gutters 16px.

## Game screens (`src/style.css` `.play` / `.screen`, `src/pages/adventure.css`)

Every game uses one layout; only its palette and game-specific content change (football: dark green chrome; adventure: cream cards on its own scenes). A game's TV and phone use the same palette.

- **Frame (every game, TV and phone)**: top-left the connection status as plain text with a coloured dot (connected / relay / lost) and the room code; top-centre one info pill (football's score, adventure's HUD); top-right exactly two round icon buttons, 全屏 and 菜单 (全屏 hides once fullscreen; on iPhone it explains Add to Home Screen); bottom-left the 小聚场 logo (small and faded on phones, where the joystick sits). Nothing covers the middle: in the lobby / warm-up everyone can already move.
- **Host card**: one docked card holds the host's lobby controls and hides once play starts. TV: bottom-right, with players (football: both team lists with + 添加 AI; adventure: round avatars), the mode segmented control, QR + room code, and the start button. Hosting phone: top-right under the round buttons, clear of the action buttons (football: one row, QR + code + 开始比赛; adventure: modes, QR + code, 一起出发). The menu never opens by itself in the lobby; it still opens for football results.
- **Controls**: joystick or d-pad on the left; on the right the same Y (top) / X (left) / B (right) / A (bottom) diamond in every game. Buttons a game does not use right now stay in place as faint dashed empty slots (adventure: X and Y always, A outside 吃吐吐).
- **Menu drawer**: same left rail in every game; the first tab is always 房间, the last 按键设置. Every menu has a 语言 select (reloads the page) and puts leaving last as red text. Adventure's drawer is one column: progress, mode hint, roster, then a settings list with hairlines (角色 picker, 音效 switch, 语言 select), then full-width 回到大厅选玩法 / 换游戏 and red 退出房间; it never opens by itself. Football's footer is two rows: 语言 / 视角 / 教程, then 换游戏 and red 退出房间.
- **TV menu**: the same right-hand drawer as phones. Football: all match settings (mode, party rules, duration, AI level, auto-fill), 语言, 保存二维码, 结束比赛 (in a match), 换游戏 and red 退出房间. In play, a small QR code and room code stay in the bottom-right corner for late joiners.
- **Join card** (`src/ui/join-card.ts`): one structure for every game and every entry path (QR, lobby row, typed code), only the palette changes. Header row: game name (display weight) left, room code in mono right with a lock when the room has a PIN. Then labelled fields: 昵称, 房间密码 (only for locked rooms), and the game's own row (football: team segmented control with team-colour dots; adventure: the character picker). One primary button; 只观战 / 回首页 are underlined text links. Fits a 375px-tall landscape phone without scrolling; no gamepad shows behind it.
- **Confirmations**: always the in-app dialog (`src/ui/confirm.ts`), never `window.confirm`, which the native app's webview may silently cancel. It mounts inside the current game page and takes its palette. Bold short question as the title, one muted line with the consequence, two equal buttons: the cancel side (留下 when leaving) and a confirm button that names the action (关闭房间, 离开, 结束比赛, 换游戏, 移出); destructive actions are red, others use the game's primary colour.

