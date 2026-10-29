import './adventure.css';
import { AdventureGame, LEVELS, MAP_THEMES, MODES, modeInfo, modeLevels, padInput, validMode, type AdventureInput, type AdventureView, type ModeId } from '../game/adventure';
import { AdventureRenderer, drawAvatar, loadCharacterSprites } from '../game/adventure-render';
import { CHARACTERS, DEFAULT_SKIN, characterMatches, characterOf, legacySkin, validSkin, type SkinId } from '../game/characters';
import { AdventureHost } from '../net/adventure-host';
import { ClientNet } from '../net/client';
import { HostNet } from '../net/host';
import { LanClient } from '../net/lan-client';
import { LanHost } from '../net/lan-host';
import { isLanPage, isNativeApp, lanBaseUrl, lanSession, startLan, stopLan } from '../net/lan-session';
import { bindLanAddress, lanInfoHtml } from '../ui/lan-room';
import { brand, canFullscreen, enterFullscreen, esc, isFullscreen, joinUrl, keepAwake, randomCode, roomOpts, showMatching, store, vibrate } from '../ui/util';
import { Gamepad } from '../ui/gamepad';
import { bindControlsPane, controlsPaneHtml } from '../ui/controls-pane';
import { bindDrawer } from '../ui/drawer';
import { bindLangSelect, icon, langSelect } from '../ui/site';
import { joinCardHtml, showField } from '../ui/join-card';
import { BTN_A, BTN_B, BTN_X, BTN_Y } from '../game/types';
import { t, type Key } from '../i18n';
import { gameName, switchHostGame } from '../room/catalog';
import { confirmLeave } from '../ui/confirm';
import { sfxAdventure, unlockAudio } from '../ui/sound';

const HINTS: Record<ModeId, string> = {
  classic: '摇杆左右移动 · B 跳跃，按住跳得更高 · 从上面踩扁小软糖',
  rope: '大家被一根绳子连着：一起起跳，掉下去的人会被站稳的队友吊住，吊着时按 B 能跳回来',
  eat: '靠近队友按 A 吃掉，再按 A 把他吐出去，被吃的人按 A 挣脱；把队友吐到对岸踩按钮放下吊桥',
  stack: '跳到队友头上叠罗汉，从头顶起跳更高；爬上墙顶踩按钮，给大家放下台阶',
};
const storedSkin = () => { const value = legacySkin(store.get('adventure.skin')); return validSkin(value) ? value : DEFAULT_SKIN; };
const logo = () => `<span class="adv-logo-flower" aria-hidden="true">✿</span><span>${gameName('adventure')}<small>little picnic club</small></span>`;
const nav = `<nav class="adv-nav"><a class="adv-brand" href="#/adventure">${logo()}</a><div><a href="#/">回到小聚场</a><button class="adv-full" aria-label="进入全屏">全屏 ↗</button></div></nav>`;
// 角色多了以后用下拉：当前角色带小头像，展开后先是搜索框，每一项也有头像预览；角色列表等本机角色读完再填
const choices = () => `<details class="adv-picker"><summary aria-label="选择角色"><canvas class="adv-picked-avatar" aria-hidden="true"></canvas><span><b class="adv-picked-name"></b><small class="adv-picked-note"></small></span><i aria-hidden="true">▾</i></summary><div class="adv-options"></div></details>`;
/** 只等自己选的角色；列表里其他角色的头像在第一次展开时才下载 */
async function avatars(root: HTMLElement, skin: SkinId) {
  await loadCharacterSprites([skin]);
  root.querySelectorAll<HTMLElement>('.adv-options').forEach((options) => {
    options.innerHTML = `<label class="adv-search">${icon.search}<input type="search" placeholder="${t('chars.pick')}" aria-label="${t('chars.search')}" autocomplete="off"></label>${CHARACTERS.map((c) => `<button class="adv-character" data-skin="${c.id}" aria-pressed="false" aria-label="选择${esc(c.name)}，${esc(c.subtitle)}"><canvas aria-hidden="true"></canvas><b>${esc(c.name)}</b><small>${esc(c.subtitle.split(' · ')[1] || c.subtitle)}</small></button>`).join('')}<p class="adv-search-empty" hidden>${t('chars.empty')}</p><a class="adv-more" href="#/characters"${options.closest('.adv-play') ? ' target="_blank" rel="noopener"' : ''}>${t(isLanPage() ? 'chars.pickAll' : 'chars.pickMore')} →</a>`;
    const input = options.querySelector('input')!;
    input.oninput = () => showMatching(options.querySelectorAll<HTMLElement>('[data-skin]'), (button) => characterMatches(characterOf(button.dataset.skin!), input.value), options.querySelector<HTMLElement>('.adv-search-empty'));
  });
  // 像普通下拉框一样：点别处就收起；在菜单里展开时把列表滚进视野
  document.addEventListener('pointerdown', (e) => root.querySelectorAll<HTMLDetailsElement>('.adv-picker[open]').forEach((picker) => { if (!picker.contains(e.target as Node)) picker.open = false; }));
  root.querySelectorAll<HTMLDetailsElement>('.adv-picker').forEach((picker) => {
    picker.addEventListener('toggle', () => { if (picker.open && picker.closest('.adv-panel, .join')) picker.scrollIntoView({ block: 'nearest' }); });
    picker.addEventListener('toggle', () => {
      if (picker.open) picker.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((button) => drawAvatar(button.querySelector('canvas')!, button.dataset.skin!));
    }, { once: true });
  });
}
function selected(root: HTMLElement, skin: SkinId) {
  const c = characterOf(skin);
  root.style.setProperty('--adv-accent', c.accent);
  root.querySelectorAll<HTMLElement>('[data-skin]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.skin === c.id)));
  root.querySelectorAll<HTMLDetailsElement>('.adv-picker').forEach((picker) => {
    picker.open = false;
    drawAvatar(picker.querySelector<HTMLCanvasElement>('.adv-picked-avatar')!, skin);
    picker.querySelector('.adv-picked-name')!.textContent = c.name;
    picker.querySelector('.adv-picked-note')!.textContent = c.subtitle;
  });
}

export async function mountAdventureMenu(app: HTMLElement) {
  document.title = `${gameName('adventure')} · Little Lobby`;
  let skin = storedSkin();
  app.innerHTML = `<main class="adventure adv-menu">${nav}<section class="adv-hero"><div class="adv-welcome"><span class="adv-eyebrow">A TINY ADVENTURE, TOGETHER</span><h1>今天，和谁<br>一起去<span>冒险？</span></h1><p>踩着软软的草地，捡一点小点心。<br>跳过小水洼，和朋友在终点碰头。</p><div class="adv-menu-actions"><a class="adv-primary" href="#/adventure-host?solo=1">一个人先逛逛 <span>→</span></a><a class="adv-secondary" href="${isLanPage() ? `#/join/${window.__LITTLE_LOBBY_LAN__!.room}?lan=1&game=adventure` : `#/adventure-host${isNativeApp() ? '?lan=1' : ''}`}">${isLanPage() ? '回到朋友的房间' : isNativeApp() ? '和朋友离线出发' : '和朋友一起玩'} <span>↗</span></a></div><small class="adv-network-note">${isNativeApp() || isLanPage() ? '同一个 Wi-Fi / 热点，扫码就能一起玩，无需外网。' : '单人无需联网 · 离线联机请用原生应用开房，朋友手机扫码加入。'}</small></div><div class="adv-preview"><span class="adv-sticker">没有淘汰，只有再试一次 ♡</span><canvas class="adv-preview-canvas" aria-label="可爱角色和平台关卡预览"></canvas><div class="adv-preview-caption"><span>01 / 莓莓散步道</span><span>跳一跳 · 收集 · 一起到终点</span></div></div></section><section class="adv-wardrobe"><div><span class="adv-eyebrow">PICK YOUR LITTLE BUDDY</span><h2>挑一位小伙伴</h2><p>随时换角色，在同一张地图一起冒险。</p><strong class="adv-theme-label"></strong></div>${choices()}</section><section class="adv-trip"><span>✦ 三站小旅行</span>${modeLevels('classic').map((li, i) => `<span><b>0${i + 1}</b>${LEVELS[li].name}</span>`).join('')}<span>多人还有：串一串 · 吃吐吐 · 叠罗汉</span></section><p class="adv-original"><a href="#/characters">打开角色图鉴，看看所有小伙伴 →</a></p></main>`;
  try { await avatars(app, skin); }
  catch (error) { app.querySelector('.adv-preview-caption')!.textContent = String(error); return; }
  skin = characterOf(skin).id;
  const renderer = new AdventureRenderer(app.querySelector('canvas.adv-preview-canvas')!);
  const preview = new AdventureGame(); preview.add(1, characterOf(skin).name, skin);
  const update = () => {
    const { name } = characterOf(skin);
    selected(app.querySelector('.adventure')!, skin);
    app.querySelector('.adv-theme-label')!.textContent = `${name} · 地图由房主选择`;
    preview.skin(1, skin); preview.players.get(1)!.name = name;
  };
  update();
  app.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((button) => { button.onclick = () => { skin = button.dataset.skin!; store.set('adventure.skin', skin); update(); }; });
  app.querySelector<HTMLButtonElement>('.adv-full')!.onclick = () => { void enterFullscreen(); };
  let frame = 0, closed = false;
  const draw = () => { if (closed) return; renderer.draw(preview.view(1), skin); frame = requestAnimationFrame(draw); };
  frame = requestAnimationFrame(draw);
  window.addEventListener('pagehide', () => { closed = true; cancelAnimationFrame(frame); renderer.close(); }, { once: true });
}

interface AdventureMode { host?: boolean; solo?: boolean; screen?: boolean; lan?: boolean; room?: string; server?: string; pin?: string; lock?: boolean; }
/** 与足球手机页同一套布局：全屏画面、顶栏、浮动摇杆 + B 键跳跃、居中菜单面板。 */
export async function mountAdventure(app: HTMLElement, mode: AdventureMode) {
  document.title = `${gameName('adventure')} · Little Lobby`;
  let skin = storedSkin(), host: AdventureHost | null = null, client: ClientNet | LanClient | null = null;
  let state: AdventureView | null = null, previous: AdventureView | null = null, received = 0, pid = -1;
  let closed = false, frame = 0, timer = 0, seq = 0, lastEpoch = -1, sound = true, panelOpen = false, lastPhase = '';
  let input: AdventureInput = { axis: 0, jump: false, act: false };
  // 与足球共用房间码键（手机开房 / 大屏），切换玩法时房间码不变
  const roomKey = mode.screen ? 'room' : 'hostroom';
  const room = mode.room || (mode.solo ? randomCode() : store.get(roomKey, false) || randomCode());
  // 房间设置（密码 / 公开大厅）由首页开房时写入，冒险沿用，切回足球时也不丢
  const roomPin = mode.host && !mode.solo ? roomOpts().pin : undefined;
  const pinKey = `pin.${room}`;
  if (mode.host && !mode.solo) store.set(roomKey, room, false);
  const abort = new AbortController(), listen = { signal: abort.signal };
  const decoder = new TextDecoder();
  const initial = new AdventureGame(); initial.add(1, '小伙伴', skin);

  app.innerHTML = `<div class="play adv-play${mode.host ? ' joined' : ''}${mode.screen ? ' watching' : ''}">
    <canvas class="stage" aria-label="横版平台闯关游戏，摇杆左右移动，B 键跳跃"></canvas>
    <div class="topbar">
      <div class="topbar-left"><div class="status"><i></i><span>${mode.host ? '正在准备小世界…' : `房间 ${esc(room)}`}</span></div></div>
      <div class="adv-hud"></div>
      <div class="top-actions"><button class="ghost round-btn fs-btn" aria-label="${t('play.fullscreen')}" title="${t('play.fullscreen')}" hidden>${icon.expand}</button><button class="ghost round-btn menu" aria-label="${t('play.menu')}">${icon.menu}</button></div>
    </div>
    <div class="card adv-paused" role="status" hidden>房主已切到后台，冒险暂停中。<br>请房主回到游戏，大家就能继续。</div>
    <img class="corner-logo" src="${brand('logo-sm.png')}" alt="">
    <div class="pad" hidden></div>
    ${mode.host && !mode.solo ? `<div class="adv-dock game-dock" hidden>
      ${mode.screen ? '<div class="adv-cast"></div>' : ''}
      <div class="adv-modes" role="radiogroup" aria-label="玩法">${MODES.map((m) => `<button type="button" role="radio" class="adv-mode" data-mode="${m.id}" title="${esc(m.desc)}">${m.name}</button>`).join('')}</div>
      <div class="adv-invite"><img class="adv-qr" alt="扫码加入闯关房间" hidden><div><b class="adv-code">${esc(room)}</b><span>${mode.lan ? '连同一 Wi-Fi，扫码加入' : '手机扫码加入'}</span></div></div>
      <div class="adv-address"></div>
      <button class="primary adv-start" disabled>准备小背包…</button>
    </div>` : ''}
    ${mode.screen ? `<div class="corner-qr tv-corner" hidden><img alt="扫码加入"><b>${esc(room)}</b></div>` : ''}
    <div class="panel card adv-panel drawer" hidden>
      <nav class="prail"><button class="pcollapse" aria-label="收起菜单">${icon.right}</button><button data-tab="room" class="on" aria-pressed="true">${icon.home}<span>房间</span></button>${mode.screen ? '' : `<button data-tab="controls" aria-pressed="false">${icon.pad}<span>按键</span></button>`}</nav>
      <div class="pmain">
      <div class="panel-head"><span><b class="adv-level-name">莓莓散步道</b> <span class="adv-level-number">01 / 03</span></span><button class="ghost close" aria-label="关闭">×</button></div>
      <div class="adv-tab" data-tabpane="room">
      <p class="adv-progress"></p>
      <p class="muted small adv-hint">${HINTS.classic}</p>
      <div class="adv-roster"></div>
      <div class="adv-settings">
        ${mode.screen ? '' : `<div class="adv-row adv-row-picker"><span>角色</span>${choices()}</div>`}
        <label class="adv-row"><span>音效</span><input type="checkbox" class="switch adv-audio" checked></label>
        <label class="adv-row"><span>${t('lang.label')}</span>${langSelect()}</label>
      </div>
      <div class="adv-actions"><button class="ghost adv-lobby" hidden>回到大厅选玩法</button>${mode.host && !mode.solo ? `<button class="ghost switch-game">${t('game.switchTo', { game: gameName('football') })}</button>` : ''}<button class="adv-leave leave-room">${t('play.leave')}</button></div>
      </div>
      <div class="adv-tab" data-tabpane="controls" hidden>${controlsPaneHtml()}</div>
      </div>
    </div>
    ${joinCardHtml({
      title: gameName('adventure'),
      room,
      name: store.get('adventure.name') || store.get('name') || '',
      pin: mode.pin || store.get(pinKey, false) || '',
      askPin: !!mode.lock,
      pick: mode.screen ? undefined : { label: t('join.character'), html: choices() },
      go: '加入小伙伴',
      links: [['return-home', t('play.home')]],
      hidden: mode.host,
    })}
    <div class="card adv-overlay" hidden><span>✿</span><h2></h2><p class="muted"></p><div class="adv-results"></div><button class="primary adv-next" hidden>下一站 →</button></div>
    <div class="toast" hidden></div>
    <div class="rotate"><span>${t('play.rotate')}</span><button class="ghost leave-room">${t('play.leave')}</button></div>
  </div>`;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => app.querySelector<T>(selector)!;
  const play = $('.play'), panel = $('.panel'), joinEl = $('.join');
  const status = (message: string, ok = true) => {
    if (closed) return;
    $('.status').className = `status ${ok ? 'p2p' : 'lost'}`;
    $('.status span').textContent = message;
  };
  let toastTimer = 0, rosterKey = '';
  const toast = (message: string, ms = 2200) => {
    const el = $('.toast'); el.textContent = message; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { el.hidden = true; }, ms);
  };
  const joinButton = $<HTMLButtonElement>('.go');
  joinButton.disabled = true; joinButton.textContent = '正在加载角色…';
  $('.return-home').onclick = () => { location.hash = '#/'; };
  try { await avatars(app, skin); }
  catch (error) {
    status('角色图片加载失败，请重试', false); toast(String(error), 6000);
    joinButton.disabled = false; joinButton.textContent = '图片加载失败，点击重试';
    // 房主平时看不到加入卡片，失败时露出来，只留重试和回首页
    if (mode.host) { joinEl.hidden = false; showField($<HTMLInputElement>('.join .name'), false); joinEl.querySelector<HTMLElement>('.join-pick')?.setAttribute('hidden', ''); }
    // 原地重来：已下载好的图片保留，只重新下载失败的
    joinButton.onclick = () => { void mountAdventure(app, mode); };
    return;
  }
  joinButton.disabled = false; joinButton.textContent = '加入小伙伴';
  skin = characterOf(skin).id;
  const renderer = new AdventureRenderer($<HTMLCanvasElement>('.stage'));
  // 和足球同一套菱形键位：B 跳跃在右、A 吃 / 吐在下；X、Y 用不到，留淡淡的空位
  const pad = new Gamepad($('.pad'), { buttons: [{ bit: BTN_Y, key: 'Y', label: '', cls: 'y' }, { bit: BTN_X, key: 'X', label: '', cls: 'x' }, { bit: BTN_B, key: 'B', label: '跳跃', cls: 'b' }, { bit: BTN_A, key: 'A', label: '吃 / 吐', cls: 'a' }] });
  pad.slot(BTN_Y, true); pad.slot(BTN_X, true); pad.slot(BTN_A, true);
  bindControlsPane(panel, (settings) => { pad.apply(settings); pad.slot(BTN_A, state?.mode !== 'eat'); });
  // 菜单抽屉左缘竖排「房间 / 按键设置」两个分页；按键分页时抽屉缩成窄条，两侧手柄露出来
  panel.querySelectorAll<HTMLButtonElement>('.prail [data-tab]').forEach((button) => {
    button.onclick = () => {
      panel.querySelectorAll<HTMLElement>('.prail [data-tab]').forEach((b) => { b.classList.toggle('on', b === button); b.setAttribute('aria-pressed', String(b === button)); });
      panel.querySelectorAll<HTMLElement>('[data-tabpane]').forEach((pane) => { pane.hidden = pane.dataset.tabpane !== button.dataset.tab; });
      panel.classList.toggle('is-narrow', button.dataset.tab === 'controls');
      // 大厅里手柄平时是隐藏的；调按键时先露出来预览（不在游戏中，按了也不会动）
      play.classList.toggle('ctl-preview', button.dataset.tab === 'controls');
    };
  });
  app.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => { button.onclick = () => { if (validMode(button.dataset.mode)) host?.setMode(button.dataset.mode); }; });

  const setSkin = () => {
    selected(play, skin);
    initial.skin(1, skin);
    if (host?.localId !== undefined) { host.game.skin(host.localId, skin); host.publish(); }
    if (client?.linked) client.sendJson({ t: 'adventure-skin', skin });
  };
  app.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((button) => { button.onclick = () => { skin = button.dataset.skin!; store.set('adventure.skin', skin); setSkin(); }; });
  setSkin();

  function send() {
    if (!state || closed) return;
    if (host) {
      host.localInput = { ...input };
      if (host.localId !== undefined) host.game.input(host.localId, input);
    } else if (client?.linked) client.sendJson({ t: 'adventure-input', epoch: state.epoch, seq: seq++, ...input }, 1);
  }
  function updateInput() {
    const enabled = (state?.phase === 'playing' || state?.phase === 'lobby') && !state.paused && (host ? host.localId !== undefined : !!client?.linked);
    const next = padInput(pad.input.jx, pad.input.jy, !!(pad.input.btn & BTN_B), enabled, !!(pad.input.btn & BTN_A));
    if (next.jump && !input.jump && sound) { unlockAudio(); sfxAdventure('jump'); }
    const changed = next.axis !== input.axis || next.jump !== input.jump || next.act !== input.act;
    input = next;
    if (changed) send();
  }
  pad.onButtons = updateInput;
  pad.onPress = (bit) => { if (bit === BTN_B) vibrate(8); };

  const renderPanel = () => { panel.hidden = !panelOpen || !joinEl.hidden; if (panel.hidden) play.classList.remove('ctl-preview'); else play.classList.toggle('ctl-preview', panel.classList.contains('is-narrow')); };
  const menuBtn = app.querySelector<HTMLButtonElement>('.menu');
  if (menuBtn) menuBtn.onclick = () => { panelOpen = !panelOpen; renderPanel(); };
  const closePanel = () => { panelOpen = false; renderPanel(); };
  panel.querySelectorAll<HTMLElement>('.close, .pcollapse').forEach((b) => { b.onclick = closePanel; });
  bindDrawer(play, panel, closePanel);
  $<HTMLInputElement>('.adv-audio').onchange = (e) => { sound = (e.target as HTMLInputElement).checked; unlockAudio(); };
  bindLangSelect(panel);
  const leave = async () => {
    if (!mode.solo && (host || client) && !(await confirmLeave(!!host))) return;
    autoFs = false;
    // 与足球一致：退出后清掉自动重连标记，下次开房 / 加入回到填写表单
    // 大屏退出时和足球大屏一样清掉房间码，下次开房换新码，旧手机不会自动连回来
    store.set(mode.screen ? 'room' : mode.host ? 'hosting' : `adventure.joined.${room}`, '', false);
    location.hash = '#/';
  };
  app.querySelectorAll<HTMLButtonElement>('.leave-room, .return-home').forEach((button) => { button.onclick = leave; });
  app.querySelectorAll<HTMLButtonElement>('.switch-game').forEach((button) => { button.onclick = () => { void switchHostGame('football'); }; });

  // ---------- 全屏：与足球页相同，加入后在下一次抬手时补一次 ----------
  const fsBtn = app.querySelector<HTMLButtonElement>('.fs-btn') ?? document.createElement('button');
  // iPhone 没有网页全屏：按钮照样显示，点了告诉他添加到主屏幕
  const iosTip = !canFullscreen() && !isFullscreen();
  const syncFs = () => { fsBtn.hidden = isFullscreen(); };
  document.addEventListener('fullscreenchange', syncFs, listen);
  document.addEventListener('webkitfullscreenchange', syncFs, listen);
  syncFs();
  fsBtn.onclick = () => { if (iosTip) toast(t('play.iosTip'), 7000); else void enterFullscreen(true); };
  let autoFs = canFullscreen();
  const tryFs = () => {
    if (!autoFs || !joinEl.hidden) return;
    void enterFullscreen(true).then((ok) => { if (ok) autoFs = false; });
  };
  window.addEventListener('touchend', tryFs, listen);
  window.addEventListener('click', tryFs, listen);

  function receive(view: AdventureView) {
    if (closed || !LEVELS[view.level] || !validMode(view.mode) || !Array.isArray(view.players) || view.players.length > 8) return;
    if (state && view.epoch < state.epoch) return;
    if (state && view.epoch === state.epoch && view.time < state.time) return;
    const oldMe = state?.players.find((p) => p.id === state!.me);
    if (!host && pid < 0 && view.me >= 0) pid = view.me;
    previous = state; state = { ...view, me: host ? host.localId ?? -1 : pid }; received = performance.now();
    if (lastEpoch !== state.epoch) { lastEpoch = state.epoch; previous = null; pad.reset(); }
    // 大厅里显示所选玩法的第一关；关卡编号按玩法内计数
    const levels = modeLevels(state.mode), shown = state.phase === 'lobby' ? levels[0] : state.level;
    const me = state.players.find((p) => p.id === state!.me), level = LEVELS[shown];
    const nameOf = (id: number) => state!.players.find((p) => p.id === id)?.name ?? '队友';
    if (oldMe && me) {
      // 大厅里只是热身，出发时星星、存档都会清零，不弹进度提示
      const warmUp = state.phase === 'lobby';
      if (me.deaths > oldMe.deaths) { if (!warmUp) toast('没关系，在休息站重新出发 ♡'); if (sound) sfxAdventure('hurt'); vibrate(25); }
      else if (me.checkpoint > oldMe.checkpoint && !warmUp) toast('休息站已点亮，下次从这里出发！');
      else if (me.coins.length > oldMe.coins.length && sound) sfxAdventure('collect');
      if (me.eatenBy >= 0 && oldMe.eatenBy < 0) toast(`你在 ${nameOf(me.eatenBy)} 的肚子里啦，按 A 挣脱`, 3000);
      if (me.eating >= 0 && oldMe.eating < 0) toast(`含住了 ${nameOf(me.eating)}！按 A 把他吐出去`, 3000);
    }
    if (state.stars.length > (previous?.stars.length ?? 0)) { if (state.phase !== 'lobby') toast(`找到小星星！${state.stars.length} / 3`); if (sound) sfxAdventure('collect'); }
    const won = state.phase === 'clear' || state.phase === 'complete';
    if (won && previous?.phase === 'playing' && sound) sfxAdventure('clear');
    const time = `${String(Math.floor(state.time / 60)).padStart(2, '0')}:${String(Math.floor(state.time) % 60).padStart(2, '0')}`;
    // 大屏没有自己的角色：显示关卡、星星和时间；手机显示自己的爱心和收集
    $('.adv-hud').textContent = state.phase === 'lobby' ? (!mode.host ? '先走走看，等房主出发' : mode.screen ? '手机扫码加入，人齐了就出发' : '先走走看，人齐了就出发')
      : me
      ? `${'♥'.repeat(me.hearts) + '♡'.repeat(3 - me.hearts)} · ${MAP_THEMES[level.theme].item} ${me.coins.length}/${level.coins.length} · ✦ ${state.stars.length}/3 · ${time}`
      : `${level.name} · ✦ ${state.stars.length}/3 · ${time}`;
    $('.adv-level-name').textContent = level.name; $('.adv-level-number').textContent = `${modeInfo(state.mode).name} ${String(levels.indexOf(shown) + 1).padStart(2, '0')} / ${String(levels.length).padStart(2, '0')}`;
    $('.adv-hint').textContent = HINTS[state.mode];
    app.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      const m = modeInfo(button.dataset.mode as ModeId);
      button.setAttribute('aria-checked', String(m.id === state!.mode));
      button.disabled = m.coop && state!.players.filter((p) => p.online).length < 2;
    });
    const modeLine = app.querySelector('.adv-mode-line');
    if (modeLine) modeLine.textContent = `玩法：${modeInfo(state.mode).name} · ${modeInfo(state.mode).desc}`;
    pad.slot(BTN_A, state.mode !== 'eat');
    $('.adv-progress').textContent = state.paused ? '主机在后台，旅行暂停中' : state.phase === 'lobby' ? (mode.host ? '选好玩法和小伙伴，就能出发' : '挑好小伙伴，等房主出发') : me && me.eatenBy >= 0 ? `你在 ${nameOf(me.eatenBy)} 的肚子里，按 A 挣脱` : me?.reached ? '你已到达，等小伙伴来野餐 ♡' : state.stars.length === 3 ? '小屋开门了！去终点集合 →' : '找齐三颗星星，去小屋集合';
    $('.adv-overlay').hidden = !won;
    if (won) {
      const coop = modeInfo(state.mode).coop;
      $('.adv-overlay h2').textContent = state.phase === 'complete' ? (coop ? `「${modeInfo(state.mode).name}」通关！` : '小小旅行，圆满抵达！') : '这一站，我们到啦！';
      $('.adv-overlay p').textContent = state.phase === 'complete' ? (coop ? '配合得太棒了！回菜单换个玩法再来 ♡' : '三站冒险完成，谢谢你们一起走到这里 ♡') : mode.host ? '休息一下，再一起出发。' : '等房主带大家去下一站。';
      $('.adv-results').innerHTML = state.players.filter((p) => p.online).map((p) => `<span>${esc(p.name)} <b>${p.coins.length} 份点心</b></span>`).join('');
      $('.adv-next').hidden = !mode.host;
      $('.adv-next').textContent = state.phase === 'complete' ? '再去散一次步' : '下一站 →';
    }
    const key = JSON.stringify(state.players.map((p) => [p.id, p.name, p.skin, p.online, p.reached]));
    if (key !== rosterKey) {
      rosterKey = key;
      $('.adv-roster').innerHTML = state.players.map((p) => `<span class="${p.online ? '' : 'is-offline'}"><i style="background:${characterOf(p.skin)?.accent || '#ccc'}"></i>${esc(p.name)}${p.reached ? ' ✓' : !p.online ? ' · 重连中' : ''}</span>`).join('');
      if (mode.screen) {
        // 大屏左下角：每位小伙伴一个圆头像和名字
        const cast = $('.adv-cast');
        cast.innerHTML = state.players.map((p) => `<span class="${p.online ? '' : 'is-offline'}" style="--chip:${characterOf(p.skin)?.accent || '#ccc'}"><canvas data-skin="${esc(p.skin)}" aria-hidden="true"></canvas><b>${esc(p.name)}</b></span>`).join('');
        cast.querySelectorAll<HTMLCanvasElement>('canvas[data-skin]').forEach((c) => drawAvatar(c, c.dataset.skin!));
      }
    }
    const lobby = state.phase === 'lobby', dock = app.querySelector<HTMLElement>('.adv-dock');
    if (dock) {
      dock.hidden = !lobby;
      const start = $<HTMLButtonElement>('.adv-start'), online = state.players.filter((p) => p.online).length, needTwo = modeInfo(state.mode).coop && online < 2;
      start.disabled = !online || needTwo;
      start.textContent = !online ? '等一位小伙伴加入' : needTwo ? '这个玩法要 2 人' : '一起出发';
    }
    if (mode.screen) {
      $('.tv-corner').hidden = lobby || !$<HTMLImageElement>('.tv-corner img').src;
    }
    $('.adv-lobby').hidden = !mode.host || !!mode.solo || lobby;
    const playing = !!me && (state.phase === 'playing' || state.phase === 'lobby') && !state.paused && (!!host || !!client?.linked);
    $('.adv-paused').hidden = !state.paused || state.phase !== 'playing';
    $('.pad').hidden = !playing;
    play.classList.toggle('watching', !me);
    if (!playing) pad.reset();
    // 换阶段时收起菜单；大厅里菜单不自动弹出，进来就能先走走
    if (state.phase !== lastPhase) { lastPhase = state.phase; panelOpen = false; renderPanel(); }
  }
  const start = () => { unlockAudio(); void keepAwake(); pad.reset(); host?.advance(); };
  app.querySelector<HTMLButtonElement>('.adv-start')?.addEventListener('click', start); $('.adv-next').onclick = start;
  $('.adv-lobby').onclick = () => { pad.reset(); host?.toLobby(); closePanel(); };
  function draw() {
    if (closed) return;
    pad.update(); updateInput();
    let view = host ? host.game.view(host.localId) : state || initial.view(1);
    if (!host && state && previous && previous.epoch === state.epoch) {
      const k = Math.max(0, Math.min(1, (performance.now() - received) / 50));
      view = { ...state, players: state.players.map((p) => { const prev = previous!.players.find((v) => v.id === p.id); return prev && Math.hypot(prev.x - p.x, prev.y - p.y) < 160 ? { ...p, x: prev.x + (p.x - prev.x) * k, y: prev.y + (p.y - prev.y) * k } : p; }) };
    }
    renderer.draw(view, skin); frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);
  function cleanup() {
    if (closed) return;
    pad.reset(); closed = true; abort.abort(); cancelAnimationFrame(frame); clearInterval(timer); clearTimeout(toastTimer);
    renderer.close(); host?.close(); client?.close();
    if (mode.host && mode.lan) void stopLan().catch(() => {});
  }
  window.addEventListener('pagehide', cleanup, { once: true });

  if (mode.host) {
    try {
      if (mode.lan) {
        if (!isNativeApp()) throw new Error('离线开房请使用原生应用，朋友可以用浏览器加入。');
        await startLan(room);
        if (closed) { await stopLan(); return; }
      }
      host = new AdventureHost(room, mode.solo ? undefined : mode.lan ? (_r, cb) => new LanHost(lanSession()!, cb) : (r, cb) => new HostNet(r, cb), roomPin, !mode.solo && roomOpts().listed);
      if (!mode.screen) host.addLocal(store.get('adventure.name') || store.get('name') || (mode.solo ? '小伙伴' : '房主'), skin);
      host.onView = receive;
      host.onStatus = (ok) => status(ok ? mode.solo ? '单人小旅行' : `${mode.lan ? '局域网' : '已连接'} · 房间 ${room}` : mode.lan ? '局域网服务已断开' : '正在恢复连接…', ok);
      await host.start();
      if (closed) return;
      if (mode.solo) host.advance();
      else {
        $('.adv-address').innerHTML = mode.lan ? lanInfoHtml() : '';
        let version = 0;
        const invite = async () => {
          const current = ++version, url = new URL(joinUrl({ room, pin: roomPin }));
          const [path, query] = url.hash.slice(1).split('?'), params = new URLSearchParams(query); params.set('game', 'adventure'); url.hash = `${path}?${params}`;
          try {
            const qr = (await import('qrcode')).default, image = await qr.toDataURL(url.href, { width: 220, margin: 1 });
            if (closed || current !== version) return;
            $<HTMLImageElement>('.adv-qr').src = image; $('.adv-qr').hidden = false;
            if (mode.screen) $<HTMLImageElement>('.tv-corner img').src = image;
          } catch { toast(`二维码生成失败，请打开 ${url.href} 加入`, 6000); }
        };
        bindLanAddress($('.adv-address'), () => { void invite(); }); await invite();
      }
    } catch (e) { host?.close(); if (mode.lan) await stopLan().catch(() => {}); status('出发前遇到问题', false); toast(`${String(e)}，可以返回重试。`, 8000); }
  } else {
    const joinedKey = `adventure.joined.${room}`;
    const join = async () => {
      const name = $<HTMLInputElement>('.join .name').value.trim().slice(0, 12); if (!name) { $('.join .name').focus(); return; }
      unlockAudio(); void keepAwake();
      void enterFullscreen(true).then((ok) => { if (ok) autoFs = false; });
      if (iosTip && !store.get('iosTip')) { store.set('iosTip', '1'); toast(t('play.iosTip'), 7000); }
      store.set('adventure.name', name); store.set(joinedKey, '1', false);
      let token = store.get(`adventure.token.${room}`); if (!token) { token = randomCode(16); store.set(`adventure.token.${room}`, token); }
      client?.close();
      state = previous = null; lastEpoch = -1; lastPhase = ''; rosterKey = '';
      pad.reset(); $('.pad').hidden = true; $('.adv-paused').hidden = true;
      joinEl.hidden = true; play.classList.add('joined'); renderPanel();
      const pin = $<HTMLInputElement>('.join .pin').value.replace(/\D/g, '') || undefined;
      store.set(pinKey, pin ?? '', false);
      const info = { name, token, team: 'auto' as const, pin };
      const connection = mode.lan || isLanPage() ? new LanClient(room, info, mode.server ? lanBaseUrl(mode.server) : undefined) : new ClientNet(room, info);
      client = connection; seq = 0; pid = -1;
      const showJoin = (message: string) => { connection.close(); client = null; pad.reset(); $('.adv-paused').hidden = true; joinEl.hidden = false; play.classList.remove('joined'); store.set(joinedKey, '', false); renderPanel(); toast(message, 5000); };
      connection.onState = (s) => {
        if (closed || client !== connection) return;
        status(connection.linked ? `${s === 'lan' ? '局域网' : s === 'p2p' ? '直连' : '中继'} · 房间 ${room}` : s === 'lost' ? '正在找回连接…' : '正在连接…', connection.linked);
        if (!connection.linked) {
          pad.reset(); $('.pad').hidden = true;
          // 主机重开后 epoch / time 从头计数，不能拿旧房间的快照拦截新状态。
          state = previous = null; lastEpoch = -1; lastPhase = '';
          $('.adv-paused').hidden = true;
        }
        else connection.sendJson({ t: 'adventure-skin', skin });
      };
      const message = (m: any) => {
        if (closed || client !== connection || !m || typeof m !== 'object') return;
        if (m.t === 'welcome' && m.game !== 'adventure') {
          // 房主换回了足球：沿用身份与昵称，自动进入足球房间
          store.set(`token.${room}`, token!); store.set(`joined.${room}`, '1', false);
          if (!store.get('name')) store.set('name', name);
          const params = new URLSearchParams(location.hash.split('?')[1]); params.delete('game');
          location.hash = `#/join/${room}${params.toString() ? `?${params}` : ''}`;
          return;
        }
        if (m.t === 'welcome') {
          pid = m.pid;
          if (state) receive(state);
          connection.sendJson({ t: 'adventure-skin', skin });
        }
        else if (m.t === 'adventure-state') receive(m);
      };
      connection.onJson = message;
      connection.onBinary = (bytes) => { try { message(JSON.parse(decoder.decode(bytes))); } catch { /* 丢弃畸形快照。 */ } };
      connection.onReject = (reason) => {
        if (closed || client !== connection) return;
        if (reason.startsWith('pin')) { showJoin(t(`reject.${reason}` as Key)); const field = $<HTMLInputElement>('.join .pin'); showField(field, true); field.value = ''; field.focus(); }
        else showJoin('没有找到房间，或小伙伴已满 8 人。');
      };
      status('正在连接…', false);
      try { await connection.start(); }
      catch { if (!closed && client === connection) showJoin('暂时没连上，确认网络后可以重试。'); }
    };
    $('.go').onclick = () => { void join(); };
    app.querySelectorAll<HTMLInputElement>('.join input').forEach((field) => { field.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); void join(); } }; });
    // 刷新后按原身份自动重连
    if (store.get(joinedKey, false) === '1' && store.get('adventure.name')) void join();
  }
  if (!closed) timer = window.setInterval(send, 120);
}
