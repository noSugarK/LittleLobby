export const CHARACTERS = [
  { name: '一二', sprite: 'yier', accent: '#f5a8b8', subtitle: '白色小熊 · 小黑布鞋' },
  { name: '布布', sprite: 'bubu', accent: '#eeb76b', subtitle: '棕色小熊 · 圆圆小脚' },
] as const;
/** Shared map art is independent of each player's chosen character. */
export const MAP_THEMES = [
  { sky: '#fff3e9', grass: '#aad5aa', accent: '#f5a8b8', item: '草莓', treat: 0 },
  { sky: '#edf6fc', grass: '#b7d6cc', accent: '#eeb76b', item: '蜂蜜', treat: 1 },
  { sky: '#eee9f8', grass: '#b9c4d9', accent: '#bfacd9', item: '星光点心', treat: 0 },
] as const;
export const validSkin = (skin: unknown): skin is number => Number.isInteger(skin) && Number(skin) >= 0 && Number(skin) < CHARACTERS.length;
export interface Rect { x: number; y: number; w: number; h: number; }
export interface Level {
  name: string; caption: string; width: number; platforms: Rect[];
  coins: { x: number; y: number }[]; stars: { x: number; y: number }[];
  checkpoints: { x: number; y: number }[]; enemies: { x: number; y: number; range: number }[];
  goal: number;
}
const ground = (x: number, w: number): Rect => ({ x, y: 500, w, h: 140 });
const ledge = (x: number, y: number, w = 140): Rect => ({ x, y, w, h: 28 });
export const LEVELS: Level[] = [
  {
    name: '莓莓散步道', caption: '沿着小点心前进，收集三颗星星，去野餐小屋集合。', width: 3100,
    platforms: [ground(0, 760), ground(870, 740), ground(1740, 1360), ledge(330, 410), ledge(540, 345), ledge(1060, 415), ledge(1260, 340), ledge(1920, 415), ledge(2130, 340), ledge(2340, 410)],
    coins: [{ x: 210, y: 462 }, { x: 290, y: 462 }, { x: 375, y: 375 }, { x: 585, y: 310 }, { x: 710, y: 457 }, { x: 820, y: 390 }, { x: 990, y: 462 }, { x: 1120, y: 380 }, { x: 1330, y: 305 }, { x: 1540, y: 462 }, { x: 1670, y: 380 }, { x: 1830, y: 462 }, { x: 1990, y: 380 }, { x: 2200, y: 305 }, { x: 2410, y: 375 }, { x: 2600, y: 460 }, { x: 2720, y: 460 }],
    stars: [{ x: 595, y: 300 }, { x: 1340, y: 295 }, { x: 2200, y: 295 }],
    checkpoints: [{ x: 980, y: 500 }, { x: 1830, y: 500 }], enemies: [{ x: 1160, y: 500, range: 75 }, { x: 2540, y: 500, range: 100 }], goal: 2890,
  },
  {
    name: '云朵奶糖桥', caption: '慢一点也没关系。抬头找找云桥上的星星。', width: 3300,
    platforms: [ground(0, 610), ground(760, 590), ground(1500, 600), ground(2230, 1070), ledge(280, 415), ledge(460, 335), ledge(620, 405, 100), ledge(980, 415), ledge(1170, 335), ledge(1380, 405, 90), ledge(1700, 415), ledge(1900, 335), ledge(2130, 405, 90), ledge(2410, 410), ledge(2600, 340)],
    coins: [{ x: 180, y: 460 }, { x: 340, y: 380 }, { x: 520, y: 300 }, { x: 670, y: 370 }, { x: 860, y: 460 }, { x: 1040, y: 380 }, { x: 1230, y: 300 }, { x: 1420, y: 370 }, { x: 1580, y: 460 }, { x: 1770, y: 380 }, { x: 1970, y: 300 }, { x: 2170, y: 370 }, { x: 2330, y: 460 }, { x: 2480, y: 375 }, { x: 2670, y: 305 }, { x: 2820, y: 460 }, { x: 2960, y: 460 }],
    stars: [{ x: 520, y: 290 }, { x: 1230, y: 290 }, { x: 1970, y: 290 }],
    checkpoints: [{ x: 850, y: 500 }, { x: 1580, y: 500 }, { x: 2320, y: 500 }], enemies: [{ x: 1010, y: 500, range: 100 }, { x: 1810, y: 500, range: 110 }, { x: 2780, y: 500, range: 90 }], goal: 3100,
  },
  {
    name: '晚安星光园', caption: '最后一站！带上星星，和朋友一起赴约。', width: 3500,
    platforms: [ground(0, 700), ground(840, 660), ground(1640, 700), ground(2480, 1020), ledge(320, 415), ledge(510, 335), ledge(720, 400, 90), ledge(1050, 415), ledge(1250, 335), ledge(1520, 400, 90), ledge(1830, 415), ledge(2030, 335), ledge(2360, 400, 90), ledge(2650, 410), ledge(2840, 335)],
    coins: [{ x: 200, y: 460 }, { x: 380, y: 380 }, { x: 570, y: 300 }, { x: 760, y: 365 }, { x: 950, y: 460 }, { x: 1110, y: 380 }, { x: 1310, y: 300 }, { x: 1560, y: 365 }, { x: 1740, y: 460 }, { x: 1900, y: 380 }, { x: 2090, y: 300 }, { x: 2400, y: 365 }, { x: 2570, y: 460 }, { x: 2710, y: 375 }, { x: 2900, y: 300 }, { x: 3070, y: 460 }, { x: 3180, y: 460 }],
    stars: [{ x: 570, y: 290 }, { x: 1310, y: 290 }, { x: 2900, y: 290 }],
    checkpoints: [{ x: 930, y: 500 }, { x: 1730, y: 500 }, { x: 2560, y: 500 }], enemies: [{ x: 1060, y: 500, range: 110 }, { x: 1880, y: 500, range: 120 }, { x: 3000, y: 500, range: 100 }], goal: 3300,
  },
];
export interface AdventureInput { axis: number; jump: boolean; }
/** 足球同款手柄映射到冒险：摇杆横向推过三成才移动；B 键或摇杆 / 方向键往上推到底都算跳。 */
export const padInput = (jx: number, jy: number, b: boolean, enabled: boolean): AdventureInput =>
  ({ axis: enabled && Math.abs(jx) > 0.3 ? Math.sign(jx) : 0, jump: enabled && (b || jy < -0.8) });
export interface Adventurer {
  id: number; name: string; skin: number; online: boolean; x: number; y: number; vx: number; vy: number;
  grounded: boolean; facing: number; hearts: number; invulnerable: number; checkpoint: number;
  coins: number[]; deaths: number; reached: boolean;
}
interface Controls extends AdventureInput { seen: number; buffer: number; coyote: number; }
export interface AdventureView {
  t: 'adventure-state'; phase: 'lobby' | 'playing' | 'clear' | 'complete'; level: number;
  epoch: number; time: number; stars: number[]; defeated: number[]; players: Adventurer[]; paused: boolean; me: number;
}
const W = 34, H = 44;
const near = (p: Adventurer, x: number, y: number, radius = 32) => Math.hypot(p.x + W / 2 - x, p.y + H / 2 - y) < radius;
export function enemyX(level: Level, enemy: number, time: number) {
  const e = level.enemies[enemy];
  return e.x + Math.sin(time * 1.1 + enemy) * e.range;
}

export class AdventureGame {
  readonly players = new Map<number, Adventurer>();
  private controls = new Map<number, Controls>();
  phase: AdventureView['phase'] = 'lobby';
  level = 0;
  epoch = 0;
  time = 0;
  paused = false;
  stars = new Set<number>();
  defeated = new Set<number>();
  private clock = 0;

  add(id: number, name: string, skin = 0) {
    if (this.players.has(id) || this.players.size >= 8) return false;
    this.players.set(id, { id, name: name.slice(0, 12), skin: validSkin(skin) ? skin : 0, online: true, x: 90 + (id % 4) * 42, y: 456, vx: 0, vy: 0, grounded: false, facing: 1, hearts: 3, invulnerable: 0, checkpoint: -1, coins: [], deaths: 0, reached: false });
    this.controls.set(id, { axis: 0, jump: false, seen: this.clock, buffer: 0, coyote: 0 });
    return true;
  }
  remove(id: number) { this.players.delete(id); this.controls.delete(id); }
  online(id: number, online: boolean) {
    const p = this.players.get(id);
    if (p) p.online = online;
    this.input(id, { axis: 0, jump: false });
    const c = this.controls.get(id);
    if (c) c.buffer = 0;
  }
  skin(id: number, skin: unknown) {
    const p = this.players.get(id);
    if (p && validSkin(skin)) p.skin = skin;
  }
  input(id: number, input: AdventureInput) {
    const c = this.controls.get(id);
    if (!c || !Number.isFinite(input.axis) || typeof input.jump !== 'boolean') return;
    if (input.jump && !c.jump) c.buffer = 0.13;
    c.axis = Math.max(-1, Math.min(1, input.axis));
    c.jump = input.jump;
    c.seen = this.clock;
  }
  start(selectedLevel?: number) {
    if (this.phase === 'playing' || ![...this.players.values()].some((p) => p.online)) return false;
    const level = selectedLevel ?? (this.phase === 'clear' ? this.level + 1 : 0);
    if (!Number.isInteger(level) || level < 0 || level >= LEVELS.length) return false;
    this.level = level;
    this.epoch++;
    this.time = 0; this.stars.clear(); this.defeated.clear();
    for (const p of this.players.values()) {
      p.checkpoint = -1; p.coins = []; p.deaths = 0; p.reached = false; p.hearts = 3;
      this.respawn(p, false);
      const c = this.controls.get(p.id)!; c.buffer = c.coyote = 0; c.jump = false; c.axis = 0;
    }
    this.phase = 'playing';
    return true;
  }
  private respawn(p: Adventurer, hurt = true) {
    const cp = LEVELS[this.level].checkpoints[p.checkpoint];
    p.x = cp?.x ?? 90 + (p.id % 4) * 42;
    p.y = (cp?.y ?? 500) - H; p.vx = p.vy = 0; p.grounded = false;
    if (hurt) { p.deaths++; p.hearts = p.hearts > 1 ? p.hearts - 1 : 3; }
    p.invulnerable = hurt ? 1.5 : 0;
  }
  step(dt: number, visible = true) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1 || this.phase !== 'playing') return;
    this.clock += dt;
    this.paused = !visible;
    if (!visible) return;
    this.time += dt;
    const level = LEVELS[this.level];
    for (const p of this.players.values()) {
      if (!p.online || p.reached) continue;
      const c = this.controls.get(p.id)!;
      if (this.clock - c.seen > 0.75) { c.axis = 0; c.jump = false; c.buffer = 0; }
      c.buffer = Math.max(0, c.buffer - dt);
      c.coyote = p.grounded ? 0.1 : Math.max(0, c.coyote - dt);
      p.invulnerable = Math.max(0, p.invulnerable - dt);
      const target = c.axis * 260;
      p.vx += Math.max(-1900 * dt, Math.min(1900 * dt, target - p.vx));
      if (Math.abs(c.axis) > 0.1) p.facing = c.axis > 0 ? 1 : -1;
      if (c.buffer > 0 && c.coyote > 0) { p.vy = -650; p.grounded = false; c.coyote = c.buffer = 0; }
      if (!c.jump && p.vy < -380) p.vy = -380;
      p.vy = Math.min(900, p.vy + 1600 * dt);
      p.x = Math.max(0, Math.min(level.width - W, p.x + p.vx * dt));
      for (const r of level.platforms) if (p.x < r.x + r.w && p.x + W > r.x && p.y < r.y + r.h - 0.1 && p.y + H > r.y + 0.1) {
        if (p.vx > 0) p.x = r.x - W;
        else if (p.vx < 0) p.x = r.x + r.w;
        p.vx = 0;
      }
      const oldBottom = p.y + H;
      p.y += p.vy * dt; p.grounded = false;
      for (const r of level.platforms) if (p.x + W > r.x + 0.1 && p.x < r.x + r.w - 0.1 && p.y + H >= r.y && p.y < r.y + r.h) {
        if (p.vy >= 0 && oldBottom <= r.y + 1) { p.y = r.y - H; p.vy = 0; p.grounded = true; }
        else if (p.vy < 0) { p.y = r.y + r.h; p.vy = 0; }
      }
      if (p.y > 700) { this.respawn(p); continue; }
      level.checkpoints.forEach((cp, i) => { if (i > p.checkpoint && near(p, cp.x, cp.y - 25, 42)) p.checkpoint = i; });
      level.coins.forEach((coin, i) => { if (!p.coins.includes(i) && near(p, coin.x, coin.y)) p.coins.push(i); });
      level.stars.forEach((star, i) => { if (near(p, star.x, star.y, 35)) this.stars.add(i); });
      level.enemies.forEach((e, i) => {
        if (this.defeated.has(i)) return;
        const x = enemyX(level, i, this.time);
        if (p.x + W < x - 20 || p.x > x + 20 || p.y + H < e.y - 30 || p.y > e.y) return;
        if (p.vy > 50 && oldBottom < e.y - 15) { this.defeated.add(i); p.vy = -430; }
        else if (p.invulnerable === 0) this.respawn(p);
      });
      if (this.stars.size === level.stars.length && near(p, level.goal + 20, 460, 64)) {
        p.reached = true; p.vx = p.vy = 0;
      }
    }
    const online = [...this.players.values()].filter((p) => p.online);
    if (online.length && online.every((p) => p.reached)) this.phase = this.level === LEVELS.length - 1 ? 'complete' : 'clear';
  }
  view(me = -1): AdventureView {
    return { t: 'adventure-state', phase: this.phase, level: this.level, epoch: this.epoch, time: this.time, stars: [...this.stars], defeated: [...this.defeated], paused: this.paused, me, players: [...this.players.values()].map((p) => ({ ...p, coins: [...p.coins] })) };
  }
}
