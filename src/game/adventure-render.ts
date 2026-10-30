import { drawBuddyImage, type BuddyAction } from './adventure-sprites';
import { MAP_THEMES, LEVELS, RACE_COUNTDOWN, ROPE, SPRING, eatenTreats, enemySize, enemyX, enemyY, goalOpen, moverRect, type AdventureView, type Rect } from './adventure';
import { t } from '../i18n';

const INK = '#70594f';
function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke = '') {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, stroke = '') {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const d = i % 2 ? r * .49 : r; ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
}
function smile(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath(); ctx.arc(x, y, 3, .1, Math.PI - .1); ctx.strokeStyle = INK; ctx.stroke();
}

export function drawTreat(ctx: CanvasRenderingContext2D, x: number, y: number, skin: number, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.lineWidth = 1.8;
  if (skin === 0) {
    ctx.beginPath(); ctx.moveTo(0, 12); ctx.bezierCurveTo(-22, -4, -8, -19, 0, -9); ctx.bezierCurveTo(8, -19, 22, -4, 0, 12); ctx.fillStyle = '#eb939e'; ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#88b78c'; ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(-3, -14); ctx.lineTo(0, -10); ctx.lineTo(5, -16); ctx.lineTo(9, -9); ctx.closePath(); ctx.fill();
    for (const [sx, sy] of [[-5, -3], [4, -3], [0, 4]]) oval(ctx, sx, sy, 1, 1.5, '#fff7d5');
  } else {
    round(ctx, -11, -8, 22, 23, 6, '#edc578', INK); round(ctx, -13, -13, 26, 7, 3, '#c49c75', INK);
    oval(ctx, 0, 4, 7, 7, '#fff5c5'); ctx.fillStyle = INK; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('H', 0, 7);
  }
  ctx.restore();
}

export { drawBuddyAvatar as drawAvatar, loadCharacterSprites } from './adventure-sprites';

export class AdventureRenderer {
  private ctx: CanvasRenderingContext2D;
  private observer: ResizeObserver;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private camera = 0;
  private level = -1;
  private last = performance.now();
  private animations = new Map<number, { action: BuddyAction; since: number; skin: string }>();
  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas); this.resize();
  }
  private resize() {
    this.width = Math.max(1, this.canvas.clientWidth); this.height = Math.max(1, this.canvas.clientHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * this.dpr); this.canvas.height = Math.round(this.height * this.dpr);
  }
  close() { this.observer.disconnect(); }
  draw(s: AdventureView, _skin: string) {
    const ctx = this.ctx, level = LEVELS[s.level], theme = MAP_THEMES[level.theme];
    const now = performance.now(), dt = Math.min(.05, (now - this.last) / 1000); this.last = now;
    const scale = this.height / 460, worldWidth = this.width / scale;
    const me = s.players.find((p) => p.id === s.me);
    const focus = me || s.players.find((p) => p.online && !p.reached) || s.players[0];
    const target = Math.max(0, Math.min(level.width - worldWidth, (focus?.x ?? 90) - worldWidth * .35));
    if (this.level !== s.level || Math.abs(target - this.camera) > worldWidth) { this.camera = target; this.level = s.level; this.animations.clear(); }
    this.camera += (target - this.camera) * Math.min(1, dt * 9);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
    ctx.save(); ctx.scale(scale, scale); ctx.translate(0, -100); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const gradient = ctx.createLinearGradient(0, 100, 0, 590); gradient.addColorStop(0, theme.sky); gradient.addColorStop(1, '#fffcf3'); ctx.fillStyle = gradient; ctx.fillRect(0, 100, worldWidth, 590);
    oval(ctx, worldWidth - 100, 155, 32, 32, level.theme === 2 ? '#fff9d9' : '#ffe7a6'); oval(ctx, worldWidth - 110, 153, 2, 3, INK); oval(ctx, worldWidth - 90, 153, 2, 3, INK); smile(ctx, worldWidth - 100, 160);
    if (level.theme === 2) for (let i = 0; i < 12; i++) { ctx.lineWidth = 1; star(ctx, i * 131 + 20, 125 + i % 3 * 39, 3, '#fff6ca'); }
    for (let i = -1; i < 9; i++) {
      const x = i * 220 - (this.camera * .12 % 220), y = 165 + (i % 3) * 38;
      oval(ctx, x, y, 43, 12, '#ffffffc9'); oval(ctx, x - 15, y - 10, 19, 17, '#ffffffc9'); oval(ctx, x + 12, y - 14, 23, 20, '#ffffffc9');
    }
    for (let i = -1; i < 10; i++) {
      const x = i * 230 - (this.camera * .25 % 230);
      oval(ctx, x, 475, 180, 150 + (i % 2) * 35, i % 2 ? '#dbe6c5' : '#e5ebd5');
      oval(ctx, x + 90, 490, 140, 85, '#cbdcbe');
    }
    ctx.fillStyle = '#d2eeea'; ctx.fillRect(0, 525, worldWidth, 65);
    for (let i = 0; i < worldWidth / 70; i++) {
      ctx.beginPath(); ctx.arc(i * 70 + Math.sin(now / 2000) * 7, 551, 16, 0, Math.PI); ctx.strokeStyle = '#f4fffc'; ctx.stroke();
    }
    ctx.translate(-this.camera, 0);
    for (const r of level.platforms) {
      const floating = r.h < 100;
      round(ctx, r.x, r.y, r.w, r.h, floating ? 12 : 10, floating ? '#e6cba8' : '#ecd6b7', '#baa388');
      round(ctx, r.x - 1, r.y - 2, r.w + 2, 17, 8, theme.grass, '#82a987');
      for (let x = r.x + 14; x < r.x + r.w; x += 30) {
        oval(ctx, x, r.y + 13, 12, 7, theme.grass);
        if (!floating && x % 90 < 30) { oval(ctx, x, r.y + 48, 3, 2, '#d9bd99'); oval(ctx, x + 10, r.y + 72, 2, 2, '#d9bd99'); }
      }
      if (!floating) for (let x = r.x + 50; x < r.x + r.w - 20; x += 170) {
        ctx.strokeStyle = '#81ad83'; ctx.beginPath(); ctx.moveTo(x, r.y); ctx.lineTo(x, r.y - 17); ctx.stroke();
        for (let i = 0; i < 5; i++) oval(ctx, x + Math.cos(i * 1.26) * 5, r.y - 19 + Math.sin(i * 1.26) * 5, 4, 4, '#fff9ec');
        oval(ctx, x, r.y - 19, 3, 3, '#eec888');
      }
    }
    this.devices(s, theme.accent, now);
    // 弹簧垫：红色软垫压在弹簧上；移动平台：一朵软软的云
    for (const sp of level.springs ?? []) {
      const y = sp.y - SPRING.h;
      ctx.strokeStyle = '#b08a5e'; ctx.beginPath();
      for (let i = 0; i <= 6; i++) ctx.lineTo(sp.x + 12 + (i % 2) * 32, y + 6 + i * 1.3);
      ctx.stroke(); ctx.strokeStyle = INK;
      round(ctx, sp.x, y - 2, SPRING.w, 9, 5, '#f08c94', INK);
    }
    for (const m of level.movers ?? []) {
      const r = moverRect(m, s.time);
      round(ctx, r.x, r.y, r.w, r.h, 10, '#ffffff', '#c9d6e0');
      for (let x = r.x + 16; x < r.x + r.w - 8; x += 26) oval(ctx, x, r.y + 2, 14, 9, '#ffffff');
      oval(ctx, r.x + r.w / 2 - 8, r.y + 10, 1.5, 2, INK); oval(ctx, r.x + r.w / 2 + 8, r.y + 10, 1.5, 2, INK);
    }
    const eaten = eatenTreats(s.players);
    level.coins.forEach((item, i) => { if (!eaten.has(i)) drawTreat(ctx, item.x, item.y + Math.sin(now / 380 + i) * 3, theme.treat, .8); });
    level.stars.forEach((item, i) => {
      if (s.stars.includes(i)) return;
      oval(ctx, item.x, item.y + 3, 24, 24, '#fff4c480'); star(ctx, item.x, item.y + Math.sin(now / 400) * 4, 17, '#f6d47a');
      oval(ctx, item.x - 5, item.y - 1, 1.5, 2, INK); oval(ctx, item.x + 5, item.y - 1, 1.5, 2, INK);
    });
    level.checkpoints.forEach((cp, i) => {
      const active = (me?.checkpoint ?? -1) >= i;
      round(ctx, cp.x - 3, cp.y - 83, 6, 83, 3, '#b4997b');
      ctx.fillStyle = active ? theme.accent : '#e9ddca'; ctx.beginPath(); ctx.moveTo(cp.x + 3, cp.y - 80); ctx.quadraticCurveTo(cp.x + 20, cp.y - 86, cp.x + 40, cp.y - 70); ctx.lineTo(cp.x + 37, cp.y - 45); ctx.quadraticCurveTo(cp.x + 16, cp.y - 60, cp.x + 3, cp.y - 50); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = INK; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(t(active ? 'adv.cp.saved' : 'adv.cp.rest'), cp.x + 10, cp.y - 94);
    });
    level.enemies.forEach((e, i) => {
      if (s.defeated.includes(i)) return;
      const x = enemyX(level, i, s.time), y = enemyY(level, i, s.time), k = enemySize(e), hp = e.hp ?? 1;
      if (y < e.y) oval(ctx, x, e.y - 2, 16, 3, '#70594f1c');
      ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
      // 刚被踩：闪烁并压扁一点
      if (s.stunned?.includes(i)) { ctx.globalAlpha = Math.floor(now / 90) % 2 ? .45 : 1; ctx.scale(1.12, .85); }
      oval(ctx, -10, -3, 10, 4, '#c1a5ac'); oval(ctx, 10, -3, 10, 4, '#c1a5ac');
      round(ctx, -22, -30, 44, 27, 14, hp > 1 ? '#c7a6dd' : theme.accent, INK);
      oval(ctx, -7, -18, 2, 2, INK); oval(ctx, 7, -18, 2, 2, INK); smile(ctx, 0, -14);
      oval(ctx, -14, -12, 4, 2, '#ffffff70'); oval(ctx, 14, -12, 4, 2, '#ffffff70');
      // Boss 戴一顶小皇冠
      if (hp > 1) { ctx.beginPath(); ctx.moveTo(-10, -29); ctx.lineTo(-10, -39); ctx.lineTo(-4, -33); ctx.lineTo(0, -41); ctx.lineTo(4, -33); ctx.lineTo(10, -39); ctx.lineTo(10, -29); ctx.closePath(); ctx.fillStyle = '#f6d47a'; ctx.fill(); ctx.stroke(); }
      ctx.restore();
      if (hp > 1) for (let h = 0; h < hp; h++) {
        ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = h < hp - (s.hits?.[i] ?? 0) ? '#e4686c' : '#d8c8bc';
        ctx.fillText('♥', x + (h - (hp - 1) / 2) * 16, y - 30 * k - 24);
      }
    });
    const gx = level.goal, open = goalOpen(level, s.mode, s.stars.length, s.defeated);
    round(ctx, gx - 25, 377, 140, 123, 16, '#fff5e6', '#bda28c');
    ctx.beginPath(); ctx.moveTo(gx - 40, 382); ctx.quadraticCurveTo(gx + 45, 285, gx + 130, 382); ctx.closePath(); ctx.fillStyle = theme.accent; ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
    round(ctx, gx + 24, 424, 43, 76, 20, open ? '#a8cdb0' : '#dfc9b4', INK);
    oval(ctx, gx + 56, 466, 3, 3, '#fff6d6'); round(ctx, gx - 4, 410, 19, 23, 5, '#d7eeeb', '#bda28c'); round(ctx, gx + 78, 410, 19, 23, 5, '#d7eeeb', '#bda28c');
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.font = 'bold 14px sans-serif';
    ctx.fillText(open ? t('adv.goal.open') : s.stars.length < 3 ? t('adv.goal.need', { n: 3 - s.stars.length }) : t('adv.goal.boss'), gx + 45, 350);
    if (s.mode === 'rope') this.rope(s);
    for (const p of s.players) {
      // 被吃掉的队友藏在肚子里，不单独画
      if (!p.online || p.eatenBy >= 0 || (p.invulnerable > 0 && Math.floor(now / 90) % 2)) continue;
      oval(ctx, p.x + 17, p.y + 45, 19, 4, '#70594f1c');
      const action: BuddyAction = s.phase === 'clear' || s.phase === 'complete' || p.reached ? 'idle' : !p.grounded ? p.vy < -20 ? 'jump' : 'fall' : Math.abs(p.vx) > 30 ? 'run' : 'idle';
      let animation = this.animations.get(p.id);
      if (!animation || animation.action !== action || animation.skin !== p.skin) {
        animation = { action, since: now, skin: p.skin }; this.animations.set(p.id, animation);
      }
      drawBuddyImage(ctx, p.x + 17, p.y + 44, p.skin, action, (now - animation.since) / 1000, p.facing, p.eating >= 0);
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      const name = `${p.name}${p.id === s.me ? ` · ${t('adv.you')}` : ''}`;
      const width = ctx.measureText(name).width + 16;
      round(ctx, p.x + 17 - width / 2, p.y - 45, width, 20, 9, '#fffdf3dc');
      ctx.fillStyle = INK; ctx.fillText(name, p.x + 17, p.y - 31);
      if (p.reached) star(ctx, p.x + 17, p.y - 59, 8, '#f6d47a');
    }
    if (this.camera < 350) {
      round(ctx, 54, 318, 207, 57, 12, '#fffdf3e6', '#dbc6b3'); ctx.textAlign = 'left'; ctx.fillStyle = INK; ctx.font = 'bold 12px sans-serif';
      const tip = TIPS[s.mode];
      ctx.fillText(tip[0], 69, 340); ctx.font = '11px sans-serif'; ctx.fillText(tip[1], 69, 359);
    }
    // 竞速倒数：3、2、1，开跑后“出发！”再停留半秒
    if (s.mode === 'race' && s.phase === 'playing' && s.time < RACE_COUNTDOWN + .6) {
      const left = Math.ceil(RACE_COUNTDOWN - s.time), text = left > 0 ? String(left) : t('adv.race.go');
      ctx.font = 'bold 64px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 8; ctx.strokeStyle = '#fffdf3';
      const cx = this.camera + worldWidth / 2;
      ctx.strokeText(text, cx, 300); ctx.fillStyle = INK; ctx.fillText(text, cx, 300); ctx.lineWidth = 2;
    }
    ctx.restore();
  }
  /** 机关：踩板（激活后压下去）、激活后出现的木板吊桥 / 台阶、未打开时挡路的糖果闸门。 */
  private devices(s: AdventureView, accent: string, now: number) {
    const ctx = this.ctx;
    (LEVELS[s.level].devices ?? []).forEach((d, i) => {
      const on = s.active.includes(i), p = d.plate;
      round(ctx, p.x - 4, p.y + p.h - 4, p.w + 8, 6, 3, '#d8c1a6', '#baa388');
      round(ctx, p.x + 6, on ? p.y + 3 : p.y - 4, p.w - 12, on ? 6 : 12, 6, on ? '#a8cdb0' : accent, INK);
      if (d.need > 1 && !on) { ctx.fillStyle = INK; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(t('adv.plate.need', { n: d.need }), p.x + p.w / 2, p.y - 12); }
      if (on) for (const r of d.solid ?? []) plank(ctx, r);
      else for (const r of d.gate ?? []) gate(ctx, r, now);
      if (!on) for (const r of d.solid ?? []) { ctx.setLineDash([6, 8]); ctx.strokeStyle = '#baa38899'; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]); }
    });
  }
  /** 串一串：相邻两人之间一根软软下垂的红白毛线，越松垂得越多。 */
  private rope(s: AdventureView) {
    const ctx = this.ctx;
    const chain = s.players.filter((p) => p.online && p.eatenBy < 0).sort((a, b) => a.id - b.id);
    for (let i = 0; i + 1 < chain.length; i++) {
      const a = chain[i], b = chain[i + 1];
      const ax = a.x + 17, ay = a.y + 26, bx = b.x + 17, by = b.y + 26;
      const sag = Math.max(0, ROPE - Math.hypot(bx - ax, by - ay)) * .55 + 4;
      const path = () => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by); };
      ctx.lineWidth = 5; ctx.strokeStyle = '#e4686c'; path(); ctx.stroke();
      ctx.lineWidth = 2.5; ctx.setLineDash([5, 6]); ctx.strokeStyle = '#fff6ea'; path(); ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = 2;
    }
  }
}
const TIPS = {
  classic: [t('adv.intro.classic'), t('adv.intro.classic.2')],
  rope: [t('adv.intro.rope'), t('adv.intro.rope.2')],
  eat: [t('adv.intro.eat'), t('adv.intro.eat.2')],
  stack: [t('adv.intro.stack'), t('adv.intro.stack.2')],
  race: [t('adv.intro.race'), t('adv.intro.race.2')],
} as const;
function plank(ctx: CanvasRenderingContext2D, r: Rect) {
  round(ctx, r.x, r.y, r.w, r.h, 6, '#e8c48f', '#b08a5e');
  ctx.strokeStyle = '#c99f6a'; for (let x = r.x + 30; x < r.x + r.w; x += 30) { ctx.beginPath(); ctx.moveTo(x, r.y + 3); ctx.lineTo(x, r.y + r.h - 3); ctx.stroke(); }
  ctx.strokeStyle = INK;
}
function gate(ctx: CanvasRenderingContext2D, r: Rect, now: number) {
  round(ctx, r.x, r.y, r.w, r.h, 8, '#fff2f2', INK);
  ctx.save(); ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8); ctx.clip();
  ctx.fillStyle = '#f08c94';
  for (let y = r.y - 40 + (now / 40) % 30; y < r.y + r.h; y += 30) { ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y - 14); ctx.lineTo(r.x + r.w, y - 2); ctx.lineTo(r.x, y + 12); ctx.fill(); }
  ctx.restore();
}

