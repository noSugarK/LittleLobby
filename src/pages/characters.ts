import { t } from '../i18n';
import { bindSiteTools, icon, siteFooter, siteTools } from '../ui/site';
import { brand, esc, showMatching } from '../ui/util';
import { canDownload, characterMatches, downloadCharacter, downloadedCharacters, isRemote, loadCatalog, removeCharacter, type Character } from '../game/characters';
import { drawBuddyAvatar, loadCharacterSprites, loadSheet } from '../game/adventure-sprites';
import './home.css';
import './characters.css';

type Filter = 'all' | 'owned' | 'more';

/** 角色图鉴：和首页同一套设计。网页版列出全部角色；原生应用列出线上目录，内置之外的可以下载到本机（局域网里朋友也能用）。 */
export async function mountCharacters(app: HTMLElement) {
  document.title = `${t('chars.title')} · Little Lobby`;
  const download = canDownload();
  app.innerHTML = `
  <div class="site home ch-page">
    <header class="lh-top">
      <div class="ch-head">
        <a class="lh-wordmark" href="#/" aria-label="${t('app.name')}"><img class="lh-mark on-light" src="${brand('mark.svg')}" alt="" width="50" height="35"><img class="lh-mark on-dark" src="${brand('mark-light.svg')}" alt="" width="50" height="35"><span>${t('app.name')}<small>Little Lobby</small></span></a>
        <span class="ch-crumb">${icon.right}${t('chars.title')}</span>
      </div>
      ${siteTools()}
    </header>
    <main class="lh-main">
      <section class="ch-intro">
        <div><h1 class="lh-title">${t('chars.title')}</h1><p class="lh-lede">${t(download ? 'chars.desc' : 'chars.descWeb')}</p></div>
        <div class="ch-tools">
          <label class="ch-search">${icon.search}<input type="search" placeholder="${t('chars.search')}" aria-label="${t('chars.search')}" autocomplete="off"></label>
          ${download ? `<div class="ch-filter" role="radiogroup" aria-label="${t('chars.title')}">${(['all', 'owned', 'more'] as Filter[]).map((f) => `<button type="button" role="radio" data-filter="${f}" aria-checked="${f === 'all'}">${t(`chars.${f}`)} <b></b></button>`).join('')}</div>` : ''}
        </div>
      </section>
      <p class="ch-note" hidden>${t('chars.offline')}</p>
      <div class="ch-grid" aria-live="polite"></div>
      <p class="ch-empty" hidden>${t('chars.empty')}</p>
    </main>
    ${siteFooter()}
  </div>`;
  bindSiteTools(app);
  const $ = <T extends HTMLElement>(s: string) => app.querySelector<T>(s)!;
  const grid = $('.ch-grid'), input = $<HTMLInputElement>('.ch-search input');
  const [catalog, downloaded] = await Promise.all([loadCatalog(), downloadedCharacters(), loadCharacterSprites().catch(() => {})]);
  if (!app.contains(grid)) return;
  $('.ch-note').hidden = catalog.online || !download;
  let owned = new Set([...catalog.builtin, ...downloaded]);
  let filter: Filter = 'all';
  // 联网模式下没下载的角色也能直接用，算「已拥有」；还可以下载下来留着离线 / 局域网用
  const isOwned = (c: Character) => !download || owned.has(c.id) || isRemote(c.id);

  const status = (c: Character) => !download ? `<span class="ch-pill">${t('chars.ready')}</span>`
    : catalog.builtin.includes(c.id) ? `<span class="ch-pill">${t('chars.builtin')}</span>`
    : owned.has(c.id) ? `<span class="ch-pill is-done">${icon.check}${t('chars.downloaded')}</span><button type="button" class="ch-remove" data-remove="${c.id}">${t('chars.remove')}</button>`
    : isRemote(c.id) ? `<span class="ch-pill">${t('chars.online')}</span><button type="button" class="ch-remove" data-get="${c.id}">${t('chars.keep')}</button>`
    : `<button type="button" class="ch-get" data-get="${c.id}">${icon.download}${t('chars.download')}</button>`;
  const card = (c: Character) => `<article class="ch-card" data-id="${c.id}" style="--ch-accent:${c.accent}">
      <div class="ch-art"><canvas width="112" height="112" aria-hidden="true"></canvas></div>
      <h2>${esc(c.name)}</h2>
      <p class="ch-origin">${esc(c.origin)}</p>
      <p class="ch-desc">${esc(c.description)}</p>
      <div class="ch-foot">${status(c)}</div>
    </article>`;
  grid.innerHTML = catalog.list.map(card).join('');
  // 本机已有的直接画；没下载的从线上目录读精灵表预览
  for (const c of catalog.list) {
    const canvas = grid.querySelector<HTMLCanvasElement>(`[data-id="${c.id}"] canvas`)!;
    if (isOwned(c) && !download) drawBuddyAvatar(canvas, c.id);
    else loadSheet(`${catalog.base}${c.id}/atlas.png`, c.name).then((sheet) => drawBuddyAvatar(canvas, c.id, 'idle', 0, 1, sheet)).catch(() => drawBuddyAvatar(canvas, c.id));
  }

  const apply = () => {
    showMatching(grid.querySelectorAll<HTMLElement>('.ch-card'), (el) => {
      const c = catalog.list.find((x) => x.id === el.dataset.id)!;
      return characterMatches(c, input.value) && (filter === 'all' || (filter === 'owned') === isOwned(c));
    }, $('.ch-empty'));
    app.querySelectorAll<HTMLElement>('[data-filter]').forEach((b) => {
      const f = b.dataset.filter as Filter;
      b.setAttribute('aria-checked', String(f === filter));
      b.querySelector('b')!.textContent = String(catalog.list.filter((c) => f === 'all' || (f === 'owned') === isOwned(c)).length);
    });
  };
  const refresh = (id: string) => {
    const c = catalog.list.find((x) => x.id === id)!;
    grid.querySelector(`[data-id="${id}"] .ch-foot`)!.innerHTML = status(c);
    apply();
  };
  input.oninput = apply;
  app.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => { b.onclick = () => { filter = b.dataset.filter as Filter; apply(); }; });
  grid.addEventListener('click', async (e) => {
    const get = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-get]');
    const remove = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-remove]');
    if (get) {
      const id = get.dataset.get!, foot = get.parentElement!;
      foot.innerHTML = `<div class="ch-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span>${t('chars.downloading', { n: 0 })}</span><i></i></div>`;
      const bar = foot.querySelector<HTMLElement>('.ch-progress')!;
      try {
        await downloadCharacter(id, (done) => {
          const n = Math.round(done * 100);
          bar.style.setProperty('--p', `${n}%`); bar.setAttribute('aria-valuenow', String(n));
          bar.querySelector('span')!.textContent = t('chars.downloading', { n });
        });
        owned = new Set([...owned, id]);
        await loadCharacterSprites().catch(() => {});
      } catch {
        foot.innerHTML = `<p class="ch-error">${t('chars.failed')}</p>`;
        setTimeout(() => refresh(id), 2400);
        return;
      }
      refresh(id);
    } else if (remove) {
      const id = remove.dataset.remove!;
      remove.disabled = true;
      await removeCharacter(id).catch(() => {});
      owned.delete(id); owned = new Set(owned);
      refresh(id);
    }
  });
  apply();
}
