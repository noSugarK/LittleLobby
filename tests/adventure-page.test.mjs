import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
const hostUrl = new URL('../src/net/adventure-host.ts', import.meta.url).href;
const mocks = {
  '../net/client': `export class ClientNet {
    linked = false; sent = [];
    constructor() { globalThis.__adventureClient = this; }
    async start() {}
    sendJson(message) { this.sent.push(message); }
    close() { this.linked = false; }
  }`,
  '../net/lan-client': `export {ClientNet as LanClient} from 'test:adventure/../net/client';`,
  '../net/adventure-host': `import {AdventureHost as Base} from ${JSON.stringify(hostUrl)};export class AdventureHost extends Base {constructor(...a){super(...a);globalThis.__adventureHost=this;}}`,
  '../game/adventure-render': 'export class AdventureRenderer {draw(){} close(){}} export const drawAvatar=()=>{}; export const loadCharacterSprites=async()=>{};',
  // 手柄只保留页面依赖的接口：input / onButtons / reset，由测试直接驱动
  '../ui/gamepad': `export class Gamepad {
    constructor() { this.input = { jx: 0, jy: 0, btn: 0 }; this.onButtons = () => {}; this.onPress = () => {}; globalThis.__pad = this; window.addEventListener('blur', () => this.reset()); }
    reset() { this.input.jx = this.input.jy = this.input.btn = 0; this.onButtons(); }
    update() {}
    show() {}
    slot() {}
    apply() {}
  }`,
  '../ui/sound': 'export const sfxAdventure = () => {}, unlockAudio = () => {};',
  '../ui/lan-room': 'export const bindLanAddress = () => {}, lanInfoHtml = () => "";',
};
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/src/pages/adventure.ts') && specifier in mocks) return { url: `test:adventure/${specifier}`, shortCircuit: true };
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('test:adventure/')) return { format: 'module', shortCircuit: true, source: mocks[url.slice('test:adventure/'.length)] };
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: '' };
    if (!url.endsWith('.ts')) return next(url, context);
    return { format: 'module', shortCircuit: true, source: ts.transpile(readFileSync(new URL(url), 'utf8'), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }) };
  },
});
class Element extends EventTarget {
  innerHTML = ''; textContent = ''; hidden = false; disabled = false; open = false; value = ''; dataset = {}; style = { setProperty() {} };
  children = new Map(); classList = { toggle() {}, add() {}, remove() {}, contains() { return false; } };
  querySelector(key) { if (!this.children.has(key)) this.children.set(key, new Element()); return this.children.get(key); }
  querySelectorAll(key) { return this.children.get(`all:${key}`) || []; }
  setAttribute() {}
  focus() {}
}
test('手柄输入驱动主机：键盘斜向也能边走边跳，换装不打断操作，失焦清空且退出后停止计时', async () => {
  const keys = ['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'localStorage', 'sessionStorage'];
  const originals = Object.fromEntries(keys.map((k) => [k, globalThis[k]]));
  const intervals = [];
  globalThis.window = Object.assign(new EventTarget(), { setInterval: (fn) => { const id = setInterval(fn, 100000); intervals.push(id); return id; }, setTimeout, clearTimeout });
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible', documentElement: {}, title: '' });
  globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
  globalThis.matchMedia = () => ({ matches: false });
  const storage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  try {
    const { mountAdventure } = await import('../src/pages/adventure.ts');
    const { CHARACTERS } = await import('../src/game/characters.ts');
    CHARACTERS.push(...['yier', 'jinmao'].map((id) => ({ id, name: id, accent: '#f5a8b8', subtitle: 'a · b', description: '', origin: '', look: '', search: id })));
    const app = new Element();
    const skins = ['yier', 'jinmao'].map((skin) => { const b = new Element(); b.dataset.skin = skin; return b; });
    app.children.set('all:[data-skin]', skins);
    await mountAdventure(app, { host: true, solo: true });
    const host = globalThis.__adventureHost, pad = globalThis.__pad;
    const move = (jx, jy, btn = 0) => { Object.assign(pad.input, { jx, jy, btn }); pad.onButtons(); };
    // 键盘 → + ↑：手柄归一化为 (0.71, -0.71)
    move(Math.SQRT1_2, -Math.SQRT1_2);
    assert.deepEqual(host.localInput, { axis: 1, jump: true, act: false });
    skins[1].onclick();
    assert.equal(host.game.players.get(host.localId).skin, 'jinmao');
    assert.deepEqual(host.localInput, { axis: 1, jump: true, act: false });
    move(-1, 0, 0b10); // 反向 + B 键
    assert.deepEqual(host.localInput, { axis: -1, jump: true, act: false });
    window.dispatchEvent(new Event('blur'));
    assert.deepEqual(host.localInput, { axis: 0, jump: false, act: false });
    window.dispatchEvent(new Event('pagehide'));
    for (const id of intervals) assert.equal(id._destroyed, true);
  } finally {
    for (const id of intervals) clearInterval(id);
    globalThis.__adventureHost?.close();
    for (const k of keys) globalThis[k] = originals[k];
    delete globalThis.__adventureHost; delete globalThis.__pad;
  }
});

test('扫码玩家开局显示按键，延迟身份和主机重开后仍能加入并发送输入', async () => {
  const keys = ['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'localStorage', 'sessionStorage'];
  const originals = Object.fromEntries(keys.map((k) => [k, globalThis[k]]));
  const intervals = [];
  globalThis.window = Object.assign(new EventTarget(), { setInterval: (fn) => { const id = setInterval(fn, 100000); intervals.push(id); return id; }, setTimeout, clearTimeout });
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible', documentElement: {}, title: '' });
  globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
  globalThis.matchMedia = () => ({ matches: false });
  const storage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  try {
    const { mountAdventure } = await import('../src/pages/adventure.ts');
    const { AdventureGame } = await import('../src/game/adventure.ts');
    for (const lan of [false, true]) {
      const app = new Element();
      app.querySelector('.join .name').value = '扫码伙伴';
      await mountAdventure(app, { room: 'ABCDE', lan });
      app.querySelector('.go').onclick();
      const client = globalThis.__adventureClient, pad = globalThis.__pad;
      client.linked = true; client.onState(lan ? 'lan' : 'relay');
      const game = new AdventureGame(); game.add(2, '扫码伙伴'); game.start();
      game.epoch = 4; game.time = 90;
      client.onJson(game.view()); // 快照先到，welcome 后到
      assert.equal(app.querySelector('.pad').hidden, true);
      client.onJson({ t: 'welcome', game: 'adventure', pid: 2 });
      assert.equal(app.querySelector('.pad').hidden, false, '身份晚到也应立即恢复按键');
      const move = () => { Object.assign(pad.input, { jx: 1, jy: 0, btn: 2 }); pad.onButtons(); };
      move();
      assert.deepEqual(client.sent.at(-1), { t: 'adventure-input', epoch: 4, seq: 0, axis: 1, jump: true, act: false });
      client.linked = false; client.onState('lost');
      assert.equal(app.querySelector('.pad').hidden, true);
      client.linked = true; client.onState(lan ? 'lan' : 'relay');
      game.epoch = 1; game.time = 0;
      client.onJson({ t: 'welcome', game: 'adventure', pid: 2 });
      client.onBinary(new TextEncoder().encode(JSON.stringify(game.view())));
      assert.equal(app.querySelector('.pad').hidden, false, '主机重开后的较小 epoch 不能被当作过期快照');
      move();
      assert.equal(client.sent.at(-1).epoch, 1);
      window.dispatchEvent(new Event('pagehide'));
    }
  } finally {
    for (const id of intervals) clearInterval(id);
    for (const k of keys) globalThis[k] = originals[k];
    delete globalThis.__adventureClient; delete globalThis.__pad;
  }
});
