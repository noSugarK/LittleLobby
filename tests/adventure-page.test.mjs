import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
const hostUrl = new URL('../src/net/adventure-host.ts', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/src/pages/adventure.ts')) {
      if (specifier === '../net/adventure-host') return { url: 'test:adventure-host', shortCircuit: true };
      if (specifier === '../game/adventure-render') return { url: 'test:adventure-render', shortCircuit: true };
    }
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'test:adventure-host') return { format: 'module', shortCircuit: true, source: `import {AdventureHost as Base} from ${JSON.stringify(hostUrl)};export class AdventureHost extends Base {constructor(...a){super(...a);globalThis.__adventureHost=this;}}` };
    if (url === 'test:adventure-render') return { format: 'module', shortCircuit: true, source: 'export class AdventureRenderer {draw(){} close(){}} export const drawAvatar=()=>{}; export const loadCharacterSprites=async()=>{};' };
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: '' };
    if (!url.endsWith('.ts')) return next(url, context);
    return { format: 'module', shortCircuit: true, source: ts.transpile(readFileSync(new URL(url), 'utf8'), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }) };
  },
});
class Element extends EventTarget {
  innerHTML = ''; textContent = ''; hidden = false; disabled = false; dataset = {}; style = { setProperty() {} };
  children = new Map(); attributes = new Map(); classList = { toggle() {} };
  querySelector(key) { if (!this.children.has(key)) this.children.set(key, new Element()); return this.children.get(key); }
  querySelectorAll(key) { return this.children.get(`all:${key}`) || []; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  setPointerCapture() {}
}
test('触屏多指与键盘可同时移动跳跃，换装不打断操作，失焦清空且退出后停止监听', async () => {
  const originals = Object.fromEntries(['window', 'document', 'HTMLInputElement', 'requestAnimationFrame', 'cancelAnimationFrame'].map((k) => [k, globalThis[k]]));
  const intervals = [];
  globalThis.window = Object.assign(new EventTarget(), { setInterval: (fn) => { const id = setInterval(fn, 100000); intervals.push(id); return id; }, setTimeout });
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  globalThis.HTMLInputElement = class {};
  globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
  try {
    const { mountAdventure } = await import('../src/pages/adventure.ts');
    const app = new Element();
    const buttons = ['left', 'right', 'jump'].map((action) => { const b = new Element(); b.dataset.action = action; return b; });
    const skins = [0, 1].map((skin) => { const b = new Element(); b.dataset.skin = String(skin); return b; });
    app.children.set('all:[data-action]', buttons); app.children.set('all:[data-skin]', skins);
    await mountAdventure(app, { host: true, solo: true });
    const host = globalThis.__adventureHost;
    const key = (type, code) => window.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code, repeat: false }));
    const pointer = (b, type, id) => b.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { pointerId: id, button: 0 }));
    key('keydown', 'KeyD'); pointer(buttons[2], 'pointerdown', 2);
    assert.deepEqual(host.localInput, { axis: 1, jump: true });
    skins[1].onclick();
    assert.equal(host.game.players.get(host.localId).skin, 1);
    assert.deepEqual(host.localInput, { axis: 1, jump: true });
    pointer(buttons[0], 'pointerdown', 3); assert.equal(host.localInput.axis, 0);
    pointer(buttons[0], 'pointerup', 3); assert.equal(host.localInput.axis, 1);
    pointer(buttons[2], 'lostpointercapture', 2); assert.equal(host.localInput.jump, false);
    key('keydown', 'ArrowRight'); key('keyup', 'KeyD'); assert.equal(host.localInput.axis, 1);
    window.dispatchEvent(new Event('blur')); assert.deepEqual(host.localInput, { axis: 0, jump: false });
    key('keyup', 'ArrowRight'); assert.equal(host.localInput.axis, 0);
    window.dispatchEvent(new Event('pagehide'));
    key('keydown', 'Space'); assert.equal(host.localInput.jump, false);
    for (const id of intervals) assert.equal(id._destroyed, true);
  } finally {
    for (const id of intervals) clearInterval(id);
    Object.assign(globalThis, originals); delete globalThis.__adventureHost;
  }
});
