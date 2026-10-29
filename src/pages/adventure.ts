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
import { joinCardHtml, retryOnly, showField } from '../ui/join-card';
import { BTN_A, BTN_B, BTN_X, BTN_Y } from '../game/types';
import { t, type Key } from '../i18n';
import { gameName, switchHostGame } from '../room/catalog';
import { confirmLeave } from '../ui/confirm';
import { sfxAdventure, unlockAudio } from '../ui/sound';

const HINTS: Record<ModeId, string> = {
  classic: t('adv.hint.classic'),
  rope: t('adv.hint.rope'),
  eat: t('adv.hint.eat'),
  stack: t('adv.hint.stack'),
};
const storedSkin = () => { const value = legacySkin(store.get('adventure.skin')); return validSkin(value) ? value : DEFAULT_SKIN; };
const logo = () => `<span class="adv-logo-flower" aria-hidden="true">✿</span><span>${gameName('adventure')}<small>little picnic club</small></span>`;
const nav = `<nav class="adv-nav"><a class="adv-brand" href="#/adventure">${logo()}</a><div><a href="#/">${t('adv.nav.home')}</a><button class="adv-full" aria-label="${t('adv.nav.fullscreenAria')}">${t('adv.nav.fullscreen')} ↗</button></div></nav>`;
// 角色多了以后用下拉：当前角色带小头像，展开后先是搜索框，每一项也有头像预览；角色列表等本机角色读完再填
const choices = () => `<details class="adv-picker"><summary aria-label="${t('adv.pick')}"><canvas class="adv-picked-avatar" aria-hidden="true"></canvas><span><b class="adv-picked-name"></b><small class="adv-picked-note"></small></span><i aria-hidden="true">▾</i></summary><div class="adv-options"></div></details>`;
/** 只等自己选的角色；列表里其他角色的头像在第一次展开时才下载 */
async function avatars(root: HTMLElement, skin: SkinId, signal?: AbortSignal) {
  await loadCharacterSprites([skin]);
  root.querySelectorAll<HTMLElement>('.adv-options').forEach((options) => {
    // 游戏里不放「去角色图鉴」：跳页会关掉房间，应用的 WebView 里也开不了新标签页
    options.innerHTML = `<label class="adv-search">${icon.search}<input type="search" placeholder="${t('chars.pick')}" aria-label="${t('chars.search')}" autocomplete="off"></label>${CHARACTERS.map((c) => `<button class="adv-character" data-skin="${c.id}" aria-pressed="false" aria-label="${t('adv.pickOne', { name: esc(c.name), note: esc(c.subtitle) })}"><canvas aria-hidden="true"></canvas><b>${esc(c.name)}</b><small>${esc(c.subtitle.split(' · ')[1] || c.subtitle)}</small></button>`).join('')}<p class="adv-search-empty" hidden>${t('chars.empty')}</p>${options.closest('.adv-play') ? '' : `<a class="adv-more" href="#/characters">${t(isLanPage() ? 'chars.pickAll' : 'chars.pickMore')} →</a>`}`;
    const input = options.querySelector('input')!;
    input.oninput = () => showMatching(options.querySelectorAll<HTMLElement>('[data-skin]'), (button) => characterMatches(characterOf(button.dataset.skin!), input.value), options.querySelector<HTMLElement>('.adv-search-empty'));
  });
  // 像普通下拉框一样：点别处就收起；在菜单里展开时把列表滚进视野
  document.addEventListener('pointerdown', (e) => root.querySelectorAll<HTMLDetailsElement>('.adv-picker[open]').forEach((picker) => { if (!picker.contains(e.target as Node)) picker.open = false; }), { signal });
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
  app.innerHTML = `<main class="adventure adv-menu">${nav}<section class="adv-hero"><div class="adv-welcome"><span class="adv-eyebrow">A TINY ADVENTURE, TOGETHER</span><h1>${t('adv.hero.title')}</h1><p>${t('adv.hero.lead')}</p><div class="adv-menu-actions"><a class="adv-primary" href="#/adventure-host?solo=1">${t('adv.hero.solo')} <span>→</span></a><a class="adv-secondary" href="${isLanPage() ? `#/join/${window.__LITTLE_LOBBY_LAN__!.room}?lan=1&game=adventure` : `#/adventure-host${isNativeApp() ? '?lan=1' : ''}`}">${t(isLanPage() ? 'adv.hero.backToRoom' : isNativeApp() ? 'adv.hero.offline' : 'adv.hero.together')} <span>↗</span></a></div><small class="adv-network-note">${t(isNativeApp() || isLanPage() ? 'adv.hero.noteLan' : 'adv.hero.noteWeb')}</small></div><div class="adv-preview"><span class="adv-sticker">${t('adv.hero.sticker')}</span><canvas class="adv-preview-canvas" aria-label="${t('adv.hero.previewAria')}"></canvas><div class="adv-preview-caption"><span>01 / ${LEVELS[0].name}</span><span>${t('adv.hero.caption')}</span></div></div></section><section class="adv-wardrobe"><div><span class="adv-eyebrow">PICK YOUR LITTLE BUDDY</span><h2>${t('adv.wardrobe.title')}</h2><p>${t('adv.wardrobe.desc')}</p><strong class="adv-theme-label"></strong></div>${choices()}</section><section class="adv-trip"><span>✦ ${t('adv.trip.title')}</span>${modeLevels('classic').map((li, i) => `<span><b>0${i + 1}</b>${LEVELS[li].name}</span>`).join('')}<span>${t('adv.trip.more', { modes: MODES.filter((m) => m.coop).map((m) => m.name).join(' · ') })}</span></section><p class="adv-original"><a href="#/characters">${t('adv.gallery')} →</a></p></main>`;
  try { await avatars(app, skin); }
  catch (error) { app.querySelector('.adv-preview-caption')!.textContent = String(error); return; }
  skin = characterOf(skin).id;
  const renderer = new AdventureRenderer(app.querySelector('canvas.adv-preview-canvas')!);
  const preview = new AdventureGame(); preview.add(1, characterOf(skin).name, skin);
  const update = () => {
    const { name } = characterOf(skin);
    selected(app.querySelector('.adventure')!, skin);
    app.querySelector('.adv-theme-label')!.textContent = t('adv.wardrobe.theme', { name });
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
  const initial = new AdventureGame(); initial.add(1, t('adv.defaultName'), skin);

  app.innerHTML = `<div class="play adv-play${mode.host ? ' joined' : ''}${mode.screen ? ' watching' : ''}">
    <canvas class="stage" aria-label="${t('adv.stageAria')}"></canvas>
    <div class="topbar">
      <div class="topbar-left"><div class="status"><i></i><span>${mode.host ? t('adv.status.preparing') : t('adv.room', { room: esc(room) })}</span></div></div>
      <div class="adv-hud"></div>
      <div class="top-actions"><button class="ghost round-btn fs-btn" aria-label="${t('play.fullscreen')}" title="${t('play.fullscreen')}" hidden>${icon.expand}</button><button class="ghost round-btn menu" aria-label="${t('play.menu')}">${icon.menu}</button></div>
    </div>
    <div class="card adv-paused" role="status" hidden>${t('adv.paused')}</div>
    <img class="corner-logo" src="${brand('logo-sm.png')}" alt="">
    <div class="pad" hidden></div>
    ${mode.host && !mode.solo ? `<div class="adv-dock game-dock" hidden>
      ${mode.screen ? '<div class="adv-cast"></div>' : ''}
      <div class="adv-modes" role="radiogroup" aria-label="${t('adv.modes')}">${MODES.map((m) => `<button type="button" role="radio" class="adv-mode" data-mode="${m.id}" title="${esc(m.desc)}">${m.name}</button>`).join('')}</div>
      <div class="adv-invite"><img class="adv-qr" alt="${t('adv.qrAlt')}" hidden><div><b class="adv-code">${esc(room)}</b><span>${t(mode.lan ? 'adv.scanLan' : 'adv.scan')}</span></div></div>
      <div class="adv-address"></div>
      <button class="primary adv-start" disabled>${t('adv.start.loading')}</button>
    </div>` : ''}
    ${mode.screen ? `<div class="corner-qr tv-corner" hidden><img alt="${t('adv.scanAlt')}"><b>${esc(room)}</b></div>` : ''}
    <div class="panel card adv-panel drawer" hidden>
      <nav class="prail"><button class="pcollapse" aria-label="${t('adv.menu.collapse')}">${icon.right}</button><button data-tab="room" class="on" aria-pressed="true">${icon.home}<span>${t('adv.menu.room')}</span></button>${mode.screen ? '' : `<button data-tab="controls" aria-pressed="false">${icon.pad}<span>${t('adv.menu.controls')}</span></button>`}</nav>
      <div class="pmain">
      <div class="panel-head"><span><b class="adv-level-name">${LEVELS[0].name}</b> <span class="adv-level-number">01 / 03</span></span><button class="ghost close" aria-label="${t('adv.menu.close')}">×</button></div>
      <div class="adv-tab" data-tabpane="room">
      <p class="adv-progress"></p>
      <p class="muted small adv-hint">${HINTS.classic}</p>
      <div class="adv-roster"></div>
      <div class="adv-settings">
        ${mode.screen ? '' : `<div class="adv-row adv-row-picker"><span>${t('adv.menu.character')}</span>${choices()}</div>`}
        <label class="adv-row"><span>${t('adv.menu.sound')}</span><input type="checkbox" class="switch adv-audio" checked></label>
        <label class="adv-row"><span>${t('lang.label')}</span>${langSelect()}</label>
      </div>
      <div class="adv-actions"><button class="ghost adv-lobby" hidden>${t('adv.menu.lobby')}</button>${mode.host && !mode.solo ? `<button class="ghost switch-game">${t('game.switchTo', { game: gameName('football') })}</button>` : ''}<button class="adv-leave leave-room">${t('play.leave')}</button></div>
      </div>
      <div class="adv-tab" data-tabpane="controls" hidden>${controlsPaneHtml()}</div>
      </div>
    </div>
    ${joinCardHtml({
      title: gameName('adventure'),
      room,
      name: store.get('adventure.name') || store.get('name') || '',
      locked: !!mode.lock || !!mode.pin,
      pin: { value: mode.pin || store.get(pinKey, false) || '', show: !!mode.lock },
      pick: mode.screen ? undefined : { label: t('join.character'), html: choices() },
      go: t('adv.join.go'),
      links: [['return-home', t('play.home')]],
      hidden: mode.host,
    })}
    <div class="card adv-overlay" hidden><span>✿</span><h2></h2><p class="muted"></p><div class="adv-results"></div><button class="primary adv-next" hidden>${t('adv.next')}</button></div>
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
  joinButton.disabled = true; joinButton.textContent = t('adv.join.loading');
  $('.return-home').onclick = () => { location.hash = '#/'; };
  try { await avatars(app, skin, abort.signal); }
  catch (error) {
    status(t('adv.status.spritesFailed'), false); toast(String(error), 6000);
    joinButton.disabled = false; joinButton.textContent = t('adv.join.retry');
    // 房主平时看不到加入卡片，失败时露出来，只留重试和回首页
    if (mode.host) { joinEl.hidden = false; retryOnly(joinEl); }
    // 原地重来：已下载好的图片保留，只重新下载失败的
    joinButton.onclick = () => { abort.abort(); void mountAdventure(app, mode); };
    return;
  }
  joinButton.disabled = false; joinButton.textContent = t('adv.join.go');
  skin = characterOf(skin).id;
  const renderer = new AdventureRenderer($<HTMLCanvasElement>('.stage'));
  // 和足球同一套菱形键位：B 跳跃在右、A 吃 / 吐在下；X、Y 用不到，留淡淡的空位
  const pad = new Gamepad($('.pad'), { buttons: [{ bit: BTN_Y, key: 'Y', label: '', cls: 'y' }, { bit: BTN_X, key: 'X', label: '', cls: 'x' }, { bit: BTN_B, key: 'B', label: t('adv.pad.jump'), cls: 'b' }, { bit: BTN_A, key: 'A', label: t('adv.pad.eat'), cls: 'a' }] });
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
    const nameOf = (id: number) => state!.players.find((p) => p.id === id)?.name ?? t('adv.mate');
    if (oldMe && me) {
      // 大厅里只是热身，出发时星星、存档都会清零，不弹进度提示
      const warmUp = state.phase === 'lobby';
      if (me.deaths > oldMe.deaths) { if (!warmUp) toast(t('adv.toast.respawn')); if (sound) sfxAdventure('hurt'); vibrate(25); }
      else if (me.checkpoint > oldMe.checkpoint && !warmUp) toast(t('adv.toast.checkpoint'));
      else if (me.coins.length > oldMe.coins.length && sound) sfxAdventure('collect');
      if (me.eatenBy >= 0 && oldMe.eatenBy < 0) toast(t('adv.toast.eaten', { name: nameOf(me.eatenBy) }), 3000);
      if (me.eating >= 0 && oldMe.eating < 0) toast(t('adv.toast.eating', { name: nameOf(me.eating) }), 3000);
    }
    if (state.stars.length > (previous?.stars.length ?? 0)) { if (state.phase !== 'lobby') toast(t('adv.toast.star', { n: state.stars.length })); if (sound) sfxAdventure('collect'); }
    const won = state.phase === 'clear' || state.phase === 'complete';
    if (won && previous?.phase === 'playing' && sound) sfxAdventure('clear');
    const time = `${String(Math.floor(state.time / 60)).padStart(2, '0')}:${String(Math.floor(state.time) % 60).padStart(2, '0')}`;
    // 大屏没有自己的角色：显示关卡、星星和时间；手机显示自己的爱心和收集
    $('.adv-hud').textContent = state.phase === 'lobby' ? t(!mode.host ? 'adv.hud.waitHost' : mode.screen ? 'adv.hud.screen' : 'adv.hud.host')
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
    if (modeLine) modeLine.textContent = t('adv.modeLine', { name: modeInfo(state.mode).name, desc: modeInfo(state.mode).desc });
    pad.slot(BTN_A, state.mode !== 'eat');
    $('.adv-progress').textContent = state.paused ? t('adv.progress.paused') : state.phase === 'lobby' ? t(mode.host ? 'adv.progress.hostLobby' : 'adv.progress.lobby') : me && me.eatenBy >= 0 ? t('adv.progress.eaten', { name: nameOf(me.eatenBy) }) : me?.reached ? t('adv.progress.reached') : state.stars.length === 3 ? t('adv.progress.open') : t('adv.progress.stars');
    $('.adv-overlay').hidden = !won;
    if (won) {
      const coop = modeInfo(state.mode).coop;
      $('.adv-overlay h2').textContent = state.phase === 'complete' ? (coop ? t('adv.over.modeDone', { mode: modeInfo(state.mode).name }) : t('adv.over.tripDone')) : t('adv.over.stage');
      $('.adv-overlay p').textContent = state.phase === 'complete' ? t(coop ? 'adv.over.coop' : 'adv.over.trip') : t(mode.host ? 'adv.over.rest' : 'adv.over.wait');
      $('.adv-results').innerHTML = state.players.filter((p) => p.online).map((p) => `<span>${esc(p.name)} <b>${t('adv.over.treats', { n: p.coins.length })}</b></span>`).join('');
      $('.adv-next').hidden = !mode.host;
      $('.adv-next').textContent = t(state.phase === 'complete' ? 'adv.over.again' : 'adv.next');
    }
    const key = JSON.stringify(state.players.map((p) => [p.id, p.name, p.skin, p.online, p.reached]));
    if (key !== rosterKey) {
      rosterKey = key;
      $('.adv-roster').innerHTML = state.players.map((p) => `<span class="${p.online ? '' : 'is-offline'}"><i style="background:${characterOf(p.skin)?.accent || '#ccc'}"></i>${esc(p.name)}${p.reached ? ' ✓' : !p.online ? ` · ${t('adv.reconnecting')}` : ''}</span>`).join('');
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
      start.textContent = t(!online ? 'adv.start.wait' : needTwo ? 'adv.start.needTwo' : 'adv.start.go');
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
        if (!isNativeApp()) throw new Error(t('adv.err.nativeOnly'));
        await startLan(room);
        if (closed) { await stopLan(); return; }
      }
      host = new AdventureHost(room, mode.solo ? undefined : mode.lan ? (_r, cb) => new LanHost(lanSession()!, cb) : (r, cb) => new HostNet(r, cb), roomPin, !mode.solo && roomOpts().listed);
      if (!mode.screen) host.addLocal(store.get('adventure.name') || store.get('name') || t(mode.solo ? 'adv.defaultName' : 'adv.host'), skin);
      host.onView = receive;
      host.onStatus = (ok) => status(ok ? mode.solo ? t('adv.status.solo') : `${t(mode.lan ? 'adv.status.lan' : 'adv.status.linked')} · ${t('adv.room', { room })}` : t(mode.lan ? 'adv.status.lanLost' : 'adv.status.recovering'), ok);
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
          } catch { toast(t('adv.toast.qrFailed', { url: url.href }), 6000); }
        };
        bindLanAddress($('.adv-address'), () => { void invite(); }); await invite();
      }
    } catch (e) { host?.close(); if (mode.lan) await stopLan().catch(() => {}); status(t('adv.status.startFailed'), false); toast(t('adv.toast.retry', { error: String(e) }), 8000); }
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
        status(connection.linked ? `${t(s === 'lan' ? 'adv.status.lan' : s === 'p2p' ? 'adv.status.p2p' : 'adv.status.relay')} · ${t('adv.room', { room })}` : t(s === 'lost' ? 'adv.status.lost' : 'adv.status.connecting'), connection.linked);
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
        else showJoin(t('adv.join.noRoom'));
      };
      status(t('adv.status.connecting'), false);
      try { await connection.start(); }
      catch { if (!closed && client === connection) showJoin(t('adv.join.offline')); }
    };
    $('.go').onclick = () => { void join(); };
    app.querySelectorAll<HTMLInputElement>('.join input').forEach((field) => { field.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); void join(); } }; });
    // 刷新后按原身份自动重连
    if (store.get(joinedKey, false) === '1' && store.get('adventure.name')) void join();
  }
  if (!closed) timer = window.setInterval(send, 120);
}
