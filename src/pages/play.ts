import QRCode from 'qrcode';
import { HostGame, resultTitle } from '../game/host-game';
import { Renderer, TEAM_COLOR, TEAM_NAME, type ViewState } from '../game/render';
import { predictMove } from '../game/sim';
import {
  BTN_A,
  BTN_B,
  BTN_Y,
  FLAG_STUN,
  FLAG_TACKLE,
  Phase,
  type ClientMsg,
  type PlayerInfo,
  type RosterMsg,
  type Snapshot,
} from '../game/types';
import { ClientNet, type ClientState } from '../net/client';
import { SnapBuffer } from '../net/interp';
import { decodeSnapshot, encodeInput } from '../net/protocol';
import { Gamepad } from '../ui/gamepad';
import { bindSettings, settingsHtml } from '../ui/settings-ui';
import { unlockAudio } from '../ui/sound';
import { canFullscreen, enterFullscreen, esc, isFullscreen, keepAwake, publicBase, randomCode, store, vibrate } from '../ui/util';

const STATE_TEXT: Record<ClientState, string> = {
  signal: '连接信令…',
  waiting: '寻找大屏…',
  connecting: '建立直连…',
  p2p: '直连',
  relay: '中继',
  lost: '重连中…',
  rejected: '无法加入',
};

/** client：扫码加入的手机；host：无大屏模式，本机既是主机又是球员 */
export type PlayMode = { kind: 'client'; room: string; forceRelay: boolean } | { kind: 'host' };

export function mountPlay(app: HTMLElement, mode: PlayMode) {
  const isHost = mode.kind === 'host';
  const forceRelay = mode.kind === 'client' && mode.forceRelay;
  let room: string;
  if (mode.kind === 'client') room = mode.room;
  else {
    room = store.get('sfb.hostroom', false) || randomCode();
    store.set('sfb.hostroom', room, false);
  }
  const joinedKey = isHost ? 'sfb.hosting' : `sfb.joined.${room}`;
  const savedName = store.get('sfb.name') || `球员${Math.floor(Math.random() * 90 + 10)}`;
  const autoJoin = store.get(joinedKey, false) === '1';
  const joinUrl = `${publicBase()}#/join/${room}`;
  let qrUrl = '';
  if (isHost) QRCode.toDataURL(joinUrl, { width: 220, margin: 1 }).then((u) => {
      qrUrl = u;
      renderPanel();
    });

  app.innerHTML = `
  <div class="play">
    <canvas class="stage"></canvas>
    <div class="topbar">
      <div class="status"><i></i><span></span></div>
      <div class="top-actions">
        <button class="ghost fs-btn" hidden>全屏</button>
        <button class="ghost cam">跟随视角</button>
        <button class="ghost menu">菜单</button>
      </div>
    </div>
    <div class="pad"></div>
    <div class="panel card" hidden></div>
    <div class="join card">
      <h1>${isHost ? '无大屏模式' : '扫码足球'}</h1>
      <p class="muted">${isHost ? '这台手机作为主机，其他人扫你屏幕上的二维码加入' : `房间 <b>${esc(room)}</b>`}</p>
      <input class="name" maxlength="12" value="${esc(savedName)}" placeholder="你的昵称">
      <div class="seg">
        <button data-team="0" style="--c:${TEAM_COLOR[0]}">红队</button>
        <button data-team="2" class="on">自动</button>
        <button data-team="1" style="--c:${TEAM_COLOR[1]}">蓝队</button>
      </div>
      <button class="primary go">${isHost ? '创建房间' : '进入球场'}</button>
      <p class="muted small">建议横屏，并关闭系统的「自动锁屏」</p>
    </div>
    <div class="toast" hidden></div>
    <div class="rotate">请把手机横过来 ↻</div>
  </div>`;

  const $ = <T extends HTMLElement>(s: string) => app.querySelector(s) as T;
  const joinEl = $('.join');
  const panel = $('.panel');
  const statusEl = $('.status');
  const toastEl = $('.toast');
  const renderer = new Renderer($('.stage'));
  renderer.padTop = 0;
  const pad = new Gamepad($('.pad'));
  const buf = new SnapBuffer();

  let team = 2;
  joinEl.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) => {
    b.onclick = () => {
      team = Number(b.dataset.team);
      joinEl.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
    };
  });

  let net: ClientNet | null = null;
  let game: HostGame | null = null;
  let meId = -1;
  let players: PlayerInfo[] = [];
  let roster: RosterMsg | null = null;
  let rtt = 0;
  let goalText = '';
  let panelOpen = false;
  let lastPhase: Phase | -1 = -1;

  const toast = (text: string, ms = 2000) => {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout((toast as any).t);
    (toast as any).t = setTimeout(() => (toastEl.hidden = true), ms);
  };

  function setStatus(s: ClientState) {
    statusEl.className = `status ${s}`;
    const ping = (s === 'p2p' || s === 'relay') && rtt ? ` ${Math.round(rtt)}ms` : '';
    statusEl.querySelector('span')!.textContent = STATE_TEXT[s] + ping;
  }

  const send = (msg: ClientMsg) => {
    if (game) game.command(meId, msg);
    else net?.sendJson(msg);
  };
  /** 当前阶段与比分：主机直接读模拟器，客户端读最新快照 */
  const current = (): Pick<Snapshot, 'phase' | 'score'> =>
    game ? game.sim : (buf.latest?.s ?? { phase: Phase.Lobby, score: [0, 0] });

  async function join() {
    const name = ($<HTMLInputElement>('.name').value.trim() || savedName).slice(0, 12);
    store.set('sfb.name', name);
    store.set(joinedKey, '1', false);
    if (isHost) return startHost(name);
    let token = store.get(`sfb.token.${room}`);
    if (!token) {
      token = randomCode(12);
      store.set(`sfb.token.${room}`, token);
    }
    joinEl.hidden = true;
    $('.play').classList.add('joined');
    keepAwake();
    net = new ClientNet(room, { token, name, team });
    net.forceRelay = forceRelay;
    buf.delay = 60;
    net.onState = (s) => {
      setStatus(s);
      buf.delay = s === 'relay' ? 140 : 60;
      if (s === 'lost') buf.reset();
    };
    net.onReject = (r) => {
      toast(r, 5000);
      joinEl.hidden = false;
    };
    net.onBinary = (d) => {
      const s = decodeSnapshot(d);
      if (s) buf.push(s, performance.now());
    };
    net.onJson = onMsg;
    setStatus('signal');
    try {
      await net.start();
    } catch {
      setStatus('lost');
      toast('信令服务器连接失败，请检查网络后刷新', 6000);
    }
  }

  async function startHost(name: string) {
    joinEl.hidden = true;
    $('.play').classList.add('joined');
    keepAwake();
    unlockAudio();
    game = new HostGame(room);
    game.onLocal = onMsg;
    game.onStatus = (ok, text) => {
      statusEl.className = `status ${ok ? 'p2p' : 'lost'}`;
      statusEl.querySelector('span')!.textContent = ok ? `主机 · 房间 ${room}` : text;
    };
    meId = game.addLocal(name, team);
    await game.start();
  }

  function onMsg(m: any) {
    switch (m.t) {
      case 'welcome':
        meId = m.pid;
        break;
      case 'roster':
        roster = m;
        players = m.players;
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
          toast('被铲倒了！', 1000);
        } else if (m.k === 'goal') {
          goalText = m.own ? `乌龙球 · ${m.scorer}` : `${TEAM_NAME[m.team]} · ${m.scorer}`;
          const me = players.find((p) => p.id === meId);
          vibrate(me && me.team === m.team ? [120, 60, 120, 60, 200] : 200);
        } else if (m.k === 'end') {
          vibrate([300, 100, 300]);
        } else if (m.k === 'vote') {
          const me = players.find((p) => p.id === meId);
          if (me?.team === m.team) toast(`${m.name}${m.cancel ? '撤回了投降' : '同意投降'}（${m.n}/${m.need}）`, 2500);
          else if (!m.cancel) toast('对方有人提议投降', 2000);
        }
        break;
    }
  }

  // ---------- 面板（大厅/结算/菜单） ----------
  function renderPanel() {
    const { phase } = current();
    const lobby = phase === Phase.Lobby;
    const ended = phase === Phase.Ended;
    const inMatch = !lobby && !ended;
    const show = panelOpen || lobby || ended;
    panel.hidden = !show || !joinEl.hidden;
    if (panel.hidden || !roster) return;
    const me = players.find((p) => p.id === meId);
    const count = (t: number) => players.filter((p) => p.team === t && !p.bot).length;
    let html = `<div class="panel-head">房间 <b>${esc(room)}</b> · ${players.filter((p) => !p.bot).length} 人在线`;
    html += panelOpen ? `<button class="ghost close">×</button></div>` : `</div>`;
    if (isHost && !inMatch) {
      html += `<div class="host-qr">${qrUrl ? `<img src="${qrUrl}" alt="">` : ''}<div>
        <div class="room-code sm">${esc(room)}</div><div class="muted small">让其他人扫码加入</div></div></div>`;
    }
    if (ended && roster.end) {
      const [a, b] = roster.end.score;
      html += `<div class="final"><span style="color:${TEAM_COLOR[0]}">${a}</span> : <span style="color:${TEAM_COLOR[1]}">${b}</span></div>
        <p><b>${resultTitle(roster.end)}</b> <span class="muted small">${esc(roster.end.reason)}</span></p>`;
    }
    html += `<div class="seg team-switch">
        <button data-team="0" style="--c:${TEAM_COLOR[0]}" class="${me?.team === 0 ? 'on' : ''}">红队 ${count(0)}</button>
        <button data-team="1" style="--c:${TEAM_COLOR[1]}" class="${me?.team === 1 ? 'on' : ''}">蓝队 ${count(1)}</button>
      </div>`;
    if (!inMatch) html += settingsHtml(roster.settings, players);
    if (!inMatch) {
      html += `<button class="primary start">${ended ? '再来一局' : '开始比赛'} · ${roster.settings.duration / 60} 分钟</button>`;
      if (isHost && ended) html += `<button class="back">返回大厅</button>`;
    }
    if (inMatch && me) {
      const votes = roster.votes[me.team];
      const voted = votes.includes(meId);
      html += `<button class="surrender ${voted ? '' : 'danger'}">${voted ? '撤回投降' : '投降'}（${votes.length}/${roster.need[me.team]}）</button>`;
      if (isHost) html += `<button class="end">结束比赛（按比分判定）</button>`;
    }
    if (lobby) html += `<p class="muted small">${isHost ? '本机是主机：请保持本页在前台，不要锁屏' : '热身中，先试试操作吧'}</p>`;
    panel.innerHTML = html;

    const on = (sel: string, fn: () => void) => {
      const el = panel.querySelector<HTMLElement>(sel);
      if (el) el.onclick = fn;
    };
    panel.querySelectorAll<HTMLButtonElement>('.team-switch button').forEach((b) => {
      b.onclick = () => send({ t: 'team', team: Number(b.dataset.team) as 0 | 1 });
    });
    on('.start', () => send({ t: 'start' }));
    on('.surrender', () => send({ t: 'surrender' }));
    on('.end', () => confirm('确定结束本场比赛吗？') && game?.endMatch());
    on('.back', () => game?.toLobby());
    on('.close', () => {
      panelOpen = false;
      renderPanel();
    });
    bindSettings(panel, { settings: (patch) => send({ t: 'settings', patch }), bot: (team, delta) => send({ t: 'bot', team, delta }) });
  }

  $('.menu').onclick = () => {
    panelOpen = !panelOpen;
    renderPanel();
  };
  const camBtn = $('.cam');
  camBtn.onclick = () => {
    renderer.follow = !renderer.follow;
    camBtn.textContent = renderer.follow ? '全场视角' : '跟随视角';
  };
  // ---------- 全屏 ----------
  const fsBtn = $('.fs-btn');
  const iosTip = !canFullscreen() && !isFullscreen();
  const syncFs = () => (fsBtn.hidden = !canFullscreen() || isFullscreen());
  document.addEventListener('fullscreenchange', syncFs);
  document.addEventListener('webkitfullscreenchange', syncFs);
  syncFs();
  fsBtn.onclick = () => enterFullscreen(true);
  // 浏览器只在 touchend/click 等手势里允许全屏；自动重连后在下次抬手时补一次，成功前持续尝试
  let autoFs = canFullscreen();
  const tryFs = () => {
    if (!autoFs || !joinEl.hidden) return;
    enterFullscreen(true).then((ok) => ok && (autoFs = false));
  };
  window.addEventListener('touchend', tryFs);
  window.addEventListener('click', tryFs);

  $('.go').onclick = () => {
    enterFullscreen(true).then((ok) => ok && (autoFs = false));
    join();
    if (iosTip && !store.get('sfb.iosTip')) {
      store.set('sfb.iosTip', '1');
      toast('iPhone 不支持网页全屏：Safari 点「分享 → 添加到主屏幕」，从桌面图标打开即可全屏', 7000);
    }
  };

  pad.onPress = (bit) => {
    if (bit === BTN_A || bit === BTN_B || bit === BTN_Y) vibrate(8);
  };

  // ---------- 输入发送 ----------
  let seq = 0;
  let lastSent = '';
  let lastSentAt = 0;
  setInterval(() => {
    if (!net?.linked) return;
    const key = `${pad.input.jx.toFixed(2)},${pad.input.jy.toFixed(2)},${pad.input.btn}`;
    const now = performance.now();
    const relay = net.state === 'relay';
    const heartbeat = relay ? 200 : 100;
    if (key !== lastSent || now - lastSentAt > heartbeat) {
      if (relay && key !== lastSent && now - lastSentAt < 60) return; // 中继限速约 15Hz
      net.sendInput(encodeInput(seq++, pad.input));
      lastSent = key;
      lastSentAt = now;
    }
  }, 33);
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
      renderer.draw(view, dt);
      if (snap.phase !== lastPhase) {
        lastPhase = snap.phase;
        if (snap.phase === Phase.Playing || snap.phase === Phase.Ready) panelOpen = false;
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
    const ahead = Math.min(0.25, (now - latest.recv + rtt) / 1000);
    const sx = server.x + server.vx * ahead;
    const sy = server.y + server.vy * ahead;
    const frozen = view.phase === Phase.Ready || view.phase === Phase.Ended || server.flags & (FLAG_STUN | FLAG_TACKLE);
    if (!pred.ok || frozen) {
      Object.assign(pred, { x: frozen ? view.players[i].x : sx, y: frozen ? view.players[i].y : sy, vx: server.vx, vy: server.vy, ok: true });
    } else {
      predictMove(pred, pad.input, dt, !!(pad.input.btn & BTN_B), server.stamina > 0.05);
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
    const mag = Math.hypot(pad.input.jx, pad.input.jy);
    view.players[i] = {
      ...view.players[i],
      x: pred.x,
      y: pred.y,
      angle: mag > 0.2 && !frozen ? Math.atan2(pad.input.jy, pad.input.jx) : view.players[i].angle,
    };
  }
  requestAnimationFrame(frame);

  if (autoJoin) join();
}
