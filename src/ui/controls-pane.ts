import { t } from '../i18n';
import { DEFAULT_CONTROLS, SIZE_RANGE, loadControls, saveControls, type ControlSettings } from './gamepad';

/** 足球和冒险菜单里的“按键”分页内容：不另弹窗口，就在同一个菜单面板里切换。 */
export function controlsPaneHtml() {
  const seg = (name: 'move' | 'layout', options: [string, string][]) =>
    `<div class="ctl-seg" role="radiogroup">${options.map(([value, label]) => `<button type="button" role="radio" data-${name}="${value}">${label}</button>`).join('')}</div>`;
  return `<div class="ctl-pane">
    <div class="ctl-row"><span>${t('ctl.move')}</span>${seg('move', [['stick', t('ctl.stick')], ['dpad', t('ctl.dpad')]])}</div>
    <div class="ctl-row"><span>${t('ctl.buttons')}</span>${seg('layout', [['diamond', t('ctl.diamond')], ['arc', t('ctl.arc')]])}</div>
    <label class="ctl-row"><span>${t('ctl.size')}</span><input class="ctl-size" type="range" min="${SIZE_RANGE[0] * 100}" max="${SIZE_RANGE[1] * 100}" step="5"><output class="ctl-size-val"></output></label>
    <button type="button" class="ghost ctl-reset">${t('ctl.reset')}</button>
  </div>`;
}

/** 绑定分页里的选项：改动立即保存并交给当前页面的手柄重建。 */
export function bindControlsPane(root: HTMLElement, onChange: (settings: ControlSettings) => void) {
  const pane = root.querySelector<HTMLElement>('.ctl-pane');
  if (!pane) return;
  let settings = loadControls();
  const size = pane.querySelector<HTMLInputElement>('.ctl-size')!;
  const paint = () => {
    pane.querySelectorAll<HTMLElement>('[data-move]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.move === settings.move)));
    pane.querySelectorAll<HTMLElement>('[data-layout]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.layout === settings.layout)));
    size.value = String(Math.round(settings.size * 100));
    pane.querySelector('.ctl-size-val')!.textContent = `${size.value}%`;
  };
  const commit = (patch: Partial<ControlSettings>) => {
    settings = { ...settings, ...patch };
    saveControls(settings);
    paint();
    onChange(settings);
  };
  pane.querySelectorAll<HTMLElement>('[data-move]').forEach((b) => { b.onclick = () => commit({ move: b.dataset.move as ControlSettings['move'] }); });
  pane.querySelectorAll<HTMLElement>('[data-layout]').forEach((b) => { b.onclick = () => commit({ layout: b.dataset.layout as ControlSettings['layout'] }); });
  size.oninput = () => commit({ size: Number(size.value) / 100 });
  pane.querySelector<HTMLElement>('.ctl-reset')!.onclick = () => commit({ ...DEFAULT_CONTROLS });
  paint();
}
