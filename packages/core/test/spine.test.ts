import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { decideSource, EMAIL_LINK_THRESHOLD, linkEmail, linkRate, linkRecord, postingIdFromUrl, type Applied } from '../src/spine.ts';
import type { PublicPool, PublicRow } from '../src/schema.ts';

const row = (id: string, company: string, title: string): PublicRow => ({ id, source: id.split(':')[0]!, company, title, url: 'https://jobs.example.com/x', location: null,
  remote: 'unknown', region: null, role_tags: [], seniority: null, posted_at: null, status: 'open', status_checked_at: '2026-11-18T08:00:00Z' });
const pool: PublicPool = { version: 'spine', checkedRange: { from: '2026-11-18', to: '2026-11-18' }, rows: [
  row('greenhouse:4410001', 'willowfield', 'Senior Backend Engineer'),
  row('ashby:0b7c7c2e-1a2b-4c3d-8e9f-0123456789ab', 'pixel-labs', 'Staff Platform Engineer'),
  row('lever:11111111-2222-4333-8444-555555555555', 'briskgrid', 'Senior Backend Engineer, Stockholm'),
  row('lever:11111111-2222-4333-8444-666666666666', 'briskgrid', 'Senior Backend Engineer, London'),
] };

test('ID spine: the posting id is source plus ATS job id, never the URL, for every ATS URL shape', () => {
  const uuid = fc.uuid({ version: 4 });
  const slug = fc.stringMatching(/^[a-z][a-z0-9-]{1,20}$/);
  fc.assert(fc.property(slug, fc.nat({ max: 99_999_999 }), uuid, fc.constantFrom('', '?utm_source=x', '/application', '#top'), (co, n, u, tail) => {
    const cases: Array<[string, string]> = [
      [`https://boards.greenhouse.io/${co}/jobs/${n}${tail}`, `greenhouse:${n}`],
      [`https://job-boards.eu.greenhouse.io/${co}/jobs/${n}${tail}`, `greenhouse:${n}`],
      [`https://www.${co}.com/careers/job?gh_jid=${n}`, `greenhouse:${n}`],
      [`https://jobs.lever.co/${co}/${u}${tail}`, `lever:${u}`],
      [`https://jobs.ashbyhq.com/${co}/${u}${tail}`, `ashby:${u}`],
      [`https://arbetsformedlingen.se/platsbanken/annonser/${n}${tail}`, `platsbanken:${n}`],
    ];
    return cases.every(([url, id]) => postingIdFromUrl(url) === id && !id.includes('/'));
  }), { numRuns: 300, seed: 20261120 });
  for (const generic of ['https://www.databricks.com/company/careers/open-positions', 'https://example.com/jobs', 'not a url', '']) assert.equal(postingIdFromUrl(generic), null, generic);
});

test('tracker link: URL id first, then a unique company plus location-free title, never a guess on ambiguity', () => {
  assert.deepEqual(linkRecord({ url: 'https://boards.greenhouse.io/willowfield/jobs/4410001', company: 'Willowfield', title: 'x' }, pool), { postingId: 'greenhouse:4410001', how: 'url-id', confidence: 1, inPool: true });
  const byTitle = linkRecord({ url: 'https://www.pixellabs.com/careers', company: 'Pixel Labs', title: 'Staff Platform Engineer' }, pool);
  assert.equal(byTitle.postingId, 'ashby:0b7c7c2e-1a2b-4c3d-8e9f-0123456789ab');
  assert.deepEqual(linkRecord({ company: 'Briskgrid', title: 'Senior Backend Engineer' }, pool), { postingId: null, reason: 'ambiguous-title' });
  const rate = linkRate([{ company: 'Willowfield', title: 'Senior Backend Engineer' }, { url: 'https://boards.greenhouse.io/willowfield/jobs/4410001', company: 'Willowfield', title: 'Senior Backend Engineer' }, { company: 'Nobody', title: 'Chef' }], pool);
  assert.deepEqual(rate, { linked: 2, total: 3, duplicates: 1 });
});

const applied: ReadonlyArray<Applied> = [
  { postingId: 'greenhouse:4410001', company: 'willowfield', title: 'Senior Backend Engineer', submittedAt: '2026-10-01T10:00:00Z' },
  { postingId: 'greenhouse:4410002', company: 'willowfield', title: 'Staff Data Engineer', submittedAt: '2026-10-03T10:00:00Z' },
  { postingId: 'ashby:0b7c7c2e-1a2b-4c3d-8e9f-0123456789ab', company: 'pixel-labs', title: 'Staff Platform Engineer', submittedAt: '2026-10-05T10:00:00Z' },
];

test('email link: auto only above the threshold with a clear winner at the same company; otherwise it goes to the owner', () => {
  fc.assert(fc.property(fc.constantFrom('Willowfield', 'Pixel Labs', 'Other Co'), fc.constantFrom('Your application: Senior Backend Engineer', 'Update on Staff Platform Engineer', 'Thanks for applying', 'Staff Data Engineer role'),
    fc.constantFrom('2026-10-20T10:00:00Z', '2025-01-01T10:00:00Z'), fc.constantFrom('rejected', 'interview', 'other') as fc.Arbitrary<'rejected' | 'interview' | 'other'>, (company, subject, receivedAt, outcome) => {
    const l = linkEmail({ company, subject, receivedAt, outcome }, applied);
    if (l.auto && l.confidence < EMAIL_LINK_THRESHOLD) return false;
    if (l.postingId && !applied.some(a => a.postingId === l.postingId && (a.company === company.toLowerCase().replace(/ /g, '-') || a.company === company.toLowerCase()))) return false;
    return company !== 'Other Co' || l.postingId === null;
  }), { numRuns: 200, seed: 20261120 });
  assert.equal(linkEmail({ company: 'Willowfield', subject: 'Your application: Senior Backend Engineer', receivedAt: '2026-10-20T10:00:00Z', outcome: 'rejected' }, applied).auto, true);
  assert.equal(linkEmail({ company: 'Willowfield', subject: 'Thanks for applying', receivedAt: '2026-10-20T10:00:00Z', outcome: 'rejected' }, applied).auto, false);
});

test('source precedence: live ATS over the cached pool; email marks the owner only, never closed for everyone', () => {
  fc.assert(fc.property(fc.constantFrom('open', 'closed', 'unknown') as fc.Arbitrary<'open' | 'closed' | 'unknown'>, fc.option(fc.constantFrom('open', 'closed', 'unknown') as fc.Arbitrary<'open' | 'closed' | 'unknown'>),
    fc.option(fc.constantFrom('rejected', 'interview', 'other') as fc.Arbitrary<'rejected' | 'interview' | 'other'>), (cached, live, mail) => {
    const d = decideSource([{ kind: 'pool', status: cached, at: '2026-11-01' }, ...(live ? [{ kind: 'live-ats' as const, status: live, at: '2026-11-20' }] : []), ...(mail ? [{ kind: 'email' as const, outcome: mail, at: '2026-11-19' }] : [])]);
    return d.forEveryone === (live ?? cached) && d.forOwner === (mail && mail !== 'other' ? mail : null);
  }), { numRuns: 200, seed: 20261120 });
});
