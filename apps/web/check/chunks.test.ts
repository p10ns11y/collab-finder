import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

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

const staticAssets = (root: string): Set<string> => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const seen = new Set<string>();
  const queue = [...html.matchAll(/\s(?:src|href)="(\/[^"]+)"/g)].map(m => m[1]);
  while (queue.length > 0) {
    const url = queue.pop();
    if (url === undefined || seen.has(url)) continue;
    const file = join(root, url);
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

const sdkish = (entry: string) => entry.includes('ui-sdk') || entry.includes('sdk-path');

test('main entry chunk stays within 5% of the recorded baseline', () => {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const src = /<script type="module"[^>]*\bsrc="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  assert.ok(src);
  const bytes = statSync(join(dist, src)).size;
  const baseline = JSON.parse(readFileSync(new URL('./entry-chunk-baseline.json', import.meta.url), 'utf8')) as { entryBytes: number };
  assert.ok(baseline.entryBytes > 0);
  assert.ok(bytes * 100 <= baseline.entryBytes * 105, `entry ${bytes} B is more than 5% over baseline ${baseline.entryBytes} B`);
});

test('ui-sdk and sdk-path chunks stay lazy and out of the flag-off precache', () => {
  const linked = staticAssets(dist);
  assert.deepEqual([...linked].filter(sdkish), []);
  const assets = readdirSync(join(dist, 'assets')).filter(f => f.endsWith('.js'));
  assert.ok(assets.some(sdkish));
  const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
  const raw = /const PRECACHE = (\[[\s\S]*?\]);/.exec(sw)?.[1];
  assert.ok(raw);
  const precache: unknown = JSON.parse(raw);
  assert.ok(Array.isArray(precache));
  assert.deepEqual(precache.filter(entry => typeof entry === 'string' && sdkish(entry)), []);
});

const polyfillish = (entry: string) => entry.includes('webmcp-polyfill');

test('webmcp polyfill is a separate lazy chunk, not statically linked from the entry', () => {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const src = /<script type="module"[^>]*\bsrc="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  assert.ok(src);
  assert.equal(polyfillish(src), false);
  const assets = readdirSync(join(dist, 'assets')).filter(f => f.endsWith('.js'));
  assert.ok(assets.some(polyfillish));
  assert.deepEqual([...staticAssets(dist)].filter(polyfillish), []);
});

test('xstate runs only inside the lazy flow chunks, each one self-contained so a retry never reuses a failed import', () => {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const src = /<script type="module"[^>]*\bsrc="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  assert.ok(src);
  const runtime = (f: string) => readFileSync(join(dist, f), 'utf8').includes('xstate.init');
  const assets = readdirSync(join(dist, 'assets')).filter(f => f.endsWith('.js')).map(f => `/assets/${f}`);
  const flows = assets.filter(f => /\/flow-[^/]+\.js$/.test(f));
  assert.equal(flows.length, 2);
  assert.deepEqual(assets.filter(runtime).sort(), [...flows].sort());
  for (const f of flows) assert.doesNotMatch(readFileSync(join(dist, f), 'utf8'), /\bfrom\s*["']\.|\bimport\s*\(?\s*["']\./);
  assert.equal(runtime(src), false);
});
