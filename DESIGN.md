# Design

Scope: the home page (`src/pages/home.ts`, `src/pages/home.css`) and the characters page, which reuses it (`src/pages/characters.ts`, `src/pages/characters.css`). Game pages keep their own fullscreen language (`src/style.css`, `.play`).

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

- **Join panel**: brand-teal field, five 72px cream code boxes (60px on phones) with a transparent input over them, coral "加入" button, cream outline scan button.
- **Host panel**: white/raised panel; game picker as two radio tiles (art + name + players, checked = accent ring and check badge); collapsible 房间设置 (public lobby switch, PIN) that opens itself when the PIN is invalid; two host buttons (big screen = accent, phone = outline).
- **Join scan tip**: under the scan button, a small line-art phone-and-TV SVG with "没有房间码？" (web only, not LAN).
- **Lobby**: full-width table on a panel, hover tint in accent-soft. With no rooms (or while loading) the whole section collapses to one panel row: title, status pill, "开个公开房间 →" (ticks 公开大厅, opens 房间设置, focuses 大屏开房).
- **Games**: two equal 3:2 cards where the illustration (`public/home/<game>.webp`) fills the card and the title, caption, coral players pill and links sit at the bottom on a dark gradient. On hover or keyboard focus the illustration fades and blurs slightly, the gradient grows, the text lifts and the title grows, and a coral ring appears. Below, three co-op mode cards (rope / eat / stack) use the same treatment over art drawn from the game's sprite frames (cropped to a strip on one-column phones).
- **Offline download**: brand-teal band like the join panel; four cream buttons (Windows / macOS / Linux / Android) that point at the latest GitHub release's installers, falling back to the releases page; note line shows the version or "安装包即将发布". Hidden in the native app and LAN page. Art `public/home/offline.webp`.
- **Header download**: on the web, the download icon opens a popover listing the latest release's installers, with this device's platform first in coral marked 推荐. In the native app the icon is hidden unless the latest release differs from the app's own version; then it shows with a small coral-red dot and the popover heads with "发现新版本 vX" and "当前版本 vY". Never shown on LAN pages.
- **Hero**: one-line headline (wraps only on phones) with the subline under it. The cast strip takes no layout space: it overlays the headline area and the characters' feet overlap the top edge of the join and host panels.
- **Cast (parade)**: every available character walks in one full-width row, entering at the left screen edge and leaving at the right, about two character widths apart, looping forever. At the screen centre each one turns to face you, jumps, and shows its name bubble, then walks on. Clicking or tapping a character makes it jump too. Under reduced motion the row stands still, evenly spaced.
- **Guide links**: full-width soft-accent rows under the games, one for the tutorial and one for the characters page.

## Characters page (`#/characters`)

Same tokens, header and footer as the home page; the header adds a `›` crumb with the page title next to the wordmark.

- **Toolbar**: search field (searches every language of name, trait and origin) and, in the native app, a segmented filter 全部 / 已拥有 / 可下载 with counts.
- **Cards**: auto-fill grid (5 across on desktop, 2 on phones). Each card has the idle sprite on a soft radial glow in the character's `accent`, name, muted origin, description clamped to three lines, and a status footer.
- **Status footer**: web and LAN pages show "可直接使用". The native app shows 内置 (outline pill), 已下载 with a check icon plus a 移除 text link, "联网可直接用" plus a 下载离线用 text link in online mode, or a coral 下载 button that turns into a thin coral progress bar while downloading.
- **Entry points**: the home guide row, the adventure page's "打开角色图鉴" line, and the link at the bottom of every character picker.

## Rules

No eyebrow labels, no section numbers, no emoji as icons (icons come from `src/ui/site.ts`), no gradient text, no hard offset shadows. Layout collapses to one column at 900px; phone gutters 18px.

## Game screens (`src/style.css` `.play` / `.screen`, `src/pages/adventure.css`)

Every game uses one layout; only its palette and game-specific content change (football: dark green chrome; adventure: cream cards on its own scenes). A game's TV and phone use the same palette.

- **Phone**: top bar with the room status pill on the left, one game info pill (football's canvas score, adventure's HUD) in the centre, and only 全屏 / 菜单 on the right. Game-only actions such as football's 跟随视角 live in the menu footer.
- **Controls**: joystick or d-pad on the left; on the right the same Y (top) / X (left) / B (right) / A (bottom) diamond in every game. Buttons a game does not use right now stay in place as faint dashed empty slots (adventure: X and Y always, A outside 吃吐吐).
- **Menu drawer**: same left rail in every game; the first tab is always 房间, the last 按键设置.
- **TV lobby**: one centred card over the blurred scene, left column QR code, big room code, join address and 保存二维码; right column game title with a "TV 大屏" tag, the game's options (football teams and settings, adventure play modes), the player list, the start button and a hint about the phone controls. Actions (回到大厅 / 结束比赛, 换成另一个游戏, 退出房间) sit top right; the TV has no menu drawer. In play, a small QR code and room code stay in the bottom-right corner for late joiners.
- **Confirmations**: always the in-app dialog (`src/ui/confirm.ts`), never `window.confirm`, which the native app's webview may silently cancel.

