import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('flag-off precache has no ui-sdk or sdk-path chunk', () => {
  const sw = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8');
  const raw = /const PRECACHE = (\[[\s\S]*?\]);/.exec(sw)?.[1];
  assert.ok(raw);
  const precache: unknown = JSON.parse(raw);
  assert.ok(Array.isArray(precache));
  const leaked = precache.filter(entry => typeof entry === 'string' && (entry.includes('ui-sdk') || entry.includes('sdk-path')));
  assert.deepEqual(leaked, []);
});
