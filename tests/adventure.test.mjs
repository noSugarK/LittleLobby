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
const { AdventureGame, LEVELS, CHARACTERS, enemyX, padInput } = await import('../src/game/adventure.ts');
const { AdventureHost } = await import('../src/net/adventure-host.ts');
const { joinHashFromQr } = await import('../src/ui/scan.ts');
const tick = (g, frames, input = { axis: 0, jump: false }) => { for (let i = 0; i < frames; i++) { g.input(1, input); g.step(1 / 60); } };
function game() { const g = new AdventureGame(); g.add(1, '一二'); g.start(); tick(g, 2); return g; }

test('一二与布布切换只改造型，保留位置、收集与检查点；非法角色不生效', () => {
  const g = game(), p = g.players.get(1); p.coins = [1]; p.checkpoint = 0;
  for (let skin = 0; skin < CHARACTERS.length; skin++) {
    const before = [p.x, p.y, p.hearts, p.checkpoint, [...p.coins]];
    g.skin(1, skin); assert.equal(p.skin, skin);
    assert.deepEqual([p.x, p.y, p.hearts, p.checkpoint, p.coins], before);
  }
  for (const invalid of [-1, CHARACTERS.length, 99, '1', NaN, null]) g.skin(1, invalid);
  assert.equal(p.skin, CHARACTERS.length - 1);
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
  const deliver = (patch) => cb.onJson('one', { t: 'adventure-input', epoch: host.game.epoch, seq: 5, axis: 1, jump: false, ...patch });
  deliver({}); deliver({ seq: 4, axis: -1 }); deliver({ seq: 6, axis: NaN }); deliver({ seq: 6, epoch: 0, axis: -1 });
  tick(host.game, 0); host.game.step(1 / 60); assert.ok(host.game.players.get(1).vx > 0);
  cb.onJson('one', { t: 'adventure-skin', skin: 1 }); assert.equal(host.game.players.get(1).skin, 1);
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

test('足球同款手柄：摇杆过死区才移动，B 或上推到底跳跃，非游戏中不出输入', () => {
  assert.deepEqual(padInput(0.2, 0, false, true), { axis: 0, jump: false });
  assert.deepEqual(padInput(-0.6, 0.1, true, true), { axis: -1, jump: true });
  assert.deepEqual(padInput(0.5, -0.9, false, true), { axis: 1, jump: true });
  // 键盘 → + ↑ 被手柄归一化为 (0.71, -0.71)，边走边跳必须成立
  assert.deepEqual(padInput(Math.SQRT1_2, -Math.SQRT1_2, false, true), { axis: 1, jump: true });
  assert.deepEqual(padInput(0.9, -0.4, false, true), { axis: 1, jump: false });
  assert.deepEqual(padInput(1, -1, true, false), { axis: 0, jump: false });
});

test('手机点按：按下松开落在同一帧也能跳到约 100 像素，按住仍然更高', () => {
  const g = game(), p = g.players.get(1), ground = p.y;
  g.input(1, { axis: 0, jump: true }); g.input(1, { axis: 0, jump: false });
  let top = ground;
  for (let i = 0; i < 60; i++) { g.step(1 / 60); top = Math.min(top, p.y); }
  assert.ok(ground - top > 90, `点按只跳了 ${ground - top}px`);
});
