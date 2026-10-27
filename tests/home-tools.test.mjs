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
    return {
      format: 'module', shortCircuit: true,
      source: ts.transpile(readFileSync(new URL(url), 'utf8'), {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      }),
    };
  },
});

const { bindLobby, teamCardHtml } = await import('../src/ui/settings-ui.ts');
const { bindSiteTools, isNewRelease, platformOf } = await import('../src/ui/site.ts');
const { bindLanLobby } = await import('../src/ui/lan-lobby.ts');

test('局域网大厅无需开服务器即可搜索、刷新、点击房间和手动加入，退出后停止刷新', async () => {
  const original = { window: globalThis.window, location: globalThis.location };
  let searches = 0;
  let pagehide;
  let scheduled;
  const row = { dataset: { room: '0' } };
  const elements = {
    '.lan-rooms': { innerHTML: '', querySelectorAll: () => [row] },
    '.lan-refresh': {}, '.lan-join': {}, '.lan-url': { value: '' },
    '.lan-code': { value: '' }, '.lan-error': { hidden: true },
  };
  globalThis.location = { hash: '' };
  globalThis.window = {
    __TAURI__: { core: { invoke: async (command) => {
      assert.equal(command, 'discover_lan', '加入房间不得启动本机服务器');
      searches++;
      return [{ room: 'ABCDE', baseUrl: 'http://192.168.1.2:12345' }];
    } } },
    setTimeout: (fn) => { scheduled = fn; return 0; },
    addEventListener: (name, fn) => { if (name === 'pagehide') pagehide = fn; },
  };
  try {
    bindLanLobby({ querySelector: (selector) => elements[selector] });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(searches, 1);
    assert.match(elements['.lan-rooms'].innerHTML, /ABCDE/);
    row.onclick();
    assert.equal(new URLSearchParams(location.hash.split('?')[1]).get('server'), 'http://192.168.1.2:12345');
    elements['.lan-refresh'].onclick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(searches, 2);
    const submit = () => elements['.lan-join'].onsubmit({ preventDefault() {} });
    elements['.lan-url'].value = 'http://192.168.1.3:54321/#/join/FGHJK?lan=1&pin=1234';
    submit();
    assert.match(location.hash, /^#\/join\/FGHJK\?/);
    assert.equal(new URLSearchParams(location.hash.split('?')[1]).get('pin'), '1234');
    elements['.lan-url'].value = 'http://192.168.1.4:54321';
    elements['.lan-code'].value = 'abcde';
    submit();
    assert.match(location.hash, /^#\/join\/ABCDE\?/);
    const previous = location.hash;
    elements['.lan-url'].value = 'javascript:alert(1)';
    submit();
    assert.equal(elements['.lan-error'].hidden, false);
    assert.equal(location.hash, previous);
    pagehide();
    await scheduled();
    assert.equal(searches, 2);
  } finally { Object.assign(globalThis, original); }
});

test('名单支持点击和键盘管理，滑动完成后的 click 不会把操作重新收起', () => {
  const rows = Array.from({ length: 2 }, () => {
    const attrs = {};
    const main = { style: {}, setAttribute: (key, value) => { attrs[key] = value; } };
    return {
      dataset: {}, main, attrs, events: {}, classList: { toggle() {} },
      setPointerCapture() {},
      querySelector: (selector) => selector === '.row-main' ? main : { offsetWidth: 80 },
      addEventListener(name, listener) { this.events[name] = listener; },
    };
  });
  const root = {
    querySelector: () => null,
    querySelectorAll: (selector) => selector === 'li.swipe' ? rows : [],
  };
  bindLobby(root, [], {});
  const [row, other] = rows;
  const target = { closest: () => null };
  row.onclick({ target });
  assert.equal(row.dataset.dx, '-80');
  assert.equal(row.attrs['aria-expanded'], 'true');
  let prevented = false;
  let stopped = false;
  other.main.onkeydown({
    key: 'Enter', preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; },
  });
  assert.ok(prevented && stopped, '不能把 Enter 冒泡给大屏开赛快捷键');
  assert.equal(row.dataset.dx, '0', '一次只展开一个成员');
  assert.equal(other.dataset.dx, '-80');
  row.events.pointerdown({ target, button: 0, clientX: 100, pointerId: 1 });
  row.events.pointermove({ clientX: 30 });
  row.events.pointerup();
  row.onclick({ target });
  assert.equal(row.dataset.dx, '-80', '拖动后的 click 不应反向切换');
  row.onclick({ target: { closest: () => ({}) } });
  assert.equal(row.dataset.dx, '-80', '管理按钮点击不能切换名单行');

  const player = { id: 1, name: 'A"<', team: 0, num: 1, online: true, bot: false, link: 'p2p' };
  const html = teamCardHtml(0, [player], { hostPid: 2, manage: true, addAi: false, slots: false, joinable: false });
  assert.match(html, /role="button" tabindex="0" aria-expanded="false"/);
  assert.match(html, /aria-label="[^\"]*A&quot;&lt;"/);
});

test('下载失败可重新打开重试，加载中和成功后不会重复请求', async () => {
  const original = { fetch: globalThis.fetch, document: globalThis.document };
  const msg = { textContent: '', outerHTML: '' };
  const menu = {
    open: true, listener: null, classList: { contains: () => false },
    querySelector: () => msg,
    addEventListener(name, listener) { if (name === 'toggle') this.listener = listener; },
  };
  const root = { querySelector: (selector) => selector === '.dl-menu' ? menu : {} };
  let requests = 0;
  let finish;
  globalThis.document = { addEventListener() {} };
  globalThis.fetch = async () => {
    requests++;
    if (requests === 1) throw new Error('offline');
    return new Promise((resolve) => { finish = resolve; });
  };
  try {
    bindSiteTools(root);
    await menu.listener();
    assert.ok(msg.textContent);
    menu.open = false;
    await menu.listener();
    menu.open = true;
    const pending = menu.listener();
    await menu.listener();
    assert.equal(requests, 2, '失败后重试，加载期间去重');
    finish({ ok: true, json: async () => [{
      tag_name: 'v1', assets: [{ name: 'LittleLobby_v1_windows-x64.exe', size: 1048576, browser_download_url: 'https://example.com/app.exe' }],
    }] });
    await pending;
    assert.match(msg.outerHTML, /https:\/\/example.com\/app.exe/);
    await menu.listener();
    assert.equal(requests, 2, '成功后保留下载链接');
  } finally {
    Object.assign(globalThis, original);
  }
});

test('应用只在最新发布和当前版本不一致时露出下载按钮并亮小红点，下载列表把本机平台排第一', async () => {
  assert.ok(isNewRelease('v0.2.0-beta.4', '0.2.0-beta.3'));
  assert.ok(!isNewRelease('v0.2.0-beta.3', '0.2.0-beta.3'));
  assert.ok(!isNewRelease('v0.2.0-beta.4', ''), '拿不到当前版本时不提示');
  assert.equal(String(platformOf('Mozilla/5.0 (Linux; Android 14; Pixel 8)')), String(/android.*\.apk$/), '安卓的 UA 也含 Linux');
  assert.equal(String(platformOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')), String(/windows.*\.exe$/));
  assert.equal(String(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')), String(/macos.*\.dmg$/));
  assert.equal(platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), null);

  const original = { fetch: globalThis.fetch, document: globalThis.document, version: globalThis.__APP_VERSION__ };
  const added = [];
  const summary = { setAttribute() {}, title: '' };
  const menu = { hidden: true, classList: { contains: (c) => c === 'dl-update', add: (c) => added.push(c) }, querySelector: () => summary, addEventListener() {} };
  const root = { querySelector: (selector) => selector === '.dl-menu' ? menu : {} };
  globalThis.document = { addEventListener() {} };
  // 页面内只查一次最新发布：和上一个测试一样用 v1，测试顺序不影响结果
  globalThis.fetch = async () => ({ ok: true, json: async () => [{ tag_name: 'v1', assets: [] }] });
  try {
    globalThis.__APP_VERSION__ = '1';
    bindSiteTools(root); await new Promise((r) => setTimeout(r, 0));
    assert.ok(menu.hidden && !added.length, '已是最新版：按钮保持隐藏');
    globalThis.__APP_VERSION__ = '0.0.1';
    bindSiteTools(root); await new Promise((r) => setTimeout(r, 0));
    assert.ok(!menu.hidden && added.includes('has-update'), '有新版本：露出按钮并加小红点');
  } finally {
    globalThis.fetch = original.fetch; globalThis.document = original.document; globalThis.__APP_VERSION__ = original.version;
  }
});

test('old storage keys move to the littlelobby prefix without overwriting newer values', async () => {
  const { migrateStorage } = await import('../src/ui/util.ts');
  const area = (entries) => {
    const m = new Map(entries);
    return Object.assign(Object.create({
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    }), { get map() { return m; } });
  };
  const local = area([['sfb.name', 'Ann'], ['sfb.theme', 'dark'], ['adventure.skin', '2'], ['littlelobby.lang', 'en'], ['sfb.lang', 'zh-CN'], ['other', 'x']]);
  // Object.keys(Storage) lists stored keys; mirror that on the stub.
  const keys = (s) => new Proxy(s, { ownKeys: () => [...s.map.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
  const session = area([['sfb.hist.ABCDE', '[]']]);
  migrateStorage([keys(local), keys(session)]);
  assert.deepEqual(Object.fromEntries(local.map), {
    'littlelobby.name': 'Ann', 'littlelobby.theme': 'dark', 'littlelobby.adventure.skin': '2', 'littlelobby.lang': 'en', other: 'x',
  });
  assert.deepEqual(Object.fromEntries(session.map), { 'littlelobby.hist.ABCDE': '[]' });
});
