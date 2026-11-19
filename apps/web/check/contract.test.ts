import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const here = (p: string) => new URL(p, import.meta.url);
const app = readFileSync(here('../src/App.tsx'), 'utf8');
const spec = readFileSync(here('../../../spec/tla/WebTraps.tla'), 'utf8');

test('the View kinds in App.tsx equal the Ready set in WebTraps.tla', () => {
  const block = /type View =([\s\S]*?);\n/.exec(app)?.[1] ?? '';
  const viewKinds = [...block.matchAll(/kind: '([a-zA-Z]+)'/g)].map(m => m[1]!).sort();
  const ready = (/Ready == \{([^}]*)\}/.exec(spec)?.[1] ?? '').split(',').map(x => x.trim().replace(/"/g, '')).filter(Boolean).sort();
  assert.ok(viewKinds.length > 0);
  assert.deepEqual(viewKinds, ready);
});

test('every form field resets the view, as Edit does in the spec', () => {
  for (const setter of ['setDescription', 'setGoal', 'setRegion', 'setRemote']) {
    const handler = new RegExp(`onChange=\\{e => \\{ ${setter}\\([^;]*\\); formChanged\\(\\); \\}\\}`);
    assert.match(app, handler, setter);
  }
  assert.match(app, /const formChanged = \(\) => setView\(\{ kind: 'idle' \}\);/);
  assert.match(spec, /WidenFilters ==[\s\S]*?state' = "matching"/);
});

const headers = JSON.parse(readFileSync(here('../vercel.json'), 'utf8')) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
const global = headers.headers.find(h => h.source === '/(.*)')?.headers ?? [];
const header = (k: string) => global.find(h => h.key.toLowerCase() === k.toLowerCase())?.value;

test('vercel.json carries the CSP and security headers on every path', () => {
  const csp = header('Content-Security-Policy') ?? '';
  const directives = new Map(csp.split(';').map(d => d.trim()).filter(Boolean).map(d => { const [k, ...v] = d.split(/\s+/); return [k!, v.join(' ')] as const; }));
  const want: Record<string, string> = {
    'default-src': "'self'", 'script-src': "'self'", 'style-src': "'self'", 'connect-src': "'self'", 'img-src': "'self' data:",
    'worker-src': "'self'", 'frame-ancestors': "'none'", 'base-uri': "'none'", 'form-action': "'none'", 'object-src': "'none'",
  };
  for (const [k, v] of Object.entries(want)) assert.equal(directives.get(k), v, k);
  assert.ok(!/unsafe-inline|unsafe-eval|\*|https?:/.test(csp), 'no wildcard, unsafe or remote source');
  assert.equal(header('Referrer-Policy'), 'no-referrer');
  assert.equal(header('X-Content-Type-Options'), 'nosniff');
  assert.equal(header('X-Robots-Tag'), 'noindex');
  assert.match(header('Permissions-Policy') ?? '', /camera=\(\).*microphone=\(\).*geolocation=\(\)/);
});

test('the built page needs nothing the CSP blocks', { skip: !existsSync(here('../dist/index.html')) }, () => {
  const html = readFileSync(here('../dist/index.html'), 'utf8');
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'no inline script');
  assert.ok(!/<style[\s>]/i.test(html), 'no inline style element');
  assert.ok(!/\son[a-z]+=/i.test(html), 'no inline handlers');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) assert.ok(/^(\/|data:)/.test(m[1]!), m[1]);
});
