import QRCode from 'qrcode';
import { HostGame, endReasonText, resultTitle } from '../game/host-game';
import { Renderer, TEAM_COLOR, TEAM_NAME } from '../game/render';
import { Phase, type RosterMsg, type Team } from '../game/types';
import { t } from '../i18n';
import { bindSettings, settingsHtml } from '../ui/settings-ui';
import { audioReady, unlockAudio } from '../ui/sound';
import { enterFullscreen, esc, joinUrl, keepAwake, randomCode, roomOpts, store } from '../ui/util';

export function mountScreen(app: HTMLElement) {
  let room = store.get('sfb.room', false);
  if (!room) {
    room = randomCode();
    store.set('sfb.room', room, false);
  }
  const opts = roomOpts();
  const qrUrl = joinUrl(room, opts.pin);
  const pinLine = opts.pin ? `<div class="pin-line">${t('play.pinLine')} <b>${opts.pin}</b></div>` : '';

  app.innerHTML = `
  <div class="screen">
    <canvas class="stage"></canvas>
    <div class="corner-qr" hidden>
      <canvas></canvas><div>${t('screen.scanJoin')} · <b>${room}</b>${opts.pin ? ` · ${t('play.pinLine')} ${opts.pin}` : ''}</div>
    </div>
    <div class="net-badge"><i></i><span>${t('status.connectingSignal')}</span></div>
    <button class="ghost end-btn" hidden>${t('screen.end')}</button>
    <div class="lobby card">
      <div class="lobby-join">
        <canvas class="qr"></canvas>
        <div class="room-code">${room}</div>
        ${pinLine}
        <div class="muted">${t('screen.orOpen')}<br><span class="url">${esc(joinUrl(room))}</span></div>
      </div>
      <div class="lobby-side">
        <h1>${t('app.name')}</h1>
        <div class="teams">
          <div class="team t0"><h3>${TEAM_NAME[0]}</h3><ul></ul></div>
          <div class="team t1"><h3>${TEAM_NAME[1]}</h3><ul></ul></div>
        </div>
        <div class="cfg-wrap"></div>
        <div class="row">
          <button class="primary start">${t('play.start')}</button>
          <button class="fs">${t('play.fullscreen')}</button>
        </div>
        <p class="muted small">${t('screen.lobbyTip')}</p>
      </div>
    </div>
    <div class="result card" hidden></div>
    <div class="audio-tip" hidden>${t('screen.audio')}</div>
  </div>`;

  const $ = <T extends HTMLElement>(s: string) => app.querySelector(s) as T;
  const lobbyEl = $('.lobby');
  const resultEl = $('.result');
  const cornerEl = $('.corner-qr');
  const endBtn = $('.end-btn');
  const badge = $('.net-badge');
  const cfgEl = $('.cfg-wrap');
  let cfgHtml = '';

  QRCode.toCanvas($('.qr'), qrUrl, { width: 260, margin: 1 });
  QRCode.toCanvas($('.corner-qr canvas'), qrUrl, { width: 110, margin: 1 });

  const game = new HostGame(room, opts);
  const renderer = new Renderer($('.stage'));

  game.onStatus = (ok, text) => {
    badge.classList.toggle('ok', ok);
    badge.querySelector('span')!.textContent = text;
  };
  game.onRoster = (r) => renderUi(r);
  game.onPhase = () => renderUi(game.rosterMsg());

  function renderUi(r: RosterMsg) {
    for (const team of [0, 1] as Team[]) {
      const ul = app.querySelector(`.team.t${team} ul`)!;
      const list = r.players.filter((p) => p.team === team).sort((a, b) => a.num - b.num);
      ul.innerHTML =
        list
          .map(
            (p) =>
              `<li class="${p.online ? '' : 'off'}"><b>${p.num}</b>${esc(p.name)}<em>${
                p.bot ? 'AI' : !p.online ? t('status.offline') : t(p.link === 'p2p' ? 'status.p2p' : 'status.relay')
              }</em></li>`,
          )
          .join('') || `<li class="empty">${t('screen.waiting')}</li>`;
    }
    // 只在内容变化时重绘，避免下拉框展开时被刷新收起
    const html = settingsHtml(r.settings, r.players);
    if (html !== cfgHtml) {
      cfgHtml = html;
      cfgEl.innerHTML = html;
      bindSettings(cfgEl, { settings: (p) => game.setSettings(p), bot: (t, d) => game.changeBots(t, d) });
    }
    const phase = game.sim.phase;
    lobbyEl.hidden = phase !== Phase.Lobby;
    cornerEl.hidden = phase === Phase.Lobby;
    endBtn.hidden = phase === Phase.Lobby || phase === Phase.Ended;
    if (phase === Phase.Ended && r.end) {
      const [a, b] = r.end.score;
      resultEl.innerHTML = `
        <h2>${resultTitle(r.end)}</h2>
        <p class="muted">${esc(endReasonText(r.end))}</p>
        <div class="final"><span style="color:${TEAM_COLOR[0]}">${a}</span> : <span style="color:${TEAM_COLOR[1]}">${b}</span></div>
        <div class="row"><button class="primary again">${t('play.again')}</button><button class="back">${t('play.toLobby')}</button></div>`;
      resultEl.querySelector<HTMLElement>('.again')!.onclick = () => game.startMatch();
      resultEl.querySelector<HTMLElement>('.back')!.onclick = () => game.toLobby();
      resultEl.hidden = false;
    } else resultEl.hidden = true;
  }

  $('.start').onclick = () => game.startMatch();
  $('.fs').onclick = () => enterFullscreen();
  endBtn.onclick = () => {
    if (confirm(t('screen.confirmEnd'))) game.endMatch();
  };
  cornerEl.onclick = () => cornerEl.classList.toggle('mini');
  window.addEventListener('keydown', (e) => {
    const phase = game.sim.phase;
    if ((e.code === 'Space' || e.code === 'Enter') && (phase === Phase.Lobby || phase === Phase.Ended)) game.startMatch();
    if (e.code === 'KeyF') enterFullscreen();
    if (e.code === 'Escape') {
      if (phase === Phase.Ended) game.toLobby();
      else if (phase !== Phase.Lobby && confirm(t('play.confirmEnd'))) game.endMatch();
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
