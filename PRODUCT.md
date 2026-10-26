# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Friends getting together in person. One person hosts a room on a TV, computer or phone; everyone else joins with their phone by scanning a QR code or typing a room code. People who open the home page to host and people who open it to join are roughly equally common (confirmed), and the home page is used on phones and on large screens about equally (confirmed).

## Product Purpose
小聚场 · Little Lobby is a multi-game party platform: a big screen (or one phone) hosts, phones become the controllers. Success is a group going from "let's play" to playing in under a minute, without installing anything on the guests' phones.

## Positioning
Phone-as-controller party games that also work fully offline: the native app hosts the page, assets and WebSocket service over the same Wi-Fi or hotspot, so guests only need a browser and no internet.

## Operating Context
- Games: 开踢 (football, up to 4v4, match rules and party items) and 软乎乎冒险 (1–8 player co-op platformer; characters 一二, 布布, 小白, 小金毛).
- Host modes: 大屏开房 (TV/computer as the shared screen) and 手机开房 (host also plays). Room options: public lobby listing, optional 4–6 digit PIN, online vs LAN (native app only).
- Join paths: scan the host's QR code, type a 5-character room code, pick a room from the public lobby, or the LAN lobby inside the native app.
- The host can switch games from the room menu; the room code stays and joined friends follow.
- Chinese (simplified/traditional) and English UI via `src/i18n.ts`; light and dark themes.

## Capabilities and Constraints
- Web build is static (Vite, hash routing, `base: './'`), deployed to GitHub Pages; the same pages are bundled into the Tauri native app.
- Online play uses public MQTT signaling and WebRTC; LAN hosting requires the native app.
- Game pages are fullscreen landscape; the home page is a normal scrolling page.

## Brand Commitments
- Name and slogan must stay: 小聚场 / Little Lobby, "朋友碰头，随时一起开玩" (confirmed).
- The home page must keep the public lobby list and the app download entry in the header (confirmed).

## Evidence on Hand
- Character sprite atlases: `public/adventure/characters/{yier,bubu,xiaobai,jinmao}-atlas.png` (frame 0 is a front-facing idle pose).
- Brand marks: `public/brand/`.
- No testimonials, player counts, press or ratings exist; do not fabricate them.

## Product Principles
1. Hosting and joining are equal first actions; neither is buried.
2. Zero friction for guests: scan or type a code, nothing to install.
3. Offline is a real feature, stated plainly, not hidden.
4. Same quality on a phone in the hand and on a TV across the room.

## Accessibility & Inclusion
Readable from a couch on a TV and one-handed on a phone; keyboard focus visible; respects reduced motion.
