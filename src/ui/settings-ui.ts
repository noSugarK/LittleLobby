import { CONFIG } from '../config';
import { LEVEL_NAME } from '../game/ai';
import { TEAM_NAME } from '../game/render';
import { t } from '../i18n';
import { DURATIONS, type PlayerInfo, type Settings, type Team } from '../game/types';

export interface SettingsActions {
  settings(patch: Partial<Settings>): void;
  bot(team: Team, delta: 1 | -1): void;
}

/** 球员状态标签：AI / 掉线 / 直连 / 中继（本机球员不显示） */
export function playerTag(p: PlayerInfo): string {
  if (p.bot) return 'AI';
  if (!p.online) return t('status.offline');
  if (p.link === 'local') return '';
  return t(p.link === 'p2p' ? 'status.p2p' : 'status.relay');
}

/** 房间密码一行；没有密码时为空 */
export function pinLineHtml(pin: string): string {
  return pin ? `<div class="pin-line">${t('play.pinLine')} <b>${pin}</b></div>` : '';
}

/** 比赛设置 + 每队 AI 增减（大屏大厅和手机面板共用） */
export function settingsHtml(st: Settings, players: PlayerInfo[]): string {
  const opt = (v: number, label: string, cur: number) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  const step = (team: Team) => {
    const bots = players.filter((p) => p.team === team && p.bot).length;
    const humans = players.filter((p) => p.team === team && !p.bot).length;
    const full = bots + humans >= CONFIG.maxPerTeam;
    return `<div class="ai-step t${team}"><span>${t('cfg.ai', { team: TEAM_NAME[team] })}</span>
      <button data-team="${team}" data-d="-1" ${bots <= 0 ? 'disabled' : ''}>−</button><b>${bots}</b>
      <button data-team="${team}" data-d="1" ${full ? 'disabled' : ''}>＋</button></div>`;
  };
  return `<div class="cfg">
      <select data-k="duration">${DURATIONS.map((v) => opt(v, t('play.minutes', { n: v / 60 }), st.duration)).join('')}</select>
      <select data-k="level">${LEVEL_NAME.map((n, i) => opt(i, `AI ${n}`, st.level)).join('')}</select>
      <label class="check"><input type="checkbox" data-k="autoFill" ${st.autoFill ? 'checked' : ''}> ${t('cfg.autoFill')}</label>
    </div>
    <div class="ai-row">${step(0)}${step(1)}</div>`;
}

export function bindSettings(root: HTMLElement, act: SettingsActions) {
  root.querySelectorAll<HTMLSelectElement>('.cfg select').forEach((el) => {
    el.onchange = () => act.settings({ [el.dataset.k!]: Number(el.value) });
  });
  const fill = root.querySelector<HTMLInputElement>('.cfg [data-k="autoFill"]');
  if (fill) fill.onchange = () => act.settings({ autoFill: fill.checked });
  root.querySelectorAll<HTMLButtonElement>('.ai-step button').forEach((b) => {
    b.onclick = () => act.bot(Number(b.dataset.team) as Team, Number(b.dataset.d) as 1 | -1);
  });
}
