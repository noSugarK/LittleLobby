import './style.css';
import { mountHome } from './pages/home';
import { mountPlay } from './pages/play';
import { mountScreen } from './pages/screen';
import { normalizeCode } from './ui/util';

const app = document.getElementById('app')!;

function route() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [page, arg] = path.split('/');
  if (page === 'screen') mountScreen(app);
  else if (page === 'host') mountPlay(app, { kind: 'host' });
  else if (page === 'join' && arg) {
    const q = new URLSearchParams(query);
    mountPlay(app, { kind: 'client', room: normalizeCode(arg), forceRelay: q.has('relay'), pin: q.get('pin') ?? '', lock: q.has('lock') });
  } else mountHome(app);
}

// 页面各自持有网络连接与定时器，切换路由时直接整页重载最稳妥
window.addEventListener('hashchange', () => location.reload());
route();

// iOS Safari 双指缩放
document.addEventListener('gesturestart', (e) => e.preventDefault());
