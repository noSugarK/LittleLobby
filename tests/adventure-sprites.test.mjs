import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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
    return { format: 'module', shortCircuit: true, source: ts.transpile(readFileSync(new URL(url), 'utf8').replace('import.meta.env.BASE_URL', '"/LittleLobby/"'), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }) };
  },
});
const { buddyFrame, loadCharacterSprites, drawBuddyImage } = await import('../src/game/adventure-sprites.ts');
const { CHARACTERS } = await import('../src/game/adventure.ts');

test('一二是白色、布布是棕色；完整角色精灵表为带透明通道的 PNG', () => {
  assert.deepEqual(CHARACTERS.map((p) => [p.name, p.sprite]), [['一二', 'yier'], ['布布', 'bubu']]);
  for (const character of CHARACTERS) {
    const png = readFileSync(new URL(`../public/adventure/characters/${character.sprite}-atlas.png`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1280);
    assert.equal(png[25], 6, 'RGBA PNG');
  }
});

test('待机和跑动循环，起跳与下落停留在末帧，左右采样各自的动作行', () => {
  assert.equal(buddyFrame('run', .5, 1).x, 768);
  assert.equal(buddyFrame('run', .64, 1).x, 0);
  assert.equal(buddyFrame('idle', 1, 1).x, 0);
  assert.equal(buddyFrame('jump', 10, 1).x, 128);
  assert.equal(buddyFrame('fall', 10, 1).x, 128);
  assert.equal(buddyFrame('run', 0, -1).y - buddyFrame('run', 0, 1).y, 640);
  for (const action of ['idle', 'run', 'jump', 'fall']) for (const time of [-1, NaN, Infinity, 0, .1, 10, 1e6]) {
    const f = buddyFrame(action, time, -1); assert.ok(f.x >= 0 && f.x + f.width <= 1024 && f.y + f.height <= 1280);
  }
});

test('本地精灵加载失败可重试，成功后复用图片，绘制直接采样 PNG 帧', async () => {
  const original = globalThis.Image, urls = [];
  let fail = true;
  globalThis.Image = class {
    naturalWidth = 1024; naturalHeight = 1280;
    set src(value) { urls.push(value); queueMicrotask(() => fail ? this.onerror() : this.onload()); }
  };
  try {
    await assert.rejects(loadCharacterSprites(), /角色图片未能加载/);
    fail = false; await loadCharacterSprites(); const count = urls.length; await loadCharacterSprites();
    assert.equal(urls.length, count);
    assert.ok(urls.every((url) => url.startsWith('/LittleLobby/adventure/characters/')));
    assert.ok(urls.some((url) => url.endsWith('yier-atlas.png')));
    assert.ok(urls.some((url) => url.endsWith('bubu-atlas.png')));
    const calls = []; drawBuddyImage({ drawImage: (...args) => calls.push(args) }, 100, 200, 1, 'run', .2, -1);
    assert.equal(calls.length, 1); assert.ok(calls[0][0] instanceof Image);
    assert.deepEqual(calls[0].slice(1, 5), [256, 800, 128, 160]);
    assert.equal(calls[0][6] + 146 * .5, 200, '脚底锚点与角色状态无关');
  } finally { globalThis.Image = original; }
});
