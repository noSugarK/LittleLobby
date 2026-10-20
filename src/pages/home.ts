import type { LobbyInfo } from '../game/types';
import { Signal, parseJson } from '../net/signal';
import { esc, isPin, normalizeCode, store } from '../ui/util';

// 主机每 30 秒刷新一次；超过该时长没刷新的视为已失效
const STALE_MS = 90_000;

export function mountHome(app: HTMLElement) {
  app.innerHTML = `
  <div class="home">
    <div class="card hero">
      <div class="ball-icon">⚽</div>
      <h1>扫码足球</h1>
      <p class="muted">大屏开房间，手机扫码当手柄，最多 4v4 实时对战</p>
      <div class="room-opts">
        <label class="check"><input type="checkbox" class="opt-listed"> 展示在公开大厅</label>
        <input class="opt-pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" placeholder="房间密码（可选，4–6 位数字）">
      </div>
      <button class="primary create">在这台设备上创建房间（大屏）</button>
      <button class="host">无大屏模式：用这台手机开房并参赛</button>
      <div class="or">或输入房间码加入</div>
      <form class="join-form">
        <input class="code" placeholder="房间码" maxlength="8" autocapitalize="characters" autocomplete="off">
        <button type="submit">加入</button>
      </form>
      <div class="or">公开大厅</div>
      <ul class="room-list"><li class="empty">正在加载…</li></ul>
    </div>
  </div>`;

  const $ = <T extends HTMLElement>(s: string) => app.querySelector(s) as T;
  const pinEl = $<HTMLInputElement>('.opt-pin');
  pinEl.oninput = () => {
    pinEl.value = pinEl.value.replace(/\D/g, '');
    pinEl.classList.remove('bad');
  };

  const create = (hash: string) => {
    const pin = pinEl.value;
    if (pin && !isPin(pin)) {
      pinEl.classList.add('bad');
      pinEl.focus();
      return;
    }
    store.set('sfb.roomopts', JSON.stringify({ listed: $<HTMLInputElement>('.opt-listed').checked, pin }), false);
    // 每次从首页创建都换新房间码，避免旧房间的玩家绕过新设置的密码重连
    store.set('sfb.room', '', false);
    store.set('sfb.hostroom', '', false);
    location.hash = hash;
  };
  $('.create').onclick = () => create('#/screen');
  $('.host').onclick = () => create('#/host');
  $<HTMLFormElement>('.join-form').onsubmit = (e) => {
    e.preventDefault();
    const code = normalizeCode($<HTMLInputElement>('.code').value);
    if (code) location.hash = `#/join/${code}`;
  };

  // ---------- 公开大厅：订阅所有房间的保留消息 ----------
  const rooms = new Map<string, LobbyInfo>();
  const listEl = $('.room-list');
  let loaded = false;

  function render() {
    const now = Date.now();
    const list = [...rooms.entries()].filter(([, r]) => now - r.ts < STALE_MS).sort((a, b) => b[1].ts - a[1].ts);
    if (!list.length) {
      listEl.innerHTML = `<li class="empty">${loaded ? '暂无公开房间' : '正在加载…'}</li>`;
      return;
    }
    listEl.innerHTML = list
      .map(
        ([code, r]) => `<li>
          <b class="code">${code}</b>
          <span class="meta">${r.host ? `${esc(r.host)} 的房间` : '大屏房间'} · ${r.n}/${r.max} 人 · ${r.playing ? '比赛中' : '大厅中'}</span>
          ${r.lock ? '<span class="lock" title="需要密码">🔒</span>' : ''}
          <button data-code="${code}" data-lock="${r.lock ? 1 : ''}" ${r.n >= r.max ? 'disabled' : ''}>加入</button>
        </li>`,
      )
      .join('');
    listEl.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => (location.hash = `#/join/${b.dataset.code}${b.dataset.lock ? '?lock' : ''}`);
    });
  }

  // 用 '+' 作房间名，订阅 scanfb/v1/+/info
  const sig = new Signal('+');
  sig.onMessage((topic, payload) => {
    const code = normalizeCode(topic.split('/').at(-2) ?? '');
    if (!code) return;
    const r = parseJson<LobbyInfo>(payload);
    // 公共 broker 上谁都能发，字段逐个校验
    if (r && typeof r.ts === 'number' && typeof r.n === 'number' && typeof r.max === 'number') {
      rooms.set(code, {
        host: String(r.host ?? '').slice(0, 12),
        n: Math.max(0, Math.min(99, r.n | 0)),
        max: Math.max(1, Math.min(99, r.max | 0)),
        playing: !!r.playing,
        lock: !!r.lock,
        ts: r.ts,
      });
    } else rooms.delete(code); // 空消息 = 房间关闭
    render();
  });
  sig
    .connect()
    .then(() => {
      sig.sub('info');
      // 保留消息在订阅后立即到达，稍等一下再显示「暂无」
      setTimeout(() => {
        loaded = true;
        render();
      }, 1500);
    })
    .catch(() => (listEl.innerHTML = '<li class="empty">大厅连接失败</li>'));
  setInterval(render, 10_000);
}
