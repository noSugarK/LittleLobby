import './room.css';
import { PartyRoomHost, type RoomState, type GamePacket } from '../room/session';
import { GAMES, gameInfo, validGame } from '../room/catalog';
import { AdventureRenderer } from '../game/adventure-render';
import { AdventureGame, CHARACTERS, LEVELS, MAP_THEMES, type AdventureView } from '../game/adventure';
import { drawBuddyAvatar, loadCharacterSprites } from '../game/adventure-sprites';
import { Renderer, fmtTime } from '../game/render';
import { Phase, type Snapshot, type PlayerInfo, type RosterMsg } from '../game/types';
import { decodeSnapshot } from '../net/protocol';
import { ClientNet } from '../net/client';
import { LanClient } from '../net/lan-client';
import { LanHost } from '../net/lan-host';
import { isLanPage, lanSession, stopLan } from '../net/lan-session';
import { Gamepad } from '../ui/gamepad';
import { bindLanAddress, lanInfoHtml } from '../ui/lan-room';
import { bindSiteTools, siteTools } from '../ui/site';
import { enterFullscreen, esc, joinUrl, keepAwake, randomCode, roomOpts, store } from '../ui/util';
import { saveQrCard } from '../ui/qrcard';
import { unlockAudio } from '../ui/sound';
import { t } from '../i18n';

export interface PartyRoomMode { host?: boolean; screen?: boolean; room?: string; lan?: boolean; server?: string; pin?: string; }
const decoder = new TextDecoder();

export async function mountRoom(app: HTMLElement, mode: PartyRoomMode) {
  const opts = roomOpts();
  const room = mode.room || store.get(mode.screen ? 'sfb.room' : 'sfb.hostroom', false) || randomCode();
  if (mode.host) store.set(mode.screen ? 'sfb.room' : 'sfb.hostroom', room, false);
  document.title = `房间 ${room} · 小聚场 Little Lobby`;
  app.innerHTML = `<main class="party-room${mode.screen ? ' is-screen' : ''}">
    <header class="party-nav"><a href="#/" class="party-brand">小聚场<small>LITTLE LOBBY</small></a><span class="party-room-code">房间 <b>${esc(room)}</b></span><div>${siteTools()}<button class="party-full">全屏 ↗</button></div></header>
    <div class="party-status" role="status">正在准备聚会房间…</div>
    <form class="party-join" ${mode.host ? 'hidden' : ''}><h1>朋友都在这里</h1><p>加入后可以自己选角色，和朋友一起开玩。</p><label>你的昵称<input name="name" maxlength="12" required autocomplete="nickname" value="${esc(store.get('littlelobby.name') || store.get('adventure.name') || '')}" placeholder="给自己起个名字"></label><label>房间密码（如有）<input name="pin" inputmode="numeric" maxlength="6" value="${esc(mode.pin || '')}"></label><label><input type="checkbox" name="watch">先旁观，不占玩家名额</label><button type="submit">加入小聚场 →</button></form>
    <div class="party-layout" hidden>
      <section class="party-main"><div class="party-game-top"><div><span class="party-eyebrow">LET’S PLAY TOGETHER</span><h1 class="party-game-title"></h1><p class="party-map-label"></p></div><span class="party-phase">等待伙伴</span></div>
        <div class="party-stage"><canvas class="party-canvas" aria-label="当前游戏预览与实时画面"></canvas><div class="party-hud"></div></div>
        <div class="party-options" ${mode.host ? '' : 'hidden'}><label>当前游戏<select class="party-game-select" aria-label="当前游戏">${GAMES.map((game) => `<option value="${game.id}">${game.name}</option>`).join('')}</select></label><label class="party-map-control">地图<select class="party-map-select" aria-label="地图">${LEVELS.map((level, i) => `<option value="${i}">${level.name}</option>`).join('')}</select></label><label class="party-football-control">比赛规则<select class="party-match-select" aria-label="比赛规则"><option value="0">经典计时</option><option value="1">抢三球</option><option value="2">金球加时</option></select></label><label class="party-football-control">派对道具<select class="party-rule-select" aria-label="派对道具"><option value="0">标准足球</option><option value="1">巨型足球</option><option value="2">无限体力</option><option value="3">强反弹</option></select></label></div>
        <p class="party-switch-note" ${mode.host ? '' : 'hidden'}>游戏中换游戏或地图会结束本局，房间和伙伴都保留。</p>
        <div class="party-actions"><button class="party-start" ${mode.host ? '' : 'hidden'}>开始游戏</button><button class="party-next" hidden>下一关 →</button><button class="party-back" ${mode.host ? '' : 'hidden'}>回到大厅</button><button class="party-ready" ${mode.screen ? 'hidden' : ''}>准备好了</button><button class="party-watch">我先旁观</button></div>
        <p class="party-instructions"></p><p class="party-touch-tip"></p><div class="party-pad"></div>
      </section>
      <aside class="party-sidebar"><section class="party-card party-me"><span class="party-eyebrow">YOUR LITTLE BUDDY</span><h2>今天和谁一起玩？</h2><div class="party-characters">${CHARACTERS.map((c, i) => `<button data-skin="${i}" aria-label="选择${c.name}"><canvas width="112" height="112"></canvas><b>${c.name}</b></button>`).join('')}</div><div class="party-team"><span>选择球队</span><button data-team="0">红队</button><button data-team="1">蓝队</button></div></section>
        <section class="party-card"><div class="party-card-heading"><h2>房间里的伙伴</h2><span class="party-count"></span></div><div class="party-members"></div></section>
        <section class="party-card party-invite" ${mode.host ? '' : 'hidden'}><span class="party-eyebrow">SAVE A SEAT FOR A FRIEND</span><h2>扫码，一起开玩</h2><img class="party-qr" alt="扫码加入当前房间" hidden><div class="party-address">${mode.host && mode.lan ? lanInfoHtml() : ''}</div><input class="party-url" readonly aria-label="房间邀请链接"><div class="party-invite-actions"><button class="party-copy">复制链接</button><button class="party-save">保存二维码</button></div><small>换游戏不用重扫，房间号一直有效。</small></section>
      </aside>
    </div></main>`;
  bindSiteTools(app);
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => app.querySelector<T>(selector)!;
  let host: PartyRoomHost | undefined, client: ClientNet | LanClient | undefined;
  let state: RoomState | undefined, me = -1, seq = 0, closed = false;
  let adventure: AdventureView | undefined, football: Snapshot | undefined, roster: RosterMsg | undefined;
  let renderer: AdventureRenderer | Renderer | undefined, renderedGame = '', renderedRevision = -1;
  let previousTime = performance.now(), raf = 0;
  const pad = new Gamepad($('.party-pad'));
  const status = (text: string) => { $('.party-status').textContent = text; };
  const member = () => state?.members.find((player) => player.id === me);
  const send = (message: object) => { if (host) host.local(message); else if (client?.linked) client.sendJson(message); };
  const input = () => {
    if (closed || !state || state.phase !== 'playing' || member()?.watch) return;
    send({ t: 'room-input', revision: state.revision, seq: seq++, input: { ...pad.input } });
  };
  pad.onButtons = input;
  const inputTimer = window.setInterval(input, 33);
  $('.party-full').onclick = () => { void enterFullscreen(); void keepAwake(); };
  const changeMember = (patch: object) => send({ t: 'room-member', ...patch });
  app.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((button) => {
    button.onclick = () => { const skin = Number(button.dataset.skin); store.set('adventure.skin', String(skin)); changeMember({ skin }); button.blur(); };
  });
  app.querySelectorAll<HTMLButtonElement>('[data-team]').forEach((button) => {
    button.onclick = () => { changeMember({ team: Number(button.dataset.team) }); button.blur(); };
  });
  $('.party-ready').onclick = () => { changeMember({ ready: !member()?.ready }); $('.party-ready').blur(); unlockAudio(); };
  $('.party-watch').onclick = () => { changeMember({ watch: !member()?.watch }); $('.party-watch').blur(); };
  $('.party-start').onclick = () => { unlockAudio(); host?.startGame(); $('.party-start').blur(); void keepAwake(); };
  $('.party-back').onclick = () => { host?.toLobby(); $('.party-back').blur(); };
  $('.party-next').onclick = () => { host?.nextLevel(); $('.party-next').blur(); };
  $<HTMLSelectElement>('.party-game-select').onchange = (event) => { host?.switchGame((event.target as HTMLSelectElement).value); (event.target as HTMLElement).blur(); };
  $<HTMLSelectElement>('.party-map-select').onchange = (event) => { host?.selectMap(Number((event.target as HTMLSelectElement).value)); (event.target as HTMLElement).blur(); };
  $<HTMLSelectElement>('.party-match-select').onchange = () => host?.setSettings({ mode: Number($<HTMLSelectElement>('.party-match-select').value) as 0 | 1 | 2 });
  $<HTMLSelectElement>('.party-rule-select').onchange = () => host?.setSettings({ party: Number($<HTMLSelectElement>('.party-rule-select').value) as 0 | 1 | 2 | 3 });

  function receiveState(next: RoomState) {
    if (closed || !validGame(next.game) || !Array.isArray(next.members) || next.members.length > 32 || !LEVELS[next.map] || !Number.isSafeInteger(next.revision)) return;
    if (state && next.revision < state.revision) return;
    const changed = !state || state.revision !== next.revision;
    state = next;
    $('.party-room').classList.toggle('is-playing', state.phase === 'playing');
    if (changed) { adventure = undefined; football = undefined; roster = undefined; seq = 0; pad.reset(); }
    $('.party-join').hidden = true; $('.party-layout').hidden = false;
    document.title = `${gameInfo(state.game).name} · 房间 ${room} · Little Lobby`;
    $('.party-game-title').textContent = gameInfo(state.game).name;
    $('.party-map-label').textContent = state.game === 'adventure' ? `${LEVELS[state.map].name} · ${LEVELS[state.map].caption}` : '传球配合，进球庆祝。AI 会自动补齐球队。';
    $('.party-phase').textContent = state.phase === 'lobby' ? '大厅 · 等待准备' : '游戏进行中';
    $<HTMLSelectElement>('.party-game-select').value = state.game;
    $<HTMLSelectElement>('.party-map-select').value = String(state.map);
    $<HTMLSelectElement>('.party-match-select').value = String(state.settings.mode);
    $<HTMLSelectElement>('.party-rule-select').value = String(state.settings.party);
    app.querySelectorAll<HTMLElement>('.party-football-control').forEach((el) => { el.hidden = state!.game !== 'football'; });
    $('.party-map-control').hidden = state.game !== 'adventure';
    $('.party-team').hidden = state.game !== 'football';
    $('.party-touch-tip').textContent = state.game === 'adventure' ? '左边控制方向，右边跳跃 · 按住跳得更高' : '左边控制方向，右边传球、射门和冲刺';
    $('.party-characters').hidden = state.game !== 'adventure';
    $('.party-me h2').textContent = state.game === 'adventure' ? '今天和谁一起玩？' : '穿上你的球队颜色';
    const mine = member();
    $('.party-ready').hidden = !!mine?.watch || state.phase !== 'lobby';
    $('.party-ready').textContent = mine?.ready ? '已准备 ✓' : '准备好了';
    $('.party-watch').hidden = !mine || state.phase !== 'lobby';
    $('.party-watch').textContent = mine?.watch ? '我也参加' : '我先旁观';
    $('.party-pad').hidden = state.phase !== 'playing' || !mine || mine.watch;
    $('.party-touch-tip').hidden = state.phase !== 'playing' || !mine || mine.watch;
    $('.party-pad').classList.toggle('is-adventure', state.game === 'adventure');
    $('.party-pad .pad-btn.b span').textContent = state.game === 'adventure' ? '跳跃' : t('pad.b');
    $('.party-back').hidden = !mode.host || state.phase === 'lobby';
    $('.party-start').hidden = !mode.host || state.phase !== 'lobby';
    const players = state.members.filter((p) => p.online && !p.watch);
    const ready = players.length > 0 && players.every((p) => p.ready);
    $<HTMLButtonElement>('.party-start').disabled = !ready;
    $('.party-start').textContent = !players.length ? '等伙伴入场' : ready ? '一起开玩 →' : '等待伙伴准备';
    $('.party-count').textContent = `${players.length}/8`;
    $('.party-members').innerHTML = state.members.map((p) => `<div class="party-member ${p.online ? '' : 'is-offline'}"><span class="party-member-dot" style="background:${state!.game === 'adventure' ? CHARACTERS[p.skin]?.accent || '#ddd' : p.team === 0 ? '#de7e82' : '#8cabdf'}"></span><span>${esc(p.name)}${p.id === me ? ' · 你' : ''}<small>${p.watch ? '旁观' : state!.game === 'adventure' ? CHARACTERS[p.skin]?.name || '小伙伴' : p.team === 0 ? '红队' : '蓝队'}</small></span><b>${!p.online ? '离线' : p.watch ? '观看中' : state!.phase === 'playing' ? '游戏中' : p.ready ? '已准备' : '未准备'}</b></div>`).join('');
    app.querySelectorAll<HTMLElement>('[data-skin]').forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.skin) === mine?.skin)));
    app.querySelectorAll<HTMLElement>('[data-team]').forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.team) === mine?.team)));
    $('.party-instructions').textContent = state.game === 'adventure' ? 'A D / ← → 移动 · 空格或 B 跳跃，按住跳得更高 · 从上方踩小怪 · 一起收齐星星到终点' : 'WASD / 方向键移动 · J 传球 · K / 空格射门 · L / Shift 冲刺 · I 铲球';
    status(mode.lan ? '同一 Wi-Fi / 热点即可游玩，无需外网。换游戏不换房间。' : '房间已连接。换游戏时伙伴会自动跟随，无需重新加入。');
    if (changed) setupRenderer();
  }

  function packet(message: GamePacket) {
    if (!state || message.revision !== state.revision || closed) return;
    if (message.json?.t === 'roster') roster = message.json;
    if (message.bytes) {
      const bytes = new Uint8Array(message.bytes);
      if (state.game === 'football') { const snap = decodeSnapshot(bytes); if (snap) football = snap; }
      else {
        try { const view = JSON.parse(decoder.decode(bytes)); if (view.t === 'adventure-state' && LEVELS[view.level] && view.players?.length <= 8) adventure = view; } catch { /* Ignore malformed snapshots. */ }
      }
    }
  }
  function setupRenderer() {
    if (!state) return;
    if (renderer instanceof AdventureRenderer) renderer.close();
    if (renderer instanceof Renderer) renderer.close();
    const old = $('.party-canvas'), canvas = document.createElement('canvas');
    canvas.className = 'party-canvas'; canvas.setAttribute('aria-label', '当前游戏预览与实时画面'); old.replaceWith(canvas);
    renderer = state.game === 'adventure' ? new AdventureRenderer(canvas) : new Renderer(canvas);
    renderedGame = state.game; renderedRevision = state.revision;
  }
  function draw(now: number) {
    if (closed) return;
    const dt = Math.min(.05, (now - previousTime) / 1000); previousTime = now;
    if (state && renderer && renderedGame === state.game && renderedRevision === state.revision) {
      const mine = member();
      if (renderer instanceof AdventureRenderer) {
        let view = host?.adventure?.game.view(mine?.gamePid) || adventure;
        if (!view) { const preview = new AdventureGame(); preview.level = state.map; preview.add(1, '小伙伴', 0); view = preview.view(1); }
        view = { ...view, me: mine?.gamePid ?? -1 };
        renderer.draw(view, mine?.skin || 0);
        const mePlayer = view.players.find((p) => p.id === mine?.gamePid);
        $('.party-hud').textContent = state.phase === 'lobby' ? '选好小伙伴，等房主开始' : view.phase === 'clear' ? '这一关完成啦！等房主出发下一站' : view.phase === 'complete' ? '三站小旅行完成！回大厅再选个游戏吧' : `${mePlayer ? '♥'.repeat(mePlayer.hearts) + '  ·  ' : ''}✦ ${view.stars.length}/3 · ${MAP_THEMES[view.level].item} ${mePlayer?.coins.length ?? 0}`;
        $('.party-next').hidden = !mode.host || view.phase !== 'clear';
      } else {
        const view = host?.football?.view(mine?.gamePid ?? -1);
        const snap = view || football;
        if (snap) renderer.draw(view || { ...snap, info: new Map<number, PlayerInfo>((roster?.players || []).map((p) => [p.id, p])), meId: mine?.gamePid ?? -1 }, dt);
        $('.party-hud').textContent = snap?.phase === Phase.Ended ? `本局结束 · ${snap.score.join(' : ')} · 回大厅换个玩法吧` : state.phase === 'lobby' ? '选好球队，准备好就开踢' : snap ? `${snap.score.join(' : ')} · ${fmtTime(snap.timeLeft)}` : '等待比赛画面…';
        $('.party-next').hidden = true;
      }
    }
    raf = requestAnimationFrame(draw);
  }
  raf = requestAnimationFrame(draw);
  async function invite() {
    const url = joinUrl({ room, pin: opts.pin });
    $<HTMLInputElement>('.party-url').value = url;
    const qr = (await import('qrcode')).default;
    const src = await qr.toDataURL(url, { width: 220, margin: 2, color: { dark: '#46594f', light: '#fffdf7' } });
    if (closed) return;
    $<HTMLImageElement>('.party-qr').src = src; $('.party-qr').hidden = false;
  }
  $('.party-copy').onclick = async () => {
    try { await navigator.clipboard.writeText($<HTMLInputElement>('.party-url').value); $('.party-copy').textContent = '已复制'; }
    catch { $<HTMLInputElement>('.party-url').select(); status('请复制选中的入场链接。'); }
  };
  $('.party-save').onclick = () => { void saveQrCard({ room, pin: opts.pin }); };
  const cleanup = () => {
    if (closed) return;
    pad.reset(); closed = true; clearInterval(inputTimer); cancelAnimationFrame(raf);
    renderer?.close(); client?.close(); host?.close();
    if (mode.host && mode.lan) void stopLan().catch(() => {});
  };
  window.addEventListener('pagehide', cleanup, { once: true });
  try {
    await loadCharacterSprites();
    if (closed) return;
    app.querySelectorAll<HTMLCanvasElement>('.party-characters canvas').forEach((canvas, index) => drawBuddyAvatar(canvas, index));
    if (mode.host) {
      const saved = store.get('littlelobby.game');
      host = new PartyRoomHost(room, opts, validGame(saved) ? saved : 'football', mode.lan ? (_r, cb) => new LanHost(lanSession()!, cb) : undefined);
      host.onState = receiveState; host.onPacket = packet;
      host.onStatus = (ok) => status(ok ? '小聚场已就绪，邀请朋友一起加入。' : '房间连接断开，正在等待恢复…');
      me = host.addLocal(store.get('littlelobby.name') || '房主', !!mode.screen, Number(store.get('adventure.skin')) || 0);
      receiveState(host.view());
      await host.start(); if (closed) return;
      bindLanAddress($('.party-address'), () => { void invite(); }); await invite();
    }
  } catch (error) { status(`房间暂时无法启动：${String(error)}`); }

  $<HTMLFormElement>('.party-join').onsubmit = async (event) => {
    event.preventDefault(); if (closed) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const name = String(form.get('name') || '').trim().slice(0, 12); if (!name) return;
    store.set('littlelobby.name', name); unlockAudio(); void keepAwake();
    client?.close(); state = undefined;
    const tokenKey = `littlelobby.token.${room}`;
    const token = store.get(tokenKey) || randomCode(20); store.set(tokenKey, token);
    const info = { token, name, team: 'auto' as const, pin: String(form.get('pin') || ''), watch: form.has('watch') };
    const connection = mode.lan || isLanPage() ? new LanClient(room, info, mode.server) : new ClientNet(room, info);
    client = connection;
    connection.onState = (link) => { if (link === 'lost' || link === 'connecting') { pad.reset(); status('正在连接房间，重连后会恢复当前游戏与角色…'); } };
    connection.onReject = (reason) => { status(`暂时无法加入：${({ pinNeed: '请输入房间密码', pinWrong: '密码不正确', pinThrottle: '尝试太快，稍后重试', full: '玩家已满，可勾选旁观', watchFull: '房间已满' } as Record<string, string>)[reason] || reason}`); $('.party-join').hidden = false; };
    connection.onJson = (message) => {
      if (client !== connection || closed) return;
      if (message.t === 'welcome') {
        if (message.game !== 'party') { status('这是旧版房间，请房主从小聚场首页重新开房。'); return; }
        me = message.pid;
        connection.sendJson({ t: 'room-member', skin: Number(store.get('adventure.skin')) || 0 });
      } else if (message.t === 'room-state') receiveState(message);
      else if (message.t === 'room-game') packet(message);
    };
    connection.onBinary = (bytes) => { if (client !== connection || closed) return; try { const message = JSON.parse(decoder.decode(bytes)); if (message.t === 'room-game') packet(message); } catch { /* Ignore old or malformed packets. */ } };
    try { await connection.start(); } catch { status('暂时无法连接房间，请检查网络后重新加入。'); }
  };
}
