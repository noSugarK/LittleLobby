import { t } from '../i18n';
import { LOBBY_STALE_MS, roomState, watchLobby, type LobbyInfo } from '../net/lobby';
import { openScanner } from '../ui/scan';
import { MAIN_DOWNLOADS, REPO_URL, bindSiteTools, icon, latestRelease, siteFooter, siteTools } from '../ui/site';
import { HISTORY_KEY, brand, esc, isPin, normalizeCode, store } from '../ui/util';
import { isLanPage, isNativeApp, stopLan } from '../net/lan-session';
import { bindLanLobby, lanLobbyHtml } from '../ui/lan-lobby';
import { GAMES, gameInfo, gameName, validGame, type GameId } from '../room/catalog';
import { loadCharacters } from '../game/characters';
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
  const savedGame = store.get('game');
  let selectedGame: GameId = validGame(savedGame) ? savedGame : 'football';
  const native = isNativeApp();
  const lan = isLanPage() || (native && store.get('network') !== 'online');
  if (native) void stopLan().catch(() => {});
  // 回到首页即离开了房间（主机随页面关闭），房间战绩一并删除
  store.clear(HISTORY_KEY, false);
  // 局域网页面只能加入；原生局域网模式由应用内大厅加入，没有房间码表单
  const showJoin = isLanPage() || !lan;
  const showHost = !isLanPage();
  // 原生局域网模式：右栏换成局域网房间列表，没有公开大厅
  const showLanJoin = lan && native;
  const showLobby = !isLanPage() && !showLanJoin;
  const gameArt = (id: GameId) => id === 'football' ? pitchArt
    : `<span class="lh-buddies" aria-hidden="true"><canvas data-buddy="yier" width="112" height="112"></canvas><canvas data-buddy="bubu" width="112" height="112"></canvas></span>`;

  app.innerHTML = `
  <div class="site home${native || isLanPage() ? ' app-home' : ''}">
    <header class="lh-top">
      <a class="lh-wordmark" href="#/" aria-label="${t('app.name')}"><img class="lh-mark on-light" src="${brand('mark.svg')}" alt="" width="40" height="28"><img class="lh-mark on-dark" src="${brand('mark-light.svg')}" alt="" width="40" height="28"><span>${t('app.name')}</span></a>
      ${siteTools()}
    </header>
    <main class="lh-main">
      <h1 class="lh-title">${t('app.tagline')}</h1>
      ${native ? `<div class="network-mode seg lh-network" role="group" aria-label="${t('lan.mode')}"><button data-network="online" class="${lan ? '' : 'on'}">${t('lan.online')}</button><button data-network="lan" class="${lan ? 'on' : ''}">${t('lan.local')}</button></div>` : ''}
      ${lan ? `<p class="lh-note">${t('lan.hint')}</p>` : ''}

      <div class="lh-actions${(showJoin || showLanJoin) && showHost ? '' : ' is-single'}">
        ${showJoin ? `<section class="lh-panel lh-join" aria-labelledby="lh-join-title">
          <h2 id="lh-join-title">${t('home.joinTitle')}</h2>
          <form class="code-form lh-code-form">
            <label class="code-boxes lh-code-boxes">
              ${'<span></span>'.repeat(CODE_LEN)}
              <input class="code" maxlength="${CODE_LEN}" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="${t('join.codeLabel')}">
            </label>
            <button type="submit" class="lh-btn lh-btn-accent join-btn">${t('join.go')}</button>
          </form>
          ${lan ? '' : `<button type="button" class="lh-link scan-btn">${t('join.scan')}</button>`}
        </section>` : ''}

        ${showHost ? `<section class="lh-panel lh-host" aria-labelledby="lh-host-title">
          <h2 id="lh-host-title">${t('home.hostTitle')}</h2>
          <div class="lh-picker" role="radiogroup" aria-label="${t('home.game')}">
            ${GAMES.map(({ id }) => gameInfo(id)).map((game) => `<button type="button" class="lh-pick" role="radio" data-game="${game.id}" aria-checked="${selectedGame === game.id}">
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
          <button type="button" class="lh-btn lh-btn-ink create">${t('host.screen')}</button>
          <button type="button" class="lh-link host">${t('host.phone')}</button>
        </section>` : ''}

        ${showLanJoin ? `<section class="lh-panel lh-lan" aria-labelledby="lh-lan-title">${lanLobbyHtml()}</section>` : ''}
      </div>

      ${showLobby ? `<section class="lh-section lh-lobby" aria-labelledby="lh-lobby-title">
        <div class="lh-section-head"><h2 id="lh-lobby-title">${t('tab.lobby')} <span class="count"></span></h2><span class="lh-lobby-state">${t('home.lobbyLoading')}</span><button type="button" class="lh-link lh-refresh">${t('lobby.refresh')}</button></div>
        <div class="lobby-table" role="table">
          <div class="lbody"></div>
        </div>
      </section>` : ''}

      <p class="lh-more">
        ${native || isLanPage() ? '' : `<span class="lh-offline">${t('home.offlineTitle')}：${MAIN_DOWNLOADS.map(([label]) => `<a data-os="${label}" href="${REPO_URL}/releases" target="_blank" rel="noopener">${label}</a>`).join(' · ')}</span>`}
        <a href="#/guide">${t('guide.cta')}</a>
        <a href="#/characters">${t('chars.cta')}</a>
      </p>
    </main>
    ${siteFooter()}
  </div>`;

  const $ = <T extends HTMLElement>(s: string) => app.querySelector(s) as T | null;
  bindSiteTools(app);
  // 开房选择里冒险的小图用角色帧画
  void loadCharacters().then(() => loadCharacterSprites(['yier', 'bubu'])).then(() => {
    app.querySelectorAll<HTMLCanvasElement>('[data-buddy]').forEach((canvas) => drawBuddyAvatar(canvas, canvas.dataset.buddy!));
  }).catch(() => { /* Decorative thumbnails do not block joining a room. */ });

  const pickGame = (game: GameId) => {
    selectedGame = game;
    store.set('game', game);
    app.querySelectorAll<HTMLElement>('[data-game]').forEach((el) => el.setAttribute('aria-checked', String(el.dataset.game === game)));
  };
  app.querySelectorAll<HTMLButtonElement>('[data-game]').forEach((button) => {
    button.onclick = () => { if (validGame(button.dataset.game)) pickGame(button.dataset.game); };
  });
  const offline = $('.lh-offline');
  if (offline) {
    void latestRelease().then((release) => {
      if (!release) return;
      offline.querySelectorAll<HTMLAnchorElement>('[data-os]').forEach((a) => {
        const patterns = MAIN_DOWNLOADS.find(([label]) => label === a.dataset.os)?.[2] ?? [];
        const asset = patterns.map((re) => release.assets.find((x) => re.test(x.name))).find(Boolean);
        if (!asset) return;
        a.href = asset.browser_download_url;
        a.removeAttribute('target');
        a.title = `${asset.name} · ${(asset.size / 1048576).toFixed(1)} MB`;
      });
    }).catch(() => { /* 拿不到版本时链接仍指向发布页 */ });
  }
  app.querySelectorAll<HTMLButtonElement>('[data-network]').forEach((button) => {
    button.onclick = () => {
      store.set('network', button.dataset.network!);
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
      store.set('roomopts', JSON.stringify({ listed: !lan && $<HTMLInputElement>('.opt-listed')!.checked, mode: lan ? 'lan' : undefined, pin: pin || undefined }), false);
      store.set('game', selectedGame);
      // 每次从首页创建都换新房间码，避免旧房间的玩家绕过新设置的密码重连
      store.set('room', '', false);
      store.set('hostroom', '', false);
      location.hash = hash;
    };
    $('.create')!.onclick = () => create('#/screen');
    $('.host')!.onclick = () => create('#/host');
  }

  // 公开大厅里的房间（下面订阅后才有内容）；进房链接和扫码一样带上玩法与上锁，
  // 手输房间码时也能按它直接进对应玩法的加入页、提前显示密码框
  let rooms = new Map<string, LobbyInfo>();
  const joinHash = (code: string) => {
    const room = rooms.get(code), query = new URLSearchParams();
    if (lan) query.set('lan', '1');
    if (room?.lock) query.set('lock', '');
    if (room?.game === 'adventure') query.set('game', 'adventure');
    return `#/join/${code}${query.size ? `?${query}` : ''}`;
  };

  // ---------- 加入：房间码格子 ----------
  const codeEl = $<HTMLInputElement>('.code');
  if (codeEl) {
    if (isLanPage()) codeEl.value = window.__LITTLE_LOBBY_LAN__!.room;
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
      if (code.length === CODE_LEN) location.hash = joinHash(code);
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
    if (showLanJoin) bindLanLobby(app);
    return; // Never initialize public MQTT discovery in local mode.
  }

  // ---------- 公开大厅：订阅所有房间的保留消息 ----------
  const body = $('.lbody')!;
  const countEls = app.querySelectorAll<HTMLElement>('.count');
  const lobby = $('.lh-lobby');
  const lobbyState = $('.lh-lobby-state');
  let state: 'loading' | 'ready' | 'failed' = 'loading';

  function render() {
    const now = Date.now();
    const list = [...rooms.entries()].filter(([, r]) => now - r.ts < LOBBY_STALE_MS);
    // 可加入的在前，其次按人数
    list.sort(([, a], [, b]) => Number(a.n >= a.max) - Number(b.n >= b.max) || Number(a.playing) - Number(b.playing) || b.n - a.n);
    countEls.forEach((el) => (el.textContent = list.length ? String(list.length) : ''));
    // 没有房间时整个大厅收成一行，不留一张空表格
    lobby?.classList.toggle('is-empty', !list.length);
    if (!list.length) {
      const key = state === 'failed' ? 'lobby.failed' : state === 'loading' ? 'home.lobbyLoading' : 'home.lobbyEmpty';
      if (lobbyState) lobbyState.textContent = t(key);
      body.innerHTML = '';
      return;
    }
    body.innerHTML = list
      .map(([code, r]) => {
        const st = roomState(r);
        return `<button class="lrow ${st === 'full' ? 'is-full' : ''}" role="row" data-code="${code}">
          <span class="mono code">${code}</span>
          <span class="who">${r.host ? esc(r.host) : t('lobby.screen')} · ${gameName(r.game ?? 'football')}${r.lock ? `<i title="${t('lobby.locked')}">${icon.lock}</i>` : ''}</span>
          <span class="mono">${r.n}/${r.max}</span>
          <span class="st ${st}">${t(`lobby.${st}`)}</span>
        </button>`;
      })
      .join('');
    body.querySelectorAll<HTMLButtonElement>('.lrow').forEach((b) => {
      b.onclick = () => (location.hash = joinHash(b.dataset.code!));
    });
  }

  render();
  const watch = watchLobby((next) => {
    rooms = next;
    render();
  }, (next) => {
    state = next;
    render();
  });
  const refresh = $<HTMLButtonElement>('.lh-refresh');
  if (refresh) refresh.onclick = () => watch.refresh();
  setInterval(render, 10_000); // 换页会整页刷新（见 main.ts），连接和定时器随页面一起释放
}
