import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { TOOL_NAMES } from '../src/page-tools.ts';
import { PAGE_TOOLS } from '../src/tool-catalog.ts';
import { REGIONS } from '../src/regions.ts';
import { llmsFullTxt, llmsTxt } from '../scripts/llms-text.ts';

const here = (p: string) => new URL(p, import.meta.url);
const publicFile = (name: string) => readFileSync(here(`../public/${name}`), 'utf8');
const LLMS = ['llms.txt', 'llms-full.txt'] as const;

type VercelConf = {
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  rewrites?: Array<{ source: string; destination: string }>;
};

const vercelSourceMatches = (source: string, path: string): boolean => {
  if (source === path) return true;
  const escaped = source
    .replace(/[.+?^${}|[\]\\]/g, '\\$&')
    .replace(/\\\(\\\?!(.*?)\\\)/g, '(?!$1)')
    .replace(/:([A-Za-z0-9_]+)/g, '[^/]+')
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(path);
};

test('public llms files match the tool catalog and name every tool and region', () => {
  assert.deepEqual(PAGE_TOOLS.map(tool => tool.name), [...TOOL_NAMES]);
  const brief = llmsTxt();
  const full = llmsFullTxt();
  assert.equal(publicFile('llms.txt'), brief);
  assert.equal(publicFile('llms-full.txt'), full);
  for (const text of [brief, full]) {
    for (const tool of PAGE_TOOLS) {
      assert.match(text, new RegExp(`\\b${tool.name}\\b`));
      assert.match(text, new RegExp(tool.title));
    }
    for (const [code, label] of REGIONS) {
      assert.match(text, new RegExp(`\\b${code}\\b`));
      assert.match(text, new RegExp(label.replace(/[()]/g, '\\$&')));
    }
    assert.doesNotMatch(text, /p10ns11y\/notes|life-os/i);
    assert.doesNotMatch(text, /@gmail\.com|@hotmail\.com|@outlook\.com/);
    assert.doesNotMatch(text, /\bAI\b/);
  }
  for (const tool of PAGE_TOOLS) {
    assert.match(full, new RegExp(`"required"`));
    assert.ok(full.includes(JSON.stringify(tool.inputSchema, null, 2)));
  }
});

test('built dist contains both llms files, and Vercel serves them as text/plain without rewriting them to the page', { skip: !existsSync(here('../dist/index.html')) }, () => {
  for (const name of LLMS) {
    const dist = here(`../dist/${name}`);
    assert.ok(existsSync(dist), name);
    assert.equal(readFileSync(dist, 'utf8'), publicFile(name));
  }
  const conf = JSON.parse(readFileSync(here('../vercel.json'), 'utf8')) as VercelConf;
  for (const name of LLMS) {
    const path = `/${name}`;
    const headers = conf.headers?.find(entry => entry.source === path)?.headers ?? [];
    const type = headers.find(header => header.key.toLowerCase() === 'content-type')?.value ?? '';
    assert.match(type, /^text\/plain\b/, path);
    for (const rule of conf.rewrites ?? []) {
      if (vercelSourceMatches(rule.source, path)) {
        assert.notEqual(rule.destination, '/index.html', `${path} rewritten to the page`);
        assert.equal(rule.destination, path);
      }
    }
  }
});
