import { t } from '../i18n';
import { esc } from './util';
import { icon } from './site';

/** 加入卡片：每个游戏同一个结构，只换配色（见 DESIGN.md）。顶上玩法名 + 房间码（上锁带锁），
 *  中间昵称、密码（只在房间上锁时出现）和这个玩法自己的一行选择（开踢选队、冒险选角色），
 *  底部一个主按钮，其余操作是文字链接。类名 .name / .pin / .go / .return-home 供各页面绑定。 */
export interface JoinCard {
  title: string;
  /** 房间码；手机开房还没有房间时省略，改显示 note */
  room?: string;
  note?: string;
  name: string;
  /** 房间有密码（已知时）：房间码旁带锁 */
  locked: boolean;
  /** 密码框：预填的值；show 为 false 时先藏着，被拒后再显示 */
  pin: { value: string; show: boolean };
  /** 玩法自己的一行：标签 + 控件 */
  pick?: { label: string; html: string };
  go: string;
  /** 主按钮下的文字链接，如 [['watch-go', '只观战'], ['return-home', '回首页']] */
  links: [string, string][];
  hidden?: boolean;
}

export const joinCardHtml = (c: JoinCard) => `<div class="join card"${c.hidden ? ' hidden' : ''}>
  <div class="join-head"><h1>${esc(c.title)}</h1>${c.room ? `<span class="join-code">${c.locked ? icon.lock : ''}${esc(c.room)}</span>` : ''}</div>
  ${c.note ? `<p class="join-note">${esc(c.note)}</p>` : ''}
  <label class="join-field"><span>${t('play.name')}</span><input class="name" maxlength="12" autocomplete="nickname" value="${esc(c.name)}" placeholder="${t('play.name')}"></label>
  <label class="join-field"${c.pin.show ? '' : ' hidden'}><span>${t('play.pin')}</span><input class="pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" value="${esc(c.pin.value)}"${c.pin.show ? '' : ' hidden'}></label>
  ${c.pick ? `<div class="join-pick"><span>${esc(c.pick.label)}</span>${c.pick.html}</div>` : ''}
  <button class="primary go">${esc(c.go)}</button>
  <div class="join-links">${c.links.map(([cls, label]) => `<button type="button" class="join-link ${cls}">${esc(label)}</button>`).join('')}</div>
</div>`;

/** 房主加载失败时卡片只留重试和回首页：藏起昵称和玩法那一行 */
export function retryOnly(card: HTMLElement) {
  showField(card.querySelector<HTMLInputElement>('.name')!, false);
  card.querySelector<HTMLElement>('.join-pick')?.setAttribute('hidden', '');
}

/** 显示或藏起一个输入框连同它的标签（如密码被拒后要求重新输入） */
export function showField(input: HTMLInputElement, visible: boolean) {
  input.hidden = !visible;
  if (input.parentElement) input.parentElement.hidden = !visible;
}
