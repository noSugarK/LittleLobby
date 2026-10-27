import { defineConfig, type Plugin } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import os from 'node:os';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// 开发时大屏若用 localhost 打开，二维码需要换成局域网 IP 才能被手机访问
function lanIp(): string {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal && !ni.address.startsWith('169.254.')) return ni.address;
    }
  }
  return '';
}

// 原生应用只内置清单里 builtin 的角色，其余在角色图鉴里下载；网页版保留全部角色。
// 开发应用（npm run dev:app）时同样只提供内置角色，完整目录放在 /catalog/ 下，供本地调试下载
function appCharacters(): Plugin {
  const manifest = () => JSON.parse(readFileSync('public/characters/index.json', 'utf8')) as { builtin: string[]; characters: string[] };
  return {
    name: 'app-characters',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] || '';
        if (path.startsWith('/catalog/')) { req.url = req.url!.replace('/catalog/', '/characters/'); return next(); }
        if (path === '/characters/index.json') { const m = manifest(); res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ ...m, characters: m.builtin })); }
        const id = path.match(/^\/characters\/([^/]+)\//)?.[1];
        if (id && !manifest().builtin.includes(id)) { res.statusCode = 404; return res.end(); }
        next();
      });
    },
    writeBundle({ dir = 'dist' }) {
      const file = join(dir, 'characters', 'index.json');
      const manifest = JSON.parse(readFileSync(file, 'utf8')) as { builtin: string[]; characters: string[] };
      for (const id of manifest.characters) if (!manifest.builtin.includes(id)) rmSync(join(dir, 'characters', id), { recursive: true, force: true });
      writeFileSync(file, JSON.stringify({ ...manifest, characters: manifest.builtin }, null, 2) + '\n');
    },
  };
}

export default defineConfig(({ command, mode }) => ({
  // 相对路径 + hash 路由：部署到 GitHub Pages 任意仓库名下都能直接用
  base: './',
  // 手机端的屏幕常亮、全屏等能力需要 HTTPS；NO_HTTPS=1 可关闭（本机调试用）
  plugins: mode === 'app' ? [appCharacters()] : command === 'serve' && !process.env.NO_HTTPS ? [basicSsl()] : [],
  define: {
    __DEV_LAN_IP__: JSON.stringify(command === 'serve' ? lanIp() : ''),
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: { target: 'es2020' },
}));
