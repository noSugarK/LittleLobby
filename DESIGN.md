# Design

Scope: the home page (`src/pages/home.ts`, `src/pages/home.css`). Game pages keep their own fullscreen language (`src/style.css`, `.play`).

## Direction

The category standard for party-game sites (bar: Jackbox, AirConsole, Kahoot!), executed straight. The first viewport is the product: **Join a room** (room-code entry) and **Host a room** sit side by side with equal weight, because hosts and joiners are equally common. Everything else (public lobby, games, guide) follows below.

## Tokens (`.site.home`)

| Role | Light | Dark |
|---|---|---|
| Ground `--h-bg` | `#f4f5fa` | `#0f121a` |
| Panel `--h-panel` | `#ffffff` | `#181c28` |
| Ink `--h-ink` | `#141824` | `#eef0f7` |
| Muted `--h-mu` | `#545b6e` | `#a7adc0` |
| Line `--h-line` | `#dde0ea` | `#2b3144` |
| Accent `--h-ac` (host, selection, links) | `#4b4be8` | `#9393ff` |
| Join field `--h-sun` | `#ffcf3f` (both themes), ink `#241c00` | |
| Game art grounds | turf `#dcf1e3`, buddy `#ffe4d4` | `#15301f`, `#3a2620` |

The home maps these onto the shared `--s-*` variables so shared components (switch, lobby table, LAN lobby, network toggle) follow the palette. Selection, caret, checkbox accent, scrollbar and focus rings use the accent.

## Type

System CJK sans (PingFang SC → Hiragino Sans GB → Microsoft YaHei → Noto Sans CJK SC). Chinese web fonts are multi-MB and Google Fonts is unavailable in mainland China, the main audience. Display 36–60px / 850 weight / -0.02em; panel titles 24–28px; body 15–17px. Room-code digits use the monospace stack with tabular numerals.

## Components

- **Join panel**: sun-yellow field, five 72px code boxes (60px on phones) with a transparent input over them, ink "加入" button, outline scan button.
- **Host panel**: white/raised panel; game picker as two radio tiles (art + name + players, checked = accent ring and check badge); collapsible 房间设置 (public lobby switch, PIN) that opens itself when the PIN is invalid; two host buttons (big screen = accent, phone = outline).
- **Lobby**: full-width table on a panel, hover tint in accent-soft.
- **Games**: alternating art/text rows (art 5/12, text 7/12), football art is an authored SVG pitch, adventure art uses the character sprites.
- **Cast**: the four character sprites stand on the top edge of the panels; the page's one motion is a staggered single hop on load (off under reduced motion).

## Rules

No eyebrow labels, no section numbers, no emoji as icons (icons come from `src/ui/site.ts`), no gradient text, no hard offset shadows. Layout collapses to one column at 900px; phone gutters 18px.
