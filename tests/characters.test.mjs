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
    return { format: 'module', shortCircuit: true, source: ts.transpile(readFileSync(new URL(url), 'utf8').replaceAll('import.meta.env.BASE_URL', '"/LittleLobby/"'), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }) };
  },
});
const storage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = storage(); globalThis.sessionStorage = storage();

// 本机打包的应用只带内置角色；线上目录（网页版）有全部角色
const read = (path) => readFileSync(new URL(`../public/characters/${path}`, import.meta.url));
const fullManifest = JSON.parse(read('index.json'));
const appManifest = { ...fullManifest, characters: fullManifest.builtin };
const fetched = [];
globalThis.fetch = async (url) => {
  url = String(url); fetched.push(url);
  const local = url.startsWith('/LittleLobby/characters/'), online = url.startsWith('https://nosugark.github.io/LittleLobby/characters/');
  const path = url.replace(/^.*\/characters\//, '');
  if (path === 'index.json' && (local || online)) return Response.json(local ? appManifest : fullManifest);
  const [id] = path.split('/');
  if ((online || (local && appManifest.characters.includes(id))) && existsSync(new URL(`../public/characters/${path}`, import.meta.url))) return new Response(read(path));
  return new Response('', { status: 404 });
};
// 模拟 Rust 那边的角色目录
const disk = new Map(), invoked = [];
globalThis.__TAURI__ = { core: { invoke: async (command, args) => {
  invoked.push(command);
  if (command === 'list_characters') return [...disk.keys()].sort();
  if (command === 'character_file') return new Uint8Array(disk.get(args.id)[args.file]).buffer;
  if (command === 'save_character') { disk.set(args.id, { 'character.json': new TextEncoder().encode(args.meta), 'atlas.png': Uint8Array.from(args.atlas), 'full-atlas.png': Uint8Array.from(args.full) }); return; }
  if (command === 'delete_character') { disk.delete(args.id); return; }
  throw new Error(command);
} } };

const characters = await import('../src/game/characters.ts');
const { CHARACTERS, loadCharacters, reloadCharacters, loadCatalog, downloadCharacter, removeCharacter, characterUrl, characterMatches, characterOf, legacySkin, validSkin } = characters;

test('旧版本按序号存的角色换成 id；角色 id 只允许小写字母、数字和连字符', () => {
  assert.equal(legacySkin('2'), 'xiaobai');
  assert.equal(legacySkin('nailong'), 'nailong');
  assert.ok(validSkin('some-buddy-2'));
  for (const bad of ['', 'Nailong', '../x', 'a b', 'a'.repeat(33), 3, null]) assert.ok(!validSkin(bad));
});

test('应用离线时只有内置角色；下载后加入本机角色并可用中英文搜索，移除后消失', async () => {
  globalThis.localStorage.setItem('littlelobby.network', 'lan');
  await reloadCharacters();
  assert.deepEqual(CHARACTERS.map((c) => c.id), fullManifest.builtin);
  assert.equal(characterOf('nailong').id, 'yier', '没有的角色用默认角色画');

  const catalog = await loadCatalog();
  assert.ok(catalog.online);
  assert.deepEqual(catalog.list.map((c) => c.id), fullManifest.characters);

  const progress = [];
  await downloadCharacter('nailong', (p) => progress.push(p));
  assert.deepEqual(progress.at(-1), 1);
  assert.ok(disk.has('nailong'));
  assert.deepEqual(CHARACTERS.map((c) => c.id), [...fullManifest.builtin, 'nailong']);
  assert.match(characterUrl('nailong', 'atlas.png'), /^blob:/, '下载的角色从应用数据目录读出来');
  const nailong = characterOf('nailong');
  assert.ok(characterMatches(nailong, 'dino') && characterMatches(nailong, '恐龙') && !characterMatches(nailong, 'capybara'));

  await removeCharacter('nailong');
  assert.ok(!disk.has('nailong'));
  assert.deepEqual(CHARACTERS.map((c) => c.id), fullManifest.builtin);
});

test('应用联网模式直接用线上的完整角色，不需要下载', async () => {
  globalThis.localStorage.setItem('littlelobby.network', 'online');
  await reloadCharacters();
  assert.deepEqual(CHARACTERS.map((c) => c.id), fullManifest.characters);
  assert.equal(characterUrl('lulu', 'atlas.png'), 'https://nosugark.github.io/LittleLobby/characters/lulu/atlas.png');
  assert.equal(characterUrl('yier', 'atlas.png'), '/LittleLobby/characters/yier/atlas.png', '内置角色仍然读本地');
  assert.ok(!disk.size);
  assert.equal((await loadCharacters()).length, fullManifest.characters.length);
});
