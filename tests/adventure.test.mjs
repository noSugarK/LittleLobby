import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith('.ts')) return next(url, context);
    return { format: 'module', shortCircuit: true, source: ts.transpile(readFileSync(new URL(url), 'utf8'), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }) };
  },
});
const { AdventureGame, LEVELS, enemyX, modeLevels, padInput, solids } = await import('../src/game/adventure.ts');
const { AdventureHost } = await import('../src/net/adventure-host.ts');
const { joinHashFromQr } = await import('../src/ui/scan.ts');
const tick = (g, frames, input = { axis: 0, jump: false }) => { for (let i = 0; i < frames; i++) { g.input(1, input); g.step(1 / 60); } };
function game() { const g = new AdventureGame(); g.add(1, '一二'); g.start(); tick(g, 2); return g; }

test('切换角色只改造型，保留位置、收集与检查点；非法角色 id 不生效', () => {
  const g = game(), p = g.players.get(1); p.coins = [1]; p.checkpoint = 0;
  assert.equal(p.skin, 'yier');
  // 主机不必拥有这个角色：画面上会用默认角色代替，但 id 照样同步给其他人
  for (const skin of ['bubu', 'nailong', 'some-new-buddy']) {
    const before = [p.x, p.y, p.hearts, p.checkpoint, [...p.coins]];
    g.skin(1, skin); assert.equal(p.skin, skin);
    assert.deepEqual([p.x, p.y, p.hearts, p.checkpoint, p.coins], before);
  }
  for (const invalid of [-1, 3, '', 'Nailong', '../x', 'a'.repeat(33), NaN, null]) g.skin(1, invalid);
  assert.equal(p.skin, 'some-new-buddy');
});

test('长按跳得更高，短按仍能跳起；台阶会落地，离线旧输入会停下', () => {
  const long = game(), short = game();
  let longMin = 999, shortMin = 999;
  for (let i = 0; i < 60; i++) {
    long.input(1, { axis: 0, jump: i < 35 }); short.input(1, { axis: 0, jump: i < 2 });
    long.step(1 / 60); short.step(1 / 60);
    longMin = Math.min(longMin, long.players.get(1).y); shortMin = Math.min(shortMin, short.players.get(1).y);
  }
  assert.ok(longMin < shortMin - 15, `${longMin} vs ${shortMin}`); assert.ok(shortMin < 430);
  assert.equal(long.players.get(1).grounded, true);
  tick(long, 20, { axis: 1, jump: false });
  for (let i = 0; i < 100; i++) long.step(1 / 60);
  assert.equal(long.players.get(1).vx, 0);
});

test('掉坑在检查点复活，不丢星星或点心；断线停止输入，视图不会改写主机', () => {
  const g = game(), p = g.players.get(1); p.checkpoint = 0; p.coins = [0]; g.stars.add(0); p.y = 720;
  g.step(1 / 60);
  assert.equal(p.deaths, 1); assert.equal(p.hearts, 2); assert.equal(p.x, LEVELS[0].checkpoints[0].x);
  assert.deepEqual(p.coins, [0]); assert.deepEqual([...g.stars], [0]);
  g.input(1, { axis: 1, jump: true }); g.online(1, false); const x = p.x; g.step(1 / 60); assert.equal(p.x, x);
  g.online(1, true); tick(g, 15); assert.equal(p.vx, 0);
  const coins = [...p.coins], view = g.view(1); view.players[0].coins.push(8); view.players[0].x = 10000;
  assert.deepEqual(p.coins, coins); assert.notEqual(p.x, 10000);
});

test('未集齐星星不能过关；在线伙伴都到达才完成，离线者不阻塞', () => {
  const g = game(); g.add(2, '朋友'); const level = LEVELS[0];
  for (const p of g.players.values()) { p.x = level.goal; p.y = 456; }
  g.step(1 / 60); assert.equal(g.phase, 'playing');
  g.stars = new Set([0, 1, 2]); g.players.get(2).x = 100;
  g.step(1 / 60); assert.equal(g.players.get(1).reached, true); assert.equal(g.phase, 'playing');
  g.online(2, false); g.step(1 / 60); assert.equal(g.phase, 'clear');
  assert.equal(g.start(), true); assert.equal(g.level, 1); assert.equal(g.stars.size, 0);
});

test('从上方踩怪会弹起并消灭小怪，侧碰受伤后有无敌保护', () => {
  const stomp = game(), p = stomp.players.get(1), enemy = 1;
  Object.assign(p, { x: enemyX(LEVELS[0], enemy, stomp.time) - 17, y: 423, vy: 200, grounded: false });
  stomp.step(1 / 60);
  assert.equal(stomp.defeated.has(enemy), true); assert.ok(p.vy < 0); assert.equal(p.hearts, 3);
  const side = game(), q = side.players.get(1);
  Object.assign(q, { x: enemyX(LEVELS[0], enemy, side.time) - 17, y: 456 }); side.step(1 / 60);
  assert.equal(q.hearts, 2); assert.equal(q.deaths, 1);
  Object.assign(q, { x: enemyX(LEVELS[0], enemy, side.time) - 17, y: 456 }); side.step(1 / 60);
  assert.equal(q.hearts, 2); assert.equal(q.deaths, 1);
});

// 真正使用左右/跳跃输入走完每张地图，不传送到星星或终点。
const paths = [
  [[400, 410], [595, 345], [980, 500], [1130, 415], [1340, 340], [1830, 500], [1990, 415], [2200, 340], [2895, 500]],
  [[340, 415], [520, 335], [850, 500], [1040, 415], [1230, 335], [1580, 500], [1770, 415], [1970, 335], [3100, 500]],
  [[380, 415], [570, 335], [930, 500], [1110, 415], [1310, 335], [1730, 500], [2560, 500], [2710, 410], [2900, 335], [3300, 500]],
];
test('仅通过正常移动和跳跃可依次完成三关、收齐星星并重新开始', () => {
  const g = game();
  for (let level = 0; level < paths.length; level++) {
    for (const [x, y] of paths[level]) {
      let arrived = false;
      for (let frame = 0; frame < 1800; frame++) {
        const p = g.players.get(1), dx = x - 17 - p.x;
        if ((Math.abs(dx) < 9 && Math.abs(p.y + 44 - y) < 2 && p.grounded) || p.reached) { arrived = true; break; }
        const axis = Math.abs(dx) < 5 ? 0 : Math.sign(dx);
        const floor = LEVELS[level].platforms.find((r) => Math.abs(p.y + 44 - r.y) < 2 && p.x + 34 > r.x && p.x < r.x + r.w);
        const edge = floor && axis > 0 && x > floor.x + floor.w && p.x + 34 > floor.x + floor.w - 25;
        const up = p.grounded && y < p.y + 44 - 8 && Math.abs(dx) < 185;
        g.input(1, { axis, jump: p.grounded ? !!(edge || up) : p.vy < 0 });
        g.step(1 / 60);
      }
      assert.ok(arrived, `level ${level + 1}, waypoint ${x}/${y}: ${JSON.stringify(g.players.get(1))}`);
    }
    tick(g, 3);
    assert.equal(g.stars.size, 3, `level ${level + 1} stars`);
    assert.equal(g.phase, level === 2 ? 'complete' : 'clear');
    if (level < 2) assert.equal(g.start(), true);
  }
  assert.equal(g.start(), true); assert.equal(g.level, 0); assert.equal(g.phase, 'playing');
});

test('主机过滤乱序、旧关卡和越界输入；按身份重连，角色切换走同一网络', () => {
  let cb; const sent = [];
  const host = new AdventureHost('ABCDE', (_room, callbacks) => {
    cb = callbacks; return { cb, sendJson: (cid, m) => sent.push([cid, m]), broadcastFast() {}, close() {}, drop: (cid) => cb.onLeave(cid) };
  });
  assert.equal(cb.onHello('one', { token: 't', name: 'P' }), null); cb.onPeer('one');
  assert.equal(sent[0][1].game, 'adventure'); host.game.start();
  sent.length = 0;
  cb.onLink('one', 'relay');
  assert.equal(sent[0][1].pid, 1, '首次握手丢失后，在可用链路补发玩家身份');
  assert.equal(sent[1][1].phase, 'playing');
  assert.equal(sent[1][1].me, 1);
  const deliver = (patch) => cb.onJson('one', { t: 'adventure-input', epoch: host.game.epoch, seq: 5, axis: 1, jump: false, ...patch });
  deliver({}); deliver({ seq: 4, axis: -1 }); deliver({ seq: 6, axis: NaN }); deliver({ seq: 6, epoch: 0, axis: -1 });
  tick(host.game, 0); host.game.step(1 / 60); assert.ok(host.game.players.get(1).vx > 0);
  cb.onJson('one', { t: 'adventure-skin', skin: 'bubu' }); assert.equal(host.game.players.get(1).skin, 'bubu');
  host.game.players.get(1).coins = [0, 1];
  assert.equal(cb.onHello('new', { token: 't', name: 'P' }), null);
  assert.equal(host.game.players.size, 1); assert.deepEqual(host.game.players.get(1).coins, [0, 1]);
  deliver({ seq: 999, axis: -1 }); host.game.step(1 / 60); assert.equal(host.game.players.get(1).vx, 0);
  host.close();
});

test('扫码只透传闯关玩法和有效密码', () => {
  assert.equal(joinHashFromQr('https://example.com/#/join/ABCDE?game=adventure&evil=1'), '#/join/ABCDE?game=adventure');
  assert.equal(joinHashFromQr('https://example.com/#/join/ABCDE?game=other'), '#/join/ABCDE');
});

test('冒险公开房间发布玩法、人数和状态，心跳及断网恢复刷新，退出清理；私密房间不发布', async () => {
  const originalWindow = globalThis.window;
  const timers = [];
  globalThis.window = { setInterval: (fn, ms) => { timers.push({ fn, ms }); return 0; } };
  let host;
  try {
    for (const listed of [true, false]) {
      const sent = [];
      const signal = { pub: (...args) => sent.push(args) };
      let cb;
      host = new AdventureHost('ABCDE', (_room, callbacks) => {
        cb = callbacks;
        return { signal, start: async () => {}, sendJson() {}, broadcastFast() {}, close() {} };
      }, '1234', listed);
      host.addLocal('房主');
      if (listed) assert.equal(signal.willClearTopic, 'info', '连接前设置遗嘱，异常掉线自动移除房间');
      await host.start();
      if (listed) {
        const info = () => sent.at(-1)[1];
        assert.equal(sent.at(-1)[0], 'info'); assert.equal(sent.at(-1)[2], true);
        assert.deepEqual({ ...info(), ts: 0 }, { host: '房主', n: 1, max: 8, playing: false, lock: true, game: 'adventure', ts: 0 });
        assert.equal(cb.onHello('peer', { token: 'p', name: '伙伴', pin: '1234' }), null);
        cb.onPeer('peer'); assert.equal(info().n, 2);
        host.advance(); assert.equal(info().playing, true);
        cb.onLeave('peer'); assert.equal(info().n, 1);
        const count = sent.length;
        host.publish(); assert.equal(sent.length, count, '状态不变不重复发布');
        timers.find((timer) => timer.ms === 30000).fn(); assert.equal(sent.length, count + 1);
        signal.onStatus(true); assert.equal(sent.length, count + 2, '网络恢复重新公告');
      } else assert.ok(sent.every(([, data]) => data instanceof Uint8Array), '私密房间只清除旧公告');
      host.close(); assert.ok(sent.at(-1)[1] instanceof Uint8Array); assert.equal(sent.at(-1)[1].length, 0);
    }
  } finally { host?.close(); globalThis.window = originalWindow; }
});

test('足球同款手柄：摇杆过死区才移动，B 或上推到底跳跃，非游戏中不出输入', () => {
  assert.deepEqual(padInput(0.2, 0, false, true), { axis: 0, jump: false, act: false });
  assert.deepEqual(padInput(-0.6, 0.1, true, true, true), { axis: -1, jump: true, act: true });
  assert.deepEqual(padInput(0.5, -0.9, false, true), { axis: 1, jump: true, act: false });
  // 键盘 → + ↑ 被手柄归一化为 (0.71, -0.71)，边走边跳必须成立
  assert.deepEqual(padInput(Math.SQRT1_2, -Math.SQRT1_2, false, true), { axis: 1, jump: true, act: false });
  assert.deepEqual(padInput(0.9, -0.4, false, true), { axis: 1, jump: false, act: false });
  assert.deepEqual(padInput(1, -1, true, false, true), { axis: 0, jump: false, act: false });
});

test('手机点按：按下松开落在同一帧也能跳到约 100 像素，按住仍然更高', () => {
  const g = game(), p = g.players.get(1), ground = p.y;
  g.input(1, { axis: 0, jump: true }); g.input(1, { axis: 0, jump: false });
  let top = ground;
  for (let i = 0; i < 60; i++) { g.step(1 / 60); top = Math.min(top, p.y); }
  assert.ok(ground - top > 90, `点按只跳了 ${ground - top}px`);
});

// ---------- 合作玩法 ----------
function coop(mode) {
  const g = new AdventureGame(); g.add(1, '一二'); g.add(2, '布布');
  assert.equal(g.setMode(mode), true); assert.equal(g.start(), true);
  return g;
}
const settle = (g, frames = 20) => { for (let i = 0; i < frames; i++) { for (const id of g.players.keys()) g.input(id, { axis: 0, jump: false }); g.step(1 / 60); } };
const place = (p, x, y) => Object.assign(p, { x, y, vx: 0, vy: 0, grounded: false });

test('合作玩法至少两人才能开始，只打本玩法的关卡，打完即通关', () => {
  const solo = new AdventureGame(); solo.add(1, '一二');
  assert.equal(solo.setMode('rope'), true); assert.equal(solo.start(), false);
  assert.equal(solo.setMode('nope'), false);
  const g = coop('rope');
  assert.equal(g.level, modeLevels('rope')[0]); assert.equal(LEVELS[g.level].mode, 'rope');
  g.stars = new Set([0, 1, 2]);
  for (const p of g.players.values()) place(p, LEVELS[g.level].goal, 456);
  g.step(1 / 60); assert.equal(g.phase, 'complete');
  assert.equal(g.setMode('classic'), true); assert.equal(g.start(), true); assert.equal(g.level, 0);
});

test('串一串：站稳的队友用绳子吊住掉坑的人；全员都掉下去才一起回到共享检查点', () => {
  const g = coop('rope'), a = g.players.get(1), b = g.players.get(2);
  place(a, 300, 456); settle(g, 5);
  place(b, 560, 520);
  settle(g, 120);
  assert.equal(b.deaths, 0); assert.ok(b.y < 520, `吊在坑边没掉下去：${b.y}`);
  assert.equal(a.deaths, 0); assert.equal(a.grounded, true); assert.equal(a.x, 300, '站稳的人不会被拖走');
  // 吊着时可以起跳，往回爬上地面
  let back = false;
  for (let i = 0; i < 90 && !back; i++) { g.input(2, { axis: -1, jump: i < 20 }); g.input(1, { axis: 0, jump: false }); g.step(1 / 60); back = b.grounded && b.x + 34 <= 520 && b.y === 456; }
  assert.ok(back, `从坑边跳回地面：${JSON.stringify(b)}`);

  a.checkpoint = 0;
  place(a, 560, 520); place(b, 600, 520);
  settle(g, 90);
  assert.equal(a.deaths + b.deaths, 1, '只有先掉出画面的人扣血');
  assert.deepEqual([a.checkpoint, b.checkpoint], [0, 0], '检查点全队共享');
  assert.ok(Math.abs(a.x - LEVELS[g.level].checkpoints[0].x) < 60 && Math.abs(b.x - LEVELS[g.level].checkpoints[0].x) < 60);
});

test('吃吐吐：吃掉队友后把他吐过自己跳不过的缺口，落到对岸按钮放下吊桥；被吃的人能挣脱', () => {
  const g = coop('eat'), eater = g.players.get(1), mate = g.players.get(2), level = LEVELS[g.level];
  place(eater, 630, 456); place(mate, 650, 456); settle(g);
  const press = (id) => { g.input(id, { axis: 0, jump: false, act: true }); g.step(1 / 60); g.input(id, { axis: 0, jump: false, act: false }); g.step(1 / 60); };
  eater.facing = 1; press(1);
  assert.equal(eater.eating, 2); assert.equal(mate.eatenBy, 1);
  press(1);
  assert.equal(eater.eating, -1); assert.equal(mate.eatenBy, -1);
  for (let i = 0; i < 120 && !mate.grounded; i++) settle(g, 1);
  assert.equal(mate.deaths, 0, '吐出去的人安全落在对岸');
  assert.ok(mate.x > 1060, `吐过了 360 宽的缺口：${mate.x}`);
  assert.ok(g.active.has(0), '踩下对岸按钮');
  assert.ok(solids(level, g.active).some((r) => r.x === 700 && r.w === 360), '吊桥出现');

  // 被吃的人等一下再按 A 就能自己出来
  place(mate, eater.x + 10, eater.y); settle(g, 2);
  press(1); assert.equal(mate.eatenBy, 1);
  settle(g, 30); press(2);
  assert.equal(mate.eatenBy, -1); assert.equal(eater.eating, -1);
});

test('叠罗汉：能站在队友头上并被带着走，从头顶起跳才能爬上一个人跳不上的墙', () => {
  const g = coop('stack'), base = g.players.get(1), top = g.players.get(2), level = LEVELS[g.level];
  // 一个人在墙脚怎么跳都上不去
  place(base, 640, 456); settle(g);
  for (let i = 0; i < 90; i++) { g.input(1, { axis: 1, jump: i < 40 }); g.input(2, { axis: 0, jump: false }); g.step(1 / 60); }
  assert.ok(base.y + 44 > 331, '单人跳不上 170 高的墙');
  place(base, 600, 456); place(top, 600, 380); settle(g);
  assert.equal(top.grounded, true); assert.equal(top.y, base.y - 44);
  const x0 = top.x;
  for (let i = 0; i < 6; i++) { g.input(1, { axis: 1, jump: false }); g.input(2, { axis: 0, jump: false }); g.step(1 / 60); }
  assert.ok(top.x > x0 + 3, '被下面的人带着走');
  let climbed = false;
  for (let i = 0; i < 120 && !climbed; i++) {
    g.input(2, { axis: 1, jump: i < 30 }); g.input(1, { axis: 0, jump: false }); g.step(1 / 60);
    climbed = top.grounded && Math.abs(top.y + 44 - 330) < 1 && top.x > 700;
  }
  assert.ok(climbed, `踩头爬上墙顶：${JSON.stringify(top)}`);
  for (let i = 0; i < 90 && !g.active.has(0); i++) { g.input(2, { axis: 1, jump: false }); g.step(1 / 60); }
  assert.ok(g.active.has(0), '墙顶按钮放下台阶');
  assert.ok(solids(level, g.active).some((r) => r.x === 600 && r.y === 420));
});

test('两人一起踩的按钮：一个人不够，两人踩下后锁住，闸门从挡路平台里消失', () => {
  const g = coop('stack'), level = LEVELS[g.level], d = level.devices[2], [a, b] = g.players.values();
  const gateIn = () => solids(level, g.active).some((r) => r === d.gate[0]);
  place(a, d.plate.x + 10, 448); place(b, 200, 456); settle(g);
  assert.equal(g.active.has(2), false); assert.equal(gateIn(), true);
  place(b, d.plate.x + 60, 448); settle(g);
  assert.equal(g.active.has(2), true);
  place(a, 200, 456); place(b, 300, 456); settle(g);
  assert.equal(g.active.has(2), true, '锁住后离开也保持打开'); assert.equal(gateIn(), false);
});

test('房主中途回大厅：放出被吃的人，可以换玩法重新出发', () => {
  const g = coop('eat'), [a, b] = g.players.values();
  a.eating = b.id; b.eatenBy = a.id;
  assert.equal(g.setMode('stack'), false, '游戏中不能直接换玩法');
  assert.equal(g.toLobby(), true); assert.equal(g.phase, 'lobby');
  assert.deepEqual([a.eating, b.eatenBy], [-1, -1]);
  assert.equal(g.setMode('stack'), true); assert.equal(g.start(), true); assert.equal(LEVELS[g.level].mode, 'stack');
});
