import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
const hostUrl = new URL('../src/net/adventure-host.ts', import.meta.url).href;
const mocks = {
  '../net/adventure-host': `import {AdventureHost as Base} from ${JSON.stringify(hostUrl)};export class AdventureHost extends Base {constructor(...a){super(...a);globalThis.__adventureHost=this;}}`,
  '../game/adventure-render': 'export class AdventureRenderer {draw(){} close(){}} export const drawAvatar=()=>{}; export const loadCharacterSprites=async()=>{};',
  // 手柄只保留页面依赖的接口：input / onButtons / reset，由测试直接驱动
  '../ui/gamepad': `export class Gamepad {
    constructor() { this.input = { jx: 0, jy: 0, btn: 0 }; this.onButtons = () => {}; this.onPress = () => {}; globalThis.__pad = this; window.addEventListener('blur', () => this.reset()); }
    reset() { this.input.jx = this.input.jy = this.input.btn = 0; this.onButtons(); }
    update() {}
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
  children = new Map(); classList = { toggle() {}, add() {}, remove() {} };
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
    const app = new Element();
    const skins = [0, 3].map((skin) => { const b = new Element(); b.dataset.skin = String(skin); return b; });
    app.children.set('all:[data-skin]', skins);
    await mountAdventure(app, { host: true, solo: true });
    const host = globalThis.__adventureHost, pad = globalThis.__pad;
    const move = (jx, jy, btn = 0) => { Object.assign(pad.input, { jx, jy, btn }); pad.onButtons(); };
    // 键盘 → + ↑：手柄归一化为 (0.71, -0.71)
    move(Math.SQRT1_2, -Math.SQRT1_2);
    assert.deepEqual(host.localInput, { axis: 1, jump: true });
    skins[1].onclick();
    assert.equal(host.game.players.get(host.localId).skin, 3);
    assert.deepEqual(host.localInput, { axis: 1, jump: true });
    move(-1, 0, 0b10); // 反向 + B 键
    assert.deepEqual(host.localInput, { axis: -1, jump: true });
    window.dispatchEvent(new Event('blur'));
    assert.deepEqual(host.localInput, { axis: 0, jump: false });
    window.dispatchEvent(new Event('pagehide'));
    for (const id of intervals) assert.equal(id._destroyed, true);
  } finally {
    for (const id of intervals) clearInterval(id);
    globalThis.__adventureHost?.close();
    for (const k of keys) globalThis[k] = originals[k];
    delete globalThis.__adventureHost; delete globalThis.__pad;
  }
});
