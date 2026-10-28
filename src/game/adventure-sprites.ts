import { DEFAULT_SKIN, characterOf, characterUrl, loadCharacters, type SkinId } from './characters';

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

/** 每个角色两张精灵表：平时的样子，以及吃吐吐里含着队友时的大肚肚样子（key 加 :full）。
 *  都按需加载：页面只等自己选的角色，别人的角色和大肚肚图画到时才下载，没到之前先用已有的造型顶上。 */
const sheets = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();
const failedAt = new Map<string, number>();
/** 绘制时遇到坏图不要每帧重试，隔一会儿再试；点「重试」不受限制 */
const RETRY_MS = 15000;
/** 只防连接卡死：一次只等一两张图，慢网也够用 */
const STALL_MS = 60000;
export function loadSheet(url: string, name: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new Error(`${name}的角色图片加载超时，请重试`)), STALL_MS);
    image.onload = () => {
      clearTimeout(timer);
      if (image.naturalWidth !== SPRITE_CELL.width * SPRITE_CELL.columns || image.naturalHeight !== SPRITE_CELL.height * SPRITE_CELL.rows) {
        reject(new Error(`${name}的精灵表尺寸不正确`)); return;
      }
      resolve(image);
    };
    image.onerror = () => { clearTimeout(timer); reject(new Error(`${name}的角色图片未能加载，请重试`)); };
    image.src = url;
  });
}
function requestSheet(id: SkinId, full = false, retry = false): Promise<HTMLImageElement> {
  const key = id + (full ? ':full' : '');
  const ready = sheets.get(key);
  if (ready) return Promise.resolve(ready);
  let request = pending.get(key);
  if (request) return request;
  const name = characterOf(id)?.name ?? id;
  if (!retry && Date.now() - (failedAt.get(key) ?? -Infinity) < RETRY_MS) return Promise.reject(new Error(`${name}的角色图片未能加载，请重试`));
  request = loadSheet(characterUrl(id, full ? 'full-atlas.png' : 'atlas.png'), name)
    .then((image) => { sheets.set(key, image); failedAt.delete(key); return image; }, (error) => { failedAt.set(key, Date.now()); throw error; })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
export const hasSheet = (id: SkinId) => sheets.has(id);
/** 读本机角色清单，再加载指定角色的普通精灵表（总会带上默认角色，别人的角色没到时用它顶上）。
 *  失败的图片再调用时会重新下载；只要有一张普通造型可用就能玩。 */
export async function loadCharacterSprites(ids: SkinId[] = []): Promise<void> {
  await loadCharacters();
  const wanted = [...new Set([...ids.map((id) => characterOf(id)?.id).filter((id): id is SkinId => !!id), DEFAULT_SKIN])];
  const results = await Promise.allSettled(wanted.map((id) => requestSheet(id, false, true)));
  if (![...sheets.keys()].some((key) => !key.endsWith(':full'))) {
    const failed = results.find((result) => result.status === 'rejected');
    throw failed?.status === 'rejected' ? failed.reason : new Error('没有可用的角色图片，请重试');
  }
}

/** 角色自己的图，没有就开始下载并返回已有的造型 */
function sheetOf(skin: string) {
  const id = characterOf(skin)?.id ?? DEFAULT_SKIN;
  const own = sheets.get(id);
  if (own) return own;
  requestSheet(id).catch(() => {});
  return sheets.get(DEFAULT_SKIN) || [...sheets].find(([key]) => !key.endsWith(':full'))?.[1];
}

export function drawBuddyImage(ctx: CanvasRenderingContext2D, x: number, feet: number, skin: string, action: BuddyAction, seconds: number, facing: number, full = false) {
  const normal = sheetOf(skin);
  const id = characterOf(skin)?.id;
  const fat = full && id ? sheets.get(`${id}:full`) : undefined;
  if (full && id && !fat) requestSheet(id, true).catch(() => {});
  const sheet = fat || normal;
  if (!sheet) return;
  const frame = buddyFrame(action, seconds, facing);
  // 大肚肚帧为了塞进同样的格子缩得更小，画大两成让头身和平时一样大，脚底对齐
  const k = fat ? 1.2 : 1;
  ctx.drawImage(sheet, frame.x, frame.y, frame.width, frame.height, x - 32 * k, feet - SPRITE_CELL.baseline * .5 * k, 64 * k, 80 * k);
}

/** 头像画布：默认画待机第一帧；首页的互动角色会传入动作和时间来播放待机 / 跑步 / 跳跃帧。传 sheet 可以直接画还没下载的角色。
 *  角色图还没到时先空着，下载好再补画；下载失败画默认角色。 */
export function drawBuddyAvatar(canvas: HTMLCanvasElement, skin: string, action: BuddyAction = 'idle', seconds = 0, facing = 1, sheet?: HTMLImageElement) {
  const id = characterOf(skin)?.id ?? DEFAULT_SKIN;
  const image = sheet || sheets.get(id);
  if (!image) {
    if (canvas.dataset.waiting === id) return;
    canvas.dataset.waiting = id;
    requestSheet(id).then((own) => own, () => sheetOf(skin)).then((next) => {
      if (canvas.dataset.waiting !== id) return;
      delete canvas.dataset.waiting;
      if (next) drawBuddyAvatar(canvas, skin, action, seconds, facing, next);
    });
    return;
  }
  delete canvas.dataset.waiting;
  canvas.width = 112; canvas.height = 112;
  const frame = buddyFrame(action, seconds, facing);
  canvas.getContext('2d')!.drawImage(image, frame.x, frame.y, frame.width, frame.height, 11, 0, 90, 112);
}
