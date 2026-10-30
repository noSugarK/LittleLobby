import { t } from '../i18n';
import { lanSession, setLanAddress } from '../net/lan-session';
import { esc } from './util';

const hostPort = (url: string) => url.replace(/^http:\/\//, '');

export function lanInfoHtml() {
  const session = lanSession();
  if (!session) return '';
  if (!session.addresses.length) return `<div class="lan-info"><p class="lan-warn">${t('lan.noAddress')}</p></div>`;
  // 地址直接写出来，扫不了码的人照着输入；多块网卡时才给切换
  return `<div class="lan-info"><b class="mono lan-addr">${esc(hostPort(session.baseUrl))}</b>
    ${session.addresses.length > 1 ? `<select class="lan-address" aria-label="${t('lan.address')}" title="${t('lan.address')}">${session.addresses.map((a) =>
      `<option value="${esc(a.url)}" ${a.url === session.baseUrl ? 'selected' : ''}>${esc(a.name)} · ${esc(hostPort(a.url))}</option>`).join('')}</select>` : ''}</div>`;
}

export function bindLanAddress(root: HTMLElement, changed: () => void) {
  const select = root.querySelector<HTMLSelectElement>('.lan-address');
  if (select) select.onchange = () => {
    setLanAddress(select.value);
    root.querySelector('.lan-addr')!.textContent = hostPort(select.value);
    changed();
  };
}
