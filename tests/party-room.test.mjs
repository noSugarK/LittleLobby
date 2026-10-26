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
const { PartyRoomHost } = await import('../src/room/session.ts');
const { AdventureGame, MAP_THEMES } = await import('../src/game/adventure.ts');

function fixture(game = 'adventure', pin) {
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = { setInterval: () => 0, addEventListener() {} };
  globalThis.document = { visibilityState: 'visible' };
  let callbacks, opens = 0, closes = 0;
  const messages = [];
  const host = new PartyRoomHost('ABCDE', { listed: false, pin }, game, (_room, cb) => {
    callbacks = cb;
    return { cb, start: async () => { opens++; }, close: () => { closes++; },
      sendJson: (cid, body) => messages.push({ cid, body }), broadcastJson: (body) => messages.push({ body }),
      broadcastFast() {}, linkOf: () => 'lan', drop: (cid) => cb.onLeave(cid), kick: (cid) => cb.onLeave(cid) };
  });
  const join = (cid = 'phone', token = 'phone-token', extra = {}) => {
    const reason = callbacks.onHello(cid, { t: 'hello', cid, token, name: '朋友', team: 'auto', pin, ...extra });
    if (!reason) callbacks.onPeer(cid);
    return reason;
  };
  return { host, cb: callbacks, join, messages, get opens() { return opens; }, get closes() { return closes; },
    close() { host.close(); Object.assign(globalThis, previous); } };
}

test('同一房间跨游戏反复切换保留连接、身份、角色；旧局输入与客户端管理指令不生效', async () => {
  const f = fixture();
  try {
    f.host.addLocal('房主'); await f.host.start();
    assert.equal(f.join(), null);
    f.cb.onJson('phone', { t: 'room-member', skin: 1, ready: true });
    const member = f.host.view().members.find((m) => m.name === '朋友');
    assert.equal(f.host.startGame(), true);
    const oldRevision = f.host.revision;
    f.host.switchGame('football');
    const footballPackets = f.messages.filter((m) => m.body.revision === f.host.revision);
    const firstState = footballPackets.findIndex((m) => m.body.t === 'room-state');
    const phoneRoster = footballPackets.findIndex((m) => m.body.json?.t === 'roster' && m.body.json.players.some((p) => p.name === '朋友'));
    assert.ok(firstState >= 0 && phoneRoster > firstState, '先公布新版本再发送玩家名单');
    f.cb.onJson('phone', { t: 'start' });
    f.cb.onJson('phone', { t: 'room-switch', game: 'adventure' });
    assert.equal(f.host.phase, 'lobby'); assert.equal(f.host.game, 'football');
    assert.equal(f.host.view().members.find((m) => m.id === member.id).skin, 1);
    assert.equal(f.host.startGame(), false, '换游戏需重新准备');
    f.cb.onJson('phone', { t: 'room-member', ready: true });
    assert.equal(f.host.startGame(), true);
    f.host.switchGame('adventure');
    f.cb.onJson('phone', { t: 'room-member', ready: true });
    assert.equal(f.host.startGame(), true);
    const p = f.host.adventure.game.players.get(f.host.view().members.find((m) => m.id === member.id).gamePid);
    f.cb.onJson('phone', { t: 'room-input', revision: oldRevision, seq: 99, input: { jx: 1, jy: 0, btn: 2 } });
    for (let i = 0; i < 3; i++) f.host.adventure.game.step(1 / 60);
    assert.equal(p.vx, 0, '旧局输入不能进入新游戏');
    f.cb.onJson('phone', { t: 'room-input', revision: f.host.revision, seq: 0, input: { jx: 1, jy: 0, btn: 0 } });
    f.host.adventure.game.step(1 / 60); assert.ok(p.vx > 0);
    f.cb.onJson('phone', { t: 'room-input', revision: f.host.revision, seq: 90, input: { jx: 1, jy: 0, btn: 0 } });
    f.cb.onLeave('phone'); f.join();
    f.cb.onJson('phone', { t: 'room-input', revision: f.host.revision, seq: 0, input: { jx: -1, jy: 0, btn: 0 } });
    for (let i = 0; i < 30; i++) f.host.adventure.game.step(1 / 60);
    assert.ok(p.vx < 0, '重连后从零开始的输入序号可以生效');
    assert.equal(f.opens, 1); assert.equal(f.closes, 0, '换游戏不关闭底层连接');
    assert.equal(f.host.room, 'ABCDE');
    const me = f.host.view().members.find((m) => m.id === member.id);
    assert.equal(f.host.adventure.game.players.get(me.gamePid).skin, 1);
  } finally { f.close(); }
  assert.equal(f.closes, 1);
});

test('主机选地图、旁观大屏、断线重连均保留房间与角色；密码先于成员注册校验', () => {
  const f = fixture('adventure', '1234');
  try {
    f.host.addLocal('大屏', true);
    assert.equal(f.join('bad', 'bad-token', { pin: '0000' }), 'pinWrong');
    assert.equal(f.host.view().members.length, 1);
    f.join(); f.cb.onJson('phone', { t: 'room-member', skin: 1, ready: true });
    const id = f.host.view().members.find((m) => m.name === '朋友').id;
    f.host.selectMap(2);
    assert.equal(f.host.map, 2); assert.equal(f.host.adventure.game.level, 2);
    assert.equal(f.host.adventure.game.players.size, 1, '大屏不占游戏角色');
    f.cb.onJson('phone', { t: 'room-member', ready: true });
    assert.equal(f.host.startGame(), true); assert.equal(f.host.adventure.game.level, 2);
    f.cb.onLeave('phone'); f.join('phone-again');
    const restored = f.host.view().members.find((m) => m.id === id);
    assert.equal(restored.online, true); assert.equal(restored.skin, 1);
    assert.equal(f.host.view().members.length, 2);
    for (const map of [-1, 3, NaN, '1']) f.host.selectMap(map);
    assert.equal(f.host.map, 2);
  } finally { f.close(); }
});

test('同图不同角色共享主题，指定地图开局有效，非法地图不改写游戏状态', () => {
  const game = new AdventureGame(); game.add(1, '一二', 0); game.add(2, '布布', 1);
  assert.equal(game.start(2), true); assert.equal(game.level, 2);
  const theme = MAP_THEMES[game.level]; game.skin(1, 1);
  assert.equal(MAP_THEMES[game.level], theme);
  game.phase = 'lobby';
  assert.equal(game.start(99), false); assert.equal(game.level, 2);
  const renderer = readFileSync(new URL('../src/game/adventure-render.ts', import.meta.url), 'utf8');
  assert.match(renderer, /theme = MAP_THEMES\[s.level\]/);
  assert.doesNotMatch(renderer, /CHARACTERS\[skin\]/);
});
