import { store } from '../ui/util';
export const GAMES = [
  { id: 'football', name: '开踢', caption: '传球、射门，和朋友来一场', icon: '⚽', players: '1–8 人 · 组队对战' },
  { id: 'adventure', name: '软乎乎冒险', caption: '挑个小伙伴，一起跳跳闯关', icon: '✦', players: '1–8 人 · 合作闯关' },
] as const;
export type GameId = typeof GAMES[number]['id'];
export const validGame = (value: unknown): value is GameId => GAMES.some((game) => game.id === value);
export const gameInfo = (id: GameId) => GAMES.find((game) => game.id === id)!;

/** 房主切换玩法：保留房间码整页重开；已加入的伙伴自动重连，按主机 welcome 里的玩法跳到对应页面。 */
export function switchHostGame(game: GameId) {
  if (!confirm(`换成「${gameInfo(game).name}」会结束当前这一局，房间和伙伴都保留。确定吗？`)) return;
  store.set('littlelobby.game', game);
  store.set('sfb.hosting', '1', false); // 足球手机房主重开后自动进房
  location.reload();
}
