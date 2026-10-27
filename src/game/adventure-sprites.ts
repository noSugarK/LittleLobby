import { CHARACTERS, DEFAULT_SKIN, characterOf, characterUrl, loadCharacters } from './characters';

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

/** 每个角色两张精灵表：平时的样子，以及吃吐吐里含着队友时的大肚肚样子（key 加 :full）。 */
const sheets = new Map<string, HTMLImageElement>();
export function loadSheet(url: string, name: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth !== SPRITE_CELL.width * SPRITE_CELL.columns || image.naturalHeight !== SPRITE_CELL.height * SPRITE_CELL.rows) {
        reject(new Error(`${name}的精灵表尺寸不正确`)); return;
      }
      resolve(image);
    };
    image.onerror = () => reject(new Error(`${name}的角色图片未能加载，请刷新重试`));
    image.src = url;
  });
}
let loading: Promise<void> | undefined;
/** 先读本机角色清单，再加载每个角色的两张精灵表；角色有增减时再调用会补齐新的。 */
export function loadCharacterSprites(): Promise<void> {
  if (!loading) loading = loadCharacters().then((list) => Promise.all(list.flatMap((character) => (['', ':full'] as const)
    .filter((variant) => !sheets.has(character.id + variant))
    .map(async (variant) => { sheets.set(character.id + variant, await loadSheet(characterUrl(character.id, variant ? 'full-atlas.png' : 'atlas.png'), character.name)); }))))
    .then(() => {}).finally(() => { loading = undefined; });
  return loading;
}

const sheetOf = (skin: string) => sheets.get(characterOf(skin)?.id ?? DEFAULT_SKIN) || sheets.get(DEFAULT_SKIN) || sheets.get(CHARACTERS[0]?.id);

export function drawBuddyImage(ctx: CanvasRenderingContext2D, x: number, feet: number, skin: string, action: BuddyAction, seconds: number, facing: number, full = false) {
  const normal = sheetOf(skin);
  const fat = full ? sheets.get(`${characterOf(skin)?.id}:full`) : undefined;
  const sheet = fat || normal;
  if (!sheet) return;
  const frame = buddyFrame(action, seconds, facing);
  // 大肚肚帧为了塞进同样的格子缩得更小，画大两成让头身和平时一样大，脚底对齐
  const k = fat ? 1.2 : 1;
  ctx.drawImage(sheet, frame.x, frame.y, frame.width, frame.height, x - 32 * k, feet - SPRITE_CELL.baseline * .5 * k, 64 * k, 80 * k);
}

/** 头像画布：默认画待机第一帧；首页的互动角色会传入动作和时间来播放待机 / 跑步 / 跳跃帧。传 sheet 可以直接画还没下载的角色。 */
export function drawBuddyAvatar(canvas: HTMLCanvasElement, skin: string, action: BuddyAction = 'idle', seconds = 0, facing = 1, sheet = sheetOf(skin)) {
  if (!sheet) return;
  canvas.width = 112; canvas.height = 112;
  const frame = buddyFrame(action, seconds, facing);
  canvas.getContext('2d')!.drawImage(sheet, frame.x, frame.y, frame.width, frame.height, 11, 0, 90, 112);
}
