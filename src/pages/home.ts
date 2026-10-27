import { t } from '../i18n';
import { LOBBY_STALE_MS, watchLobby, type LobbyInfo } from '../net/lobby';
import { openScanner } from '../ui/scan';
import { MAIN_DOWNLOADS, REPO_URL, bindSiteTools, icon, latestRelease, siteFooter, siteTools } from '../ui/site';
import { HISTORY_KEY, brand, esc, isPin, normalizeCode, store } from '../ui/util';
import { isLanPage, isNativeApp, stopLan } from '../net/lan-session';
import { bindLanLobby, lanLobbyHtml } from '../ui/lan-lobby';
import { GAMES, gameInfo, gameName, validGame, type GameId } from '../room/catalog';
import { CHARACTERS, MODES, type ModeId } from '../game/adventure';
import './home.css';
import { drawBuddyAvatar, drawBuddyImage, loadCharacterSprites, type BuddyAction } from '../game/adventure-sprites';

const CODE_LEN = 5;

/* 足球缩略图：手绘球场 + 球，与冒险的角色缩略图同一尺寸 */
const pitchArt = `<svg class="lh-pitch" viewBox="0 0 160 100" aria-hidden="true">
  <rect x="4" y="4" width="152" height="92" rx="10" class="lh-pitch-turf"/>
  <g class="lh-pitch-line"><rect x="12" y="12" width="136" height="76" rx="3"/><path d="M80 12v76"/><circle cx="80" cy="50" r="13"/><rect x="12" y="34" width="14" height="32"/><rect x="134" y="34" width="14" height="32"/></g>
  <g transform="translate(104 58)"><circle r="12" class="lh-ball"/><path class="lh-ball-patch" d="M0-5l4.8 3.5-1.8 5.6h-6l-1.8-5.6z"/></g>
</svg>`;

/* 加入面板底部的小插图：手机对着大屏上的二维码 */
const scanArt = `<svg class="lh-scan-art" viewBox="0 0 120 72" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
  <rect x="36" y="6" width="78" height="50" rx="6"/><path d="M66 56v8M56 66h30"/>
  <g stroke-width="2"><rect x="62" y="16" width="10" height="10" rx="1.5"/><rect x="80" y="16" width="10" height="10" rx="1.5"/><rect x="62" y="34" width="10" height="10" rx="1.5"/><path d="M80 34h4v4M88 34v10h-8M80 42v2"/></g>
  <rect x="6" y="22" width="26" height="44" rx="5" fill="var(--h-join, #0f5c5a)"/><path d="M14 34h10M14 40h10M14 46h6" stroke-width="2" opacity=".75"/>
  <path d="M32 30l26-8M32 50l26 6" stroke-dasharray="3 4" opacity=".6"/>
</svg>`;
const assetUrl = (file: string) => `${import.meta.env.BASE_URL}home/${file}`;
/** 三种合作玩法的小图：直接用游戏里的角色帧画，和实际玩到的样子一致 */
function drawModeArt(canvas: HTMLCanvasElement, mode: ModeId) {
  const ctx = canvas.getContext('2d')!;
  canvas.width = 320; canvas.height = 200;
  ctx.scale(2, 2);
  if (mode === 'rope') {
    drawBuddyImage(ctx, 50, 92, 0, 'run', 0.2, 1);
    drawBuddyImage(ctx, 110, 92, 1, 'run', 0.5, 1);
    ctx.lineCap = 'round';
    const rope = () => { ctx.beginPath(); ctx.moveTo(58, 70); ctx.quadraticCurveTo(80, 92, 102, 70); };
    ctx.lineWidth = 5; ctx.strokeStyle = '#e4686c'; rope(); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.setLineDash([5, 6]); ctx.strokeStyle = '#fff6ea'; rope(); ctx.stroke();
  } else if (mode === 'eat') {
    drawBuddyImage(ctx, 80, 94, 3, 'idle', 0, 1, true);
  } else {
    // 三层摞起来比卡片高，缩小一点整组放进去
    ctx.translate(80, 98); ctx.scale(0.62, 0.62);
    drawBuddyImage(ctx, 0, 0, 1, 'idle', 0, 1);
    drawBuddyImage(ctx, 0, -40, 2, 'idle', 0.3, 1);
    drawBuddyImage(ctx, 0, -80, 0, 'idle', 0.6, 1);
  }
}

/** 首页右侧的四个角色可以和鼠标互动：身子朝鼠标微微倾斜，悬停时朝你原地小跑，点击蹦起来并冒出名字和小爱心。
 *  平时播放待机帧（眨眼呼吸）；系统要求减少动态效果时只画静止的第一帧。纯装饰，不影响开房 / 加入。 */
function bindCast(app: HTMLElement) {
  const cast = app.querySelector<HTMLElement>('.lh-cast');
  if (!cast || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const buddies = [...cast.querySelectorAll<HTMLElement>('.lh-buddy')];
  const now = () => performance.now();
  const state = buddies.map(() => ({ action: 'idle' as BuddyAction, since: now(), facing: 1, until: 0 }));
  const set = (i: number, action: BuddyAction, facing = state[i].facing, until = 0) => {
    if (state[i].action !== action) state[i].since = now();
    Object.assign(state[i], { action, facing, until });
  };
  let last = 0;
  const draw = (time: number) => {
    if (!app.contains(cast)) return;
    // 约 12 帧每秒就够看，省电
    if (time - last > 80) {
      last = time;
      buddies.forEach((buddy, i) => {
        const s = state[i];
        if (s.until && time > s.until) set(i, buddy.matches(':hover') ? 'run' : 'idle', s.facing);
        drawBuddyAvatar(buddy.querySelector('canvas')!, i, s.action, (time - s.since) / 1000 + (s.action === 'idle' ? i * 0.37 : 0), s.facing);
      });
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  const facingTo = (buddy: HTMLElement, x: number) => {
    const r = buddy.getBoundingClientRect();
    return x < r.left + r.width / 2 ? -1 : 1;
  };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    for (const buddy of buddies) {
      const r = buddy.getBoundingClientRect();
      const lean = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 320));
      buddy.style.setProperty('--lean', lean.toFixed(3));
    }
  });
  document.addEventListener('pointerleave', () => buddies.forEach((b) => b.style.setProperty('--lean', '0')));
  buddies.forEach((buddy, i) => {
    buddy.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !state[i].until) set(i, 'run', facingTo(buddy, e.clientX)); });
    buddy.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && state[i].action === 'run') state[i].facing = facingTo(buddy, e.clientX); });
    buddy.addEventListener('pointerleave', () => { if (!state[i].until) set(i, 'idle'); });
    buddy.addEventListener('click', () => {
      set(i, 'jump', state[i].facing, now() + 700);
      buddy.classList.remove('is-jump'); void buddy.offsetWidth; buddy.classList.add('is-jump');
      buddy.querySelector('.lh-pop')?.remove();
      const pop = document.createElement('span');
      pop.className = 'lh-pop'; pop.textContent = CHARACTERS[i].name;
      buddy.append(pop);
      setTimeout(() => pop.remove(), 1100);
    });
    // 入场轻跳播完后标记就绪，之后跳跃动画结束不会再重播入场动画
    buddy.addEventListener('animationend', (e) => { if (e.animationName === 'lh-hop') buddy.classList.add('is-ready'); else if (e.animationName === 'lh-jump') buddy.classList.remove('is-jump'); });
  });
}

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
        <div><h1 class="lh-title">${t('app.tagline')}</h1>
        <p class="lh-lede">${t('app.desc')}</p></div>
        <div class="lh-cast" aria-hidden="true">${CHARACTERS.map((_, i) => `<span class="lh-buddy" data-cast="${i}" style="--i:${i}"><canvas data-buddy="${i}" width="112" height="112"></canvas></span>`).join('')}</div>
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
          ${lan ? '' : `<button type="button" class="lh-btn lh-btn-line scan-btn">${icon.scan}<span>${t('join.scan')}</span></button>
          <div class="lh-scan-tip">${scanArt}<p><b>${t('home.scanTipTitle')}</b><span>${t('home.scanTip')}</span></p></div>`}
        </section>` : ''}

        ${showHost ? `<section class="lh-panel lh-host" aria-labelledby="lh-host-title">
          <h2 id="lh-host-title">${t('home.hostTitle')}</h2>
          <p class="lh-panel-desc">${t('home.hostDesc')}</p>
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
          <div class="lh-host-btns">
            <button type="button" class="lh-btn lh-btn-accent create">${icon.tv}<span><b>${t('host.screen')}</b><small>${t('host.screenDesc')}</small></span></button>
            <button type="button" class="lh-btn lh-btn-line host">${icon.phone}<span><b>${t('host.phone')}</b><small>${t('host.phoneDesc')}</small></span></button>
          </div>
        </section>` : ''}
      </div>

      ${showLobby ? `<section class="lh-section lh-lobby" aria-labelledby="lh-lobby-title">
        <div class="lh-section-head"><h2 id="lh-lobby-title">${t('tab.lobby')} <span class="count"></span></h2>${lan ? '' : `<p class="lh-lobby-hint">${t('lobby.hint')}</p><div class="lh-lobby-empty"><span class="lh-lobby-pill">${icon.users}<span class="lh-lobby-state">${t('home.lobbyLoading')}</span></span>${showHost ? `<button type="button" class="lh-link lh-open-public">${t('home.openPublic')}${icon.right}</button>` : ''}</div>`}</div>
        ${lan && native ? `<div class="lh-lan">${lanLobbyHtml()}</div>` : ''}
        <div class="lobby-table" role="table" ${lan ? 'hidden' : ''}>
          <div class="lrow lhead" role="row"><span>${t('lobby.room')}</span><span>${t('lobby.host')}</span><span>${t('lobby.players')}</span><span>${t('lobby.state')}</span></div>
          <div class="lbody"></div>
        </div>
      </section>` : ''}

      <section class="lh-section lh-games" aria-labelledby="lh-games-title">
        <div class="lh-section-head"><h2 id="lh-games-title">${t('home.games')}</h2><p>${t('home.gamesLead')}</p></div>
        <div class="lh-game-grid">${GAMES.map(({ id }) => gameInfo(id)).map((game) => `<article class="lh-game lh-game-${game.id}">
          <div class="lh-game-text">
            <h3>${game.name}</h3>
            <p>${game.caption}</p>
            <p class="lh-game-meta">${game.players}</p>
            <div class="lh-game-links">
              ${showHost ? `<button type="button" class="lh-link" data-use-game="${game.id}">${t('home.useGame')}${icon.right}</button>` : ''}
              ${game.id === 'adventure' ? `<a class="lh-link" href="#/adventure-host?solo=1">${t('home.solo')}${icon.right}</a>` : ''}
            </div>
          </div>
          <img class="lh-game-img" src="${assetUrl(`${game.id}.webp`)}" alt="" loading="lazy" width="960" height="640">
        </article>`).join('')}</div>
        <div class="lh-modes">${MODES.filter((m) => m.coop).map((m) => `<div class="lh-mode"><canvas data-mode-art="${m.id}" width="320" height="200" aria-hidden="true"></canvas><p><b>${m.name}</b><span>${m.desc}</span></p></div>`).join('')}</div>
      </section>

      ${native || isLanPage() ? '' : `<section class="lh-offline" aria-labelledby="lh-offline-title">
        <div class="lh-offline-text">
          <h2 id="lh-offline-title">${t('home.offlineTitle')}</h2>
          <p>${t('home.offlineDesc')}</p>
          <div class="lh-dl-grid">${MAIN_DOWNLOADS.map(([label, logo]) => `<a class="lh-dl" data-os="${label}" href="${REPO_URL}/releases" target="_blank" rel="noopener">${logo}<span>${label}</span>${icon.download}</a>`).join('')}</div>
          <p class="lh-dl-note"><span class="lh-dl-ver">${t('dl.loading')}</span> · <a href="${REPO_URL}/releases" target="_blank" rel="noopener">${t('dl.all')}</a></p>
        </div>
        <img class="lh-offline-art" src="${assetUrl('offline.webp')}" alt="" loading="lazy" width="900" height="600">
      </section>`}

      <section class="lh-section lh-guide-wrap">
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
    app.querySelectorAll<HTMLCanvasElement>('[data-mode-art]').forEach((canvas) => drawModeArt(canvas, canvas.dataset.modeArt as ModeId));
    bindCast(app);
  }).catch(() => { /* Decorative characters do not block joining a room. */ });

  const pickGame = (game: GameId) => {
    selectedGame = game;
    store.set('game', game);
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
  const offline = $('.lh-offline');
  if (offline) {
    void latestRelease().then((release) => {
      const ver = offline.querySelector('.lh-dl-ver')!;
      if (!release) { ver.textContent = t('home.soon'); return; }
      ver.textContent = t('home.latest', { v: release.tag_name });
      offline.querySelectorAll<HTMLAnchorElement>('[data-os]').forEach((a) => {
        const patterns = MAIN_DOWNLOADS.find(([label]) => label === a.dataset.os)?.[2] ?? [];
        const asset = patterns.map((re) => release.assets.find((x) => re.test(x.name))).find(Boolean);
        if (!asset) return;
        a.href = asset.browser_download_url;
        a.removeAttribute('target');
        a.title = `${asset.name} · ${(asset.size / 1048576).toFixed(1)} MB`;
      });
    }).catch(() => { offline.querySelector('.lh-dl-ver')!.textContent = t('dl.failed'); });
  }
  // 大厅空着时「开个公开房间」：勾上公开大厅、展开房间设置，并把焦点交给开房按钮
  const openPublic = $('.lh-open-public');
  if (openPublic) openPublic.onclick = () => {
    const listed = $<HTMLInputElement>('.opt-listed');
    if (listed) listed.checked = true;
    const options = $<HTMLDetailsElement>('.lh-options');
    if (options) options.open = true;
    const host = $('.lh-host');
    host?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    $('.create')?.focus({ preventScroll: true });
  };
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
        const full = r.n >= r.max;
        const st = full ? ['full', t('lobby.full')] : r.playing ? ['live', t('lobby.live')] : ['open', t('lobby.open')];
        return `<button class="lrow ${full ? 'is-full' : ''}" role="row" data-code="${code}" data-lock="${r.lock ? 1 : ''}">
          <span class="mono code">${code}</span>
          <span class="who">${r.host ? esc(r.host) : t('lobby.screen')} · ${gameName(r.game === 'adventure' ? 'adventure' : 'football')}${r.lock ? `<i title="${t('lobby.locked')}">${icon.lock}</i>` : ''}</span>
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
