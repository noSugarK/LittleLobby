import { normalizeCode } from '../ui/util';

export function mountHome(app: HTMLElement) {
  app.innerHTML = `
  <div class="home">
    <div class="card hero">
      <div class="ball-icon">⚽</div>
      <h1>扫码足球</h1>
      <p class="muted">大屏开房间，手机扫码当手柄，最多 4v4 实时对战</p>
      <button class="primary create">在这台设备上创建房间（大屏）</button>
      <button class="host">无大屏模式：用这台手机开房并参赛</button>
      <div class="or">或输入房间码加入</div>
      <form class="join-form">
        <input class="code" placeholder="房间码" maxlength="8" autocapitalize="characters" autocomplete="off">
        <button type="submit">加入</button>
      </form>
    </div>
  </div>`;
  app.querySelector<HTMLElement>('.create')!.onclick = () => {
    location.hash = '#/screen';
  };
  app.querySelector<HTMLElement>('.host')!.onclick = () => {
    location.hash = '#/host';
  };
  app.querySelector<HTMLFormElement>('.join-form')!.onsubmit = (e) => {
    e.preventDefault();
    const code = normalizeCode(app.querySelector<HTMLInputElement>('.code')!.value);
    if (code) location.hash = `#/join/${code}`;
  };
}
