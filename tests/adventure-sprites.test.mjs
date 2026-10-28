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
const { buddyFrame, loadCharacterSprites, drawBuddyImage, drawBuddyAvatar } = await import('../src/game/adventure-sprites.ts');
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

test('精灵按需加载：只等所选角色和默认角色，其他角色与大肚肚图画到时才下载，失败可重试且不每帧重试', async () => {
  const original = globalThis.Image, urls = [];
  let fail = () => true;
  globalThis.Image = class {
    naturalWidth = 1024; naturalHeight = 1280;
    set src(value) { this.url = value; urls.push(value); queueMicrotask(() => fail(value) ? this.onerror() : this.onload()); }
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const file = (url) => url.split('/characters/')[1];
  const draw = (...args) => { const calls = []; drawBuddyImage({ drawImage: (...c) => calls.push(c) }, 100, 200, ...args); return calls.map((c) => file(c[0].url)); };
  serveLocal();
  try {
    await assert.rejects(loadCharacterSprites(['bubu']), /角色图片未能加载/);
    assert.deepEqual(CHARACTERS.map((c) => c.id), manifest.characters);
    assert.deepEqual(urls.map(file).sort(), ['bubu/atlas.png', 'yier/atlas.png'], '只请求所选角色和默认角色的普通造型');

    fail = (url) => url.endsWith('/yier/atlas.png');
    urls.length = 0;
    await loadCharacterSprites(['bubu']);
    assert.deepEqual(urls.map(file).sort(), ['bubu/atlas.png', 'yier/atlas.png'], '重试重新下载失败的图片');
    assert.deepEqual(draw('yier', 'idle', 0), ['bubu/atlas.png'], '默认角色坏了用可用角色顶上');

    urls.length = 0;
    for (let i = 0; i < 5; i++) draw('yier', 'idle', 0);
    await settle();
    assert.deepEqual(urls, [], '刚失败的图片绘制时不会每帧重试');

    fail = () => false;
    assert.deepEqual(draw('xiaobai', 'idle', 0), ['bubu/atlas.png'], '别人的角色没到时先用已有造型');
    assert.deepEqual(draw('bubu', 'idle', 0, 1, true), ['bubu/atlas.png'], '大肚肚图没到时用普通造型');
    await settle();
    assert.deepEqual(urls.map(file).sort(), ['bubu/full-atlas.png', 'xiaobai/atlas.png']);
    assert.deepEqual(draw('xiaobai', 'idle', 0), ['xiaobai/atlas.png']);
    assert.deepEqual(draw('bubu', 'idle', 0, 1, true), ['bubu/full-atlas.png']);

    const avatar = [], canvas = { dataset: {}, getContext: () => ({ drawImage: (...c) => avatar.push(file(c[0].url)) }) };
    drawBuddyAvatar(canvas, 'jinmao'); drawBuddyAvatar(canvas, 'jinmao');
    assert.deepEqual(avatar, [], '头像图片没到时先空着');
    await settle();
    assert.deepEqual(avatar, ['jinmao/atlas.png'], '下载好只补画一次');
    assert.equal(urls.filter((url) => url.endsWith('/jinmao/atlas.png')).length, 1);

    let count = urls.length; await loadCharacterSprites(['bubu', 'xiaobai']);
    assert.deepEqual(urls.slice(count).map(file), ['yier/atlas.png'], '主动加载会重试之前失败的默认角色');
    count = urls.length; await loadCharacterSprites(['bubu', 'xiaobai']);
    assert.equal(urls.length, count, '已加载的图片复用');
    const calls = []; drawBuddyImage({ drawImage: (...args) => calls.push(args) }, 100, 200, 'bubu', 'run', .2, -1);
    assert.equal(calls.length, 1); assert.ok(calls[0][0] instanceof Image);
    assert.deepEqual(calls[0].slice(1, 5), [256, 800, 128, 160]);
    assert.equal(calls[0][6] + 146 * .5, 200, '脚底锚点与角色状态无关');
  } finally { globalThis.Image = original; }
});
