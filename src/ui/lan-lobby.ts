import { t } from '../i18n';
import { discoverLan, lanJoinHash, type LanRoom } from '../net/lan-session';
import { gameName } from '../room/catalog';
import { icon } from './site';
import { esc } from './util';

/** 和公开大厅同一套列：房间码、房主 · 玩法 · 锁、人数、状态；旧版应用开的房间只有地址 */
function roomRow(room: LanRoom, i: number) {
  const address = esc(room.baseUrl.replace(/^http:\/\//, ''));
  const r = room.info;
  if (!r) return `<button type="button" class="lan-row" data-room="${i}"><b class="mono">${esc(room.room)}</b><span class="who"><small>${address}</small></span><span></span><i class="st">${t('join.go')} →</i></button>`;
  const full = r.n >= r.max;
  const [st, label] = full ? ['full', t('lobby.full')] : r.playing ? ['live', t('lobby.live')] : ['open', t('lobby.open')];
  return `<button type="button" class="lan-row${full ? ' is-full' : ''}" data-room="${i}"><b class="mono">${esc(room.room)}</b>
    <span class="who"><span>${r.lock ? `<i title="${t('lobby.locked')}" aria-label="${t('lobby.locked')}">${icon.lock}</i>` : ''}<span>${r.host ? `${esc(r.host)} · ` : ''}${gameName(r.game === 'adventure' ? 'adventure' : 'football')}</span></span><small>${address}</small></span>
    <span class="mono">${r.n}/${r.max}</span><i class="st ${st}">${label}</i></button>`;
}

export function lanLobbyHtml() {
  return `<div class="lan-head"><h2 id="lh-lan-title">${t('lan.joinTitle')}</h2><span class="lan-status" aria-live="polite">${t('lan.searching')}</span><button type="button" class="lh-link lan-refresh">${t('lan.refresh')}</button></div>
    <div class="lan-rooms"></div>
    <p class="hint">${t('lan.joinHint')}</p>
    <details class="lan-manual">
      <summary>${t('lan.manualToggle')}</summary>
      <form class="lan-join">
        <label>${t('lan.manual')}<input class="lan-url" type="url" required placeholder="http://192.168.1.2:12345" aria-label="${t('lan.manual')}"></label>
        <input class="lan-code" maxlength="8" autocapitalize="characters" placeholder="${t('join.codeLabel')}" aria-label="${t('join.codeLabel')}">
        <button class="join-btn" type="submit">${t('join.go')}</button>
        <p class="hint lan-error" role="alert" hidden>${t('lan.invalidAddress')}</p>
      </form>
    </details>`;
}

export function bindLanLobby(root: HTMLElement) {
  const body = root.querySelector<HTMLElement>('.lan-rooms')!;
  const refresh = root.querySelector<HTMLButtonElement>('.lan-refresh')!;
  const status = root.querySelector<HTMLElement>('.lan-status');
  let closed = false;
  let busy = false;
  let timer = 0;
  let shown = '';
  const show = (html: string) => {
    // 每 5 秒的自动搜索结果不变时不重绘，列表不闪、键盘焦点不丢
    if (html === shown) return;
    shown = body.innerHTML = html;
  };
  const search = async () => {
    if (busy || closed) return;
    busy = refresh.disabled = true;
    if (status) status.textContent = t('lan.searching');
    try {
      const rooms = await discoverLan();
      if (closed) return;
      if (status) status.textContent = rooms.length ? t('lan.found', { n: rooms.length }) : '';
      show(rooms.length ? rooms.map(roomRow).join('')
        : `<p class="lan-empty">${t('lan.empty')}</p>`);
      body.querySelectorAll<HTMLButtonElement>('[data-room]').forEach((button) => {
        button.onclick = () => { location.hash = lanJoinHash(rooms[Number(button.dataset.room)]); };
      });
    } catch {
      if (closed) return;
      if (status) status.textContent = '';
      show(`<p class="lan-empty">${t('lan.searchFailed')}</p>`);
    } finally {
      busy = refresh.disabled = false;
      if (!closed) timer = window.setTimeout(search, 5000);
    }
  };
  refresh.onclick = () => { clearTimeout(timer); void search(); };
  root.querySelector<HTMLFormElement>('.lan-join')!.onsubmit = (event) => {
    event.preventDefault();
    const error = root.querySelector<HTMLElement>('.lan-error')!;
    try {
      const url = new URL(root.querySelector<HTMLInputElement>('.lan-url')!.value.trim());
      const match = url.hash.match(/^#\/join\/([A-Z0-9]{4,8})(?:\?(.*))?$/i);
      const room = match?.[1].toUpperCase() || root.querySelector<HTMLInputElement>('.lan-code')!.value.trim().toUpperCase();
      const pin = new URLSearchParams(match?.[2]).get('pin') || '';
      location.hash = lanJoinHash({ room, baseUrl: url.href }, pin);
      error.hidden = true;
    } catch { error.hidden = false; }
  };
  window.addEventListener('pagehide', () => { closed = true; clearTimeout(timer); }, { once: true });
  void search();
}
