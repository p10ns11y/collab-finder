import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const here = (p: string) => new URL(p, import.meta.url);
const precacheOf = (sw: string): string[] => {
  const raw = /const PRECACHE = (\[[\s\S]*?\]);/.exec(sw)?.[1];
  assert.ok(raw);
  const precache: unknown = JSON.parse(raw);
  assert.ok(Array.isArray(precache));
  return precache.filter((entry): entry is string => typeof entry === 'string');
};
const isPool = (entry: string): boolean => entry === '/pool.json' || /^\/pool-\d+\.json$/.test(entry);

test('flag-off precache has no ui-sdk or sdk-path chunk', () => {
  const leaked = precacheOf(readFileSync(here('../dist/sw.js'), 'utf8')).filter(entry => entry.includes('ui-sdk') || entry.includes('sdk-path'));
  assert.deepEqual(leaked, []);
});

test('precache has no pool or shard', () => {
  assert.deepEqual(precacheOf(readFileSync(here('../dist/sw.js'), 'utf8')).filter(isPool), []);
});

test('refreshable paths are network-first and only fall back to cache on fetch failure', () => {
  const template = readFileSync(here('../sw.template.js'), 'utf8');
  const vite = readFileSync(here('../vite.config.ts'), 'utf8');
  assert.match(template, /const refreshable = \(path\) => path === '\/pool\.json' \|\| \/\^\\\/pool-\\d\+\\\.json\$\/\.test\(path\);/);
  assert.match(vite, /url === '\/pool\.json' \|\| \/\^\\\/pool-\\d\+\\\.json\$\/\.test\(url\)/);
  assert.match(vite, /!isRefreshable\(f\)/);
  const branch = /if \(refreshable\(key\)\) \{[\s\S]*?return;\s*\}/.exec(template)?.[0] ?? '';
  assert.ok(branch.length > 0);
  assert.match(branch, /event\.respondWith\(\s*fetch\(event\.request\)/);
  assert.match(branch, /\.catch\(\(\) => caches\.match\(key\)/);
  const fetchFirst = branch.indexOf('fetch(event.request)');
  const onFail = branch.indexOf('caches.match(key)');
  const put = branch.indexOf('c.put(key');
  assert.ok(fetchFirst >= 0 && onFail > fetchFirst && put > fetchFirst && put < onFail);
});

test('precache uses clean URLs and the worker never stores a redirected response', () => {
  const entries = precacheOf(readFileSync(here('../dist/sw.js'), 'utf8'));
  assert.deepEqual(entries.filter(entry => entry.endsWith('.html') || (entry.length > 1 && entry.endsWith('/'))), []);
  const template = readFileSync(here('../sw.template.js'), 'utf8');
  assert.match(template, /res\.redirected \? new Response\(/);
  assert.doesNotMatch(template, /addAll\(/);
});
