import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { match, parsePool, roleGaps, understand, type GapAsk, type GapRole } from '../src/index.ts';
import { check } from '../src/flow-schema.ts';
import { termsIn, label } from '../src/vocab.ts';

const askOf = (description: string, over: Partial<GapAsk> = {}): GapAsk => ({ understood: understand({ description })._unsafeUnwrap(), regions: [], remote: 'any', ...over });
const role = (o: Partial<GapRole> = {}): GapRole => ({ title: 'Senior Backend Engineer', company: 'Brisklabs', tags: [], seniority: 'senior', region: 'EU', location: 'Berlin, Germany', remote: 'onsite', ...o });
const SENIOR_BACKEND = 'Senior backend engineer, Go and Postgres, distributed systems';

test('a role that matches every stated fact has no gaps', () => {
  assert.deepEqual(roleGaps(askOf(SENIOR_BACKEND), role()), []);
});

test('skill gap names what the posting asks for and the description lacks, never what it names', () => {
  const gaps = roleGaps(askOf(SENIOR_BACKEND), role({ title: 'Senior Backend Engineer, Kubernetes', tags: ['typescript'] }));
  assert.deepEqual(gaps.map(g => g.kind), ['skill']);
  assert.match(gaps[0]!.detail, /infrastructure/);
  assert.match(gaps[0]!.detail, /TypeScript/i);
  assert.doesNotMatch(gaps[0]!.detail, /Go\b|backend/i);
  assert.match(gaps[0]!.step, /^Add one line on your /);
});

test('level gap appears only one level up', () => {
  const ask = askOf(SENIOR_BACKEND);
  assert.deepEqual(roleGaps(ask, role({ seniority: 'staff' })).map(g => g.kind), ['level']);
  assert.match(roleGaps(ask, role({ seniority: 'staff' }))[0]!.detail, /staff, one level above your senior/);
  assert.deepEqual(roleGaps(ask, role({ seniority: 'senior' })), []);
  assert.deepEqual(roleGaps(ask, role({ seniority: 'mid' })), []);
  assert.deepEqual(roleGaps(ask, role({ seniority: null })), []);
});

test('region gap: picked regions with an unconfirmed location, or a stated home outside the role region', () => {
  assert.match(roleGaps(askOf(SENIOR_BACKEND, { regions: ['SE', 'UK'] }), role({ region: null, location: null }))[0]!.detail, /Location not confirmed for Sweden and the UK/);
  const home = roleGaps(askOf(`${SENIOR_BACKEND}, based in Stockholm`), role({ region: 'US', location: 'Austin, TX' }));
  assert.deepEqual(home.map(g => g.kind), ['region']);
  assert.match(home[0]!.detail, /Sweden; the posting lists Austin, TX/);
  assert.match(home[0]!.step, /Brisklabs/);
  assert.deepEqual(roleGaps(askOf(`${SENIOR_BACKEND}, based in Stockholm`), role({ region: 'EU', location: 'Remote - Europe' })), []);
  assert.deepEqual(roleGaps(askOf(`${SENIOR_BACKEND}, based in Stockholm`), role({ region: 'remote-anywhere', location: 'Anywhere' })), []);
});

test('remote gap appears only when the user wants remote or hybrid and the posting is silent', () => {
  assert.deepEqual(roleGaps(askOf(SENIOR_BACKEND, { remote: 'remote' }), role({ remote: 'unknown' })).map(g => g.kind), ['remote']);
  assert.deepEqual(roleGaps(askOf(SENIOR_BACKEND, { remote: 'any' }), role({ remote: 'unknown' })), []);
  assert.deepEqual(roleGaps(askOf(SENIOR_BACKEND, { remote: 'remote' }), role({ remote: 'remote' })), []);
});

const pool = parsePool(JSON.parse(readFileSync(new URL('../fixtures/pool.sample.json', import.meta.url), 'utf8')))._unsafeUnwrap();
const byId = new Map(pool.rows.map(r => [r.id, r]));
const DESCRIPTIONS = [SENIOR_BACKEND, `${SENIOR_BACKEND}, based in Stockholm`, 'Senior frontend engineer with TypeScript and React, 8 years', 'Senior software engineer, Python and machine learning', 'Staff platform engineer, Kubernetes and Terraform'];

test('gap property: every gap on a matched sample role passes the gap schema, has one step, and never names a term the user gave', () => {
  fc.assert(fc.property(fc.constantFrom(...DESCRIPTIONS), fc.constantFrom('any', 'remote', 'hybrid') as fc.Arbitrary<'any' | 'remote' | 'hybrid'>, (description, remote) => {
    const r = match({ description, remote }, pool);
    if (r.isErr()) return r.error.kind === 'ZeroResults';
    const ask: GapAsk = { understood: r.value.understood, regions: [], remote };
    const named = new Set([...r.value.understood.roles, ...r.value.understood.skills].map(label));
    return Object.values(r.value.groups).flat().every(row => {
      const gaps = roleGaps(ask, { ...row, tags: byId.get(row.id)!.role_tags });
      return gaps.every(g => check('gapsOut', g).ok && g.step.length > 0 && ![...named].some(n => g.kind === 'skill' && g.detail.includes(` ${n}`)))
        && new Set(gaps.map(g => g.kind)).size === gaps.length;
    });
  }), { numRuns: 30 });
});

test('gap schema rejects an unknown kind or an empty step', () => {
  assert.equal(check('gapsOut', { kind: 'salary', detail: 'x', step: 'y' }).ok, false);
  assert.equal(check('gapsOut', { kind: 'skill', detail: 'x', step: ' ' }).ok, false);
  assert.ok(termsIn('Kubernetes').size > 0);
});
