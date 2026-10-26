export const GAMES = [
  { id: 'football', name: '开踢', caption: '传球、射门，和朋友来一场', icon: '⚽', players: '1–8 人 · 组队对战' },
  { id: 'adventure', name: '软乎乎冒险', caption: '挑个小伙伴，一起跳跳闯关', icon: '✦', players: '1–8 人 · 合作闯关' },
] as const;
export type GameId = typeof GAMES[number]['id'];
export const validGame = (value: unknown): value is GameId => GAMES.some((game) => game.id === value);
export const gameInfo = (id: GameId) => GAMES.find((game) => game.id === id)!;
