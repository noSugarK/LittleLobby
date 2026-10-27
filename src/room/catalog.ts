import { t } from '../i18n';
import { store } from '../ui/util';
import { askConfirm } from '../ui/confirm';
/** 游戏的名字、简介和人数说明在 i18n 的 game.<id>.* 里 */
export const GAMES = [{ id: 'football' }, { id: 'adventure' }] as const;
export type GameId = typeof GAMES[number]['id'];
export const validGame = (value: unknown): value is GameId => GAMES.some((game) => game.id === value);
export const gameName = (id: GameId) => t(`game.${id}.name`);
export const gameInfo = (id: GameId) => ({ id, name: gameName(id), caption: t(`game.${id}.caption`), players: t(`game.${id}.players`) });

/** 房主切换玩法：保留房间码整页重开；已加入的伙伴自动重连，按主机 welcome 里的玩法跳到对应页面。 */
export async function switchHostGame(game: GameId) {
  if (!(await askConfirm(t('game.switchConfirm', { game: gameName(game) })))) return;
  store.set('game', game);
  store.set('hosting', '1', false); // 足球手机房主重开后自动进房
  location.reload();
}
