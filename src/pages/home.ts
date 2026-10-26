import { t } from '../i18n';
import { LOBBY_STALE_MS, watchLobby, type LobbyInfo } from '../net/lobby';
import { openScanner } from '../ui/scan';
import { bindSiteTools, icon, siteFooter, siteTools } from '../ui/site';
import { HISTORY_KEY, esc, isPin, normalizeCode, store } from '../ui/util';
import { isLanPage, isNativeApp, stopLan } from '../net/lan-session';
import { bindLanLobby, lanLobbyHtml } from '../ui/lan-lobby';
import { GAMES, gameInfo, validGame, type GameId } from '../room/catalog';
import './home.css';
import { drawBuddyAvatar, loadCharacterSprites } from '../game/adventure-sprites';

const CODE_LEN = 5;
type Tab = 'host' | 'join' | 'lobby';

export function mountHome(app: HTMLElement) {
  const savedGame = store.get('littlelobby.game');
  let selectedGame: GameId = validGame(savedGame) ? savedGame : 'football';
  const native = isNativeApp();
  const lan = isLanPage() || (native && store.get('sfb.network') !== 'online');
  if (native) void stopLan().catch(() => {});
  // 回到首页即离开了房间（主机随页面关闭），房间战绩一并删除
  store.clear(HISTORY_KEY, false);
  const saved = store.get('sfb.tab', false) as Tab | null;
  const tabs: Tab[] = isLanPage() ? ['join'] : lan ? ['host', 'lobby'] : ['host', 'join', 'lobby'];
  let tab: Tab = lan && native && saved === 'join' ? 'lobby' : tabs.includes(saved as Tab) ? saved as Tab : tabs[0];

  app.innerHTML = `
  <div class="site home${native || isLanPage() ? ' app-home' : ''}">
    <header class="site-hero">
      <div class="site-bar"><a class="lobby-wordmark" href="#/" aria-label="小聚场首页"><span class="lobby-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>${t('app.name')}<small>LITTLE LOBBY</small></span></a>${siteTools()}</div>
      <div class="hero-body">
        <div class="hero-text">
          <span class="home-eyebrow">GOOD FRIENDS. GREAT LITTLE MOMENTS.</span>
          <h1>${t('app.tagline').replace('，', '，<br>')}</h1>
          <p class="hero-desc">${t('app.desc')}</p>
          <div class="home-perks"><span>✦ 1–8 人一起玩</span><span>⌁ 支持离线局域网</span><span>▧ 手机就是手柄</span></div>
        </div>
        <div class="welcome-scene" aria-label="一二和布布等你一起玩"><span class="scene-note">给快乐，留个位置。</span><span class="scene-sun" aria-hidden="true">✳</span><div class="scene-hill"></div><canvas class="welcome-buddy buddy-one" data-buddy="0" width="112" height="112" aria-hidden="true"></canvas><canvas class="welcome-buddy buddy-two" data-buddy="1" width="112" height="112" aria-hidden="true"></canvas><span class="scene-flower" aria-hidden="true">✿</span><span class="scene-caption">YOU + ME + A LITTLE PLAY</span></div>
      </div>
    </header>
    <main class="site-main">
      <div class="home-section-title"><div><span class="home-eyebrow">PICK YOUR HAPPY</span><h2>今天，玩点什么？</h2></div><p>选个游戏，叫上你的搭子。</p></div>
      <div class="party-game-selectors" role="group" aria-label="选择游戏">${GAMES.map((game, i) => `<button class="party-game-choice game-${game.id}" data-game="${game.id}" aria-pressed="${selectedGame === game.id}"><span class="game-art" aria-hidden="true">${game.id === 'football' ? '<span class="mini-pitch"><i></i></span><span class="game-ball">⚽</span><span class="art-spark">✦</span>' : '<span class="art-cloud"></span><canvas data-buddy="0" width="112" height="112"></canvas><canvas data-buddy="1" width="112" height="112"></canvas><span class="art-star">★</span>'}<span class="game-number">0${i + 1}</span></span><span class="game-copy"><span class="game-meta">${game.players}</span><b>${game.name}</b><small>${game.caption}</small></span><span class="game-selected">已选择 ✓</span><span class="game-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>
      <div class="home-section-title play-heading"><div><span class="home-eyebrow">MAKE ROOM FOR FRIENDS</span><h2>人齐了，就开场。</h2></div><p>一个房间，装下今晚的快乐。</p></div>
      <div class="home-card">
        ${native ? `<div class="network-mode seg" role="group" aria-label="${t('lan.mode')}"><button data-network="online" class="${lan ? '' : 'on'}">${t('lan.online')}</button><button data-network="lan" class="${lan ? 'on' : ''}">${t('lan.local')}</button></div>` : ''}
        ${lan ? `<p class="hint lan-hint">${t('lan.hint')}</p>` : ''}
        <div class="tabs" role="tablist">
          ${tabs
            .map((k) => `<button role="tab" data-tab="${k}">${t(`tab.${k}`)}${k === 'lobby' ? ' <span class="count"></span>' : ''}</button>`)
            .join('')}
        </div>

        <section data-pane="host">
          <h2 class="pane-title"><span class="pane-number">01</span>${t('tab.host')}<small>邀请朋友来玩</small></h2>
          <p class="party-selected-game">当前选择：<strong>${gameInfo(selectedGame).name}</strong> · 进入房间后房主也能切换</p>
          <div ${lan ? 'hidden' : ''}><label class="opt-row"><span>${icon.globe}${t('host.listed')}</span>
            <input type="checkbox" class="switch opt-listed"></label></div>
          <label class="pin-field">${icon.lock}<input class="opt-pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" placeholder="${t('host.pin')}"></label>
          <p class="field-err" hidden>${t('host.pinBad')}</p>
          <button class="choice create">${icon.tv}<span><b>${t('host.screen')}</b><small>${t('host.screenDesc')}</small></span>${icon.right}</button>
          <button class="choice host">${icon.phone}<span><b>${t('host.phone')}</b><small>${t('host.phoneDesc')}</small></span>${icon.right}</button>
        </section>

        <section data-pane="join">
          <h2 class="pane-title"><span class="pane-number">02</span>${t('tab.join')}<small>去朋友的房间</small></h2>
          <div ${lan ? 'hidden' : ''}><button class="scan-btn">${icon.scan}<b>${t('join.scan')}</b><small>${t('join.scanDesc')}</small></button></div>
          ${lan ? `<p class="hint">${t('lan.hint')}</p>` : ''}
          <div ${lan && native ? 'hidden' : ''}>
          <div class="divider"><span>${t('join.or')}</span></div>
          <form class="code-form">
            <label class="code-boxes">
              ${'<span></span>'.repeat(CODE_LEN)}
              <input class="code" maxlength="${CODE_LEN}" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="${t('join.codeLabel')}">
            </label>
            <button type="submit" class="join-btn">${t('join.go')}</button>
          </form>
          </div>
        </section>

        <section data-pane="lobby">
          <h2 class="pane-title"><span class="pane-number">✦</span>${t('tab.lobby')} <span class="count"></span></h2>
          ${lan && native ? lanLobbyHtml() : ''}
          <div class="lobby-table" role="table" ${lan ? 'hidden' : ''}>
            <div class="lrow lhead" role="row"><span>${t('lobby.room')}</span><span>${t('lobby.host')}</span><span>${t('lobby.players')}</span><span>${t('lobby.state')}</span></div>
            <div class="lbody"></div>
          </div>
          <p class="hint" ${lan ? 'hidden' : ''}>${t('lobby.hint')}</p>
        </section>
      </div>
      <a class="guide-link" href="#/adventure-host?solo=1">${icon.stick}<span>一个人先逛逛 <small>软乎乎冒险 · 单人试玩</small></span>${icon.right}</a>
      <a class="guide-link" href="#/guide">${icon.book}<span>${t('guide.cta')}</span>${icon.right}</a>
    </main>
    ${siteFooter()}
  </div>`;

  const $ = <T extends HTMLElement>(s: string) => app.querySelector(s) as T;
  bindSiteTools(app);
  void loadCharacterSprites().then(() => {
    if (!app.querySelector('.home')) return;
    app.querySelectorAll<HTMLCanvasElement>('[data-buddy]').forEach((canvas) => drawBuddyAvatar(canvas, Number(canvas.dataset.buddy)));
  }).catch(() => { /* Decorative characters do not block joining a room. */ });
  app.querySelectorAll<HTMLButtonElement>('[data-game]').forEach((button) => {
    button.onclick = () => {
      if (!validGame(button.dataset.game)) return;
      selectedGame = button.dataset.game;
      store.set('littlelobby.game', selectedGame);
      app.querySelectorAll<HTMLElement>('[data-game]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.game === selectedGame)));
      $('.party-selected-game strong').textContent = gameInfo(selectedGame).name;
    };
  });
  app.querySelectorAll<HTMLButtonElement>('[data-network]').forEach((button) => {
    button.onclick = () => {
      store.set('sfb.network', button.dataset.network!);
      location.reload();
    };
  });

  // ---------- 分页 ----------
  const showTab = (k: Tab) => {
    tab = k;
    store.set('sfb.tab', k, false);
    app.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === k)));
    app.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== k));
  };
  app.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => (b.onclick = () => showTab(b.dataset.tab as Tab)));
  showTab(tab);

  // ---------- 开房 ----------
  const pinEl = $<HTMLInputElement>('.opt-pin');
  const pinErr = $('.field-err');
  pinEl.oninput = () => {
    pinEl.value = pinEl.value.replace(/\D/g, '');
    pinErr.hidden = true;
  };
  const create = (hash: string) => {
    const pin = pinEl.value;
    if (pin && !isPin(pin)) {
      pinErr.hidden = false;
      pinEl.focus();
      return;
    }
    store.set('sfb.roomopts', JSON.stringify({ listed: !lan && $<HTMLInputElement>('.opt-listed').checked, mode: lan ? 'lan' : undefined, pin: pin || undefined }), false);
    store.set('littlelobby.game', selectedGame);
    // 每次从首页创建都换新房间码，避免旧房间的玩家绕过新设置的密码重连
    store.set('sfb.room', '', false);
    store.set('sfb.hostroom', '', false);
    location.hash = hash;
  };
  $('.create').onclick = () => create('#/screen');
  $('.host').onclick = () => create('#/host');

  // ---------- 加入：房间码格子 ----------
  const codeEl = $<HTMLInputElement>('.code');
  if (isLanPage()) codeEl.value = window.__SCANKICK_LAN__!.room;
  const boxes = [...app.querySelectorAll<HTMLElement>('.code-boxes span')];
  const paint = () => {
    const v = codeEl.value;
    const focused = document.activeElement === codeEl;
    boxes.forEach((b, i) => {
      b.textContent = v[i] ?? '';
      b.classList.toggle('filled', i < v.length);
      b.classList.toggle('cur', focused && i === Math.min(v.length, CODE_LEN - 1));
    });
  };
  const go = () => {
    const code = normalizeCode(codeEl.value);
    if (code.length === CODE_LEN) location.hash = `#/join/${code}${lan ? '?lan=1' : ''}`;
    else codeEl.focus();
  };
  codeEl.oninput = () => {
    codeEl.value = normalizeCode(codeEl.value).slice(0, CODE_LEN);
    paint();
    if (codeEl.value.length === CODE_LEN) go();
  };
  codeEl.onfocus = codeEl.onblur = paint;
  $<HTMLFormElement>('.code-form').onsubmit = (e) => {
    e.preventDefault();
    go();
  };
  paint();
  $('.scan-btn').onclick = () => openScanner(app);

  if (lan) {
    if (native) bindLanLobby(app);
    return; // Never initialize public MQTT discovery in local mode.
  }

  // ---------- 公开大厅：订阅所有房间的保留消息 ----------
  let rooms = new Map<string, LobbyInfo>();
  const body = $('.lbody');
  const countEls = app.querySelectorAll<HTMLElement>('.count');
  let state: 'loading' | 'ready' | 'failed' = 'loading';

  function render() {
    const now = Date.now();
    const list = [...rooms.entries()].filter(([, r]) => now - r.ts < LOBBY_STALE_MS);
    // 可加入的在前，其次按人数
    list.sort(([, a], [, b]) => Number(a.n >= a.max) - Number(b.n >= b.max) || Number(a.playing) - Number(b.playing) || b.n - a.n);
    countEls.forEach((el) => (el.textContent = list.length ? String(list.length) : ''));
    if (!list.length) {
      const key = state === 'failed' ? 'lobby.failed' : state === 'loading' ? 'lobby.loading' : 'lobby.empty';
      body.innerHTML = `<div class="lempty">${t(key)}</div>`;
      return;
    }
    body.innerHTML = list
      .map(([code, r]) => {
        const full = r.n >= r.max;
        const st = full ? ['full', t('lobby.full')] : r.playing ? ['live', t('lobby.live')] : ['open', t('lobby.open')];
        return `<button class="lrow ${full ? 'is-full' : ''}" role="row" data-code="${code}" data-lock="${r.lock ? 1 : ''}">
          <span class="mono code">${code}</span>
          <span class="who">${r.host ? esc(r.host) : t('lobby.screen')} · ${r.game === 'adventure' ? '软乎乎冒险' : '开踢'}${r.lock ? `<i title="${t('lobby.locked')}">${icon.lock}</i>` : ''}</span>
          <span class="mono">${r.n}/${r.max}</span>
          <span class="st ${st[0]}">${st[1]}</span>
        </button>`;
      })
      .join('');
    body.querySelectorAll<HTMLButtonElement>('.lrow').forEach((b) => {
      b.onclick = () => (location.hash = `#/join/${b.dataset.code}${b.dataset.lock ? '?lock' : ''}`);
    });
  }

  render();
  watchLobby((next) => {
    rooms = next;
    render();
  })
    .then(() => {
      // 保留消息在订阅后立即到达，稍等一下再显示「暂无」
      setTimeout(() => {
        state = 'ready';
        render();
      }, 1500);
    })
    .catch(() => {
      state = 'failed';
      render();
    });
  setInterval(render, 10_000);
}
