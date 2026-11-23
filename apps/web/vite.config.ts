import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? listFiles(p) : [p]; });

const resolveUrl = (fromUrl: string, spec: string): string => {
  const parts = `${fromUrl.slice(0, fromUrl.lastIndexOf('/') + 1)}${spec}`.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return `/${out.join('/')}`;
};

const cleanUrl = (file: string): string => {
  const bare = file.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  return bare.length > 1 ? bare.replace(/\/+$/, '') : '/';
};

const isRefreshable = (url: string): boolean => url === '/pool.json' || /^\/pool-\d+\.json$/.test(url);

const staticAssets = (dist: string): Set<string> => {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const seen = new Set<string>();
  const queue = [...html.matchAll(/\s(?:src|href)="(\/[^"]+)"/g)].map(m => m[1]);
  while (queue.length > 0) {
    const url = queue.pop();
    if (url === undefined || seen.has(url)) continue;
    const file = join(dist, url);
    if (!existsSync(file) || !statSync(file).isFile()) continue;
    seen.add(url);
    if (!url.endsWith('.js')) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bfrom\s*["'](\.[^"']+)["']|\bimport\s*["'](\.[^"']+)["']/g)) {
      const spec = match[1] ?? match[2];
      if (spec !== undefined) queue.push(resolveUrl(url, spec));
    }
  }
  return seen;
};

const offlineServiceWorker = (): Plugin => ({
  name: 'offline-service-worker',
  apply: 'build',
  closeBundle() {
    const dist = new URL('./dist/', import.meta.url).pathname;
    const files = listFiles(dist).map(f => `/${relative(dist, f)}`).filter(f => f !== '/sw.js').sort();
    const hash = createHash('sha256');
    for (const f of files) hash.update(readFileSync(join(dist, f)));
    const version = hash.digest('hex').slice(0, 16);
    const linked = staticAssets(dist);
    const precache = [...new Set(['/', ...files.filter(f => !isRefreshable(f) && (linked.has(f) || !f.startsWith('/assets/'))).map(cleanUrl)])];
    const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8');
    writeFileSync(join(dist, 'sw.js'), template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache)));
  },
});

const cleanUrlPreview = (): Plugin => ({
  name: 'clean-url-preview',
  apply: (_, env) => env.isPreview === true,
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = (req.url ?? '/').split('?')[0] ?? '/';
      if (!/\.html$/.test(path)) return next();
      res.statusCode = 308;
      res.setHeader('Location', cleanUrl(path));
      res.end();
    });
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), offlineServiceWorker(), cleanUrlPreview()],
  build: {
    sourcemap: false,
    target: 'es2022',
    modulePreload: false,
  },
  server: { fs: { allow: ['../..'] } },
});
