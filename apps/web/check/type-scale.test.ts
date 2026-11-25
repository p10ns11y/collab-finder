import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../src/', import.meta.url);
const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(f => f.endsWith('.tsx'));

test('components use only the 12/14/16/22/36 sizes and 400/600 weights', () => {
  assert.ok(files.includes('reveal.tsx'));
  for (const f of files) {
    const off = readFileSync(new URL(f, dir), 'utf8').match(/\b(?:\w+:)?(?:text-(?:lg|2xl|[4-9]xl)|font-(?:thin|extralight|light|medium|bold|extrabold|black))\b/g) ?? [];
    assert.deepEqual(off, [], f);
  }
});
