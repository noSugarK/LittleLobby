import './adventure.css';
import { AdventureGame, CHARACTERS, LEVELS, MAP_THEMES, padInput, validSkin, type AdventureInput, type AdventureView } from '../game/adventure';
import { AdventureRenderer, drawAvatar, loadCharacterSprites } from '../game/adventure-render';
import { AdventureHost } from '../net/adventure-host';
import { ClientNet } from '../net/client';
import { HostNet } from '../net/host';
import { LanClient } from '../net/lan-client';
import { LanHost } from '../net/lan-host';
import { isLanPage, isNativeApp, lanBaseUrl, lanSession, startLan, stopLan } from '../net/lan-session';
import { bindLanAddress, lanInfoHtml } from '../ui/lan-room';
import { canFullscreen, enterFullscreen, esc, isFullscreen, joinUrl, keepAwake, randomCode, store, vibrate } from '../ui/util';
import { Gamepad } from '../ui/gamepad';
import { BTN_B } from '../game/types';
import { t } from '../i18n';
import { sfxAdventure, unlockAudio } from '../ui/sound';

const storedSkin = () => { const value = Number(store.get('adventure.skin')); return validSkin(value) ? value : 0; };
const logo = `<span class="adv-logo-flower" aria-hidden="true">✿</span><span>软乎乎冒险<small>little picnic club</small></span>`;
const nav = `<nav class="adv-nav"><a class="adv-brand" href="#/adventure">${logo}</a><div><a href="#/">回到小聚场</a><button class="adv-full" aria-label="进入全屏">全屏 ↗</button></div></nav>`;
const choices = () => CHARACTERS.map((c, i) => `<button class="adv-character" data-skin="${i}" aria-pressed="false" aria-label="选择${c.name}，${c.subtitle}"><canvas aria-hidden="true"></canvas><b>${c.name}</b><small>${c.subtitle.split(' · ')[1]}</small></button>`).join('');
async function avatars(root: HTMLElement) {
  await loadCharacterSprites();
  root.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((button) => drawAvatar(button.querySelector('canvas')!, Number(button.dataset.skin)));
}
function selected(root: HTMLElement, skin: number) {
  root.style.setProperty('--adv-accent', CHARACTERS[skin].accent);
  root.querySelectorAll<HTMLElement>('[data-skin]').forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.skin) === skin)));
}

export async function mountAdventureMenu(app: HTMLElement) {
  document.title = '软乎乎冒险 · Little Lobby';
  let skin = storedSkin();
  app.innerHTML = `<main class="adventure adv-menu">${nav}<section class="adv-hero"><div class="adv-welcome"><span class="adv-eyebrow">A TINY ADVENTURE, TOGETHER</span><h1>今天，和谁<br>一起去<span>冒险？</span></h1><p>踩着软软的草地，捡一点小点心。<br>跳过小水洼，和朋友在终点碰头。</p><div class="adv-menu-actions"><a class="adv-primary" href="#/adventure-host?solo=1">一个人先逛逛 <span>→</span></a><a class="adv-secondary" href="${isLanPage() ? `#/join/${window.__SCANKICK_LAN__!.room}?lan=1&game=adventure` : `#/adventure-host${isNativeApp() ? '?lan=1' : ''}`}">${isLanPage() ? '回到朋友的房间' : isNativeApp() ? '和朋友离线出发' : '和朋友一起玩'} <span>↗</span></a></div><small class="adv-network-note">${isNativeApp() || isLanPage() ? '同一个 Wi-Fi / 热点，扫码就能一起玩，无需外网。' : '单人无需联网 · 离线联机请用原生应用开房，朋友手机扫码加入。'}</small></div><div class="adv-preview"><span class="adv-sticker">没有淘汰，只有再试一次 ♡</span><canvas class="adv-preview-canvas" aria-label="可爱角色和平台关卡预览"></canvas><div class="adv-preview-caption"><span>01 / 莓莓散步道</span><span>跳一跳 · 收集 · 一起到终点</span></div></div></section><section class="adv-wardrobe"><div><span class="adv-eyebrow">PICK YOUR LITTLE BUDDY</span><h2>挑一位小伙伴</h2><p>随时换角色，在同一张地图一起冒险。</p><strong class="adv-theme-label"></strong></div><div class="adv-character-grid">${choices()}</div></section><section class="adv-trip"><span>✦ 三站小旅行</span>${LEVELS.map((l, i) => `<span><b>0${i + 1}</b>${l.name}</span>`).join('')}<span>1–8 人 · 检查点复活</span></section><p class="adv-original">一二与布布 · PNG 角色帧动画 · 每个人都能选择自己喜欢的角色</p></main>`;
  try { await avatars(app); }
  catch (error) { app.querySelector('.adv-preview-caption')!.textContent = String(error); return; }
  const renderer = new AdventureRenderer(app.querySelector('canvas.adv-preview-canvas')!);
  const preview = new AdventureGame(); preview.add(1, CHARACTERS[skin].name, skin);
  const update = () => {
    selected(app.querySelector('.adventure')!, skin);
    app.querySelector('.adv-theme-label')!.textContent = `${CHARACTERS[skin].name} · 地图由房主选择`;
    preview.skin(1, skin); preview.players.get(1)!.name = CHARACTERS[skin].name;
  };
  update();
  app.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((button) => { button.onclick = () => { skin = Number(button.dataset.skin); store.set('adventure.skin', String(skin)); update(); }; });
  app.querySelector<HTMLButtonElement>('.adv-full')!.onclick = () => { void enterFullscreen(); };
  let frame = 0, closed = false;
  const draw = () => { if (closed) return; renderer.draw(preview.view(1), skin); frame = requestAnimationFrame(draw); };
  frame = requestAnimationFrame(draw);
  window.addEventListener('pagehide', () => { closed = true; cancelAnimationFrame(frame); renderer.close(); }, { once: true });
}

interface AdventureMode { host?: boolean; solo?: boolean; screen?: boolean; lan?: boolean; room?: string; server?: string; }
/** 与足球手机页同一套布局：全屏画面、顶栏、浮动摇杆 + B 键跳跃、居中菜单面板。 */
export async function mountAdventure(app: HTMLElement, mode: AdventureMode) {
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.title = '软乎乎冒险 · Little Lobby';
  let skin = storedSkin(), host: AdventureHost | null = null, client: ClientNet | LanClient | null = null;
  let state: AdventureView | null = null, previous: AdventureView | null = null, received = 0, pid = -1;
  let closed = false, frame = 0, timer = 0, seq = 0, lastEpoch = -1, sound = true, panelOpen = false, lastPhase = '';
  let input: AdventureInput = { axis: 0, jump: false };
  const room = mode.room || (mode.solo ? randomCode() : store.get('sfb.hostroom', false) || randomCode());
  if (mode.host && !mode.solo) store.set('sfb.hostroom', room, false);
  const abort = new AbortController(), listen = { signal: abort.signal };
  const decoder = new TextDecoder();
  const initial = new AdventureGame(); initial.add(1, '小伙伴', skin);

  app.innerHTML = `<div class="play adv-play${mode.host ? ' joined' : ''}${mode.screen ? ' watching' : ''}">
    <canvas class="stage" aria-label="横版平台闯关游戏，摇杆左右移动，B 键跳跃"></canvas>
    <div class="topbar">
      <div class="topbar-left"><div class="status"><i></i><span>${mode.host ? '正在准备小世界…' : `房间 ${esc(room)}`}</span></div><div class="adv-hud"></div></div>
      <div class="top-actions">
        <button class="ghost fs-btn" hidden>${t('play.fullscreen')}</button>
        <button class="ghost menu">${t('play.menu')}</button>
      </div>
    </div>
    <div class="pad" hidden></div>
    <div class="panel card adv-panel" hidden>
      <div class="panel-head"><span><b class="adv-level-name">莓莓散步道</b> <span class="adv-level-number">01 / 03</span>${mode.solo ? '' : ` · 房间 <b>${esc(room)}</b>`}</span><button class="ghost close" aria-label="关闭">×</button></div>
      <p class="adv-progress"></p>
      <div class="adv-roster"></div>
      <div class="adv-character-grid">${choices()}</div>
      <div class="pfoot-row"><button class="primary adv-start" hidden disabled>准备小背包…</button><button class="ghost adv-seat" hidden></button></div>
      ${mode.host && !mode.solo ? `<div class="host-qr adv-invite"><img class="adv-qr" alt="扫码加入闯关房间" hidden><div><div class="room-code sm">${esc(room)}</div><div class="muted small">${mode.lan ? '连同一 Wi-Fi / 热点，用相机扫码加入' : '手机扫码加入，一起闯关'}</div><button class="ghost adv-copy">复制邀请链接</button></div></div><div class="adv-address"></div>` : ''}
      <p class="muted small adv-instructions">摇杆左右移动 · B 跳跃，按住跳得更高 · 从上面踩扁小软糖<br>键盘：← → / A D 移动，空格 / ↑ 跳跃</p>
      <div class="pmeta"><button class="ghost adv-audio" aria-pressed="true">音效 开</button><button class="ghost leave-room">${t('play.leave')}</button></div>
    </div>
    <div class="join card" ${mode.host ? 'hidden' : ''}>
      <h1>软乎乎冒险</h1>
      <p class="muted">房间 <b>${esc(room)}</b></p>
      <input class="name" maxlength="12" placeholder="给自己起个可爱的名字" aria-label="你的名字" value="${esc(store.get('adventure.name') || '')}">
      <button class="primary go">加入小伙伴</button>
      <button class="ghost return-home">${t('play.home')}</button>
    </div>
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
  let toastTimer = 0;
  const toast = (message: string, ms = 2200) => {
    const el = $('.toast'); el.textContent = message; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { el.hidden = true; }, ms);
  };
  try { await avatars(app); }
  catch (error) { status(`角色图片加载失败，请刷新重试`, false); toast(String(error), 6000); return; }
  const renderer = new AdventureRenderer($<HTMLCanvasElement>('.stage'));
  const pad = new Gamepad($('.pad'));
  $('.pad-btn.b span').textContent = '跳跃';

  const setSkin = () => {
    selected(play, skin);
    initial.skin(1, skin);
    if (host?.localId !== undefined) { host.game.skin(host.localId, skin); host.publish(); }
    if (client?.linked) client.sendJson({ t: 'adventure-skin', skin });
  };
  app.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((button) => { button.onclick = () => { skin = Number(button.dataset.skin); store.set('adventure.skin', String(skin)); setSkin(); }; });
  setSkin();

  function send() {
    if (!state || closed) return;
    if (host) {
      host.localInput = { ...input };
      if (host.localId !== undefined) host.game.input(host.localId, input);
    } else if (client?.linked) client.sendJson({ t: 'adventure-input', epoch: state.epoch, seq: seq++, ...input });
  }
  function updateInput() {
    const enabled = state?.phase === 'playing' && !state.paused && (host ? host.localId !== undefined : !!client?.linked);
    const next = padInput(pad.input.jx, pad.input.jy, !!(pad.input.btn & BTN_B), enabled);
    if (next.jump && !input.jump && sound) { unlockAudio(); sfxAdventure('jump'); }
    const changed = next.axis !== input.axis || next.jump !== input.jump;
    input = next;
    if (changed) send();
  }
  pad.onButtons = updateInput;
  pad.onPress = (bit) => { if (bit === BTN_B) vibrate(8); };

  const renderPanel = () => { panel.hidden = !panelOpen || !joinEl.hidden; };
  $('.menu').onclick = () => { panelOpen = !panelOpen; renderPanel(); };
  $('.close').onclick = () => { panelOpen = false; renderPanel(); };
  $('.adv-audio').onclick = () => { sound = !sound; unlockAudio(); $('.adv-audio').textContent = `音效 ${sound ? '开' : '关'}`; $('.adv-audio').setAttribute('aria-pressed', String(sound)); };
  const leave = () => {
    if (!mode.solo && (host || client) && !confirm(t(host ? 'play.confirmCloseRoom' : 'play.confirmLeave'))) return;
    autoFs = false;
    if (!mode.host) store.set(`adventure.joined.${room}`, '', false);
    location.hash = '#/';
  };
  app.querySelectorAll<HTMLButtonElement>('.leave-room, .return-home').forEach((button) => { button.onclick = leave; });

  // ---------- 全屏：与足球页相同，加入后在下一次抬手时补一次 ----------
  const fsBtn = $('.fs-btn');
  const syncFs = () => { fsBtn.hidden = !canFullscreen() || isFullscreen(); };
  document.addEventListener('fullscreenchange', syncFs, listen);
  document.addEventListener('webkitfullscreenchange', syncFs, listen);
  syncFs();
  fsBtn.onclick = () => { void enterFullscreen(true); };
  let autoFs = canFullscreen();
  const tryFs = () => {
    if (!autoFs || !joinEl.hidden) return;
    void enterFullscreen(true).then((ok) => { if (ok) autoFs = false; });
  };
  window.addEventListener('touchend', tryFs, listen);
  window.addEventListener('click', tryFs, listen);

  function receive(view: AdventureView) {
    if (closed || !LEVELS[view.level] || !Array.isArray(view.players) || view.players.length > 8) return;
    if (state && view.epoch < state.epoch) return;
    if (state && view.epoch === state.epoch && view.time < state.time) return;
    const oldMe = state?.players.find((p) => p.id === state!.me);
    previous = state; state = { ...view, me: host ? host.localId ?? -1 : pid >= 0 ? pid : view.me }; received = performance.now();
    if (lastEpoch !== state.epoch) { lastEpoch = state.epoch; previous = null; pad.reset(); }
    const me = state.players.find((p) => p.id === state!.me), level = LEVELS[state.level];
    if (oldMe && me) {
      if (me.deaths > oldMe.deaths) { toast('没关系，在休息站重新出发 ♡'); if (sound) sfxAdventure('hurt'); vibrate(25); }
      else if (me.checkpoint > oldMe.checkpoint) toast('休息站已点亮，下次从这里出发！');
      else if (me.coins.length > oldMe.coins.length && sound) sfxAdventure('collect');
    }
    if (state.stars.length > (previous?.stars.length ?? 0)) { toast(`找到小星星！${state.stars.length} / 3`); if (sound) sfxAdventure('collect'); }
    const won = state.phase === 'clear' || state.phase === 'complete';
    if (won && previous?.phase === 'playing' && sound) sfxAdventure('clear');
    const time = `${String(Math.floor(state.time / 60)).padStart(2, '0')}:${String(Math.floor(state.time) % 60).padStart(2, '0')}`;
    $('.adv-hud').textContent = `${me ? '♥'.repeat(me.hearts) + '♡'.repeat(3 - me.hearts) + ' · ' : ''}${MAP_THEMES[state.level].item} ${me?.coins.length ?? 0}/${level.coins.length} · ✦ ${state.stars.length}/3 · ${time}`;
    $('.adv-level-name').textContent = level.name; $('.adv-level-number').textContent = `0${state.level + 1} / 03`;
    $('.adv-progress').textContent = state.paused ? '主机在后台，旅行暂停中' : state.phase === 'lobby' ? '挑好小伙伴，等房主出发' : me?.reached ? '你已到达，等小伙伴来野餐 ♡' : state.stars.length === 3 ? '小屋开门了！去终点集合 →' : '找齐三颗星星，去小屋集合';
    $('.adv-overlay').hidden = !won;
    if (won) {
      $('.adv-overlay h2').textContent = state.phase === 'complete' ? '小小旅行，圆满抵达！' : '这一站，我们到啦！';
      $('.adv-overlay p').textContent = state.phase === 'complete' ? '三站冒险完成，谢谢你们一起走到这里 ♡' : mode.host ? '休息一下，再一起出发。' : '等房主带大家去下一站。';
      $('.adv-results').innerHTML = state.players.filter((p) => p.online).map((p) => `<span>${esc(p.name)} <b>${p.coins.length} 份点心</b></span>`).join('');
      $('.adv-next').hidden = !mode.host;
      $('.adv-next').textContent = state.phase === 'complete' ? '再去散一次步' : '下一站 →';
    }
    $('.adv-roster').innerHTML = state.players.map((p) => `<span class="${p.online ? '' : 'is-offline'}"><i style="background:${CHARACTERS[p.skin]?.accent || '#ccc'}"></i>${esc(p.name)}${p.reached ? ' ✓' : !p.online ? ' · 重连中' : ''}</span>`).join('');
    const start = $<HTMLButtonElement>('.adv-start');
    start.hidden = !mode.host || state.phase !== 'lobby';
    start.disabled = !state.players.some((p) => p.online);
    start.textContent = state.players.some((p) => p.online) ? '一起出发 →' : '等一位小伙伴加入';
    $('.adv-seat').hidden = !mode.host || !!mode.solo || state.phase !== 'lobby';
    $('.adv-seat').textContent = host?.localId === undefined ? '我也加入冒险' : '仅当大屏观看';
    const playing = !!me && state.phase === 'playing' && !state.paused;
    $('.pad').hidden = !playing;
    play.classList.toggle('watching', !me);
    if (!playing) pad.reset();
    // 进入大厅自动弹出菜单，出发后自动收起；玩家随时可以手动开关
    if (state.phase !== lastPhase) { lastPhase = state.phase; panelOpen = state.phase === 'lobby'; renderPanel(); }
  }
  const start = () => { unlockAudio(); void keepAwake(); pad.reset(); host?.advance(); };
  $('.adv-start').onclick = start; $('.adv-next').onclick = start;
  $('.adv-seat').onclick = () => { if (host?.localId === undefined) host?.addLocal(store.get('adventure.name') || '房主', skin); else host.removeLocal(); host?.publish(); };
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
      store.set('sfb.roomopts', JSON.stringify({ listed: false, ...(mode.lan ? { mode: 'lan' } : {}) }), false);
      if (mode.lan) {
        if (!isNativeApp()) throw new Error('离线开房请使用原生应用，朋友可以用浏览器加入。');
        await startLan(room);
        if (closed) { await stopLan(); return; }
      }
      host = new AdventureHost(room, mode.solo ? undefined : mode.lan ? (_r, cb) => new LanHost(lanSession()!, cb) : (r, cb) => new HostNet(r, cb));
      if (!mode.screen) host.addLocal(store.get('adventure.name') || (mode.solo ? '小伙伴' : '房主'), skin);
      host.onView = receive;
      host.onStatus = (ok) => status(ok ? mode.solo ? '单人小旅行' : `${mode.lan ? '局域网 · ' : ''}房间 ${room}` : mode.lan ? '局域网服务已断开' : '正在恢复连接…', ok);
      await host.start();
      if (closed) return;
      if (mode.solo) host.advance();
      else {
        $('.adv-address').innerHTML = mode.lan ? lanInfoHtml() : '';
        let version = 0;
        const invite = async () => {
          const current = ++version, url = new URL(joinUrl({ room }));
          const [path, query] = url.hash.slice(1).split('?'), params = new URLSearchParams(query); params.set('game', 'adventure'); url.hash = `${path}?${params}`;
          $('.adv-copy').dataset.url = url.href;
          try {
            const qr = (await import('qrcode')).default, image = await qr.toDataURL(url.href, { width: 220, margin: 1 });
            if (closed || current !== version) return;
            $<HTMLImageElement>('.adv-qr').src = image; $('.adv-qr').hidden = false;
          } catch { toast('二维码生成失败，请复制邀请链接。', 4000); }
        };
        bindLanAddress($('.adv-address'), () => { void invite(); }); await invite();
        $('.adv-copy').onclick = async () => {
          try { await navigator.clipboard.writeText($('.adv-copy').dataset.url || ''); toast('已复制邀请链接'); }
          catch { prompt('复制邀请链接', $('.adv-copy').dataset.url || ''); }
        };
      }
    } catch (e) { host?.close(); if (mode.lan) await stopLan().catch(() => {}); status('出发前遇到问题', false); toast(`${String(e)}，可以返回重试。`, 8000); }
  } else {
    const joinedKey = `adventure.joined.${room}`;
    const join = async () => {
      const name = $<HTMLInputElement>('.join .name').value.trim().slice(0, 12); if (!name) { $('.join .name').focus(); return; }
      unlockAudio(); void keepAwake();
      void enterFullscreen(true).then((ok) => { if (ok) autoFs = false; });
      store.set('adventure.name', name); store.set(joinedKey, '1', false);
      let token = store.get(`adventure.token.${room}`); if (!token) { token = randomCode(16); store.set(`adventure.token.${room}`, token); }
      client?.close();
      joinEl.hidden = true; play.classList.add('joined'); renderPanel();
      const info = { name, token, team: 'auto' as const };
      const connection = mode.lan || isLanPage() ? new LanClient(room, info, mode.server ? lanBaseUrl(mode.server) : undefined) : new ClientNet(room, info);
      client = connection; seq = 0; pid = -1;
      const showJoin = (message: string) => { connection.close(); pad.reset(); joinEl.hidden = false; play.classList.remove('joined'); store.set(joinedKey, '', false); renderPanel(); toast(message, 5000); };
      connection.onState = (s) => {
        if (closed || client !== connection) return;
        status(connection.linked ? `${s === 'lan' ? '局域网' : s === 'p2p' ? '直连' : '中继'} · 房间 ${room}` : s === 'lost' ? '正在找回连接…' : '正在连接…', connection.linked);
        if (!connection.linked) pad.reset();
        else connection.sendJson({ t: 'adventure-skin', skin });
      };
      const message = (m: any) => {
        if (closed || client !== connection || !m || typeof m !== 'object') return;
        if (m.t === 'welcome') { pid = m.pid; connection.sendJson({ t: 'adventure-skin', skin }); }
        else if (m.t === 'adventure-state') receive(m);
      };
      connection.onJson = message;
      connection.onBinary = (bytes) => { try { message(JSON.parse(decoder.decode(bytes))); } catch { /* 丢弃畸形快照。 */ } };
      connection.onReject = () => { if (!closed && client === connection) showJoin('没有找到房间，或小伙伴已满 8 人。'); };
      status('正在连接…', false);
      try { await connection.start(); }
      catch { if (!closed && client === connection) showJoin('暂时没连上，确认网络后可以重试。'); }
    };
    $('.go').onclick = () => { void join(); };
    $<HTMLInputElement>('.join .name').onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); void join(); } };
    // 刷新后按原身份自动重连
    if (store.get(joinedKey, false) === '1' && store.get('adventure.name')) void join();
  }
  if (!closed) timer = window.setInterval(send, 120);
}
