import { DEFAULT_SKIN, validSkin, type SkinId } from './characters';
import { t } from '../i18n';
/** Shared map art is independent of each player's chosen character. */
export const MAP_THEMES = [
  { sky: '#fff3e9', grass: '#aad5aa', accent: '#f5a8b8', item: t('adv.theme.0'), treat: 0 },
  { sky: '#edf6fc', grass: '#b7d6cc', accent: '#eeb76b', item: t('adv.theme.1'), treat: 1 },
  { sky: '#eee9f8', grass: '#b9c4d9', accent: '#bfacd9', item: t('adv.theme.2'), treat: 0 },
] as const;
/** 四种玩法互不叠加：经典单独闯关，其余三种是需要至少两人的合作机制。 */
export const MODES = [
  { id: 'classic', name: t('adv.mode.classic'), desc: t('adv.mode.classic.desc'), coop: false },
  { id: 'rope', name: t('adv.mode.rope'), desc: t('adv.mode.rope.desc'), coop: true },
  { id: 'eat', name: t('adv.mode.eat'), desc: t('adv.mode.eat.desc'), coop: true },
  { id: 'stack', name: t('adv.mode.stack'), desc: t('adv.mode.stack.desc'), coop: true },
  // 竞速借用经典关卡：不用集星星、不用打 Boss，谁先到小屋谁赢
  { id: 'race', name: t('adv.mode.race'), desc: t('adv.mode.race.desc'), coop: true },
] as const;
export type ModeId = typeof MODES[number]['id'];
export const validMode = (mode: unknown): mode is ModeId => MODES.some((m) => m.id === mode);
export const modeInfo = (mode: ModeId) => MODES.find((m) => m.id === mode)!;
export interface Rect { x: number; y: number; w: number; h: number; }
/** 机关：踩板上的重量（含着队友的人算 2）达到 need 时激活；solid 激活时出现（吊桥、台阶），gate 激活时消失（闸门）。latch 激活后保持。 */
export interface Device { plate: Rect; need: number; latch?: boolean; solid?: Rect[]; gate?: Rect[] }
/** 移动平台：在 (x, y) 和 (x+dx, y+dy) 之间来回缓动，站在上面会被带着走。 */
export interface Mover { x: number; y: number; w: number; dx?: number; dy?: number; speed?: number }
/** 小怪：hop 会原地蹦跳（趁它跳起时能从下面钻过去）；hp > 1 的是 Boss，要踩好几下，打败前小屋不开门。 */
export interface Enemy { x: number; y: number; range: number; hop?: boolean; hp?: number }
export interface Level {
  name: string; caption: string; mode: ModeId; theme: number; width: number; platforms: Rect[];
  coins: { x: number; y: number }[]; stars: { x: number; y: number }[];
  checkpoints: { x: number; y: number }[]; enemies: Enemy[];
  devices?: Device[];
  /** 弹簧垫：(x, y) 是它所在的地面，落上去会被高高弹起。 */
  springs?: { x: number; y: number }[];
  movers?: Mover[];
  goal: number;
}
const ground = (x: number, w: number): Rect => ({ x, y: 500, w, h: 140 });
const ledge = (x: number, y: number, w = 140): Rect => ({ x, y, w, h: 28 });
const block = (x: number, y: number, w: number): Rect => ({ x, y, w, h: 500 - y });
const plate = (x: number, y = 500, w = 110): Rect => ({ x, y: y - 8, w, h: 8 });
export const LEVELS: Level[] = [
  {
    name: t('adv.level.0'), caption: t('adv.level.0.caption'), mode: 'classic', theme: 0, width: 3100,
    platforms: [ground(0, 760), ground(870, 740), ground(1740, 1360), ledge(330, 410), ledge(540, 345), ledge(1060, 415), ledge(1260, 340), ledge(1920, 415), ledge(2130, 340), ledge(2340, 410)],
    coins: [{ x: 210, y: 462 }, { x: 290, y: 462 }, { x: 375, y: 375 }, { x: 585, y: 310 }, { x: 710, y: 457 }, { x: 820, y: 390 }, { x: 990, y: 462 }, { x: 1120, y: 380 }, { x: 1330, y: 305 }, { x: 1540, y: 462 }, { x: 1670, y: 380 }, { x: 1830, y: 462 }, { x: 1990, y: 380 }, { x: 2200, y: 305 }, { x: 2410, y: 375 }, { x: 2600, y: 460 }, { x: 2720, y: 460 }],
    stars: [{ x: 595, y: 300 }, { x: 1340, y: 295 }, { x: 2200, y: 295 }],
    checkpoints: [{ x: 980, y: 500 }, { x: 1830, y: 500 }], enemies: [{ x: 1160, y: 500, range: 75 }, { x: 2540, y: 500, range: 100 }], goal: 2890,
  },
  {
    name: t('adv.level.1'), caption: t('adv.level.1.caption'), mode: 'classic', theme: 1, width: 3300,
    platforms: [ground(0, 610), ground(760, 590), ground(1500, 600), ground(2230, 1070), ledge(280, 415), ledge(460, 335), ledge(620, 405, 100), ledge(980, 415), ledge(1170, 335), ledge(1380, 405, 90), ledge(1700, 415), ledge(1900, 335), ledge(2130, 405, 90), ledge(2410, 410), ledge(2600, 340)],
    coins: [{ x: 180, y: 460 }, { x: 340, y: 380 }, { x: 520, y: 300 }, { x: 670, y: 370 }, { x: 860, y: 460 }, { x: 1040, y: 380 }, { x: 1230, y: 300 }, { x: 1420, y: 370 }, { x: 1580, y: 460 }, { x: 1770, y: 380 }, { x: 1970, y: 300 }, { x: 2170, y: 370 }, { x: 2330, y: 460 }, { x: 2480, y: 375 }, { x: 2670, y: 305 }, { x: 2820, y: 460 }, { x: 2960, y: 460 }],
    stars: [{ x: 520, y: 290 }, { x: 1230, y: 290 }, { x: 1970, y: 290 }],
    checkpoints: [{ x: 850, y: 500 }, { x: 1580, y: 500 }, { x: 2320, y: 500 }], enemies: [{ x: 1010, y: 500, range: 100 }, { x: 1810, y: 500, range: 110 }, { x: 2780, y: 500, range: 90 }], goal: 3100,
  },
  {
    name: t('adv.level.2'), caption: t('adv.level.2.caption'), mode: 'classic', theme: 2, width: 3500,
    platforms: [ground(0, 700), ground(840, 660), ground(1640, 700), ground(2480, 1020), ledge(320, 415), ledge(510, 335), ledge(720, 400, 90), ledge(1050, 415), ledge(1250, 335), ledge(1520, 400, 90), ledge(1830, 415), ledge(2030, 335), ledge(2360, 400, 90), ledge(2650, 410), ledge(2840, 335)],
    coins: [{ x: 200, y: 460 }, { x: 380, y: 380 }, { x: 570, y: 300 }, { x: 760, y: 365 }, { x: 950, y: 460 }, { x: 1110, y: 380 }, { x: 1310, y: 300 }, { x: 1560, y: 365 }, { x: 1740, y: 460 }, { x: 1900, y: 380 }, { x: 2090, y: 300 }, { x: 2400, y: 365 }, { x: 2570, y: 460 }, { x: 2710, y: 375 }, { x: 2900, y: 300 }, { x: 3070, y: 460 }, { x: 3180, y: 460 }],
    stars: [{ x: 570, y: 290 }, { x: 1310, y: 290 }, { x: 2900, y: 290 }],
    checkpoints: [{ x: 930, y: 500 }, { x: 1730, y: 500 }, { x: 2560, y: 500 }], enemies: [{ x: 1060, y: 500, range: 110 }, { x: 1880, y: 500, range: 120 }, { x: 3000, y: 500, range: 100 }], goal: 3300,
  },
  {
    // 坑都跳得过去，但绳子只有四个身位：大家得一起起跳，掉下去的人靠站稳的队友吊住再爬上来
    name: t('adv.level.3'), caption: t('adv.level.3.caption'), mode: 'rope', theme: 1, width: 3200,
    platforms: [ground(0, 520), ground(690, 300), ground(1160, 260), ledge(1500, 430, 110), ledge(1680, 380, 110), ledge(1840, 430, 70), ground(1960, 330), ground(2470, 730), ledge(820, 400, 120), ledge(2620, 400, 120), ledge(2800, 330, 120)],
    coins: [{ x: 200, y: 462 }, { x: 420, y: 462 }, { x: 600, y: 420 }, { x: 760, y: 462 }, { x: 880, y: 365 }, { x: 1075, y: 420 }, { x: 1250, y: 462 }, { x: 1555, y: 395 }, { x: 1735, y: 345 }, { x: 1875, y: 395 }, { x: 2050, y: 462 }, { x: 2380, y: 420 }, { x: 2560, y: 462 }, { x: 2680, y: 365 }, { x: 3000, y: 462 }],
    stars: [{ x: 880, y: 360 }, { x: 1735, y: 335 }, { x: 2860, y: 290 }],
    checkpoints: [{ x: 760, y: 500 }, { x: 1220, y: 500 }, { x: 2020, y: 500 }, { x: 2530, y: 500 }],
    enemies: [{ x: 2150, y: 500, range: 80 }], goal: 3050,
  },
  {
    // 长缺口自己跳不过去：把队友吐到对岸，他踩下按钮放下吊桥；高台要边跳边吐才够得着
    name: t('adv.level.4'), caption: t('adv.level.4.caption'), mode: 'eat', theme: 0, width: 3300,
    platforms: [ground(0, 700), ground(1060, 500), ground(1940, 1360), ledge(2150, 300, 150)],
    devices: [
      { plate: plate(1090), need: 1, latch: true, solid: [{ x: 700, y: 500, w: 360, h: 22 }] },
      { plate: plate(1970), need: 1, latch: true, solid: [{ x: 1560, y: 500, w: 380, h: 22 }] },
      { plate: plate(2170, 300, 110), need: 1, latch: true, gate: [{ x: 2440, y: 280, w: 30, h: 220 }] },
    ],
    coins: [{ x: 220, y: 462 }, { x: 420, y: 462 }, { x: 620, y: 462 }, { x: 880, y: 420 }, { x: 1150, y: 462 }, { x: 1350, y: 462 }, { x: 1500, y: 462 }, { x: 1750, y: 420 }, { x: 2050, y: 462 }, { x: 2225, y: 262 }, { x: 2600, y: 462 }, { x: 2800, y: 462 }, { x: 3000, y: 462 }],
    stars: [{ x: 1180, y: 430 }, { x: 2060, y: 430 }, { x: 2280, y: 255 }],
    checkpoints: [{ x: 1150, y: 500 }, { x: 2030, y: 500 }, { x: 2560, y: 500 }],
    enemies: [{ x: 2750, y: 500, range: 90 }], goal: 3100,
  },
  {
    // 墙比一个人跳得高：踩着队友的头爬上去，墙顶的按钮放下台阶给其他人；最后两人一起踩开大门
    name: t('adv.level.5'), caption: t('adv.level.5.caption'), mode: 'stack', theme: 2, width: 3300,
    platforms: [ground(0, 3300), block(700, 330, 200), block(1500, 330, 240), ledge(2560, 330, 130)],
    devices: [
      { plate: plate(760, 330, 90), need: 1, latch: true, solid: [{ x: 600, y: 420, w: 90, h: 22 }] },
      { plate: plate(1580, 330, 90), need: 1, latch: true, solid: [{ x: 1400, y: 420, w: 90, h: 22 }] },
      { plate: plate(1960, 500, 140), need: 2, latch: true, gate: [{ x: 2300, y: 250, w: 30, h: 250 }] },
    ],
    coins: [{ x: 250, y: 462 }, { x: 450, y: 462 }, { x: 640, y: 380 }, { x: 800, y: 290 }, { x: 1100, y: 462 }, { x: 1300, y: 462 }, { x: 1440, y: 380 }, { x: 1620, y: 290 }, { x: 1850, y: 462 }, { x: 2150, y: 462 }, { x: 2450, y: 462 }, { x: 2625, y: 292 }, { x: 2900, y: 462 }],
    stars: [{ x: 860, y: 280 }, { x: 1690, y: 280 }, { x: 2625, y: 285 }],
    checkpoints: [{ x: 1000, y: 500 }, { x: 1800, y: 500 }, { x: 2400, y: 500 }],
    enemies: [{ x: 1200, y: 500, range: 70 }], goal: 3100,
  },
  {
    // 经典第四站：弹簧垫弹上高台、坐移动平台和电梯过大坑，最后踩三下大果冻 Boss 才能开门
    name: t('adv.level.6'), caption: t('adv.level.6.caption'), mode: 'classic', theme: 1, width: 3600,
    platforms: [ground(0, 640), ground(900, 700), ground(2000, 1600), ledge(620, 230, 160), ledge(1270, 390), ledge(1430, 290, 120), ledge(1760, 320, 200)],
    springs: [{ x: 500, y: 500 }, { x: 2200, y: 500 }],
    movers: [{ x: 660, y: 480, w: 110, dx: 120, speed: 0.9 }, { x: 1620, y: 480, w: 100, dy: -160, speed: 0.8 }],
    coins: [{ x: 200, y: 462 }, { x: 360, y: 462 }, { x: 528, y: 300 }, { x: 700, y: 195 }, { x: 760, y: 440 }, { x: 1050, y: 462 }, { x: 1330, y: 355 }, { x: 1670, y: 380 }, { x: 1670, y: 300 }, { x: 1900, y: 285 }, { x: 2228, y: 300 }, { x: 2228, y: 220 }, { x: 2450, y: 462 }, { x: 3150, y: 462 }, { x: 3250, y: 462 }],
    stars: [{ x: 740, y: 190 }, { x: 1490, y: 255 }, { x: 1860, y: 280 }],
    checkpoints: [{ x: 960, y: 500 }, { x: 2060, y: 500 }, { x: 2560, y: 500 }],
    enemies: [{ x: 1150, y: 500, range: 60, hop: true }, { x: 2400, y: 500, range: 40, hop: true }, { x: 2850, y: 500, range: 160, hp: 3 }], goal: 3350,
  },
  {
    // 串一串第二关：绳子连着大家一起坐移动平台过坑，坐不下的人就挂在绳子上
    name: t('adv.level.7'), caption: t('adv.level.7.caption'), mode: 'rope', theme: 2, width: 3200,
    platforms: [ground(0, 600), ground(1000, 400), ground(1750, 350), ground(2450, 750), ledge(1470, 440, 100), ledge(2180, 430, 90), ledge(2330, 400, 90)],
    movers: [{ x: 610, y: 480, w: 160, dx: 220, speed: 0.7 }, { x: 1590, y: 440, w: 100, dx: 60, speed: 1.2 }],
    coins: [{ x: 200, y: 462 }, { x: 420, y: 462 }, { x: 700, y: 440 }, { x: 900, y: 440 }, { x: 1100, y: 462 }, { x: 1300, y: 462 }, { x: 1520, y: 405 }, { x: 1650, y: 400 }, { x: 1900, y: 462 }, { x: 2220, y: 395 }, { x: 2370, y: 365 }, { x: 2600, y: 462 }, { x: 2850, y: 462 }],
    stars: [{ x: 800, y: 380 }, { x: 1520, y: 395 }, { x: 2375, y: 355 }],
    checkpoints: [{ x: 1060, y: 500 }, { x: 1800, y: 500 }, { x: 2500, y: 500 }],
    enemies: [{ x: 2700, y: 500, range: 60, hop: true }], goal: 3000,
  },
  {
    // 吃吐吐第二关：先把队友吐过湖按开吊桥；再含着队友踩弹簧，弹到最高处把他吐上云台按开第二座桥
    name: t('adv.level.8'), caption: t('adv.level.8.caption'), mode: 'eat', theme: 0, width: 3300,
    platforms: [ground(0, 700), ground(1100, 500), ground(2000, 1300), ledge(1650, 150, 300)],
    springs: [{ x: 1320, y: 500 }],
    devices: [
      { plate: plate(1130), need: 1, latch: true, solid: [{ x: 700, y: 500, w: 400, h: 22 }] },
      { plate: plate(1760, 150, 100), need: 1, latch: true, solid: [{ x: 1600, y: 500, w: 400, h: 22 }] },
      { plate: plate(2300, 500, 140), need: 2, latch: true, gate: [{ x: 2600, y: 250, w: 30, h: 250 }] },
    ],
    coins: [{ x: 220, y: 462 }, { x: 420, y: 462 }, { x: 620, y: 462 }, { x: 900, y: 400 }, { x: 1200, y: 462 }, { x: 1348, y: 330 }, { x: 1348, y: 250 }, { x: 1700, y: 420 }, { x: 2100, y: 462 }, { x: 2450, y: 462 }, { x: 2750, y: 462 }, { x: 2950, y: 462 }],
    stars: [{ x: 900, y: 360 }, { x: 1900, y: 120 }, { x: 2480, y: 430 }],
    checkpoints: [{ x: 1150, y: 500 }, { x: 2050, y: 500 }, { x: 2680, y: 500 }],
    enemies: [{ x: 2850, y: 500, range: 70, hop: true }], goal: 3050,
  },
  {
    // 叠罗汉第二关：叠高才够得着的空中平台——上去的人坐到对岸按开吊桥，最后再叠一次摘星星
    name: t('adv.level.9'), caption: t('adv.level.9.caption'), mode: 'stack', theme: 1, width: 3400,
    platforms: [ground(0, 1400), ground(1800, 1600), block(700, 330, 200), ledge(2600, 330, 130)],
    movers: [{ x: 1400, y: 350, w: 120, dx: 280, speed: 0.7 }],
    devices: [
      { plate: plate(760, 330, 90), need: 1, latch: true, solid: [{ x: 600, y: 420, w: 90, h: 22 }] },
      { plate: plate(1830, 500, 110), need: 1, latch: true, solid: [{ x: 1400, y: 500, w: 400, h: 22 }] },
      { plate: plate(2250, 500, 140), need: 2, latch: true, gate: [{ x: 2500, y: 250, w: 30, h: 250 }] },
    ],
    coins: [{ x: 250, y: 462 }, { x: 450, y: 462 }, { x: 640, y: 380 }, { x: 800, y: 290 }, { x: 1100, y: 462 }, { x: 1300, y: 462 }, { x: 1500, y: 310 }, { x: 1700, y: 310 }, { x: 1950, y: 462 }, { x: 2150, y: 462 }, { x: 2400, y: 462 }, { x: 2900, y: 462 }],
    stars: [{ x: 860, y: 280 }, { x: 1600, y: 290 }, { x: 2665, y: 285 }],
    checkpoints: [{ x: 1000, y: 500 }, { x: 1850, y: 500 }, { x: 2550, y: 500 }],
    enemies: [{ x: 1150, y: 500, range: 60, hop: true }], goal: 3200,
  },
];
/** 某玩法的关卡下标（同一玩法的关卡连续排列）。 */
export const modeLevels = (mode: ModeId) => LEVELS.flatMap((level, i) => level.mode === (mode === 'race' ? 'classic' : mode) ? [i] : []);
export interface AdventureInput { axis: number; jump: boolean; act?: boolean; }
/** 足球同款手柄映射到冒险：摇杆横向推过三成才移动；B 键或摇杆 / 方向键明显往上（含键盘斜向 ↗ ≈ -0.71）都算跳；A 键吃 / 吐。 */
export const padInput = (jx: number, jy: number, b: boolean, enabled: boolean, a = false): AdventureInput =>
  ({ axis: enabled && Math.abs(jx) > 0.3 ? Math.sign(jx) : 0, jump: enabled && (b || jy < -0.6), act: enabled && a });
export interface Adventurer {
  id: number; name: string; skin: SkinId; online: boolean; x: number; y: number; vx: number; vy: number;
  grounded: boolean; facing: number; hearts: number; invulnerable: number; checkpoint: number;
  coins: number[]; deaths: number; reached: boolean;
  /** 吃吐吐：正含着的队友 / 含着自己的队友，-1 表示没有。 */
  eating: number; eatenBy: number;
}
interface Controls extends AdventureInput { seen: number; buffer: number; coyote: number; rise: number; act: boolean; actQueued: boolean; held: number; launch: number; }
export interface AdventureView {
  t: 'adventure-state'; phase: 'lobby' | 'playing' | 'clear' | 'complete'; level: number; mode: ModeId;
  epoch: number; time: number; stars: number[]; defeated: number[]; active: number[]; players: Adventurer[]; paused: boolean; me: number;
  /** 每只小怪被踩了几下（Boss 血条用）；finish 是到达小屋的先后（竞速排名）。 */
  hits: number[]; finish: number[];
  /** 刚被踩、正在眩晕闪烁的小怪。 */
  stunned: number[];
}
const W = 34, H = 44;
export const ROPE = 150;
const near = (p: Adventurer, x: number, y: number, radius = 32) => Math.hypot(p.x + W / 2 - x, p.y + H / 2 - y) < radius;
const overlaps = (p: { x: number; y: number }, r: Rect) => p.x < r.x + r.w && p.x + W > r.x && p.y < r.y + r.h - 0.1 && p.y + H > r.y + 0.1;
/** 点心全队共享：谁先吃到算谁的（记在他的 coins 里），吃掉后所有人眼前都消失 */
export const eatenTreats = (players: Iterable<{ coins: number[] }>) => new Set([...players].flatMap((p) => p.coins));
export function enemyX(level: Level, enemy: number, time: number) {
  const e = level.enemies[enemy];
  return e.x + Math.sin(time * 1.1 + enemy) * e.range;
}
export function enemyY(level: Level, enemy: number, time: number) {
  const e = level.enemies[enemy];
  return e.hop ? e.y - Math.abs(Math.sin(time * 2.6 + enemy)) * 70 : e.y;
}
/** Boss 画得大、判定也大。 */
export const enemySize = (e: Enemy) => (e.hp ?? 1) > 1 ? 1.8 : 1;
export const SPRING = { w: 56, h: 14 };
/** 竞速开跑前的倒数秒数：这段时间里大家站在起跑线上动不了。 */
export const RACE_COUNTDOWN = 3;
export function moverRect(m: Mover, time: number): Rect {
  const k = (1 - Math.cos(time * (m.speed ?? 1))) / 2;
  return { x: m.x + (m.dx ?? 0) * k, y: m.y + (m.dy ?? 0) * k, w: m.w, h: 20 };
}
/** 挡路的方块；移动平台带着这一帧的位移 mx / my，弹簧垫带 spring 标记。 */
export interface Block extends Rect { mx?: number; my?: number; spring?: boolean }
/** 当前实际挡路的平台：地图平台 + 已激活机关放出的台阶 / 吊桥 + 尚未打开的闸门 + 弹簧垫 + time 时刻的移动平台（dt 用来算本帧位移）。 */
export function solids(level: Level, active: Iterable<number>, time = 0, dt = 0): Block[] {
  const on = new Set(active);
  return [
    ...level.platforms, ...(level.devices ?? []).flatMap((d, i) => on.has(i) ? d.solid ?? [] : d.gate ?? []),
    ...(level.springs ?? []).map((sp) => ({ x: sp.x, y: sp.y - SPRING.h, ...SPRING, spring: true })),
    ...(level.movers ?? []).map((m) => { const r = moverRect(m, time), was = moverRect(m, time - dt); return { ...r, mx: r.x - was.x, my: r.y - was.y }; }),
  ];
}
/** 小屋开门：竞速直接开；其他玩法要集齐星星并打败所有 Boss。 */
export function goalOpen(level: Level, mode: ModeId, stars: number, defeated: Iterable<number>) {
  if (mode === 'race') return true;
  const down = new Set(defeated);
  return stars === level.stars.length && level.enemies.every((e, i) => (e.hp ?? 1) <= 1 || down.has(i));
}

export class AdventureGame {
  readonly players = new Map<number, Adventurer>();
  private controls = new Map<number, Controls>();
  phase: AdventureView['phase'] = 'lobby';
  mode: ModeId = 'classic';
  level = 0;
  epoch = 0;
  time = 0;
  paused = false;
  stars = new Set<number>();
  defeated = new Set<number>();
  active = new Set<number>();
  hits = new Map<number, number>();
  finish: number[] = [];
  /** 被踩后短暂眩晕的 Boss：到这个时刻前不再受伤也不伤人。 */
  private stun = new Map<number, number>();
  private clock = 0;

  add(id: number, name: string, skin: SkinId = DEFAULT_SKIN) {
    if (this.players.has(id) || this.players.size >= 8) return false;
    this.players.set(id, { id, name: name.slice(0, 12), skin: validSkin(skin) ? skin : DEFAULT_SKIN, online: true, x: 90 + (id % 4) * 42, y: 456, vx: 0, vy: 0, grounded: false, facing: 1, hearts: 3, invulnerable: 0, checkpoint: -1, coins: [], deaths: 0, reached: false, eating: -1, eatenBy: -1 });
    this.controls.set(id, { axis: 0, jump: false, act: false, actQueued: false, held: 0, launch: 0, seen: this.clock, buffer: 0, coyote: 0, rise: 0 });
    return true;
  }
  remove(id: number) { this.release(id); this.players.delete(id); this.controls.delete(id); }
  online(id: number, online: boolean) {
    const p = this.players.get(id);
    if (p) p.online = online;
    if (!online) this.release(id);
    this.input(id, { axis: 0, jump: false, act: false });
    const c = this.controls.get(id);
    if (c) c.buffer = 0;
  }
  skin(id: number, skin: unknown) {
    const p = this.players.get(id);
    if (p && validSkin(skin)) p.skin = skin;
  }
  /** 合作玩法需要至少两名在线玩家；只能在大厅里切换。 */
  setMode(mode: unknown) {
    if (!validMode(mode) || this.phase === 'playing') return false;
    this.mode = mode;
    this.phase = 'lobby'; this.warmUp();
    return true;
  }
  /** 房主中途回大厅换玩法：结束本局，房间和伙伴都保留。 */
  toLobby() {
    if (this.phase === 'lobby') return false;
    for (const p of this.players.values()) { p.eating = p.eatenBy = -1; p.reached = false; }
    this.finish = [];
    this.phase = 'lobby'; this.warmUp();
    return true;
  }
  /** 大厅里大家可以在所选玩法的第一关里先走走跳跳，出发时再统一回到起点。 */
  private warmUp() {
    this.level = modeLevels(this.mode)[0];
    // 时间从头计：换新 epoch，否则页面会把回到大厅的状态当成过期快照丢掉
    this.epoch++;
    this.reset();
    for (const p of this.players.values()) { p.checkpoint = -1; p.coins = []; p.hearts = 3; this.respawn(p, false); }
  }
  canStart(mode = this.mode) {
    const online = [...this.players.values()].filter((p) => p.online).length;
    return online > 0 && (!modeInfo(mode).coop || online >= 2);
  }
  input(id: number, input: AdventureInput) {
    const c = this.controls.get(id);
    if (!c || !Number.isFinite(input.axis) || typeof input.jump !== 'boolean') return;
    if (input.jump && !c.jump) c.buffer = 0.13;
    const act = input.act === true;
    if (act && !c.act) c.actQueued = true;
    c.act = act;
    c.axis = Math.max(-1, Math.min(1, input.axis));
    c.jump = input.jump;
    c.seen = this.clock;
  }
  start(selectedLevel?: number) {
    if (this.phase === 'playing') return false;
    const levels = modeLevels(this.mode);
    const next = this.phase === 'clear' ? levels[levels.indexOf(this.level) + 1] : levels[0];
    const level = selectedLevel ?? next;
    if (!Number.isInteger(level) || !levels.includes(level) || !this.canStart()) return false;
    this.level = level;
    this.epoch++;
    this.reset();
    for (const p of this.players.values()) {
      p.checkpoint = -1; p.coins = []; p.deaths = 0; p.reached = false; p.hearts = 3; p.eating = p.eatenBy = -1;
      this.respawn(p, false);
      const c = this.controls.get(p.id)!; c.buffer = c.coyote = c.rise = c.held = c.launch = 0; c.jump = c.act = c.actQueued = false; c.axis = 0;
    }
    this.phase = 'playing';
    return true;
  }
  private reset() {
    this.time = 0; this.stars.clear(); this.defeated.clear(); this.active.clear(); this.hits.clear(); this.stun.clear(); this.finish = [];
  }
  /** 放出被含着的队友（或从别人肚子里出来），落在吃的人身边。 */
  private release(id: number, vx = 0, vy = 0) {
    const p = this.players.get(id);
    if (!p) return;
    const eater = p.eatenBy >= 0 ? this.players.get(p.eatenBy) : p;
    const eaten = p.eatenBy >= 0 ? p : p.eating >= 0 ? this.players.get(p.eating) : undefined;
    if (!eater || !eaten) return;
    eater.eating = -1; eaten.eatenBy = -1;
    eaten.x = Math.max(0, eater.x + eater.facing * 18); eaten.y = eater.y - 8;
    eaten.vx = vx; eaten.vy = vy; eaten.grounded = false; eaten.invulnerable = Math.max(eaten.invulnerable, 0.6);
    const c = this.controls.get(eaten.id);
    // 被吐出去的人在落地前保持抛出的速度，不被自己的摇杆立刻刹停
    if (c) { c.rise = vy < 0 ? 0.45 : 0; c.held = 0; c.launch = vx ? 1.2 : 0; }
  }
  private respawn(p: Adventurer, hurt = true) {
    if (p.eating >= 0) this.release(p.id);
    const cp = LEVELS[this.level].checkpoints[p.checkpoint];
    // 竞速大家站在同一条起跑线上，其他玩法错开一点免得叠在一起
    p.x = cp?.x ?? (this.mode === 'race' ? 120 : 90 + (p.id % 4) * 42);
    p.y = (cp?.y ?? 500) - H; p.vx = p.vy = 0; p.grounded = false;
    if (hurt) { p.deaths++; p.hearts = p.hearts > 1 ? p.hearts - 1 : 3; }
    p.invulnerable = hurt ? 1.5 : 0;
  }
  /** 串一串：绳子拉住超出长度的相邻两人；站在地上（或已到终点）的人更“重”，空中的人被拉向他。返回被绳子吊着的人。 */
  private rope(platforms: Rect[]) {
    const chain = [...this.players.values()].filter((p) => p.online && p.eatenBy < 0).sort((a, b) => a.id - b.id);
    const hanging = new Set<number>();
    const mass = (p: Adventurer, other: Adventurer) => p.reached ? 0 : p.grounded && !other.grounded ? 0 : !p.grounded && other.grounded ? 1 : 0.5;
    for (let pass = 0; pass < 4; pass++) for (let i = 0; i + 1 < chain.length; i++) {
      const a = chain[i], b = chain[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d <= ROPE || d === 0) continue;
      const nx = dx / d, ny = dy / d, excess = d - ROPE;
      let wa = mass(a, b), wb = mass(b, a);
      if (wa + wb === 0) continue;
      const sum = wa + wb; wa /= sum; wb /= sum;
      for (const [p, w, s] of [[a, wa, 1], [b, wb, -1]] as const) {
        if (!w) continue;
        // 绳子不能把人拉进墙里：整步会撞墙时只沿能走的方向拉（贴着崖壁往上拽，或者横着拉）
        const mx = s * nx * excess * w, my = s * ny * excess * w, old = { x: p.x, y: p.y };
        const fits = (x: number, y: number) => !platforms.some((r) => overlaps({ x, y }, r));
        const step = [[mx, my], [0, my], [mx, 0]].find(([dx2, dy2]) => fits(old.x + dx2, old.y + dy2));
        if (!step) continue;
        p.x = old.x + step[0]; p.y = old.y + step[1];
        const along = (p.vx * nx + p.vy * ny) * s;
        if (along < 0) { p.vx -= s * nx * along; p.vy -= s * ny * along; }
        const partner = p === a ? b : a;
        if (!p.grounded && p.y > partner.y + 10) hanging.add(p.id);
      }
    }
    return hanging;
  }
  step(dt: number, visible = true) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1 || this.phase === 'clear' || this.phase === 'complete') return;
    this.clock += dt;
    this.paused = !visible;
    if (!visible) return;
    this.time += dt;
    const level = LEVELS[this.level];
    const blocks = solids(level, this.active, this.time, dt);
    const all = [...this.players.values()];
    const prev = new Map(all.map((p) => [p.id, p.x]));
    const riders = new Map<number, number>();
    for (const p of all) {
      if (!p.online || p.reached) continue;
      const c = this.controls.get(p.id)!;
      const countdown = this.mode === 'race' && this.phase === 'playing' && this.time < RACE_COUNTDOWN;
      if (countdown || this.clock - c.seen > 0.75) { c.axis = 0; c.jump = false; c.buffer = 0; c.act = false; }
      const pressed = c.actQueued; c.actQueued = false;
      if (p.eatenBy >= 0) {
        // 在队友肚子里：跟着走、不会受伤；按 A 挣脱出来
        const eater = this.players.get(p.eatenBy)!;
        p.x = eater.x; p.y = eater.y; p.vx = p.vy = 0;
        c.held += dt;
        if (pressed && c.held > 0.3) this.release(p.id, eater.facing * 140, -380);
        continue;
      }
      if (this.mode === 'eat' && pressed) {
        if (p.eating >= 0) this.release(p.id, p.facing * 560, -620);
        else {
          const target = all.filter((q) => q !== p && q.online && !q.reached && q.eatenBy < 0 && q.eating < 0)
            .filter((q) => Math.abs(q.x - p.x) < 56 && Math.abs(q.y - p.y) < 40 && (q.x - p.x) * p.facing >= -8)
            .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
          if (target) { p.eating = target.id; target.eatenBy = p.id; const tc = this.controls.get(target.id); if (tc) tc.held = 0; }
        }
      }
      const full = p.eating >= 0;
      c.buffer = Math.max(0, c.buffer - dt);
      c.coyote = p.grounded ? 0.1 : Math.max(0, c.coyote - dt);
      c.rise = Math.max(0, c.rise - dt);
      p.invulnerable = Math.max(0, p.invulnerable - dt);
      const target = c.axis * (full ? 195 : 260);
      if (c.launch > 0) c.launch -= dt;
      else p.vx += Math.max(-1900 * dt, Math.min(1900 * dt, target - p.vx));
      if (Math.abs(c.axis) > 0.1) p.facing = c.axis > 0 ? 1 : -1;
      if (c.buffer > 0 && c.coyote > 0) { p.vy = full ? -560 : -650; p.grounded = false; c.coyote = c.buffer = 0; c.rise = 0.1; }
      // 手机点按时按下和松开常落在同一帧：保证最短上升时间，点一下也能跳上台阶，按住仍然最高
      if (!c.jump && c.rise <= 0 && p.vy < -380) p.vy = -380;
      p.vy = Math.min(900, p.vy + 1600 * dt);
      p.x = Math.max(0, Math.min(level.width - W, p.x + p.vx * dt));
      // 往上走的平台顶到脚底不算撞墙，下面的落地判定会把人托上去
      for (const r of blocks) if (!r.spring && overlaps(p, r) && !(r.my && p.y + H <= r.y - r.my + 1)) {
        if (p.vx > 0) p.x = r.x - W;
        else if (p.vx < 0) p.x = r.x + r.w;
        p.vx = 0;
      }
      const oldBottom = p.y + H;
      p.y += p.vy * dt; p.grounded = false;
      let carry = 0;
      // 往下走的平台：上一帧站在上面的人这一帧还没追上它，也算踩着
      for (const r of blocks) if (p.x + W > r.x + 0.1 && p.x < r.x + r.w - 0.1 && p.y + H >= r.y - Math.max(0, r.my ?? 0) - 1 && p.y < r.y + r.h) {
        if (p.vy >= 0 && oldBottom <= r.y - (r.my ?? 0) + 1 + (r.spring ? r.h : 0)) {
          p.y = r.y - H; c.launch = 0;
          // 弹簧垫：弹得比跳跃高一倍多，松开跳跃键也不会被截短
          if (r.spring) { p.vy = -980; p.grounded = false; c.rise = 0.5; c.coyote = 0; break; }
          else { p.vy = 0; p.grounded = true; carry = r.mx ?? 0; }
        }
        else if (p.vy < 0 && p.y + H > r.y) { p.y = r.y + r.h; p.vy = 0; }
      }
      // ponytail: 被平台带着走时不再做侧面碰撞，关卡里的移动平台不贴着墙走
      if (carry) p.x = Math.max(0, Math.min(level.width - W, p.x + carry));
      // 叠罗汉：队友的头顶是一块只能从上方落上去的平台，站上去会被他带着走
      if (this.mode === 'stack' && !p.grounded && p.vy >= 0) {
        for (const q of all) {
          if (q === p || !q.online || q.eatenBy >= 0 || p.x + W <= q.x + 6 || p.x >= q.x + W - 6) continue;
          if (oldBottom <= q.y + 2 && p.y + H >= q.y) { p.y = q.y - H; p.vy = 0; p.grounded = true; riders.set(p.id, q.id); break; }
        }
      }
      if (p.y > 700) { this.fall(p); continue; }
      this.collect(p, level, oldBottom);
    }
    for (const [rider, base] of riders) {
      const p = this.players.get(rider)!, q = this.players.get(base)!;
      p.x = Math.max(0, Math.min(level.width - W, p.x + q.x - (prev.get(q.id) ?? q.x)));
    }
    if (this.mode === 'rope') {
      for (const id of this.rope(blocks)) { const c = this.controls.get(id); if (c) c.coyote = 0.1; }
    }
    this.press(level);
    const online = all.filter((p) => p.online);
    // 竞速第一个人到就结束，不用等最后一名
    if (this.phase === 'playing' && online.length && (online.every((p) => p.reached) || (this.mode === 'race' && this.finish.length))) {
      const levels = modeLevels(this.mode);
      this.phase = this.level === levels[levels.length - 1] ? 'complete' : 'clear';
    }
  }
  /** 掉坑：串一串里只要还有人站稳就会被吊住，全员都掉下去才一起回到大家到过的最远检查点。 */
  private fall(p: Adventurer) {
    if (this.mode !== 'rope') { this.respawn(p); return; }
    const team = [...this.players.values()].filter((q) => q.online && !q.reached);
    const checkpoint = Math.max(...team.map((q) => q.checkpoint));
    for (const q of team) { q.checkpoint = checkpoint; this.respawn(q, q === p); }
  }
  private collect(p: Adventurer, level: Level, oldBottom: number) {
    level.checkpoints.forEach((cp, i) => {
      if (i <= p.checkpoint || !near(p, cp.x, cp.y - 25, 42)) return;
      p.checkpoint = i;
      // 串一串的检查点全队共享
      if (this.mode === 'rope') for (const q of this.players.values()) q.checkpoint = Math.max(q.checkpoint, i);
    });
    const eaten = eatenTreats(this.players.values());
    level.coins.forEach((coin, i) => { if (!eaten.has(i) && near(p, coin.x, coin.y)) p.coins.push(i); });
    level.stars.forEach((star, i) => { if (near(p, star.x, star.y, 35)) this.stars.add(i); });
    level.enemies.forEach((e, i) => {
      if (this.defeated.has(i) || (this.stun.get(i) ?? 0) > this.time) return;
      const x = enemyX(level, i, this.time), y = enemyY(level, i, this.time), s = enemySize(e);
      if (p.x + W < x - 20 * s || p.x > x + 20 * s || p.y + H < y - 30 * s || p.y > y) return;
      if (p.vy > 50 && oldBottom < y - 15 * s) {
        const hits = (this.hits.get(i) ?? 0) + 1;
        this.hits.set(i, hits); p.vy = -430;
        if (hits >= (e.hp ?? 1)) this.defeated.add(i);
        else {
          // Boss 没倒：眩晕一会儿，并把人往外弹开，免得落回它身上又被撞
          this.stun.set(i, this.time + 1.2);
          p.vx = (p.x + W / 2 < x ? -1 : 1) * 240; this.controls.get(p.id)!.launch = 0.5;
        }
      }
      else if (p.invulnerable === 0) this.respawn(p);
    });
    if (this.phase === 'playing' && goalOpen(level, this.mode, this.stars.size, this.defeated) && near(p, level.goal + 20, 460, 64)) {
      if (p.eating >= 0) this.release(p.id);
      p.reached = true; p.vx = p.vy = 0; this.finish.push(p.id);
    }
  }
  /** 机关踩板：站在板上的人的重量（含着队友算 2）。 */
  private press(level: Level) {
    (level.devices ?? []).forEach((d, i) => {
      const weight = [...this.players.values()].filter((p) => p.online && p.eatenBy < 0 && p.grounded
        && Math.abs(p.y + H - (d.plate.y + d.plate.h)) < 3 && p.x + W > d.plate.x && p.x < d.plate.x + d.plate.w)
        .reduce((sum, p) => sum + (p.eating >= 0 ? 2 : 1), 0);
      if (weight >= d.need) this.active.add(i);
      else if (!d.latch) this.active.delete(i);
    });
  }
  view(me = -1): AdventureView {
    return { t: 'adventure-state', phase: this.phase, level: this.level, mode: this.mode, epoch: this.epoch, time: this.time, stars: [...this.stars], defeated: [...this.defeated], active: [...this.active], paused: this.paused, me, hits: LEVELS[this.level].enemies.map((_, i) => this.hits.get(i) ?? 0), finish: [...this.finish], stunned: [...this.stun].flatMap(([i, until]) => until > this.time ? [i] : []), players: [...this.players.values()].map((p) => ({ ...p, coins: [...p.coins] })) };
  }
}
