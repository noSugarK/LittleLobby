/** 角色以 public/characters/<id>/ 文件夹分发：character.json + atlas.png + full-atlas.png，清单在 characters/index.json。
 *  网页版和局域网页面直接按路径读取（局域网主机会把自己下载过的角色一起提供）；原生应用只内置 builtin 里的几位，
 *  其余从角色图鉴下载到应用数据目录，通过 Rust 命令读写；联网模式下直接用网页版的完整角色。规范见 public/characters/README.md。 */
import { lang } from '../i18n';
import { store } from '../ui/util';
/** character.json 里的文案都按语言写：zh-CN 和 en 必填，zh-TW 可省略（回退到 zh-CN）。 */
export type LocalText = { 'zh-CN': string; 'zh-TW'?: string; en: string };
const FIELDS = ['name', 'subtitle', 'description', 'origin'] as const;
/** 读进来以后按当前语言取好的角色；search 含所有语言，方便用中英文都能搜到。 */
export interface Character { id: string; accent: string; name: string; subtitle: string; description: string; origin: string; look: string; search: string }
interface Manifest { builtin: string[]; characters: string[] }
export type CharacterFile = 'character.json' | 'atlas.png' | 'full-atlas.png';

export const DEFAULT_SKIN = 'yier';
/** 网页版发布的完整角色目录；原生应用从这里下载新角色。 */
// 开发时（含 npm run dev:app）从本地开发服务器下载，方便调试
export const CATALOG_URL = import.meta.env?.DEV ? `${import.meta.env.BASE_URL}characters/` : 'https://nosugark.github.io/LittleLobby/characters/';
/** 本机可用的角色（清单顺序）；loadCharacters() 之后才有内容。 */
export const CHARACTERS: Character[] = [];
// 旧版本按序号存角色，换成 id 时按原来的顺序对应回来
const LEGACY = ['yier', 'bubu', 'xiaobai', 'jinmao'];

export const validSkin = (skin: unknown): skin is string => typeof skin === 'string' && /^[a-z0-9-]{1,32}$/.test(skin);
export const legacySkin = (value: string | null) => /^\d+$/.test(value || '') ? LEGACY[Number(value)] : value;
/** 不认识的角色（别人选了本机没有的）用默认角色代替。 */
export const characterOf = (id: string) => CHARACTERS.find((c) => c.id === id) || CHARACTERS.find((c) => c.id === DEFAULT_SKIN) || CHARACTERS[0];
export const characterMatches = (c: Character, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || c.search.includes(q);
};

const native = () => (globalThis as { __TAURI__?: { core: { invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> } } }).__TAURI__?.core;
const urls = new Map<string, Record<CharacterFile, string>>();
const metas = new Map<string, unknown>(); // 已下载角色的 character.json，读出来就解析好
const remote = new Set<string>();
/** 角色文件的地址：内置或网页里的走相对路径，原生应用下载的角色读出来转成 blob 地址，联网模式下没下载的直接读线上。 */
export const characterUrl = (id: string, file: CharacterFile) => urls.get(id)?.[file]
  || (remote.has(id) ? `${CATALOG_URL}${id}/${file}` : `${import.meta.env.BASE_URL}characters/${id}/${file}`);
/** 原生应用的联网模式：和网页版一样用完整角色；局域网 / 离线模式只用内置和已下载的。 */
const onlineApp = () => !!native() && store.get('network') === 'online';

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json() as Promise<T>;
}

const localText = (value: unknown): LocalText | null => {
  const v = value as Partial<LocalText> | null;
  return v && typeof v === 'object' && typeof v['zh-CN'] === 'string' && typeof v.en === 'string' && (v['zh-TW'] === undefined || typeof v['zh-TW'] === 'string') ? v as LocalText : null;
};
const pick = (text: LocalText) => (lang === 'zh-TW' ? text['zh-TW'] || text['zh-CN'] : text[lang]) || text.en;

export function parseCharacter(data: unknown, id: string): Character {
  const c = (data || {}) as Record<string, unknown>;
  const texts = FIELDS.map((f) => localText(c[f]));
  if (c.id !== id || !validSkin(id) || typeof c.accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(c.accent) || texts.some((x) => !x) || !texts[0]!['zh-CN'] || !texts[0]!.en) {
    throw new Error(`角色 ${id} 的 character.json 不符合规范`);
  }
  const [name, subtitle, description, origin] = texts.map((x) => pick(x!));
  const search = [id, ...texts.flatMap((x) => Object.values(x!))].join(' ').toLowerCase();
  return { id, accent: c.accent, name: name.slice(0, 12), subtitle, description, origin, look: String(c.look || ''), search };
}

let loading: Promise<Character[]> | undefined;
export function loadCharacters(): Promise<Character[]> {
  if (!loading) loading = (async () => {
    const manifest = await json<Manifest>(`${import.meta.env.BASE_URL}characters/index.json`);
    const ids = [...manifest.characters];
    const invoke = native()?.invoke;
    if (invoke) {
      for (const id of await invoke<string[]>('list_characters')) {
        if (ids.includes(id) || !validSkin(id)) continue;
        ids.push(id);
        if (urls.has(id)) continue;
        const read = async (file: CharacterFile) => new Uint8Array(await invoke<ArrayBuffer>('character_file', { id, file }));
        const [meta, atlas, full] = await Promise.all((['character.json', 'atlas.png', 'full-atlas.png'] as const).map(read));
        const blob = (bytes: Uint8Array, type: string) => URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
        metas.set(id, JSON.parse(new TextDecoder().decode(meta)));
        urls.set(id, { 'character.json': blob(meta, 'application/json'), 'atlas.png': blob(atlas, 'image/png'), 'full-atlas.png': blob(full, 'image/png') });
      }
    }
    if (onlineApp()) {
      try {
        for (const id of (await json<Manifest>(`${CATALOG_URL}index.json`)).characters) {
          if (!validSkin(id) || ids.includes(id)) continue;
          ids.push(id); remote.add(id);
        }
      } catch { /* 连不上线上目录就先用本机角色 */ }
    }
    const list = await Promise.all(ids.map(async (id) => {
      try { return parseCharacter(metas.get(id) ?? await json(characterUrl(id, 'character.json')), id); }
      catch { return null; } // 坏掉的下载不拖累其他角色
    }));
    CHARACTERS.splice(0, CHARACTERS.length, ...list.filter((c): c is Character => !!c));
    if (!CHARACTERS.length) throw new Error('没有可用的角色');
    return CHARACTERS;
  })().catch((error) => { loading = undefined; throw error; });
  return loading;
}

/** 下载或删除角色后重新读取本机角色。 */
export function reloadCharacters() { loading = undefined; return loadCharacters(); }

/** 角色图鉴用的完整目录：网页版就是本站清单；原生应用读网页版的线上清单，离线时退回本机角色。 */
export async function loadCatalog(): Promise<{ list: Character[]; builtin: string[]; base: string; online: boolean }> {
  const base = native() ? CATALOG_URL : `${import.meta.env.BASE_URL}characters/`;
  try {
    const manifest = await json<Manifest>(`${base}index.json`);
    const list = await Promise.all(manifest.characters.filter(validSkin).map(async (id) => parseCharacter(await json(`${base}${id}/character.json`), id)));
    return { list, builtin: manifest.builtin, base, online: true };
  } catch {
    return { list: [...await loadCharacters()], builtin: LEGACY, base: `${import.meta.env.BASE_URL}characters/`, online: false };
  }
}

/** 原生应用：从线上目录下载一个角色存到本机。 */
export async function downloadCharacter(id: string, onProgress?: (done: number) => void) {
  const invoke = native()?.invoke;
  if (!invoke || !validSkin(id)) throw new Error('只有应用里需要下载角色');
  let done = 0;
  const get = async (file: CharacterFile) => {
    const response = await fetch(`${CATALOG_URL}${id}/${file}`);
    if (!response.ok) throw new Error(`下载 ${file} 失败`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress?.(++done / 3);
    return bytes;
  };
  const [meta, atlas, full] = await Promise.all([get('character.json'), get('atlas.png'), get('full-atlas.png')]);
  parseCharacter(JSON.parse(new TextDecoder().decode(meta)), id);
  await invoke('save_character', { id, meta: new TextDecoder().decode(meta), atlas: [...atlas], full: [...full] });
  await reloadCharacters();
}

export async function removeCharacter(id: string) {
  await native()?.invoke('delete_character', { id });
  urls.delete(id); metas.delete(id);
  await reloadCharacters();
}

/** 只有原生应用需要下载角色；网页版和局域网页面的角色都直接可用。 */
export const canDownload = () => !!native();
export const downloadedCharacters = async () => (await native()?.invoke<string[]>('list_characters')) || [];
