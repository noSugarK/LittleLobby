import { drawBuddyImage, type BuddyAction } from './adventure-sprites';
import { MAP_THEMES, LEVELS, enemyX, type AdventureView } from './adventure';

const INK = '#70594f';
function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke = '') {
  // 旧版 iOS（<16）与部分安卓 WebView 没有 roundRect，退回直角矩形，避免每帧抛错导致黑屏
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); ctx.fillStyle = fill; ctx.fill();
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
  private animations = new Map<number, { action: BuddyAction; since: number; skin: number }>();
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
  draw(s: AdventureView, _skin: number) {
    const ctx = this.ctx, theme = MAP_THEMES[s.level], level = LEVELS[s.level];
    const now = performance.now(), dt = Math.min(.05, (now - this.last) / 1000); this.last = now;
    const scale = this.height / 460, worldWidth = this.width / scale;
    const me = s.players.find((p) => p.id === s.me);
    const focus = me || s.players.find((p) => p.online && !p.reached) || s.players[0];
    const target = Math.max(0, Math.min(level.width - worldWidth, (focus?.x ?? 90) - worldWidth * .35));
    if (this.level !== s.level || Math.abs(target - this.camera) > worldWidth) { this.camera = target; this.level = s.level; this.animations.clear(); }
    this.camera += (target - this.camera) * Math.min(1, dt * 9);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
    ctx.save(); ctx.scale(scale, scale); ctx.translate(0, -100); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const gradient = ctx.createLinearGradient(0, 100, 0, 590); gradient.addColorStop(0, s.level === 1 ? '#edf6fc' : s.level === 2 ? '#eee9f8' : theme.sky); gradient.addColorStop(1, '#fffcf3'); ctx.fillStyle = gradient; ctx.fillRect(0, 100, worldWidth, 590);
    oval(ctx, worldWidth - 100, 155, 32, 32, s.level === 2 ? '#fff9d9' : '#ffe7a6'); oval(ctx, worldWidth - 110, 153, 2, 3, INK); oval(ctx, worldWidth - 90, 153, 2, 3, INK); smile(ctx, worldWidth - 100, 160);
    if (s.level === 2) for (let i = 0; i < 12; i++) { ctx.lineWidth = 1; star(ctx, i * 131 + 20, 125 + i % 3 * 39, 3, '#fff6ca'); }
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
    level.coins.forEach((item, i) => { if (!me?.coins.includes(i)) drawTreat(ctx, item.x, item.y + Math.sin(now / 380 + i) * 3, theme.treat, .8); });
    level.stars.forEach((item, i) => {
      if (s.stars.includes(i)) return;
      oval(ctx, item.x, item.y + 3, 24, 24, '#fff4c480'); star(ctx, item.x, item.y + Math.sin(now / 400) * 4, 17, '#f6d47a');
      oval(ctx, item.x - 5, item.y - 1, 1.5, 2, INK); oval(ctx, item.x + 5, item.y - 1, 1.5, 2, INK);
    });
    level.checkpoints.forEach((cp, i) => {
      const active = (me?.checkpoint ?? -1) >= i;
      round(ctx, cp.x - 3, cp.y - 83, 6, 83, 3, '#b4997b');
      ctx.fillStyle = active ? theme.accent : '#e9ddca'; ctx.beginPath(); ctx.moveTo(cp.x + 3, cp.y - 80); ctx.quadraticCurveTo(cp.x + 20, cp.y - 86, cp.x + 40, cp.y - 70); ctx.lineTo(cp.x + 37, cp.y - 45); ctx.quadraticCurveTo(cp.x + 16, cp.y - 60, cp.x + 3, cp.y - 50); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = INK; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(active ? '已存档' : '休息站', cp.x + 10, cp.y - 94);
    });
    level.enemies.forEach((e, i) => {
      if (s.defeated.includes(i)) return;
      const x = enemyX(level, i, s.time);
      oval(ctx, x - 10, e.y - 3, 10, 4, '#c1a5ac'); oval(ctx, x + 10, e.y - 3, 10, 4, '#c1a5ac');
      round(ctx, x - 22, e.y - 30, 44, 27, 14, theme.accent, INK);
      oval(ctx, x - 7, e.y - 18, 2, 2, INK); oval(ctx, x + 7, e.y - 18, 2, 2, INK); smile(ctx, x, e.y - 14);
      oval(ctx, x - 14, e.y - 12, 4, 2, '#ffffff70'); oval(ctx, x + 14, e.y - 12, 4, 2, '#ffffff70');
    });
    const gx = level.goal;
    round(ctx, gx - 25, 377, 140, 123, 16, '#fff5e6', '#bda28c');
    ctx.beginPath(); ctx.moveTo(gx - 40, 382); ctx.quadraticCurveTo(gx + 45, 285, gx + 130, 382); ctx.closePath(); ctx.fillStyle = theme.accent; ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
    round(ctx, gx + 24, 424, 43, 76, 20, s.stars.length === 3 ? '#a8cdb0' : '#dfc9b4', INK);
    oval(ctx, gx + 56, 466, 3, 3, '#fff6d6'); round(ctx, gx - 4, 410, 19, 23, 5, '#d7eeeb', '#bda28c'); round(ctx, gx + 78, 410, 19, 23, 5, '#d7eeeb', '#bda28c');
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.font = 'bold 14px sans-serif'; ctx.fillText(s.stars.length === 3 ? '来野餐吧！' : `还差 ${3 - s.stars.length} 颗星星`, gx + 45, 350);
    for (const p of s.players) {
      if (!p.online || (p.invulnerable > 0 && Math.floor(now / 90) % 2)) continue;
      oval(ctx, p.x + 17, p.y + 45, 19, 4, '#70594f1c');
      const action: BuddyAction = s.phase !== 'playing' || p.reached ? 'idle' : !p.grounded ? p.vy < -20 ? 'jump' : 'fall' : Math.abs(p.vx) > 30 ? 'run' : 'idle';
      let animation = this.animations.get(p.id);
      if (!animation || animation.action !== action || animation.skin !== p.skin) {
        animation = { action, since: now, skin: p.skin }; this.animations.set(p.id, animation);
      }
      drawBuddyImage(ctx, p.x + 17, p.y + 44, p.skin, action, (now - animation.since) / 1000, p.facing);
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      const name = `${p.name}${p.id === s.me ? ' · 你' : ''}`;
      const width = ctx.measureText(name).width + 16;
      round(ctx, p.x + 17 - width / 2, p.y - 45, width, 20, 9, '#fffdf3dc');
      ctx.fillStyle = INK; ctx.fillText(name, p.x + 17, p.y - 31);
      if (p.reached) star(ctx, p.x + 17, p.y - 59, 8, '#f6d47a');
    }
    if (this.camera < 350) {
      round(ctx, 54, 318, 207, 57, 12, '#fffdf3e6', '#dbc6b3'); ctx.textAlign = 'left'; ctx.fillStyle = INK; ctx.font = 'bold 12px sans-serif';
      ctx.fillText('← → 散步   ·   按住跳得更高', 69, 340); ctx.font = '11px sans-serif'; ctx.fillText('跳到台阶上，找齐三颗小星星', 69, 359);
    }
    ctx.restore();
  }
}

