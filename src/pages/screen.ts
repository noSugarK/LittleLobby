import { gameName, switchHostGame } from '../room/catalog';
import QRCode from 'qrcode';
import { HostGame, endReasonText, resultTitle } from '../game/host-game';
import { Renderer, TEAM_COLOR } from '../game/render';
import { Phase, type RosterMsg, type Team } from '../game/types';
import { t } from '../i18n';
import { saveQrCard } from '../ui/qrcard';
import { confirmEndMatch, confirmLeave } from '../ui/confirm';
import { mvpLineHtml, statsTableHtml } from '../ui/stats-ui';
import { bindLobby, modeChipsHtml, pinLineHtml, settingsHtml, teamCardHtml } from '../ui/settings-ui';
import { bindDrawer } from '../ui/drawer';
import { bindLangSelect, icon, langSelect } from '../ui/site';
import { audioReady, unlockAudio } from '../ui/sound';
import { lanSession } from '../net/lan-session';
import { LanHost } from '../net/lan-host';
import { bindLanAddress, lanInfoHtml } from '../ui/lan-room';
import { brand, enterFullscreen, esc, joinUrl, keepAwake, randomCode, roomOpts, store } from '../ui/util';

export function mountScreen(app: HTMLElement) {
  let room = store.get('room', false);
  if (!room) {
    room = randomCode();
    store.set('room', room, false);
  }
  const opts = roomOpts();
  const local = opts.mode === 'lan' ? lanSession() : null;
  const qrUrl = joinUrl({ room, pin: opts.pin });
  // 没检测到局域网地址时二维码只会指向本机，手机扫了也打不开，不如不显示
  const noAddress = !!local && !local.addresses.length;

  app.innerHTML = `
  <div class="screen">
    <canvas class="stage"></canvas>
    <div class="net-badge"><i></i><span>${t(local ? 'lan.starting' : 'status.connectingSignal')}</span></div>
    <div class="screen-top">
      <button class="ghost round-btn fs-btn" aria-label="${t('play.fullscreen')}" title="${t('play.fullscreen')} (F)">${icon.expand}</button>
      <button class="ghost round-btn menu" aria-label="${t('play.menu')}" title="${t('play.menu')} (Esc)">${icon.menu}</button>
    </div>
    <img class="corner-logo" src="${brand('logo-white-sm.png')}" alt="${t('app.name')}">
    <div class="corner-qr" hidden>
      <canvas ${noAddress ? 'hidden' : ''}></canvas><div>${t('screen.scanJoin')} · <b>${room}</b>${opts.pin ? ` · ${t('play.pinLine')} ${opts.pin}` : ''}</div>
    </div>
    <div class="game-dock football-dock" hidden>
      <div class="tcards"></div>
      <div class="cfg dock-modes"></div>
      <div class="dock-invite"><canvas class="qr" ${noAddress ? 'hidden' : ''}></canvas><div><span ${noAddress ? 'hidden' : ''}>${t('screen.scanJoin')}</span><b class="room-code">${room}</b>${pinLineHtml(opts.pin)}${local ? lanInfoHtml() : ''}</div></div>
      <button class="primary start"></button>
    </div>
    <div class="panel card drawer screen-menu" hidden>
      <div class="pmain">
        <div class="panel-head"><span>${t('play.room', { room: `<b>${esc(room)}</b>` })} <span class="watchers muted"></span></span><button class="ghost close" aria-label="${t('screen.closePanel')}">×</button></div>
        <div class="pbody"><div class="cfg-wrap"></div></div>
        <div class="pmeta prefs"><label>${t('lang.label')} ${langSelect()}</label><button class="ghost save-qr">${icon.download}${t('qr.save')}</button></div>
        <div class="pmeta pactions"><button class="ghost end-btn" hidden>${t('screen.end')}</button><button class="ghost switch-game">${t('game.switchTo', { game: gameName('adventure') })}</button><button class="pleave leave-room">${t('play.leave')}</button></div>
      </div>
    </div>
    <div class="result card" hidden></div>
    <div class="audio-tip" hidden>${t('screen.audio')}</div>
  </div>`;

  const $ = <T extends HTMLElement>(s: string) => app.querySelector(s) as T;
  const screenEl = $('.screen');
  const dockEl = $('.game-dock');
  const menuEl = $('.screen-menu');
  const resultEl = $('.result');
  const cornerEl = $('.corner-qr');
  const endBtn = $('.end-btn');
  const badge = $('.net-badge');
  const cfgEl = $('.cfg-wrap');
  const watchersEl = $('.watchers');
  let cfgHtml = '';
  let modesHtml = '';

  QRCode.toCanvas($('.qr'), qrUrl, { width: 260, margin: 1 });
  QRCode.toCanvas($('.corner-qr canvas'), qrUrl, { width: 110, margin: 1 });

  bindLanAddress(app, () => {
    QRCode.toCanvas($('.qr'), joinUrl({ room, pin: opts.pin }), { width: 260, margin: 1 });
    QRCode.toCanvas($('.corner-qr canvas'), joinUrl({ room, pin: opts.pin }), { width: 110, margin: 1 });
  });
  const game = new HostGame(room, opts, local ? (_room, cb) => new LanHost(local, cb) : undefined);
  const renderer = new Renderer($('.stage'));

  game.onStatus = (ok, text) => {
    badge.classList.toggle('ok', ok);
    badge.querySelector('span')!.textContent = `${ok && local ? t('status.lan') : text} · ${room}`;
  };
  game.onRoster = (r) => renderUi(r);
  game.onPhase = () => renderUi(game.rosterMsg());

  const cardsEl = $('.tcards');
  const modesEl = $('.dock-modes');

  function renderUi(r: RosterMsg) {
    // 大屏是管理端：成员都能左滑管理，队伍未满时可添加 AI
    const card = (team: Team) => teamCardHtml(team, r.players, { hostPid: r.hostPid, manage: true, addAi: true, slots: false, joinable: false });
    cardsEl.innerHTML = card(0) + card(1);
    // 卡片里只放比赛模式，其余设置在菜单里；内容变化时才重绘
    const html = settingsHtml(r.settings);
    if (html !== cfgHtml) {
      cfgHtml = html;
      cfgEl.innerHTML = html;
    }
    const modes = modeChipsHtml(r.settings);
    if (modes !== modesHtml) {
      modesHtml = modes;
      modesEl.innerHTML = modes;
    }
    const st = r.settings;
    $('.start').textContent = `${t('play.start')} · ${st.mode === 1 ? t('mode.1') : t('play.minutes', { n: st.duration / 60 })}`;
    bindLobby(screenEl, r.players, {
      settings: (p) => game.setSettings(p),
      addBot: (team) => game.changeBots(team, 1),
      owner: (pid) => game.setOwner(pid),
      kick: (pid) => game.kick(pid),
    });
    watchersEl.textContent = r.watchers ? `${t('play.watchers', { n: r.watchers })} · ` : '';
    const phase = game.sim.phase;
    const lobby = phase === Phase.Lobby;
    // 热身时右下角是房主卡片；比赛中换成角落小二维码，晚到的人仍然可以扫码加入
    dockEl.hidden = !lobby;
    cornerEl.hidden = lobby;
    endBtn.hidden = phase === Phase.Lobby || phase === Phase.Ended;
    if (phase === Phase.Ended && r.end) {
      const [a, b] = r.end.score;
      resultEl.innerHTML = `
        <h2>${resultTitle(r.end)}</h2>
        <p class="muted">${esc(endReasonText(r.end))}</p>
        <div class="final"><span style="color:${TEAM_COLOR[0]}">${a}</span> : <span style="color:${TEAM_COLOR[1]}">${b}</span></div>
        ${mvpLineHtml(r.end)}
        ${r.end.stats.length ? statsTableHtml(r.end) : ''}
        <div class="row"><button class="primary again">${t('play.again')}</button><button class="back">${t('play.toLobby')}</button></div>`;
      resultEl.querySelector<HTMLElement>('.again')!.onclick = () => game.startMatch();
      resultEl.querySelector<HTMLElement>('.back')!.onclick = () => game.toLobby();
      resultEl.hidden = false;
    } else resultEl.hidden = true;
  }

  const setMenu = (open: boolean) => { menuEl.hidden = !open; };
  $('.menu').onclick = () => setMenu(menuEl.hidden);
  $('.close').onclick = () => setMenu(false);
  bindDrawer(screenEl, menuEl, () => setMenu(false));
  bindLangSelect(menuEl);
  $('.start').onclick = () => game.startMatch();
  $('.save-qr').onclick = () => saveQrCard({ room, pin: opts.pin });
  const fsBtn = $('.fs-btn');
  const syncFs = () => { fsBtn.hidden = !!document.fullscreenElement; };
  document.addEventListener('fullscreenchange', syncFs);
  fsBtn.onclick = () => enterFullscreen();
  $('.switch-game').onclick = () => { void switchHostGame('adventure'); };
  $('.leave-room').onclick = async () => {
    if (!(await confirmLeave(true))) return;
    game.close();
    store.set('room', '', false);
    location.hash = '#/';
  };
  endBtn.onclick = async () => {
    if (await confirmEndMatch()) game.endMatch();
  };
  cornerEl.onclick = () => cornerEl.classList.toggle('mini');
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && e.target.closest('button, input, select, textarea, a')) return;
    const phase = game.sim.phase;
    if ((e.code === 'Space' || e.code === 'Enter') && (phase === Phase.Lobby || phase === Phase.Ended)) game.startMatch();
    if (e.code === 'KeyF') enterFullscreen();
    if (e.code === 'Escape') {
      if (!menuEl.hidden || phase === Phase.Lobby) setMenu(menuEl.hidden);
      else if (phase === Phase.Ended) game.toLobby();
      else void confirmEndMatch().then((ok) => ok && game.endMatch());
    }
  });

  let lastFrame = performance.now();
  const frame = () => {
    const now = performance.now();
    renderer.draw(game.view(-1), (now - lastFrame) / 1000);
    lastFrame = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  game.start();
  keepAwake();
  // 浏览器要求用户交互后才能播放声音
  const tip = $('.audio-tip');
  unlockAudio();
  setTimeout(() => {
    if (!audioReady()) tip.hidden = false;
  }, 300);
  const unlock = () => {
    unlockAudio();
    tip.hidden = true;
    keepAwake();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}
