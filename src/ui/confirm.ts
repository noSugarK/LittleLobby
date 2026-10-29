import { t } from '../i18n';
import { esc } from './util';

/** 确认框的内容：粗体短标题说要做什么，一行灰字说后果，确认按钮直接写动作；危险操作（关房、离开、移出）用红色。 */
export interface ConfirmOptions { title: string; body?: string; ok: string; cancel?: string; danger?: boolean }

/** 应用内的确认框，替代 window.confirm：原生应用（尤其安卓 WebView）和全屏时系统弹窗可能不出现、直接当成「取消」，
 *  切换游戏、退出房间这些按钮就会点了没反应。Esc / 点背景取消；Enter / 空格按当前聚焦的按钮（默认是确认）。
 *  弹窗开着时按键不会传到游戏和页面快捷键，Tab 只在两个按钮之间切换。
 *  弹窗放进当前游戏页面里，沿用它的配色（开踢墨绿、冒险奶油），全屏时也看得见。 */
export function askConfirm({ title, body, ok, cancel = t('confirm.cancel'), danger = false }: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const root = document.fullscreenElement || document.body;
    const host = root.querySelector('.play, .screen') || root;
    const el = document.createElement('div');
    el.className = 'confirm-pop';
    el.innerHTML = `<div class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"${body ? ' aria-describedby="confirm-msg"' : ''}>
      <h2 id="confirm-title">${esc(title)}</h2>${body ? `<p id="confirm-msg">${esc(body)}</p>` : ''}
      <div class="confirm-acts"><button class="confirm-no">${esc(cancel)}</button><button class="confirm-yes${danger ? ' is-danger' : ''}">${esc(ok)}</button></div></div>`;
    const done = (value: boolean) => { el.remove(); document.removeEventListener('keydown', onKey, true); resolve(value); };
    const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('button')];
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      const focused = buttons().includes(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        const [no, yes] = buttons();
        (document.activeElement === yes ? no : yes).focus();
      } else if (e.key === 'Enter' && !focused) { e.preventDefault(); done(true); }
      // 聚焦在按钮上时 Enter / 空格交给按钮本身，按的是哪个就是哪个
      else if (!focused && e.key !== 'Enter') e.preventDefault();
    };
    el.addEventListener('click', (e) => { if (e.target === el) done(false); });
    el.querySelector<HTMLButtonElement>('.confirm-no')!.onclick = () => done(false);
    el.querySelector<HTMLButtonElement>('.confirm-yes')!.onclick = () => done(true);
    document.addEventListener('keydown', onKey, true);
    host.append(el);
    el.querySelector<HTMLButtonElement>('.confirm-yes')!.focus();
  });
}

/** 常用的几种确认：退出时房主是关房，其他人是离开 */
export const confirmLeave = (closesRoom: boolean) => askConfirm(closesRoom
  ? { title: t('confirm.closeRoom'), body: t('confirm.closeRoomBody'), ok: t('confirm.closeRoomOk'), cancel: t('confirm.stay'), danger: true }
  : { title: t('confirm.leave'), body: t('confirm.leaveBody'), ok: t('confirm.leaveOk'), cancel: t('confirm.stay'), danger: true });
export const confirmEndMatch = () => askConfirm({ title: t('confirm.end'), body: t('confirm.endBody'), ok: t('confirm.endOk'), danger: true });
