import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? listFiles(p) : [p]; });

const offlineServiceWorker = (): Plugin => ({
  name: 'offline-service-worker',
  apply: 'build',
  closeBundle() {
    const dist = new URL('./dist/', import.meta.url).pathname;
    const files = listFiles(dist).map(f => `/${relative(dist, f)}`).filter(f => f !== '/sw.js').sort();
    const hash = createHash('sha256');
    for (const f of files) hash.update(readFileSync(join(dist, f)));
    const version = hash.digest('hex').slice(0, 16);
    const precache = ['/', ...files.filter(f => f !== '/index.html')];
    const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8');
    writeFileSync(join(dist, 'sw.js'), template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache)));
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), offlineServiceWorker()],
  build: { sourcemap: false, target: 'es2022' },
  server: { fs: { allow: ['../..'] } },
});
