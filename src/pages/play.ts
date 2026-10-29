import QRCode from 'qrcode';
import { HostGame } from '../game/host-game';
import { Renderer, TEAM_COLOR, TEAM_NAME, goalText as goalLabel, type ViewState } from '../game/render';
import { resultLineHtml, statsTabHtml } from '../ui/stats-ui';
import { constrainPlayerBounds, predictMove } from '../game/sim';
import {
  BTN_A,
  BTN_B,
  BTN_Y,
  FLAG_STUN,
  FLAG_TACKLE,
  Phase,
  type ClientMsg,
  type EndInfo,
  type PlayerInfo,
  type RosterMsg,
  type Snapshot,
} from '../game/types';
import { ClientNet, type ClientState } from '../net/client';
import { LanClient } from '../net/lan-client';
import { LanHost } from '../net/lan-host';
import { lanSession } from '../net/lan-session';
import { bindLanAddress, lanInfoHtml } from '../ui/lan-room';
import { SnapBuffer, separateViewBall, separateViewPlayers } from '../net/interp';
import { decodeSnapshot, encodeInput } from '../net/protocol';
import { CONFIG } from '../config';
import { gameName, switchHostGame } from '../room/catalog';
import { confirmEndMatch, confirmLeave } from '../ui/confirm';
import { t, type Key } from '../i18n';
import { Gamepad } from '../ui/gamepad';
import { bindControlsPane, controlsPaneHtml } from '../ui/controls-pane';
import { bindDrawer } from '../ui/drawer';
import { saveQrCard } from '../ui/qrcard';
import { bindLobby, pinLineHtml, settingsHtml, settingsSummary, teamCardHtml } from '../ui/settings-ui';
import { bindLangSelect, icon, langSelect } from '../ui/site';
import { joinCardHtml, showField } from '../ui/join-card';
import { unlockAudio } from '../ui/sound';
import type { Team } from '../game/types';
import { brand, canFullscreen, enterFullscreen, esc, isFullscreen, joinUrl, keepAwake, randomCode, roomOpts, store, vibrate } from '../ui/util';

const STATE_TEXT: Record<ClientState, Key> = {
  signal: 'status.signal',
  waiting: 'status.waiting',
  connecting: 'status.connecting',
  p2p: 'status.p2p',
  lan: 'status.lan',
  relay: 'status.relay',
  lost: 'status.lost',
  rejected: 'status.rejected',
};

/** client：扫码加入的手机；host：无大屏模式，本机既是主机又是球员 */
export type PlayMode = { kind: 'client'; room: string; forceRelay: boolean; pin: string; lock: boolean; lan: boolean; server?: string } | { kind: 'host' };

export function mountPlay(app: HTMLElement, mode: PlayMode) {
  const isHost = mode.kind === 'host';
  const forceRelay = mode.kind === 'client' && mode.forceRelay;
  let room: string;
  if (mode.kind === 'client') room = mode.room;
  else {
    room = store.get('hostroom', false) || randomCode();
    store.set('hostroom', room, false);
  }
  const joinedKey = isHost ? 'hosting' : `joined.${room}`;
  const savedName = store.get('name') || `${t('player.default')}${Math.floor(Math.random() * 90 + 10)}`;
  // '1' 已作为球员加入，'w' 正在观战：刷新后按原身份自动重连
  const joined = store.get(joinedKey, false);
  const autoJoin = joined === '1' || joined === 'w';
  const opts = isHost ? roomOpts() : null;
  const local = opts?.mode === 'lan' ? lanSession() : null;
  // 客户端密码：二维码自带 > 本标签页上次输入的
  const urlPin = mode.kind === 'client' ? mode.pin : '';
  const pinKey = `pin.${room}`;
  const askPin = mode.kind === 'client' && !urlPin && (mode.lock || !!store.get(pinKey, false));
  let qrUrl = '';
  if (opts) QRCode.toDataURL(joinUrl({ room, pin: opts.pin }), { width: 220, margin: 1 }).then((u) => {
      qrUrl = u;
      renderPanel();
    });

  app.innerHTML = `
  <div class="play">
    <canvas class="stage"></canvas>
    <div class="topbar">
      <div class="topbar-left"><div class="status"><i></i><span></span></div></div>
      <div class="top-actions">
        <button class="ghost round-btn fs-btn" aria-label="${t('play.fullscreen')}" title="${t('play.fullscreen')}" hidden>${icon.expand}</button>
        <button class="ghost round-btn menu" aria-label="${t('play.menu')}" title="${t('play.menu')}">${icon.menu}</button>
      </div>
    </div>
    <img class="corner-logo" src="${brand('logo-white-sm.png')}" alt="">
    ${isHost ? `<div class="game-dock football-dock phone-dock" hidden><div class="dock-invite"><img class="dock-qr" alt=""><div><span>${t('screen.scanJoin')}</span><b class="room-code">${esc(room)}</b></div></div><button class="primary dock-start"></button></div>` : ''}
    <div class="pad"></div>
    <div class="panel card drawer" hidden></div>
    ${joinCardHtml({
      title: gameName('football'),
      room: isHost ? undefined : room,
      note: isHost ? t('play.noScreenDesc') : undefined,
      name: savedName,
      pin: store.get(pinKey, false) ?? '',
      askPin,
      pick: { label: t('join.team'), html: `<div class="seg join-team" role="radiogroup">
        <button type="button" data-team="0" style="--c:${TEAM_COLOR[0]}"><i></i>${TEAM_NAME[0]}</button>
        <button type="button" data-team="auto" class="on">${t('team.auto')}</button>
        <button type="button" data-team="1" style="--c:${TEAM_COLOR[1]}"><i></i>${TEAM_NAME[1]}</button>
      </div>` },
      go: t(isHost ? 'play.create' : 'play.enter'),
      links: isHost ? [['return-home', t('play.home')]] : [['watch-go', t('play.watch')], ['return-home', t('play.home')]],
    })}
    <div class="toast" hidden></div>
    <div class="rotate"><span>${t('play.rotate')}</span><button class="ghost leave-room">${t('play.leave')}</button></div>
  </div>`;

  const $ = <T extends HTMLElement>(s: string) => app.querySelector(s) as T;
  const joinEl = $('.join');
  const panel = $('.panel');
  const statusEl = $('.status');
  const toastEl = $('.toast');
  const renderer = new Renderer($('.stage'));
  renderer.padTop = 0;
  const pad = new Gamepad($('.pad'));
  const applyControls = (settings: Parameters<Gamepad['apply']>[0]) => pad.apply(settings);
  const buf = new SnapBuffer();

  let team: Team | 'auto' = 'auto';
  joinEl.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) => {
    b.onclick = () => {
      team = b.dataset.team === 'auto' ? 'auto' : (Number(b.dataset.team) as Team);
      joinEl.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
    };
  });

  let net: ClientNet | LanClient | null = null;
  let game: HostGame | null = null;
  let meId = -1;
  /** 观战中：不占球员名额，没有手柄 */
  let watching = false;
  let players: PlayerInfo[] = [];
  let roster: RosterMsg | null = null;
  let rtt = 0;
  let goalText = '';
  let panelOpen = false;
  let panelTab: 'teams' | 'settings' | 'stats' | 'controls' = 'teams';
  /** 本房间最近的比赛（新的在前） */
  let history: EndInfo[] = [];
  /** 结算条被手动关掉；下一场结束时重新显示 */
  let resultClosed = false;
  // 本机是主机时：还没人加入就展开二维码方便扫码，有人加入后默认收起；手动切换过就按手动的来
  let qrOpen: boolean | null = null;
  let lastPhase: Phase | -1 = -1;

  const leave = async () => {
    if ((game || net) && !(await confirmLeave(!!game))) return;
    autoFs = false;
    game?.close();
    net?.close();
    store.set(joinedKey, '', false);
    location.hash = '#/';
  };
  app.querySelectorAll<HTMLButtonElement>('.leave-room, .return-home').forEach((button) => {
    button.onclick = leave;
  });

  const toast = (text: string, ms = 2000) => {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout((toast as any).t);
    (toast as any).t = setTimeout(() => (toastEl.hidden = true), ms);
  };

  function setStatus(s: ClientState) {
    // 中继或失联时状态标签可点：手动重试直连
    const retry = joinEl.hidden && (s === 'relay' || s === 'lost');
    statusEl.className = `status ${s}${retry ? ' retry' : ''}`;
    const ping = (s === 'p2p' || s === 'relay' || s === 'lan') && rtt ? ` ${Math.round(rtt)}ms` : '';
    const role = watching ? `${t('play.watching')} · ` : '';
    statusEl.querySelector('span')!.textContent = role + t(STATE_TEXT[s]) + ping + (retry ? ' ↻' : '');
    statusEl.title = retry ? t('status.tapRetry') : '';
    statusEl.setAttribute('role', retry ? 'button' : 'status');
    statusEl.tabIndex = retry ? 0 : -1;
  }
  const retryDirect = () => {
    if (net?.retryDirect()) toast(t('play.retryP2P'), 2000);
  };
  statusEl.onclick = retryDirect;
  statusEl.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && retryDirect();

  const dockStart = app.querySelector<HTMLElement>('.dock-start');
  if (dockStart) dockStart.onclick = () => send({ t: 'start' });
  const send = (msg: ClientMsg) => {
    if (game) game.command(meId, msg);
    else net?.sendJson(msg);
  };
  /** 当前阶段与比分：主机直接读模拟器，客户端读最新快照 */
  const current = (): Pick<Snapshot, 'phase' | 'score'> =>
    game ? game.sim : (buf.latest?.s ?? { phase: Phase.Lobby, score: [0, 0] });

  function setWatching(w: boolean) {
    watching = w;
    $('.play').classList.toggle('watching', w);
    if (w) renderer.follow = false;
    if (net) {
      net.info.watch = w;
      setStatus(net.state);
    }
    if (!isHost) store.set(joinedKey, w ? 'w' : '1', false);
  }

  async function join(watch = false) {
    const name = ($<HTMLInputElement>('.name').value.trim() || savedName).slice(0, 12);
    store.set('name', name);
    store.set(joinedKey, watch ? 'w' : '1', false);
    if (isHost) return startHost(name);
    let token = store.get(`token.${room}`);
    if (!token) {
      token = randomCode(12);
      store.set(`token.${room}`, token);
    }
    joinEl.hidden = true;
    $('.play').classList.add('joined');
    keepAwake();
    const pinEl = $<HTMLInputElement>('.pin');
    // 输入框显示时以输入为准（例如二维码里的旧密码被拒后重新输入）
    const pin = (pinEl.hidden ? urlPin : pinEl.value.replace(/\D/g, '')) || undefined;
    if (!pinEl.hidden) store.set(pinKey, pin ?? '', false);
    net?.close();
    pad.reset();
    buf.reset();
    pred.ok = false;
    rtt = 0;
    meId = -1;
    lastPhase = -1;
    roster = null;
    players = [];
    history = [];
    panelOpen = false;
    panel.hidden = true;
    const info = { token, name, team, pin, watch };
    const connection = mode.kind === 'client' && mode.lan
      ? new LanClient(room, info, mode.server) : new ClientNet(room, info);
    net = connection;
    setWatching(watch);
    connection.forceRelay = forceRelay;
    buf.delay = mode.kind === 'client' && mode.lan ? 35 : 60;
    const showJoin = () => {
      connection.close();
      net = null; // 被拒后回到加入卡片，返回首页不用再确认
      pad.reset();
      buf.reset();
      pred.ok = false;
      joinEl.hidden = false;
      panel.hidden = true;
      $('.play').classList.remove('joined');
      store.set(joinedKey, '', false);
    };
    connection.onState = (s) => {
      if (net !== connection) return;
      setStatus(s);
      buf.delay = s === 'relay' ? 140 : s === 'lan' ? 35 : 60;
      if (s === 'lost' || s === 'rejected') {
        pad.reset();
        buf.reset();
        pred.ok = false;
      }
    };
    connection.onReject = (r) => {
      if (net !== connection) return;
      showJoin();
      toast(t(`reject.${r}`, { n: CONFIG.maxPerTeam * 2 }), 5000);
      if (r.startsWith('pin')) {
        showField(pinEl, true);
        pinEl.value = '';
        pinEl.focus();
      }
    };
    connection.onBinary = (d) => {
      if (net !== connection) return;
      const s = decodeSnapshot(d);
      if (s) buf.push(s, performance.now());
    };
    connection.onJson = (m) => { if (net === connection) onMsg(m); };
    setStatus(mode.kind === 'client' && mode.lan ? 'connecting' : 'signal');
    try {
      await connection.start();
    } catch {
      if (net !== connection) return;
      showJoin();
      setStatus('lost');
      toast(t('play.signalFail'), 6000);
    }
  }

  async function startHost(name: string) {
    joinEl.hidden = true;
    $('.play').classList.add('joined');
    keepAwake();
    unlockAudio();
    game = new HostGame(room, opts!, local ? (_room, cb) => new LanHost(local, cb) : undefined);
    game.onLocal = onMsg;
    game.onStatus = (ok, text) => {
      statusEl.className = `status ${ok ? 'p2p' : 'lost'}`;
      statusEl.querySelector('span')!.textContent = ok ? `${local ? t('status.lan') + ' · ' : ''}${t('status.host', { room })}` : text;
    };
    meId = game.addLocal(name, team);
    await game.start();
  }

  function onMsg(m: any) {
    switch (m.t) {
      case 'welcome':
        // 手输房间码或从局域网大厅进入时，由主机告知实际玩法。
        if (m.game === 'adventure') {
          const token = store.get(`token.${room}`);
          if (token) store.set(`adventure.token.${room}`, token);
          // 房主换成冒险：带着昵称自动进入，不用重新填写
          store.set(`adventure.joined.${room}`, '1', false);
          // 用刚在加入卡片上填的昵称，不沿用上次冒险的旧名字
          store.set('adventure.name', store.get('name') || store.get('adventure.name') || t('player.default'));
          const [path, query] = location.hash.split('?');
          const params = new URLSearchParams(query);
          params.set('game', 'adventure');
          location.hash = `${path}?${params}`;
          return;
        }
        meId = m.pid;
        setWatching(m.pid < 0);
        renderPanel();
        break;
      case 'roster':
        roster = m;
        players = m.players;
        renderPanel();
        break;
      case 'history':
        history = m.list;
        renderPanel();
        break;
      case 'pong':
        rtt = rtt ? rtt * 0.7 + (performance.now() - m.ts) * 0.3 : performance.now() - m.ts;
        if (net) setStatus(net.state);
        break;
      case 'ev':
        if (m.k === 'kick') vibrate(25);
        else if (m.k === 'tackled') {
          vibrate([60, 40, 60]);
          toast(t('play.tackled'), 1000);
        } else if (m.k === 'goal') {
          goalText = goalLabel(m.team, m.scorer, m.own);
          const me = players.find((p) => p.id === meId);
          vibrate(me && me.team === m.team ? [120, 60, 120, 60, 200] : 200);
        } else if (m.k === 'end') {
          vibrate([300, 100, 300]);
          // 结束后先看本场战绩；结算缩成一行，队伍和设置仍然一点就到
          panelTab = 'stats';
          resultClosed = false;
        } else if (m.k === 'full') {
          toast(t('play.joinFull'), 2500);
        } else if (m.k === 'vote') {
          const me = players.find((p) => p.id === meId);
          if (me?.team === m.team) toast(t(m.cancel ? 'play.unvote' : 'play.vote', { name: m.name, n: m.n, need: m.need }), 2500);
          else if (!m.cancel) toast(t('play.enemyVote'), 2000);
        }
        break;
    }
  }

  // ---------- 面板（大厅/结算/菜单） ----------
  /** 手机开房：热身时右上角一张小卡片（二维码、房间码、开始），菜单不再自动弹出，进来就能先踢 */
  function renderDock() {
    const dock = app.querySelector<HTMLElement>('.phone-dock');
    if (!dock) return;
    const st = roster?.settings;
    dock.hidden = !st || current().phase !== Phase.Lobby || !joinEl.hidden || meId < 0 || meId !== roster!.hostPid;
    if (dock.hidden || !st) return;
    const img = dock.querySelector<HTMLImageElement>('.dock-qr')!;
    if (qrUrl && img.src !== qrUrl) img.src = qrUrl;
    dock.querySelector('.dock-start')!.textContent = `${t('play.start')} · ${st.mode === 1 ? t('mode.1') : t('play.minutes', { n: st.duration / 60 })}`;
  }

  function renderPanel() {
    renderDock();
    const { phase } = current();
    const lobby = phase === Phase.Lobby;
    const ended = phase === Phase.Ended;
    const inMatch = !lobby && !ended;
    panel.hidden = !panelOpen || !joinEl.hidden;
    if (panel.hidden) return;
    if (!roster) {
      // 还没连上主机时菜单也要能退出房间（顶栏不再单独放退出按钮）
      panel.classList.remove('is-narrow');
      panel.innerHTML = `<div class="pmain"><div class="panel-head"><span>${t('play.room', { room: `<b>${esc(room)}</b>` })}</span><button class="ghost close" aria-label="close">×</button></div>${controlsPaneHtml()}<div class="pmeta"><button class="ghost leave-room">${t('play.leave')}</button></div></div>`;
      panel.querySelector<HTMLElement>('.leave-room')!.onclick = leave;
      bindControlsPane(panel, applyControls);
      panel.querySelector<HTMLElement>('.close')!.onclick = () => {
        panelOpen = false;
        renderPanel();
      };
      return;
    }
    const r = roster;
    const me = players.find((p) => p.id === meId);
    const isOwner = meId >= 0 && meId === r.hostPid;
    const st = r.settings;
    // 结算时默认收起二维码，把位置留给战绩
    const showQr = qrOpen ?? (!ended && !players.some((p) => !p.bot && p.id !== meId));

    // 大厅 / 结算有「队伍 / 设置 / 战绩 / 按键」四个分页；比赛中只有「队伍 / 按键」，竖排在抽屉左缘
    const tabs = inMatch ? (['teams', 'controls'] as const) : (['teams', 'settings', 'stats', 'controls'] as const);
    const tab = (tabs as readonly string[]).includes(panelTab) ? panelTab : 'teams';
    const label = { teams: t('play.tabTeams'), settings: t('play.tabSettings'), stats: t('stats.tab'), controls: t('ctl.title') };
    // 和冒险同一套分页：第一页都叫「房间」
    const tabIcon = { teams: icon.home, settings: icon.gear, stats: icon.chart, controls: icon.pad };
    // 按键分页时抽屉缩成窄条，只放按键设置，两侧手柄露出来实时预览
    const narrow = tab === 'controls';
    panel.classList.toggle('is-narrow', narrow);
    let html = `<nav class="prail"><button class="pcollapse" aria-label="${t('screen.closePanel')}">${icon.right}</button>${tabs
      .map((k) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}" aria-pressed="${tab === k}">${tabIcon[k]}<span>${label[k]}</span></button>`)
      .join('')}</nav><div class="pmain">`;
    if (narrow) {
      html += `<div class="panel-head"><span>${label.controls}</span><button class="ghost close" aria-label="close">×</button></div>${controlsPaneHtml()}</div>`;
      panel.innerHTML = html;
      bindControlsPane(panel, applyControls);
      panel.querySelectorAll<HTMLButtonElement>('.prail [data-tab]').forEach((b) => { b.onclick = () => { panelTab = b.dataset.tab as typeof panelTab; renderPanel(); }; });
      panel.querySelectorAll<HTMLElement>('.close, .pcollapse').forEach((b) => { b.onclick = () => { panelOpen = false; renderPanel(); }; });
      return;
    }

    // 头部：房间信息、二维码开关（本机是主机时）、关闭
    const watchers = r.watchers ? ` · ${t('play.watchers', { n: r.watchers })}` : '';
    html += `<div class="panel-head"><span>${t('play.room', { room: `<b>${esc(room)}</b>` })} · ${t('play.online', { n: players.filter((p) => !p.bot).length })}${watchers}</span>`;
    if (isHost) html += `<button class="ghost qr-toggle">${t('play.qr')} ${showQr ? '▴' : '▾'}</button>`;
    html += `<button class="ghost close" aria-label="close">×</button></div>`;
    if (isHost && showQr) {
      html += `<div class="host-qr">${qrUrl ? `<img src="${qrUrl}" alt="">` : ''}<div>
        <div class="room-code sm">${esc(room)}</div>${pinLineHtml(opts?.pin)}
        <div class="muted small">${t('play.scanToJoin')}${opts?.listed ? t('play.listed') : ''}</div>
        <button class="ghost save-qr">${icon.download}${t('qr.save')}</button></div></div>${local ? lanInfoHtml() : ''}`;
    }
    if (ended && r.end && !resultClosed) {
      html += `<div class="result-strip">${resultLineHtml(r.end)}<button class="ghost result-x" aria-label="${t('screen.closePanel')}">×</button></div>`;
    }

    html += '<div class="pbody">';
    // 观战者：哪队还有真人空位就能直接加入那队
    const hasRoom = (team: Team) => players.filter((p) => !p.bot && p.team === team).length < CONFIG.maxPerTeam;
    if (tab === 'teams') {
      const card = (team: Team) =>
        teamCardHtml(team, players, {
          hostPid: r.hostPid,
          meId,
          manage: isOwner,
          addAi: isOwner && !inMatch,
          slots: false,
          joinable: watching ? hasRoom(team) : !inMatch && !!me && me.team !== team,
          joinLabel: watching ? t('play.joinTeam') : undefined,
        });
      html += `<div class="tcards">${card(0)}${card(1)}</div>`;
      if (isOwner && players.some((p) => p.id !== meId && p.link !== 'local')) html += `<p class="muted small swipe-hint">${t('play.swipeHint')}</p>`;
    } else if (tab === 'stats') {
      html += statsTabHtml(history, meId, me?.name ?? '');
    } else {
      html += isOwner ? settingsHtml(st) : `<p class="cfg-summary">${settingsSummary(st)}</p>`;
    }
    html += '</div><div class="pfoot">';
    if (watching) {
      if (hasRoom(0) || hasRoom(1)) html += `<button class="primary play-in">${t('play.joinGame')}</button>`;
      if (!inMatch && r.hostPid >= 0) html += `<p class="wait-owner">${t('play.waitOwner', { name: esc(players.find((p) => p.id === r.hostPid)?.name ?? '') })}</p>`;
    } else if (!inMatch) {
      // 主按钮和次要按钮放一行，省出高度给名单 / 设置 / 战绩
      html += '<div class="pfoot-row">';
      if (isOwner) html += `<button class="primary start">${t(ended ? 'play.again' : 'play.start')} · ${st.mode === 1 ? t('mode.1') : t('play.minutes', { n: st.duration / 60 })}</button>`;
      else html += `<p class="wait-owner">${t('play.waitOwner', { name: esc(players.find((p) => p.id === r.hostPid)?.name ?? '') })}</p>`;
      if (isHost && ended) html += `<button class="back">${t('play.toLobby')}</button>`;
      if (!isHost && me) html += `<button class="ghost to-watch">${t('play.toWatch')}</button>`;
      html += '</div>';
    } else if (me) {
      const votes = r.votes[me.team];
      const voted = votes.includes(meId);
      html += `<button class="surrender ${voted ? '' : 'danger'}">${t(voted ? 'play.unsurrender' : 'play.surrender')} (${votes.length}/${r.need[me.team]})</button>`;
      if (isHost) html += `<button class="end">${t('play.end')}</button>`;
    }
    // 教程在新标签页打开，不打断当前连接
    const tip = watching ? t('play.watchTip') : lobby ? t(isHost ? 'play.hostTip' : 'play.warmup') : '';
    // 跟随视角是足球独有的操作，放在菜单底栏，顶栏和冒险一样只留「全屏 / 菜单」
    const cam = watching ? '' : `<button class="ghost cam">${t(renderer.follow ? 'play.overview' : 'play.follow')}</button>`;
    // 底栏两行：设置（语言 / 视角 / 教程），再是房间操作（换游戏、红字退出）
    html += `${tip ? `<p class="pmeta">${tip}</p>` : ''}<div class="pmeta prefs"><label>${t('lang.label')} ${langSelect()}</label>${cam}<a class="panel-guide" href="#/guide" target="_blank" rel="noopener">${t('play.guide')}</a></div><div class="pmeta pactions">${isHost ? `<button class="ghost switch-game">${t('game.switchTo', { game: gameName('adventure') })}</button>` : ''}<button class="pleave leave-room">${t('play.leave')}</button></div></div></div>`;
    panel.innerHTML = html;
    bindLangSelect(panel);
    if (local) bindLanAddress(panel, () => {
      QRCode.toDataURL(joinUrl({ room, pin: opts?.pin }), { width: 220, margin: 1 }).then((url) => {
        qrUrl = url;
        renderPanel();
      });
    });

    const on = (sel: string, fn: () => void) => {
      const el = panel.querySelector<HTMLElement>(sel);
      if (el) el.onclick = fn;
    };
    panel.querySelectorAll<HTMLButtonElement>('.prail [data-tab]').forEach((b) => {
      b.onclick = () => {
        panelTab = b.dataset.tab as typeof panelTab;
        renderPanel();
      };
    });
    on('.cam', () => {
      renderer.follow = !renderer.follow;
      renderPanel();
    });
    on('.qr-toggle', () => {
      qrOpen = !showQr;
      renderPanel();
    });
    on('.result-x', () => {
      resultClosed = true;
      renderPanel();
    });
    on('.start', () => send({ t: 'start' }));
    on('.play-in', () => send({ t: 'play', team: 'auto' }));
    on('.to-watch', () => send({ t: 'watch' }));
    on('.save-qr', () => saveQrCard({ room, pin: opts?.pin }));
    on('.surrender', () => send({ t: 'surrender' }));
    on('.end', () => { void confirmEndMatch().then((ok) => ok && game?.endMatch()); });
    on('.back', () => game?.toLobby());
    on('.leave-room', leave);
    on('.switch-game', () => { void switchHostGame('adventure'); });
    panel.querySelectorAll<HTMLElement>('.close, .pcollapse').forEach((b) => {
      b.onclick = () => {
        panelOpen = false;
        renderPanel();
      };
    });
    bindLobby(panel, players, {
      settings: (patch) => send({ t: 'settings', patch }),
      addBot: (team) => send({ t: 'bot', team, delta: 1 }),
      owner: (pid) => send({ t: 'owner', pid }),
      kick: (pid) => send({ t: 'kick', pid }),
      join: (team) => send(watching ? { t: 'play', team } : { t: 'team', team }),
    });
  }

  $('.menu').onclick = () => {
    panelOpen = !panelOpen;
    renderPanel();
  };
  bindDrawer($('.play'), panel, () => {
    panelOpen = false;
    renderPanel();
  });
  // ---------- 全屏 ----------
  const fsBtn = $('.fs-btn');
  const iosTip = !canFullscreen() && !isFullscreen();
  // iPhone 没有网页全屏：按钮照样显示，点了告诉他添加到主屏幕
  const syncFs = () => (fsBtn.hidden = isFullscreen());
  document.addEventListener('fullscreenchange', syncFs);
  document.addEventListener('webkitfullscreenchange', syncFs);
  syncFs();
  fsBtn.onclick = () => (iosTip ? toast(t('play.iosTip'), 7000) : enterFullscreen(true));
  // 浏览器只在 touchend/click 等手势里允许全屏；自动重连后在下次抬手时补一次，成功前持续尝试
  let autoFs = canFullscreen();
  const tryFs = () => {
    if (!autoFs || !joinEl.hidden) return;
    enterFullscreen(true).then((ok) => ok && (autoFs = false));
  };
  window.addEventListener('touchend', tryFs);
  window.addEventListener('click', tryFs);

  const go = (watch: boolean) => {
    enterFullscreen(true).then((ok) => ok && (autoFs = false));
    join(watch);
    if (iosTip && !store.get('iosTip')) {
      store.set('iosTip', '1');
      toast(t('play.iosTip'), 7000);
    }
  };
  $('.go').onclick = () => go(false);
  app.querySelectorAll<HTMLInputElement>('.join input').forEach((input) => {
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        go(false);
      }
    };
  });
  const watchGo = app.querySelector<HTMLElement>('.watch-go');
  if (watchGo) watchGo.onclick = () => go(true);

  pad.onPress = (bit) => {
    if (bit === BTN_A || bit === BTN_B || bit === BTN_Y) vibrate(8);
  };

  // ---------- 输入发送 ----------
  let seq = 0;
  let lastSent = '';
  let lastSentAt = 0;
  const sendInput = (buttons = false) => {
    if (game) {
      if (buttons) game.setLocalInput({ ...pad.input });
      return;
    }
    if (!net?.linked || watching) return;
    const key = `${pad.input.jx.toFixed(2)},${pad.input.jy.toFixed(2)},${pad.input.btn}`;
    const now = performance.now();
    const relay = net.state === 'relay';
    const heartbeat = relay ? 200 : 100;
    if (buttons || key !== lastSent || now - lastSentAt > heartbeat) {
      if (!buttons && relay && key !== lastSent && now - lastSentAt < 60) return; // 只对移动限速
      net.sendInput(encodeInput(seq++, pad.input));
      lastSent = key;
      lastSentAt = now;
    }
  };
  pad.onButtons = () => sendInput(true);
  setInterval(sendInput, 33);
  setInterval(() => net?.linked && net.sendJson({ t: 'ping', ts: performance.now() }), 2000);

  // ---------- 渲染与本地预测 ----------
  const pred = { x: 0, y: 0, vx: 0, vy: 0, ok: false };
  let lastFrame = performance.now();
  const frame = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    pad.update();
    if (game) game.setLocalInput({ ...pad.input });
    const snap = game ? game.view(meId) : buf.sample(now);
    if (snap) {
      const view: ViewState = game ? (snap as ViewState) : { ...snap, info: new Map(players.map((p) => [p.id, p])), meId, goalText };
      if (!game) applyPrediction(view, dt, now);
      renderer.draw(game ? view : separateViewBall(separateViewPlayers(view)), dt);
      if (snap.phase !== lastPhase) {
        lastPhase = snap.phase;
        // 结算时自动弹出菜单看战绩；大厅不弹，大家先在场上热身
        panelOpen = snap.phase === Phase.Ended;
        renderPanel();
      }
    }
    requestAnimationFrame(frame);
  };

  /** 自己的球员：本地立即响应输入，再平滑校正到主机位置 */
  function applyPrediction(view: Snapshot & { meId: number }, dt: number, now: number) {
    const latest = buf.latest;
    const i = view.players.findIndex((p) => p.id === meId);
    if (!latest || i < 0) return;
    const server = latest.s.players.find((p) => p.id === meId);
    if (!server) return;
    const ahead = Math.min(0.25, (now - latest.recv + rtt / 2) / 1000);
    const sx = server.x + server.vx * ahead;
    const sy = server.y + server.vy * ahead;
    const frozen = view.phase === Phase.Ready || view.phase === Phase.Ended || server.flags & (FLAG_STUN | FLAG_TACKLE);
    if (!pred.ok || frozen) {
      Object.assign(pred, { x: frozen ? view.players[i].x : sx, y: frozen ? view.players[i].y : sy, vx: server.vx, vy: server.vy, ok: true });
    } else {
      predictMove(pred, pad.input, dt, !!(pad.input.btn & BTN_B), view.party === 2 || server.stamina > 0.05);
      pred.x += pred.vx * dt;
      pred.y += pred.vy * dt;
      const ex = sx - pred.x;
      const ey = sy - pred.y;
      if (Math.hypot(ex, ey) > 70) {
        pred.x = sx;
        pred.y = sy;
      } else {
        const k = Math.min(1, dt * 6);
        pred.x += ex * k;
        pred.y += ey * k;
      }
    }
    constrainPlayerBounds(pred);
    const mag = Math.hypot(pad.input.jx, pad.input.jy);
    view.players[i] = {
      ...view.players[i],
      x: pred.x,
      y: pred.y,
      angle: mag > 0.2 && !frozen ? Math.atan2(pad.input.jy, pad.input.jx) : view.players[i].angle,
    };
  }
  requestAnimationFrame(frame);

  if (autoJoin) join(joined === 'w');
}
