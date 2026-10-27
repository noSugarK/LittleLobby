import { t } from '../i18n';
import { esc } from './util';

/** 应用内的确认框，替代 window.confirm：原生应用（尤其安卓 WebView）和全屏时系统弹窗可能不出现、直接当成「取消」，
 *  切换游戏、退出房间这些按钮就会点了没反应。Esc / 点背景取消；Enter / 空格按当前聚焦的按钮（默认是确认）。
 *  弹窗开着时按键不会传到游戏和页面快捷键，Tab 只在两个按钮之间切换。 */
export function askConfirm(message: string, ok = t('confirm.ok')): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.fullscreenElement || document.body;
    const el = document.createElement('div');
    el.className = 'confirm-pop';
    el.innerHTML = `<div class="confirm-card card" role="alertdialog" aria-modal="true" aria-describedby="confirm-msg"><p id="confirm-msg">${esc(message)}</p><div class="row"><button class="ghost confirm-no">${t('confirm.cancel')}</button><button class="primary confirm-yes">${esc(ok)}</button></div></div>`;
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
