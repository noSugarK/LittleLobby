import { t, type Key } from '../i18n';
import { MATCH_MODES, PARTY_RULES } from '../game/types';
import { gameName, validGame, type GameId } from '../room/catalog';
import { bindSiteTools, icon, siteFooter, siteTools } from '../ui/site';
import { brand, store } from '../ui/util';
import './home.css';
import './guide.css';

/** 一个按键：圆形键帽 + 名称 + 说明；slot 是这个玩法用不到的空位 */
type PadKey = { key: 'y' | 'x' | 'b' | 'a'; slot?: boolean };
const padArt = (game: GameId, keys: PadKey[]) => `<div class="g-pad g-pad-${game}" aria-hidden="true"><i class="g-stick"></i>${keys.map((k) =>
  `<b class="g-key ${k.key}${k.slot ? ' is-slot' : ''}">${k.key.toUpperCase()}</b>`).join('')}</div>`;
const row = (mark: string, cls: string, name: string, body: string) =>
  `<li><span class="g-mark ${cls}">${mark}</span><b>${name}</b><span>${body}</span></li>`;
const rules = (items: [Key, Key][]) => `<div class="g-rules">${items.map(([name, body]) => `<p><b>${t(name)}</b>${t(body)}</p>`).join('')}</div>`;

/** 玩法教程：三步开玩，然后按玩法切换（按键图 + 说明 + 规则），最后是小提示。默认停在最近玩过的玩法。 */
export function mountGuide(app: HTMLElement) {
  document.title = `${t('guide.title')} · Little Lobby`;
  const asked = new URLSearchParams(location.hash.split('?')[1]).get('game') || store.get('game');
  const first: GameId = validGame(asked) ? asked : 'football';
  const football = `
    <div class="g-controls">
      ${padArt('football', [{ key: 'y' }, { key: 'x' }, { key: 'b' }, { key: 'a' }])}
      <ul class="g-keys">
        ${row(icon.stick, 'stick', t('guide.stick'), t('guide.fb.stick'))}
        ${row('A', 'a', t('guide.fb.a'), t('guide.fb.aBody'))}
        ${row('B', 'b', t('guide.fb.b'), t('guide.fb.bBody'))}
        ${row('X', 'x', t('guide.fb.x'), t('guide.fb.xBody'))}
        ${row('Y', 'y', t('guide.fb.y'), t('guide.fb.yBody'))}
      </ul>
    </div>
    <p class="g-hint">${t('guide.fb.keys')}</p>
    <h3>${t('guide.fb.rules')}</h3>
    ${rules([['guide.fb.fill', 'guide.fb.fillBody'], ['guide.fb.host', 'guide.fb.hostBody'], ['guide.fb.surrender', 'guide.fb.surrenderBody'], ['guide.fb.end', 'guide.fb.endBody']])}
    <h3>${t('cfg.mode')}</h3>
    <div class="g-rules">${MATCH_MODES.map((mode) => `<p><b>${t(`mode.${mode}`)}</b>${t(`mode.hint.${mode}`)}</p>`).join('')}</div>
    <h3>${t('cfg.party')}</h3>
    <p class="g-hint">${t('party.hint.0')}</p>
    <div class="g-rules">${PARTY_RULES.filter((rule) => rule !== 0).map((rule) => `<p><b>${t(`party.${rule}`)}</b>${t(`party.hint.${rule}`)}</p>`).join('')}</div>`;
  const adventure = `
    <div class="g-controls">
      ${padArt('adventure', [{ key: 'y', slot: true }, { key: 'x', slot: true }, { key: 'b' }, { key: 'a' }])}
      <ul class="g-keys">
        ${row(icon.stick, 'stick', t('guide.stick'), t('guide.av.stick'))}
        ${row('B', 'b', t('guide.av.b'), t('guide.av.bBody'))}
        ${row('A', 'a', t('guide.av.a'), t('guide.av.aBody'))}
      </ul>
    </div>
    <p class="g-hint">${t('guide.av.slots')} ${t('guide.av.keys')}</p>
    <h3>${t('guide.av.modes')}</h3>
    ${rules([['guide.av.classic', 'guide.av.classicBody'], ['guide.av.rope', 'guide.av.ropeBody'], ['guide.av.eat', 'guide.av.eatBody'], ['guide.av.stack', 'guide.av.stackBody']])}
    <p class="g-hint">${t('guide.av.coop')}</p>`;
  const panes: Record<GameId, string> = { football, adventure };
  app.innerHTML = `
  <div class="site home g-page">
    <header class="lh-top">
      <div class="g-head">
        <a class="lh-wordmark" href="#/" aria-label="${t('app.name')}"><img class="lh-mark on-light" src="${brand('mark.svg')}" alt="" width="50" height="35"><img class="lh-mark on-dark" src="${brand('mark-light.svg')}" alt="" width="50" height="35"><span>${t('app.name')}<small>Little Lobby</small></span></a>
        <span class="g-crumb">${icon.right}${t('guide.title')}</span>
      </div>
      ${siteTools()}
    </header>
    <main class="lh-main">
      <h1 class="lh-title">${t('guide.title')}</h1>
      <ol class="g-steps">
        <li>${icon.tv}<b>${t('guide.host')}</b><span>${t('guide.hostBody')}</span></li>
        <li>${icon.scan}<b>${t('guide.join')}</b><span>${t('guide.joinBody')}</span></li>
        <li>${icon.pad}<b>${t('guide.play')}</b><span>${t('guide.playBody')}</span></li>
      </ol>
      <div class="g-tabs" role="tablist" aria-label="${t('guide.controls')}">${(Object.keys(panes) as GameId[]).map((id) =>
        `<button type="button" role="tab" id="g-tab-${id}" data-game="${id}" aria-controls="g-pane-${id}" aria-selected="${id === first}">${gameName(id)}</button>`).join('')}</div>
      ${(Object.keys(panes) as GameId[]).map((id) => `<section class="g-pane" role="tabpanel" id="g-pane-${id}" aria-labelledby="g-tab-${id}"${id === first ? '' : ' hidden'}>${panes[id]}</section>`).join('')}
      <h2 class="g-tips-title">${t('guide.tips')}</h2>
      <ul class="g-tips"><li>${t('guide.tip1')}</li><li>${t('guide.tip2')}</li><li>${t('guide.tip3')}</li></ul>
    </main>
    ${siteFooter()}
  </div>`;
  bindSiteTools(app);
  const tabs = [...app.querySelectorAll<HTMLButtonElement>('.g-tabs [data-game]')];
  tabs.forEach((tab) => {
    tab.onclick = () => tabs.forEach((other) => {
      other.setAttribute('aria-selected', String(other === tab));
      app.querySelector<HTMLElement>(`#g-pane-${other.dataset.game}`)!.hidden = other !== tab;
    });
  });
}
