/** 右侧菜单抽屉的收起手势：往右划一下，或点抽屉外的游戏画面（按键分页除外，方便边调边试手柄）。 */
export function bindDrawer(play: HTMLElement, panel: HTMLElement, close: () => void) {
  let start: { x: number; y: number } | null = null;
  panel.addEventListener('pointerdown', (e) => {
    start = (e.target as HTMLElement).closest('input, select, textarea') ? null : { x: e.clientX, y: e.clientY };
  });
  panel.addEventListener('pointerup', (e) => {
    if (start && e.clientX - start.x > 70 && Math.abs(e.clientY - start.y) < 60) close();
    start = null;
  });
  play.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    if (panel.hidden || panel.classList.contains('is-narrow') || panel.contains(target) || target.closest('.topbar')) return;
    close();
  }, true);
}
