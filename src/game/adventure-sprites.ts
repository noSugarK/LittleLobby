import { CHARACTERS } from './adventure';

export type BuddyAction = 'idle' | 'run' | 'jump' | 'fall';
export const SPRITE_CELL = { width: 128, height: 160, baseline: 146, columns: 8, rows: 8 };
const ACTIONS = {
  idle: { row: 0, frames: 4, fps: 4, loop: true },
  run: { row: 1, frames: 8, fps: 12.5, loop: true },
  jump: { row: 2, frames: 2, fps: 10, loop: false },
  fall: { row: 3, frames: 2, fps: 8, loop: false },
};

/** Whole-body PNG frames share a foot anchor, independent of physics. */
export function buddyFrame(action: BuddyAction, seconds: number, facing: number) {
  const animation = ACTIONS[action];
  const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const frame = Math.floor(elapsed * animation.fps);
  const column = animation.loop ? frame % animation.frames : Math.min(animation.frames - 1, frame);
  return { x: column * SPRITE_CELL.width, y: (animation.row + (facing < 0 ? 4 : 0)) * SPRITE_CELL.height, width: SPRITE_CELL.width, height: SPRITE_CELL.height };
}

const sheets = new Map<number, HTMLImageElement>();
let loading: Promise<void> | undefined;
export function loadCharacterSprites(): Promise<void> {
  if (!loading) loading = Promise.all(CHARACTERS.map((character, skin) => new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth !== SPRITE_CELL.width * SPRITE_CELL.columns || image.naturalHeight !== SPRITE_CELL.height * SPRITE_CELL.rows) {
        reject(new Error(`${character.name}的精灵表尺寸不正确`)); return;
      }
      sheets.set(skin, image); resolve();
    };
    image.onerror = () => reject(new Error(`${character.name}的角色图片未能加载，请刷新重试`));
    image.src = `${import.meta.env.BASE_URL}adventure/characters/${character.sprite}-atlas.png`;
  }))).then(() => {}).catch((error) => { loading = undefined; throw error; });
  return loading;
}

export function drawBuddyImage(ctx: CanvasRenderingContext2D, x: number, feet: number, skin: number, action: BuddyAction, seconds: number, facing: number) {
  const sheet = sheets.get(skin) || sheets.get(0);
  if (!sheet) return;
  const frame = buddyFrame(action, seconds, facing);
  ctx.drawImage(sheet, frame.x, frame.y, frame.width, frame.height, x - 32, feet - SPRITE_CELL.baseline * .5, 64, 80);
}

export function drawBuddyAvatar(canvas: HTMLCanvasElement, skin: number) {
  const sheet = sheets.get(skin);
  if (!sheet) return;
  canvas.width = 112; canvas.height = 112;
  canvas.getContext('2d')!.drawImage(sheet, 0, 0, SPRITE_CELL.width, SPRITE_CELL.height, 11, 0, 90, 112);
}
