import { F, homeSpot, type Sim, type SimPlayer } from './sim';
import { BTN_A, BTN_B, BTN_X, BTN_Y, type Input } from './types';

interface BotMem {
  holdB: number; // 剩余蓄力秒数
  releaseB: boolean;
  think: number;
  noise: [number, number];
}

const mem = new Map<number, BotMem>();

export function forgetBot(id: number) {
  mem.delete(id);
}

/** 简单 AI：离球最近的人去抢球，其余人按阵型跟随 */
export function botInput(sim: Sim, p: SimPlayer, dt: number): Input {
  let m = mem.get(p.id);
  if (!m) {
    m = { holdB: 0, releaseB: false, think: 0, noise: [0, 0] };
    mem.set(p.id, m);
  }
  const b = sim.ball;
  const mates = sim.teamPlayers(p.team);
  const attackX = p.team === 0 ? F.HL : -F.HL;
  const ownX = -attackX;

  m.think -= dt;
  if (m.think <= 0) {
    m.think = 0.3 + Math.random() * 0.3;
    m.noise = [(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30];
  }

  // 蓄力射门进行中
  if (m.holdB > 0) {
    m.holdB -= dt;
    const aim = aimAt(b.x, b.y, attackX, 0);
    return { jx: aim[0], jy: aim[1], btn: BTN_B };
  }
  if (m.releaseB) {
    m.releaseB = false;
    return { jx: 0, jy: 0, btn: 0 };
  }

  const dist = (q: SimPlayer) => Math.hypot(q.x - b.x, q.y - b.y);
  const chaser = mates.reduce((a, c) => (dist(c) < dist(a) ? c : a), mates[0]);
  const myD = dist(p);
  const isKeeper = mates.length >= 3 && p.slot === 0;
  const nearOwnGoal = Math.abs(b.x - ownX) < 260;
  const chase = chaser === p || (isKeeper && nearOwnGoal && Math.abs(b.y) < F.BOX_W && myD < 160);

  if (!chase) {
    let [hx, hy] = homeSpot(p.team, p.slot, mates.length);
    if (isKeeper) {
      hx = ownX * 0.93;
      hy = Math.max(-F.GW, Math.min(F.GW, b.y * 0.6));
    } else {
      hx += b.x * 0.55;
      hy = hy * 0.85 + b.y * 0.3;
      hx = Math.max(-F.HL + 60, Math.min(F.HL - 60, hx));
    }
    return moveTo(p, hx + m.noise[0], hy + m.noise[1], 0);
  }

  // 抢球：跑到球的“射门方向后方”再推进
  const goalY = Math.max(-F.GW * 0.6, Math.min(F.GW * 0.6, b.y * 0.3));
  const [ax, ay] = aimAt(b.x, b.y, attackX, goalY);
  const behindX = b.x - ax * (F.PR + F.BR + 2);
  const behindY = b.y - ay * (F.PR + F.BR + 2);
  const ahead = (p.x - b.x) * ax + (p.y - b.y) * ay; // >0 表示人在球前面
  let btn = 0;

  // 对手持球且离得近 -> 偶尔铲球
  for (const q of sim.players.values()) {
    if (q.team === p.team) continue;
    const qd = Math.hypot(q.x - b.x, q.y - b.y);
    const pq = Math.hypot(q.x - p.x, q.y - p.y);
    if (qd < F.PR + F.BR + 6 && pq < 55 && p.tackleCd <= 0 && Math.random() < 0.04) btn |= BTN_Y;
  }

  if (ahead > -4) {
    // 绕到球后面
    const side = (p.x - b.x) * -ay + (p.y - b.y) * ax >= 0 ? 1 : -1;
    const tx = behindX - ax * 25 + -ay * side * 34;
    const ty = behindY - ay * 25 + ax * side * 34;
    const r = moveTo(p, tx, ty, myD > 160 ? BTN_X : 0);
    r.btn |= btn;
    return r;
  }

  const toBehind = Math.hypot(p.x - behindX, p.y - behindY);
  if (toBehind > 16) {
    const r = moveTo(p, behindX, behindY, myD > 160 && p.stamina > 0.4 ? BTN_X : 0);
    r.btn |= btn;
    return r;
  }

  // 在球后方，带球推进
  const goalDist = Math.hypot(attackX - b.x, goalY - b.y);
  const facing = Math.cos(p.angle) * ax + Math.sin(p.angle) * ay;
  if (goalDist < 420 && facing > 0.85 && p.kickCd <= 0) {
    m.holdB = Math.min(0.8, 0.15 + goalDist / 700);
    m.releaseB = true;
    return { jx: ax, jy: ay, btn: BTN_B };
  }
  // 受到逼抢时尝试传球
  let pressed = false;
  for (const q of sim.players.values()) {
    if (q.team !== p.team && Math.hypot(q.x - p.x, q.y - p.y) < 60) pressed = true;
  }
  if (pressed && mates.length > 1 && Math.random() < 0.08) btn |= BTN_A;
  return { jx: ax, jy: ay, btn };
}

function aimAt(x: number, y: number, tx: number, ty: number): [number, number] {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
}

function moveTo(p: SimPlayer, x: number, y: number, btn: number): Input {
  const dx = x - p.x;
  const dy = y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 6) return { jx: 0, jy: 0, btn: 0 };
  const s = Math.min(1, d / 40);
  return { jx: (dx / d) * s, jy: (dy / d) * s, btn };
}
