# Design

Scope: the home page (`src/pages/home.ts`, `src/pages/home.css`). Game pages keep their own fullscreen language (`src/style.css`, `.play`).

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
- **Lobby**: full-width table on a panel, hover tint in accent-soft.
- **Games**: alternating art/text rows (art 5/12, text 7/12), football art is an authored SVG pitch, adventure art uses the character sprites.
- **Hero**: one-line headline with the subline under it; the four characters stand in the same row on the host panel's top edge.
- **Cast (interactive)**: idle frames play (blink/breathe); characters lean toward the mouse, run in place facing the cursor on hover, and jump with a name + heart bubble on click or tap. All motion is off under reduced motion.

## Rules

No eyebrow labels, no section numbers, no emoji as icons (icons come from `src/ui/site.ts`), no gradient text, no hard offset shadows. Layout collapses to one column at 900px; phone gutters 18px.
