import { t } from '../i18n';
import { LOBBY_STALE_MS, watchLobby, type LobbyInfo } from '../net/lobby';
import { openScanner } from '../ui/scan';
import { bindSiteTools, icon, siteFooter, siteTools } from '../ui/site';
import { HISTORY_KEY, brand, esc, isPin, normalizeCode, store } from '../ui/util';
import { isLanPage, isNativeApp, stopLan } from '../net/lan-session';
import { bindLanLobby, lanLobbyHtml } from '../ui/lan-lobby';
import { GAMES, validGame, type GameId } from '../room/catalog';
import { CHARACTERS } from '../game/adventure';
import './home.css';
import { drawBuddyAvatar, loadCharacterSprites } from '../game/adventure-sprites';

const CODE_LEN = 5;

/* 足球缩略图：手绘球场 + 球，与冒险的角色缩略图同一尺寸 */
const pitchArt = `<svg class="lh-pitch" viewBox="0 0 160 100" aria-hidden="true">
  <rect x="4" y="4" width="152" height="92" rx="10" class="lh-pitch-turf"/>
  <g class="lh-pitch-line"><rect x="12" y="12" width="136" height="76" rx="3"/><path d="M80 12v76"/><circle cx="80" cy="50" r="13"/><rect x="12" y="34" width="14" height="32"/><rect x="134" y="34" width="14" height="32"/></g>
  <g transform="translate(104 58)"><circle r="12" class="lh-ball"/><path class="lh-ball-patch" d="M0-5l4.8 3.5-1.8 5.6h-6l-1.8-5.6z"/></g>
</svg>`;

export function mountHome(app: HTMLElement) {
  const savedGame = store.get('littlelobby.game');
  let selectedGame: GameId = validGame(savedGame) ? savedGame : 'football';
  const native = isNativeApp();
  const lan = isLanPage() || (native && store.get('sfb.network') !== 'online');
  if (native) void stopLan().catch(() => {});
  // 回到首页即离开了房间（主机随页面关闭），房间战绩一并删除
  store.clear(HISTORY_KEY, false);
  // 局域网页面只能加入；原生局域网模式由应用内大厅加入，没有房间码表单
  const showJoin = isLanPage() || !lan;
  const showHost = !isLanPage();
  const showLobby = !isLanPage();
  const gameArt = (id: GameId) => id === 'football' ? pitchArt
    : `<span class="lh-buddies" aria-hidden="true"><canvas data-buddy="0" width="112" height="112"></canvas><canvas data-buddy="1" width="112" height="112"></canvas></span>`;

  app.innerHTML = `
  <div class="site home${native || isLanPage() ? ' app-home' : ''}">
    <header class="lh-top">
      <a class="lh-wordmark" href="#/" aria-label="${t('app.name')}"><img class="lh-mark on-light" src="${brand('mark.svg')}" alt="" width="50" height="35"><img class="lh-mark on-dark" src="${brand('mark-light.svg')}" alt="" width="50" height="35"><span>${t('app.name')}<small>Little Lobby</small></span></a>
      ${siteTools()}
    </header>
    <main class="lh-main">
      <section class="lh-intro">
        <div><h1 class="lh-title">${t('app.tagline').replace('，', '，<br>').replace(', ', ',<br>')}</h1>
        <p class="lh-lede">${t('app.desc')}</p></div>
        <div class="lh-cast" aria-hidden="true">${CHARACTERS.map((_, i) => `<canvas data-buddy="${i}" width="112" height="112" style="--i:${i}"></canvas>`).join('')}</div>
      </section>
      ${native ? `<div class="network-mode seg lh-network" role="group" aria-label="${t('lan.mode')}"><button data-network="online" class="${lan ? '' : 'on'}">${t('lan.online')}</button><button data-network="lan" class="${lan ? 'on' : ''}">${t('lan.local')}</button></div>` : ''}
      ${lan ? `<p class="lh-note">${t('lan.hint')}</p>` : ''}

      <div class="lh-actions${showJoin && showHost ? '' : ' is-single'}">
        ${showJoin ? `<section class="lh-panel lh-join" aria-labelledby="lh-join-title">
          <h2 id="lh-join-title">${t('home.joinTitle')}</h2>
          <p class="lh-panel-desc">${t('home.joinDesc')}</p>
          <form class="code-form lh-code-form">
            <label class="code-boxes lh-code-boxes">
              ${'<span></span>'.repeat(CODE_LEN)}
              <input class="code" maxlength="${CODE_LEN}" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="${t('join.codeLabel')}">
            </label>
            <button type="submit" class="lh-btn lh-btn-ink join-btn">${t('join.go')}${icon.right}</button>
          </form>
          ${lan ? '' : `<button type="button" class="lh-btn lh-btn-line scan-btn">${icon.scan}<span>${t('join.scan')}</span></button>`}
        </section>` : ''}

        ${showHost ? `<section class="lh-panel lh-host" aria-labelledby="lh-host-title">
          <h2 id="lh-host-title">${t('home.hostTitle')}</h2>
          <p class="lh-panel-desc">${t('home.hostDesc')}</p>
          <div class="lh-picker" role="radiogroup" aria-label="${t('home.game')}">
            ${GAMES.map((game) => `<button type="button" class="lh-pick" role="radio" data-game="${game.id}" aria-checked="${selectedGame === game.id}">
              <span class="lh-pick-art lh-art-${game.id}">${gameArt(game.id)}</span>
              <span class="lh-pick-text"><b>${game.name}</b><small>${game.players}</small></span>
            </button>`).join('')}
          </div>
          <details class="lh-options">
            <summary>${t('home.options')}</summary>
            <div class="lh-options-body">
              <label class="opt-row" ${lan ? 'hidden' : ''}><span>${icon.globe}${t('host.listed')}</span><input type="checkbox" class="switch opt-listed"></label>
              <label class="pin-field">${icon.lock}<input class="opt-pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" placeholder="${t('host.pin')}"></label>
              <p class="field-err" hidden>${t('host.pinBad')}</p>
            </div>
          </details>
          <div class="lh-host-btns">
            <button type="button" class="lh-btn lh-btn-accent create">${icon.tv}<span><b>${t('host.screen')}</b><small>${t('host.screenDesc')}</small></span></button>
            <button type="button" class="lh-btn lh-btn-line host">${icon.phone}<span><b>${t('host.phone')}</b><small>${t('host.phoneDesc')}</small></span></button>
          </div>
        </section>` : ''}
      </div>

      ${showLobby ? `<section class="lh-section lh-lobby" aria-labelledby="lh-lobby-title">
        <div class="lh-section-head"><h2 id="lh-lobby-title">${t('tab.lobby')} <span class="count"></span></h2>${lan ? '' : `<p>${t('lobby.hint')}</p>`}</div>
        ${lan && native ? `<div class="lh-lan">${lanLobbyHtml()}</div>` : ''}
        <div class="lobby-table" role="table" ${lan ? 'hidden' : ''}>
          <div class="lrow lhead" role="row"><span>${t('lobby.room')}</span><span>${t('lobby.host')}</span><span>${t('lobby.players')}</span><span>${t('lobby.state')}</span></div>
          <div class="lbody"></div>
        </div>
      </section>` : ''}

      <section class="lh-section lh-games" aria-labelledby="lh-games-title">
        <div class="lh-section-head"><h2 id="lh-games-title">${t('home.games')}</h2></div>
        ${GAMES.map((game) => `<article class="lh-game lh-game-${game.id}">
          <div class="lh-game-art lh-art-${game.id}">${gameArt(game.id)}</div>
          <div class="lh-game-text">
            <h3>${game.name}</h3>
            <p class="lh-game-meta">${game.players}</p>
            <p>${game.caption}</p>
            <div class="lh-game-links">
              ${showHost ? `<button type="button" class="lh-link" data-use-game="${game.id}">${t('home.useGame')}${icon.right}</button>` : ''}
              ${game.id === 'adventure' ? `<a class="lh-link" href="#/adventure-host?solo=1">${t('home.solo')}${icon.right}</a>` : ''}
            </div>
          </div>
        </article>`).join('')}
        <a class="lh-guide" href="#/guide">${icon.book}<span>${t('guide.cta')}</span>${icon.right}</a>
      </section>
    </main>
    ${siteFooter()}
  </div>`;

  const $ = <T extends HTMLElement>(s: string) => app.querySelector(s) as T | null;
  bindSiteTools(app);
  void loadCharacterSprites().then(() => {
    if (!app.querySelector('.home')) return;
    app.querySelectorAll<HTMLCanvasElement>('[data-buddy]').forEach((canvas) => drawBuddyAvatar(canvas, Number(canvas.dataset.buddy)));
  }).catch(() => { /* Decorative characters do not block joining a room. */ });

  const pickGame = (game: GameId) => {
    selectedGame = game;
    store.set('littlelobby.game', game);
    app.querySelectorAll<HTMLElement>('[data-game]').forEach((el) => el.setAttribute('aria-checked', String(el.dataset.game === game)));
  };
  app.querySelectorAll<HTMLButtonElement>('[data-game]').forEach((button) => {
    button.onclick = () => { if (validGame(button.dataset.game)) pickGame(button.dataset.game); };
  });
  app.querySelectorAll<HTMLButtonElement>('[data-use-game]').forEach((button) => {
    button.onclick = () => {
      if (!validGame(button.dataset.useGame)) return;
      pickGame(button.dataset.useGame);
      const host = $('.lh-host');
      host?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      host?.querySelector<HTMLElement>(`[data-game="${button.dataset.useGame}"]`)?.focus({ preventScroll: true });
    };
  });
  app.querySelectorAll<HTMLButtonElement>('[data-network]').forEach((button) => {
    button.onclick = () => {
      store.set('sfb.network', button.dataset.network!);
      location.reload();
    };
  });

  // ---------- 开房 ----------
  const pinEl = $<HTMLInputElement>('.opt-pin');
  const pinErr = $('.field-err');
  if (pinEl && pinErr) {
    pinEl.oninput = () => {
      pinEl.value = pinEl.value.replace(/\D/g, '');
      pinErr.hidden = true;
    };
    const create = (hash: string) => {
      const pin = pinEl.value;
      if (pin && !isPin(pin)) {
        pinErr.hidden = false;
        $<HTMLDetailsElement>('.lh-options')!.open = true;
        pinEl.focus();
        return;
      }
      store.set('sfb.roomopts', JSON.stringify({ listed: !lan && $<HTMLInputElement>('.opt-listed')!.checked, mode: lan ? 'lan' : undefined, pin: pin || undefined }), false);
      store.set('littlelobby.game', selectedGame);
      // 每次从首页创建都换新房间码，避免旧房间的玩家绕过新设置的密码重连
      store.set('sfb.room', '', false);
      store.set('sfb.hostroom', '', false);
      location.hash = hash;
    };
    $('.create')!.onclick = () => create('#/screen');
    $('.host')!.onclick = () => create('#/host');
  }

  // ---------- 加入：房间码格子 ----------
  const codeEl = $<HTMLInputElement>('.code');
  if (codeEl) {
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
    $<HTMLFormElement>('.code-form')!.onsubmit = (e) => {
      e.preventDefault();
      go();
    };
    paint();
    const scan = $('.scan-btn');
    if (scan) scan.onclick = () => openScanner(app);
  }

  if (lan) {
    if (native) bindLanLobby(app);
    return; // Never initialize public MQTT discovery in local mode.
  }

  // ---------- 公开大厅：订阅所有房间的保留消息 ----------
  let rooms = new Map<string, LobbyInfo>();
  const body = $('.lbody')!;
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
