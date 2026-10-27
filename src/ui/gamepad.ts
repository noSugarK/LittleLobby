import { BTN_A, BTN_B, BTN_X, BTN_Y, type Input } from '../game/types';
import { t } from '../i18n';
import { store } from './util';

export interface PadButton { bit: number; key: string; label: string; cls: string }
const BUTTONS: PadButton[] = [
  { bit: BTN_Y, key: 'Y', label: t('pad.y'), cls: 'y' },
  { bit: BTN_X, key: 'X', label: t('pad.x'), cls: 'x' },
  { bit: BTN_B, key: 'B', label: t('pad.b'), cls: 'b' },
  { bit: BTN_A, key: 'A', label: t('pad.a'), cls: 'a' },
];

/** 按键设置（存在本机，足球和冒险共用）：左侧摇杆 / 方向键，右侧菱形 / 圆弧布局，整体缩放。 */
export interface ControlSettings { move: 'stick' | 'dpad'; layout: 'diamond' | 'arc'; size: number }
export const DEFAULT_CONTROLS: ControlSettings = { move: 'stick', layout: 'diamond', size: 1 };
const CONTROLS_KEY = 'controls';
export const SIZE_RANGE = [0.7, 1.4] as const;
export function loadControls(): ControlSettings {
  try {
    const raw = JSON.parse(store.get(CONTROLS_KEY) || '{}');
    const size = Number(raw.size);
    return {
      move: raw.move === 'dpad' ? 'dpad' : 'stick',
      layout: raw.layout === 'arc' ? 'arc' : 'diamond',
      size: Number.isFinite(size) ? Math.min(SIZE_RANGE[1], Math.max(SIZE_RANGE[0], size)) : 1,
    };
  } catch { return { ...DEFAULT_CONTROLS }; }
}
export const saveControls = (settings: ControlSettings) => store.set(CONTROLS_KEY, JSON.stringify(settings));

// 桌面调试：WASD/方向键移动，J 传球 K 射门 L/Shift 冲刺 I 铲球（冒险里 J / E 是吃 / 吐）
const KEY_BITS: Record<string, number> = {
  KeyJ: BTN_A,
  KeyE: BTN_A,
  KeyK: BTN_B,
  Space: BTN_B,
  KeyL: BTN_X,
  ShiftLeft: BTN_X,
  ShiftRight: BTN_X,
  KeyI: BTN_Y,
};
const KEY_DIRS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/** 虚拟手柄：左侧浮动摇杆或十字方向键 + 右侧按键（菱形或圆弧布局） */
export class Gamepad {
  readonly input: Input = { jx: 0, jy: 0, btn: 0 };
  /** 按键按下时回调（用于震动反馈） */
  onPress: (bit: number) => void = () => {};
  /** 按键和移动起停立即发送，避免短按或松手等待下一次定时采样。 */
  onButtons: () => void = () => {};
  settings: ControlSettings;
  private readonly buttons: PadButton[];
  private hiddenBits = new Set<number>();
  private joyId: number | null = null;
  private origin = { x: 0, y: 0 };
  private base: HTMLElement | null = null;
  private knob: HTMLElement | null = null;
  private zone!: HTMLElement;
  private dpad: HTMLElement | null = null;
  private bEl: HTMLElement | null = null;
  private bDown = 0;
  private touchBtn = 0;
  private keyBtn = 0;
  private moving = false;
  private keys = new Set<string>();
  private pointers = new Map<HTMLElement, Set<number>>();
  private R = 56;

  constructor(private root: HTMLElement, options: { buttons?: PadButton[] } = {}) {
    this.buttons = options.buttons ?? BUTTONS;
    this.settings = loadControls();
    this.build();
    this.bindKeyboard();
    window.addEventListener('blur', () => this.reset());
    window.addEventListener('pagehide', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.reset();
    });
  }

  /** 换布局时整体重建触屏部分；键盘监听只绑定一次。 */
  apply(settings: ControlSettings) {
    this.reset();
    this.settings = settings;
    this.root.innerHTML = '';
    this.build();
  }

  /** 由游戏决定显示哪些键（例如冒险只在吃吐吐里显示 A 键）。 */
  show(bit: number, visible: boolean) {
    if (visible) this.hiddenBits.delete(bit); else this.hiddenBits.add(bit);
    this.root.querySelectorAll<HTMLElement>('.pad-btn').forEach((el) => { el.hidden = this.hiddenBits.has(Number(el.dataset.bit)); });
    this.layoutButtons();
  }

  private build() {
    const s = this.settings;
    const move = s.move === 'dpad'
      ? `<div class="dpad-zone"><div class="dpad">${['up', 'right', 'down', 'left'].map((d) => `<i class="dpad-${d}"></i>`).join('')}</div></div>`
      : '<div class="joy-zone"><div class="joy-base"><div class="joy-knob"></div></div></div>';
    this.root.insertAdjacentHTML(
      'beforeend',
      `${move}<div class="btn-pad ${s.layout}">${this.buttons.map(
        (b) => `<div class="pad-btn ${b.cls}" data-bit="${b.bit}"${this.hiddenBits.has(b.bit) ? ' hidden' : ''}><b>${b.key}</b><span>${b.label}</span></div>`,
      ).join('')}</div>`,
    );
    this.root.style?.setProperty('--pad-scale', String(s.size));
    if (s.move === 'dpad') {
      this.zone = this.root.querySelector('.dpad-zone')!;
      this.dpad = this.root.querySelector('.dpad');
      this.base = this.knob = null;
      this.bindDpad();
    } else {
      this.zone = this.root.querySelector('.joy-zone')!;
      this.base = this.root.querySelector('.joy-base');
      this.knob = this.root.querySelector('.joy-knob');
      this.dpad = null;
      this.bindJoystick();
      this.restBase();
    }
    this.bEl = null;
    this.pointers.clear();
    this.root.querySelectorAll<HTMLElement>('.pad-btn').forEach((el) => this.bindButton(el));
    this.layoutButtons();
  }

  /** 圆弧布局：主键（B）在右下角放大，其余可见按键沿四分之一圆弧排开；菱形布局交给 CSS。 */
  private layoutButtons() {
    const els = [...this.root.querySelectorAll<HTMLElement>('.pad-btn')];
    if (this.settings.layout !== 'arc') { els.forEach((el) => { el.style.left = el.style.top = ''; }); return; }
    const visible = els.filter((el) => !el.hidden);
    const main = visible.find((el) => Number(el.dataset.bit) === BTN_B) ?? visible[0];
    const rest = visible.filter((el) => el !== main);
    const box = 250, mainSize = 96, size = 66, radius = 128;
    const cx = box - mainSize / 2, cy = box - mainSize / 2;
    if (main) { main.style.left = `${box - mainSize}px`; main.style.top = `${box - mainSize}px`; }
    rest.forEach((el, i) => {
      // 180°（正左）到 90°（正上）之间均匀排开；只有一个副键时放在左上 150°
      const deg = rest.length === 1 ? 150 : 180 - (90 * i) / (rest.length - 1);
      const a = (deg * Math.PI) / 180;
      el.style.left = `${cx + Math.cos(a) * radius - size / 2}px`;
      el.style.top = `${cy - Math.sin(a) * radius - size / 2}px`;
    });
  }

  /** 丢失焦点或连接时释放所有输入，恢复后必须重新操作。 */
  reset() {
    const joyId = this.joyId;
    this.joyId = null;
    this.keys.clear();
    this.keyBtn = this.touchBtn = 0;
    this.bDown = 0;
    this.moving = false;
    this.input.jx = this.input.jy = this.input.btn = 0;
    this.restBase();
    this.lightDpad(0, 0);
    if (joyId !== null && this.zone.hasPointerCapture?.(joyId)) this.zone.releasePointerCapture(joyId);
    for (const [el, ids] of this.pointers) {
      const captured = [...ids];
      ids.clear();
      el.classList.remove('down');
      for (const id of captured) if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
    }
    this.bEl?.style.setProperty('--charge', '0');
    this.onButtons();
  }

  private restBase() {
    if (!this.base || !this.knob) return;
    this.base.classList.remove('active');
    this.base.style.left = '';
    this.base.style.top = '';
    this.knob.style.transform = '';
  }

  private bindJoystick() {
    const z = this.zone;
    z.addEventListener('pointerdown', (e) => {
      if (this.joyId !== null) return;
      e.preventDefault();
      this.joyId = e.pointerId;
      z.setPointerCapture(e.pointerId);
      const r = z.getBoundingClientRect();
      const m = this.R + 10;
      const x = Math.max(r.left + m, Math.min(r.right - m, e.clientX));
      const y = Math.max(r.top + m, Math.min(r.bottom - m, e.clientY));
      this.origin = { x, y };
      this.base!.classList.add('active');
      this.base!.style.left = `${x - r.left}px`;
      this.base!.style.top = `${y - r.top}px`;
      this.moveJoy(e.clientX, e.clientY);
    });
    z.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joyId) this.moveJoy(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      this.restBase();
      this.syncKeys();
    };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
    z.addEventListener('lostpointercapture', end);
  }

  private moveJoy(cx: number, cy: number) {
    let dx = cx - this.origin.x;
    let dy = cy - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > this.R) {
      dx = (dx / d) * this.R;
      dy = (dy / d) * this.R;
    }
    this.knob!.style.transform = `translate(${dx}px, ${dy}px)`;
    const len = Math.min(d, this.R);
    const m = len / this.R;
    const dead = 0.12;
    if (m < dead) {
      this.input.jx = this.input.jy = 0;
      this.sync();
      return;
    }
    const mag = (m - dead) / (1 - dead);
    this.input.jx = (dx / len) * mag;
    this.input.jy = (dy / len) * mag;
    this.sync();
  }

  /** 十字方向键：按住后手指可以在方向键上滑动换方向，按在两个方向之间就是斜向（足球八方向）。 */
  private bindDpad() {
    const z = this.zone;
    const point = (e: PointerEvent) => {
      const r = this.dpad!.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < r.width * 0.12) { this.setDir(0, 0); return; }
      const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
      const angle = (sector * Math.PI) / 4;
      this.setDir(Math.round(Math.cos(angle)), Math.round(Math.sin(angle)));
    };
    z.addEventListener('pointerdown', (e) => {
      if (this.joyId !== null) return;
      e.preventDefault();
      this.joyId = e.pointerId;
      z.setPointerCapture(e.pointerId);
      point(e);
    });
    z.addEventListener('pointermove', (e) => { if (e.pointerId === this.joyId) point(e); });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      this.lightDpad(0, 0);
      this.syncKeys();
    };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
    z.addEventListener('lostpointercapture', end);
  }

  private setDir(x: number, y: number) {
    const m = Math.hypot(x, y) || 1;
    this.input.jx = x / m;
    this.input.jy = y / m;
    this.lightDpad(x, y);
    this.sync();
  }

  private lightDpad(x: number, y: number) {
    if (!this.dpad) return;
    const on = { up: y < 0, down: y > 0, left: x < 0, right: x > 0 };
    for (const [dir, lit] of Object.entries(on)) this.dpad.querySelector(`.dpad-${dir}`)?.classList.toggle('on', lit);
  }

  private bindButton(el: HTMLElement) {
    const bit = Number(el.dataset.bit);
    if (bit === BTN_B) this.bEl = el;
    const ids = new Set<number>();
    this.pointers.set(el, ids);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      ids.add(e.pointerId);
      if (!(this.touchBtn & bit)) {
        this.touchBtn |= bit;
        this.press(bit);
      }
      el.classList.add('down');
      this.sync();
    });
    const up = (e: PointerEvent) => {
      if (!ids.delete(e.pointerId) || ids.size) return;
      this.touchBtn &= ~bit;
      el.classList.remove('down');
      this.sync();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  private press(bit: number) {
    if (bit === BTN_B) this.bDown = performance.now();
    this.onPress(bit);
  }

  private bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select, button, [role="button"], a[href], [contenteditable]')) return;
      if (KEY_BITS[e.code] || KEY_DIRS[e.code]) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      const bit = KEY_BITS[e.code];
      if (bit && !(this.keyBtn & bit)) {
        this.keyBtn |= bit;
        this.press(bit);
      }
      this.syncKeys();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const bit = KEY_BITS[e.code];
      if (bit && ![...this.keys].some((k) => KEY_BITS[k] === bit)) this.keyBtn &= ~bit;
      this.syncKeys();
    });
  }

  private syncKeys() {
    if (this.joyId === null) {
      let x = 0;
      let y = 0;
      for (const k of this.keys) {
        const d = KEY_DIRS[k];
        if (d) {
          x += d[0];
          y += d[1];
        }
      }
      const m = Math.hypot(x, y) || 1;
      this.input.jx = x / m;
      this.input.jy = y / m;
    }
    this.sync();
  }

  private sync() {
    const btn = this.touchBtn | this.keyBtn;
    const moving = !!(this.input.jx || this.input.jy);
    if (btn === this.input.btn && moving === this.moving) return;
    this.input.btn = btn;
    this.moving = moving;
    this.onButtons();
  }

  /** 每帧调用：更新射门蓄力环 */
  update() {
    if (!this.bEl) return;
    const charge = this.input.btn & BTN_B ? Math.min(1, (performance.now() - this.bDown) / 850) : 0;
    this.bEl.style.setProperty('--charge', String(charge));
  }
}
