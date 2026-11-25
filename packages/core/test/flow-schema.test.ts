import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONSUMERS, check, ingest } from '../src/flow-schema.ts';

const role = { id: 'ashby:1', title: 'Senior Backend Engineer', company: 'pixel-labs', url: 'https://jobs.example.com/ashby/1', location: 'Stockholm', remote: 'remote', status: 'open', lastChecked: '2026-11-20T06:00:00Z', score: 80, reasons: ['backend'] };

test('find_roles requires only stateVersion and rejects unknown places', () => {
  assert.equal(check('findRolesTool', {}).ok, false);
  assert.equal(check('findRolesTool', { stateVersion: 1.5 }).ok, false);
  assert.equal(check('findRolesTool', { stateVersion: 0 }).ok, true);
  assert.equal(check('findRolesTool', { stateVersion: 0, regions: ['XX'] }).ok, false);
});

test('each consumer asks only for its own fields', () => {
  const card = { id: role.id, title: role.title, company: role.company, reasons: role.reasons };
  assert.equal(check('matchCard', card).ok, true);
  assert.equal(check('tailorInput', card).ok, true);
  assert.equal(check('applyPackInput', card).ok, false);
  assert.equal(check('applyPackInput', role).ok, true);
  assert.equal(check('pickTool', {}).ok, false);
  assert.equal(check('pickTool', { id: 'ashby:1', apply: true }).ok, true);
  assert.deepEqual(Object.keys(CONSUMERS).sort(), ['applyPackInput', 'applyPackOut', 'findRolesTool', 'matchCard', 'pickTool', 'sourceIngest', 'tailorInput']);
});

test('an apply pack can never claim applied or sent', () => {
  const pack = { roleId: role.id, title: role.title, company: role.company, url: role.url, checklist: ['Read the live posting.'], notice: 'A person must confirm.', applied: false, sent: false };
  assert.equal(check('applyPackOut', pack).ok, true);
  assert.equal(check('applyPackOut', { ...pack, sent: true }).ok, false);
  assert.equal(check('applyPackOut', { ...pack, applied: true }).ok, false);
  assert.equal(check('applyPackOut', { ...pack, applied: undefined }).ok, false);
});

test('ingest keeps rows with source facts and drops the rest', () => {
  const ok = { id: 'gh:1', source: 'greenhouse', company: 'pixel-labs', title: 'Platform Engineer', url: 'https://jobs.example.com/gh/1', status_checked_at: '2026-11-24T06:00:00Z' };
  const r = ingest([ok, { ...ok, url: 'javascript:alert(1)' }, { ...ok, source: undefined }, null]);
  assert.equal(r.kept.length, 1);
  assert.equal(r.dropped, 3);
});
