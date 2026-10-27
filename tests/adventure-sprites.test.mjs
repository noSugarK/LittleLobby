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
    return { format: 'module', shortCircuit: true, source: ts.transpile(readFileSync(new URL(url), 'utf8').replaceAll('import.meta.env.BASE_URL', '"/LittleLobby/"'), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }) };
  },
});
const { buddyFrame, loadCharacterSprites, drawBuddyImage } = await import('../src/game/adventure-sprites.ts');
const { CHARACTERS, parseCharacter } = await import('../src/game/characters.ts');
const manifest = JSON.parse(readFileSync(new URL('../public/characters/index.json', import.meta.url), 'utf8'));
// 浏览器里 fetch 站内文件；测试里直接读 public/ 目录
const serveLocal = () => { globalThis.fetch = async (url) => {
  const file = new URL(`../public/${String(url).replace('/LittleLobby/', '')}`, import.meta.url);
  return existsSync(file) ? new Response(readFileSync(file)) : new Response('', { status: 404 });
}; };

test('每个角色文件夹都符合规范：中英文案齐全、两张带透明通道的 1024×1280 精灵表，内置角色都在清单里', () => {
  assert.ok(manifest.builtin.length && manifest.builtin.every((id) => manifest.characters.includes(id)));
  assert.deepEqual(manifest.builtin, ['yier', 'bubu', 'xiaobai', 'jinmao']);
  assert.equal(new Set(manifest.characters).size, manifest.characters.length);
  for (const id of manifest.characters) {
    const meta = JSON.parse(readFileSync(new URL(`../public/characters/${id}/character.json`, import.meta.url), 'utf8'));
    const c = parseCharacter(meta, id);
    for (const field of ['name', 'subtitle', 'description', 'origin']) assert.ok(meta[field]['zh-CN'] && meta[field].en, `${id}.${field} 需要中英文`);
    assert.match(c.subtitle, / · /, `${id} 的 subtitle 写成「种类 · 特点」`);
    assert.ok(c.look, `${id} 需要 look（生成图片用的外形描述）`);
    for (const file of ['atlas.png', 'full-atlas.png']) {
      const png = readFileSync(new URL(`../public/characters/${id}/${file}`, import.meta.url));
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1280);
      assert.equal(png[25], 6, `${id}/${file} 需要 RGBA PNG`);
    }
  }
  assert.throws(() => parseCharacter({ id: 'x', accent: '#ffffff', name: '只有中文' }, 'x'), /不符合规范/);
  assert.throws(() => parseCharacter({ ...JSON.parse(readFileSync(new URL('../public/characters/yier/character.json', import.meta.url), 'utf8')) }, 'bubu'), /不符合规范/);
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
  serveLocal();
  try {
    await assert.rejects(loadCharacterSprites(), /角色图片未能加载/);
    assert.deepEqual(CHARACTERS.map((c) => c.id), manifest.characters);
    fail = false; await loadCharacterSprites(); const count = urls.length; await loadCharacterSprites();
    assert.equal(urls.length, count);
    assert.ok(urls.every((url) => url.startsWith('/LittleLobby/characters/')));
    assert.ok(urls.includes('/LittleLobby/characters/yier/atlas.png'));
    assert.ok(urls.includes('/LittleLobby/characters/bubu/full-atlas.png'));
    const calls = []; drawBuddyImage({ drawImage: (...args) => calls.push(args) }, 100, 200, 'bubu', 'run', .2, -1);
    assert.equal(calls.length, 1); assert.ok(calls[0][0] instanceof Image);
    assert.deepEqual(calls[0].slice(1, 5), [256, 800, 128, 160]);
    assert.equal(calls[0][6] + 146 * .5, 200, '脚底锚点与角色状态无关');
  } finally { globalThis.Image = original; }
});
