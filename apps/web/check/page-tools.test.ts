import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MatchRow } from '../../../packages/core/src/index.ts';
import {
  APPLY_SEND_NOTICE,
  TOOL_NAMES,
  buildApplyPack,
  buildCvOutline,
  FACT,
  confirmedButNotSent,
  confirmUnavailable,
  declinedConfirm,
  needsPersonConfirm,
  panelUnavailable,
  parseFindRoles,
  parseRolePick,
  summarizeRoles,
} from '../src/page-tools.ts';

const row = (over: Partial<MatchRow> = {}): MatchRow => ({
  id: 'ashby:1', title: 'Senior Backend Engineer', company: 'pixel-labs',
  url: 'https://jobs.example.com/ashby/1', location: 'Stockholm', region: 'SE',
  remote: 'remote', seniority: 'senior', status: 'open', lastChecked: '2026-11-20T06:00:00Z',
  ageDays: 5, stale: false, tier: 0, relevance: 10, score: 80,
  reasons: ['Title matches what you do: backend', 'Tagged with: Go'], alsoIds: [], ...over,
});

test('parseFindRoles requires a whole-number stateVersion and keeps only known filters', () => {
  assert.equal(parseFindRoles({}).ok, false);
  assert.equal(parseFindRoles({ stateVersion: 1.5 }).ok, false);
  assert.equal(parseFindRoles({ stateVersion: -1 }).ok, false);
  const parsed = parseFindRoles({ stateVersion: 0, description: 'Senior backend engineer, Go', regions: ['SE', 'XX'], remote: 'remote', productOnly: true, goal: 'platform' });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value, { baseVersion: 0, change: { description: 'Senior backend engineer, Go', goal: 'platform', regions: ['SE'], remote: 'remote', productOnly: true } });
});

test('parseRolePick requires an id and only treats apply or send when they are true', () => {
  assert.equal(parseRolePick({}).ok, false);
  assert.equal(parseRolePick({ id: 1 }).ok, false);
  assert.deepEqual(parseRolePick({ id: 'ashby:1', apply: false, send: 'yes' }), { ok: true, value: { id: 'ashby:1' } });
  const both = parseRolePick({ id: 'ashby:1', apply: true, send: true });
  assert.deepEqual(both, { ok: true, value: { id: 'ashby:1', apply: true, send: true } });
  assert.equal(both.ok && needsPersonConfirm(both.value), true);
  assert.equal(needsPersonConfirm({ id: 'ashby:1' }), false);
});

test('buildCvOutline leads with phrases the person typed, posting hits first, never generic words or posting facts', () => {
  const reasons = ['Title matches what you do: distributed', 'Level fits: senior', 'Region: US (Austin, TX)', 'Open when last checked (2026-11-19)'];
  const outline = buildCvOutline('Senior backend engineer with Go and Postgres, distributed systems, 8 years', row({ title: 'Distributed Systems Engineer', reasons }));
  assert.equal(outline.roleId, 'ashby:1');
  assert.deepEqual(outline.emphasize, ['Distributed systems', 'Backend', 'Go', 'Postgres']);
  assert.match(outline.notice, /not a submitted CV/);
  assert.doesNotMatch(outline.notice, /sent a CV|applied/i);
});

test('outline property: 1 to 5 lines, none a lone generic word, a fact, or a place', () => {
  const GENERIC = /^(senior|staff|engineer|developer|software|years|experience)$/i;
  for (const description of ['Senior backend engineer, Go and Postgres, distributed systems', 'Staff platform engineer in Stockholm, Sweden, Kubernetes, Terraform, Go, Rust, AWS and GCP',
    'Machine learning engineer working on LLM inference', 'Senior engineer who writes TypeScript and Python every day', 'Senior full-stack engineer, TypeScript and React, 8 years']) {
    const { emphasize } = buildCvOutline(description, row());
    assert.ok(emphasize.length >= 1 && emphasize.length <= 5, description);
    assert.ok(emphasize.every(line => !GENERIC.test(line) && !FACT.test(line) && !/Stockholm|Sweden/.test(line)), `${description}: ${emphasize.join(' | ')}`);
  }
});

test('the apply pack keeps posting facts out of its reasons', () => {
  const pack = buildApplyPack(row({ reasons: ['Title matches what you do: backend', 'Level fits: senior', 'Region: SE (Stockholm)', 'Open when last checked (2026-11-20)'] }));
  assert.deepEqual(pack.reasons, ['Title matches what you do: backend']);
});

test('buildApplyPack is public facts plus a checklist and never claims to apply or send', () => {
  const pack = buildApplyPack(row());
  assert.equal(pack.url, 'https://jobs.example.com/ashby/1');
  assert.ok(pack.checklist.every(item => !/(we|this page) (will )?(apply|send)|submitted|applied for you/i.test(item)));
  assert.ok(pack.checklist.some(item => /employer's page/.test(item)));
  assert.equal(pack.notice, APPLY_SEND_NOTICE);
  assert.match(APPLY_SEND_NOTICE, /never applies or sends/);
});

test('a cancelled confirm does not apply or send, and a confirm still does not send', () => {
  const cancelled = declinedConfirm(3);
  assert.equal(cancelled.applied, false);
  assert.equal(cancelled.sent, false);
  assert.match(cancelled.error, /cancelled/);
  assert.equal('confirmed' in cancelled, false);
  const hidden = confirmUnavailable(5);
  assert.equal(hidden.applied, false);
  assert.equal(hidden.sent, false);
  assert.match(hidden.error, /could not be shown/);
  assert.equal('confirmed' in hidden, false);
  assert.match(panelUnavailable(6, 'CV outline').error, /CV outline could not be shown/);
  const done = confirmedButNotSent(4, 'https://jobs.example.com/ashby/1');
  assert.equal(done.confirmed, true);
  assert.equal(done.applied, false);
  assert.equal(done.sent, false);
  assert.equal(done.notice, APPLY_SEND_NOTICE);
});

test('summarizeRoles lists the first ten rows in each group and keeps the state version', () => {
  const many = Array.from({ length: 12 }, (_, i) => row({ id: `ashby:${i + 1}` }));
  const out = summarizeRoles({
    stateVersion: 2,
    verdict: 'results',
    error: null,
    result: {
      coreVersion: '1', poolVersion: '1',
      groups: { fitsNow: many, stepTowardGoal: [], stretch: [] },
      totals: { fitsNow: 12, stepTowardGoal: 0, stretch: 0 },
      warnings: [], understood: { roles: ['backend'], skills: ['go'], goal: [], seniority: 'senior', places: [], entry: false, nordic: false, learned: [] },
      likesMiss: false,
    },
  });
  assert.equal(out.stateVersion, 2);
  assert.equal(out.groups?.fitsNow.length, 10);
  assert.equal(TOOL_NAMES.join(','), 'find_roles,show_apply_pack,tailor_cv');
});
