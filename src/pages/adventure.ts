import './adventure.css';
import { AdventureGame, CHARACTERS, LEVELS, MAP_THEMES, validSkin, type AdventureInput, type AdventureView } from '../game/adventure';
import { AdventureRenderer, drawAvatar, loadCharacterSprites } from '../game/adventure-render';
import { AdventureHost } from '../net/adventure-host';
import { ClientNet } from '../net/client';
import { HostNet } from '../net/host';
import { LanClient } from '../net/lan-client';
import { LanHost } from '../net/lan-host';
import { isLanPage, isNativeApp, lanBaseUrl, lanSession, startLan, stopLan } from '../net/lan-session';
import { bindLanAddress, lanInfoHtml } from '../ui/lan-room';
import { enterFullscreen, esc, joinUrl, keepAwake, randomCode, store, vibrate } from '../ui/util';
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

interface AdventureMode { host?: boolean; solo?: boolean; lan?: boolean; room?: string; server?: string; }
export async function mountAdventure(app: HTMLElement, mode: AdventureMode) {
  document.title = '软乎乎冒险 · Little Lobby';
  let skin = storedSkin(), host: AdventureHost | null = null, client: ClientNet | LanClient | null = null;
  let state: AdventureView | null = null, previous: AdventureView | null = null, received = 0, pid = -1;
  let closed = false, frame = 0, timer = 0, seq = 0, lastEpoch = -1, sound = true;
  let input: AdventureInput = { axis: 0, jump: false };
  const room = mode.room || randomCode();
  const keys = new Set<string>(), pointers = new Map<number, string>(), pulses = new Set<string>(), pulseTimers = new Set<number>();
  const abort = new AbortController(), listen = { signal: abort.signal };
  const decoder = new TextDecoder();
  const initial = new AdventureGame(); initial.add(1, '小伙伴', skin);

  app.innerHTML = `<main class="adventure adv-play">${nav}<header class="adv-game-heading"><div><span class="adv-eyebrow">${mode.solo ? 'JUST YOU & A LITTLE ADVENTURE' : `ROOM ${esc(room)} / ${mode.lan ? '离线局域网' : '在线联机'}`}</span><h1><span class="adv-level-name">莓莓散步道</span><small class="adv-level-number">01 / 03</small></h1></div><div class="adv-game-actions"><button class="adv-audio" aria-pressed="true">音效 开</button><button class="adv-start adv-primary" ${mode.host ? '' : 'hidden'} disabled>准备小背包…</button><button class="adv-seat" ${mode.host && !mode.solo ? '' : 'hidden'}>仅当大屏观看</button></div></header>
    <p class="adv-status" role="status">${mode.host ? '正在准备小世界…' : '欢迎，先告诉大家你的名字。'}</p>
    <form class="adv-join" ${mode.host ? 'hidden' : ''}><label>你的名字<input name="name" maxlength="12" required autocomplete="nickname" placeholder="给自己起个可爱的名字" value="${esc(store.get('adventure.name') || '')}"></label><button class="adv-primary">加入小伙伴</button></form>
    <div class="adv-game-content"><section class="adv-hud"><span class="adv-hearts" aria-label="生命">♡ ♡ ♡</span><span class="adv-treat-count">草莓 0</span><span class="adv-star-count">✦ 0 / 3</span><span class="adv-time">00:00</span><span class="adv-progress">找到星星，去小屋集合</span></section>
    <div class="adv-stage"><canvas class="adv-canvas" aria-label="横版平台闯关游戏，左右移动，空格或跳跃键跳跃"></canvas><div class="adv-overlay" hidden><span>✿</span><h2></h2><p></p><div class="adv-results"></div><button class="adv-next adv-primary" ${mode.host ? '' : 'hidden'}>下一站 →</button></div><p class="adv-toast" aria-live="polite"></p></div>
    <div class="adv-understage"><p class="adv-instructions">← → / A D 移动 <span>·</span> 空格跳跃 <span>·</span> 按住跳得更高 <span>·</span> 从上面踩扁小软糖</p><div class="adv-roster"></div></div>
    <div class="adv-controls" aria-label="触屏手柄"><div><button data-action="left" aria-label="向左移动" disabled>←</button><button data-action="right" aria-label="向右移动" disabled>→</button></div><button class="adv-jump" data-action="jump" aria-label="跳跃" disabled>↑ <span>跳一下</span></button></div>
    <section class="adv-outfit"><div><b>今天穿哪一套？</b><span class="adv-current-theme"></span></div><div class="adv-character-grid">${choices()}</div></section>
    <details class="adv-invite" ${mode.host && !mode.solo ? 'open' : 'hidden'}><summary>邀请朋友一起走 · 扫码加入</summary><div class="adv-invite-content"><img class="adv-qr" alt="扫码加入闯关房间" hidden><div><p>${mode.lan ? '连到同一个 Wi-Fi / 热点，用系统相机扫码。主机提供完整游戏，不需要外网。' : '浏览器联机需要外网。离线聚会请使用原生应用开房。'}<br>主机保持在前台，朋友随时可以加入。</p><input class="adv-url" readonly aria-label="入场链接"><button class="adv-copy">复制邀请链接</button><div class="adv-address"></div></div></div></details>
    <footer class="adv-game-footer"><a href="#/adventure">← 回小伙伴之家</a><span>掉进水里也没关系，会在最近的休息站醒来。</span></footer></div></main>`;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => app.querySelector<T>(selector)!;
  const status = (message: string) => { if (!closed) $('.adv-status').textContent = message; };
  try { await avatars(app); }
  catch (error) { status(`角色图片加载失败：${String(error)}。请刷新重试。`); return; }
  const renderer = new AdventureRenderer($<HTMLCanvasElement>('.adv-canvas'));
  const setSkin = () => {
    selected($('.adventure'), skin);
    $('.adv-current-theme').textContent = `${CHARACTERS[skin].name} · 角色装扮`;
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
    const sources = [...keys, ...pointers.values(), ...pulses];
    const enabled = state?.phase === 'playing' && !state.paused && (host ? host.localId !== undefined : !!client?.linked);
    const next = { axis: enabled ? Math.sign(Number(sources.includes('right')) - Number(sources.includes('left'))) : 0, jump: !!enabled && sources.includes('jump') };
    if (next.jump && !input.jump && sound) { unlockAudio(); sfxAdventure('jump'); }
    input = next;
    app.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => {
      const on = button.dataset.action === 'jump' ? input.jump : button.dataset.action === 'left' ? input.axis < 0 : input.axis > 0;
      button.classList.toggle('is-pressed', on); button.setAttribute('aria-pressed', String(on));
    });
    send();
  }
  function release() { keys.clear(); pointers.clear(); pulses.clear(); updateInput(); }
  const codes: Record<string, string> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', ArrowUp: 'jump', KeyW: 'jump' };
  const physical = new Set<string>();
  window.addEventListener('keydown', (e) => {
    const action = codes[e.code];
    if (!action || e.target instanceof HTMLInputElement || state?.phase !== 'playing') return;
    e.preventDefault(); physical.add(e.code); keys.add(action); if (!e.repeat) updateInput();
  }, listen);
  window.addEventListener('keyup', (e) => { physical.delete(e.code); keys.clear(); for (const code of physical) if (codes[code]) keys.add(codes[code]); updateInput(); }, listen);
  app.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
    button.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || state?.phase !== 'playing') return;
      e.preventDefault(); unlockAudio(); button.setPointerCapture(e.pointerId); pointers.set(e.pointerId, button.dataset.action!); updateInput();
    }, listen);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) button.addEventListener(type, (e) => { pointers.delete(e.pointerId); updateInput(); }, listen);
    button.addEventListener('contextmenu', (e) => e.preventDefault(), listen);
    button.addEventListener('click', (e) => {
      if (e.detail !== 0 || state?.phase !== 'playing') return;
      const action = button.dataset.action!; pulses.add(action); updateInput();
      const id = window.setTimeout(() => { pulses.delete(action); pulseTimers.delete(id); updateInput(); }, 240); pulseTimers.add(id);
    }, listen);
  });
  window.addEventListener('blur', () => { physical.clear(); release(); }, listen);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { physical.clear(); release(); } }, listen);
  $('.adv-full').onclick = () => { unlockAudio(); void enterFullscreen(); void keepAwake(); };
  $('.adv-audio').onclick = () => { sound = !sound; unlockAudio(); $('.adv-audio').textContent = `音效 ${sound ? '开' : '关'}`; $('.adv-audio').setAttribute('aria-pressed', String(sound)); };
  let toastTimer = 0, rosterKey = '';
  function toast(message: string) { $('.adv-toast').textContent = message; clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { $('.adv-toast').textContent = ''; }, 3000); }

  function receive(view: AdventureView) {
    if (closed || !LEVELS[view.level] || !Array.isArray(view.players) || view.players.length > 8) return;
    if (state && view.epoch < state.epoch) return;
    if (state && view.epoch === state.epoch && view.time < state.time) return;
    const oldMe = state?.players.find((p) => p.id === state!.me);
    previous = state; state = { ...view, me: host ? host.localId ?? -1 : pid >= 0 ? pid : view.me }; received = performance.now();
    if (lastEpoch !== state.epoch) { lastEpoch = state.epoch; previous = null; physical.clear(); release(); }
    const me = state.players.find((p) => p.id === state!.me), level = LEVELS[state.level];
    if (oldMe && me) {
      if (me.deaths > oldMe.deaths) { toast('没关系，在休息站重新出发 ♡'); if (sound) sfxAdventure('hurt'); vibrate(25); }
      else if (me.checkpoint > oldMe.checkpoint) toast('休息站已点亮，下次从这里出发！');
      else if (me.coins.length > oldMe.coins.length && sound) sfxAdventure('collect');
    }
    if (state.stars.length > (previous?.stars.length ?? 0)) { toast(`找到小星星！${state.stars.length} / 3`); if (sound) sfxAdventure('collect'); }
    const won = state.phase === 'clear' || state.phase === 'complete';
    if (won && previous?.phase === 'playing' && sound) sfxAdventure('clear');
    $('.adv-level-name').textContent = level.name; $('.adv-level-number').textContent = `0${state.level + 1} / 03`;
    $('.adv-hearts').textContent = me ? '♥ '.repeat(me.hearts) + '♡ '.repeat(3 - me.hearts) : '♡ 一起散步';
    $('.adv-treat-count').textContent = `${MAP_THEMES[state.level].item} ${me?.coins.length ?? 0} / ${level.coins.length}`;
    $('.adv-star-count').textContent = `✦ ${state.stars.length} / 3`;
    $('.adv-time').textContent = `${String(Math.floor(state.time / 60)).padStart(2, '0')}:${String(Math.floor(state.time) % 60).padStart(2, '0')}`;
    $('.adv-progress').textContent = state.paused ? '主机在后台，旅行暂停中' : me?.reached ? '你已到达，等小伙伴来野餐 ♡' : state.stars.length === 3 ? '小屋开门了！去终点集合 →' : '找齐三颗星星，去小屋集合';
    $('.adv-overlay').hidden = !won;
    if (won) {
      $('.adv-overlay h2').textContent = state.phase === 'complete' ? '小小旅行，圆满抵达！' : '这一站，我们到啦！';
      $('.adv-overlay p').textContent = state.phase === 'complete' ? '三站冒险完成，谢谢你们一起走到这里 ♡' : mode.host ? '休息一下，再一起出发。' : '等房主带大家去下一站。';
      $('.adv-results').innerHTML = state.players.filter((p) => p.online).map((p) => `<span>${esc(p.name)} <b>${p.coins.length} 份点心</b></span>`).join('');
      $('.adv-next').textContent = state.phase === 'complete' ? '再去散一次步' : '下一站 →';
    }
    const key = JSON.stringify(state.players.map((p) => [p.id, p.name, p.skin, p.online, p.reached]));
    if (key !== rosterKey) {
      rosterKey = key;
      $('.adv-roster').innerHTML = state.players.map((p) => `<span class="${p.online ? '' : 'is-offline'}"><i style="background:${CHARACTERS[p.skin]?.accent || '#ccc'}"></i>${esc(p.name)}${p.reached ? ' ✓' : !p.online ? ' · 重连中' : ''}</span>`).join('');
    }
    const start = $<HTMLButtonElement>('.adv-start');
    start.hidden = !mode.host || state.phase !== 'lobby';
    start.disabled = !state.players.some((p) => p.online);
    start.textContent = state.players.some((p) => p.online) ? '一起出发 →' : '等一位小伙伴加入';
    $('.adv-seat').hidden = !mode.host || !!mode.solo || state.phase !== 'lobby';
    $('.adv-seat').textContent = host?.localId === undefined ? '我也加入冒险' : '仅当大屏观看';
    app.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => { button.disabled = !me || state!.phase !== 'playing' || state!.paused || (!host && !client?.linked); });
    if (state.phase !== 'playing' || state.paused) { physical.clear(); release(); }
  }
  const start = () => { unlockAudio(); void keepAwake(); physical.clear(); release(); if (host?.advance()) $<HTMLDetailsElement>('.adv-invite').open = false; };
  $('.adv-start').onclick = start; $('.adv-next').onclick = start;
  $('.adv-seat').onclick = () => { if (host?.localId === undefined) host?.addLocal(store.get('adventure.name') || '房主', skin); else host.removeLocal(); host?.publish(); };
  function draw() {
    if (closed) return;
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
    physical.clear(); release(); closed = true; abort.abort(); cancelAnimationFrame(frame); clearInterval(timer); clearTimeout(toastTimer);
    for (const id of pulseTimers) clearTimeout(id);
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
      host.addLocal(store.get('adventure.name') || (mode.solo ? '小伙伴' : '房主'), skin);
      host.onView = receive;
      host.onStatus = (ok) => status(ok ? mode.solo ? '单人小旅行 · 随时换角色，按住跳跃可以跳得更高。' : mode.lan ? '离线房间已就绪 · 朋友连同一 Wi-Fi，扫码加入。' : '在线房间已就绪 · 邀请朋友一起出发。' : mode.lan ? '局域网服务已断开，请返回重新开房。' : '正在恢复连接…');
      await host.start();
      if (closed) return;
      if (mode.solo) host.advance();
      else {
        $('.adv-address').innerHTML = mode.lan ? lanInfoHtml() : '';
        let version = 0;
        const invite = async () => {
          const current = ++version, url = new URL(joinUrl({ room }));
          const [path, query] = url.hash.slice(1).split('?'), params = new URLSearchParams(query); params.set('game', 'adventure'); url.hash = `${path}?${params}`;
          $<HTMLInputElement>('.adv-url').value = url.href;
          try {
            const qr = (await import('qrcode')).default, image = await qr.toDataURL(url.href, { width: 220, margin: 2 });
            if (closed || current !== version) return;
            $<HTMLImageElement>('.adv-qr').src = image; $('.adv-qr').hidden = false;
          } catch { status('二维码生成失败，请复制入场链接。'); }
        };
        bindLanAddress($('.adv-address'), () => { void invite(); }); await invite();
        $('.adv-copy').onclick = async () => {
          const field = $<HTMLInputElement>('.adv-url');
          try { await navigator.clipboard.writeText(field.value); $('.adv-copy').textContent = '已复制'; }
          catch { field.focus(); field.select(); status('请长按入场链接复制。'); }
        };
      }
    } catch (e) { host?.close(); if (mode.lan) await stopLan().catch(() => {}); status(`出发前遇到问题：${String(e)}，可以返回重试。`); }
  } else {
    $<HTMLFormElement>('.adv-join').onsubmit = async (e) => {
      e.preventDefault();
      const name = $<HTMLInputElement>('.adv-join input').value.trim().slice(0, 12); if (!name) return;
      const button = $<HTMLButtonElement>('.adv-join button'); button.disabled = true; unlockAudio(); void keepAwake();
      store.set('adventure.name', name);
      let token = store.get(`adventure.token.${room}`); if (!token) { token = randomCode(16); store.set(`adventure.token.${room}`, token); }
      client?.close();
      const info = { name, token, team: 'auto' as const };
      const connection = mode.lan || isLanPage() ? new LanClient(room, info, mode.server ? lanBaseUrl(mode.server) : undefined) : new ClientNet(room, info);
      client = connection; seq = 0; pid = -1;
      connection.onState = (s) => {
        if (closed || client !== connection) return;
        status(connection.linked ? `已加入小伙伴 · ${s === 'lan' ? '离线局域网' : s === 'p2p' ? '直连' : '中继'}` : s === 'lost' ? '正在找回连接，角色和收集进度会保留。' : '正在连接小世界…');
        if (!connection.linked) { physical.clear(); release(); app.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((b) => { b.disabled = true; }); }
        else connection.sendJson({ t: 'adventure-skin', skin });
      };
      const message = (m: any) => {
        if (closed || client !== connection || !m || typeof m !== 'object') return;
        if (m.t === 'welcome') { pid = m.pid; connection.sendJson({ t: 'adventure-skin', skin }); }
        else if (m.t === 'adventure-state') { $('.adv-join').hidden = true; receive(m); }
      };
      connection.onJson = message;
      connection.onBinary = (bytes) => { try { message(JSON.parse(decoder.decode(bytes))); } catch { /* 丢弃畸形快照。 */ } };
      connection.onReject = () => { if (closed || client !== connection) return; release(); $('.adv-join').hidden = false; button.disabled = false; status('没有找到房间，或小伙伴已满 8 人。请确认主机仍开着。'); };
      try { await connection.start(); }
      catch { if (!closed && client === connection) { connection.close(); button.disabled = false; status('暂时没连上，确认网络后可以重试。'); } }
    };
  }
  if (!closed) timer = window.setInterval(send, 120);
}

