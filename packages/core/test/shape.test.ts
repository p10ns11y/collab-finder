import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { buildPublicPool, companyIndustries, honestRegion, industriesOfText, industryOfLike, inPoolScope, likedEntries, match, shapeRows, type PublicPool, type PublicRow } from '../src/index.ts';

const RUNS = { numRuns: 300, seed: 20261123 };
const row = (o: Partial<PublicRow> & Pick<PublicRow, 'id' | 'title'>): PublicRow => ({
  source: 'greenhouse', company: 'Brisklabs', url: `https://jobs.example.com/${o.id}`, location: 'Berlin, Germany', remote: 'onsite', region: 'EU',
  role_tags: [], seniority: 'senior', posted_at: null, status: 'open', status_checked_at: '2026-11-22T22:43:16Z', ...o,
});

test('region: a Brazil-only location never stays in EU, SE or UK', () => {
  assert.equal(honestRegion('EU', 'Porto Alegre,Rio Grande do Sul,Brazil'), 'LATAM');
  assert.equal(honestRegion('EU', 'Porto Seguro, Ba / Porto Seguro, Bahia, Brazil'), 'LATAM');
  assert.equal(honestRegion('SE', 'São Paulo, Brazil'), 'LATAM');
  assert.equal(honestRegion('UK', 'Remote - Brazil'), 'LATAM');
});

test('region: mixed lists keep their European part, European places and other regions are untouched', () => {
  assert.equal(honestRegion('SE', 'Germany / Tokyo / Spain / Brazil'), 'EU');
  assert.equal(honestRegion('EU', 'Madrid, Spain'), 'EU');
  assert.equal(honestRegion('EU', 'Lisbon / Porto, Portugal'), 'EU');
  assert.equal(honestRegion('US', 'São Paulo, Brazil'), 'US');
  assert.equal(honestRegion('EU', null), 'EU');
  assert.equal(honestRegion('SE', 'Multiple Locations'), 'SE');
});

const LATAM = ['Porto Alegre, Brazil', 'São Paulo, Brazil', 'Buenos Aires, Argentina', 'Mexico City, Mexico', 'Bogotá, Colombia', 'Santiago, Chile'];
test('region property: rows whose every location is in Latin America leave Europe at build time', () => {
  fc.assert(fc.property(fc.array(fc.constantFrom(...LATAM), { minLength: 1, maxLength: 4 }), fc.constantFrom('SE', 'EU', 'UK'), (places, region) => {
    const { rows } = shapeRows([row({ id: 'greenhouse:1', title: 'Senior Software Engineer', location: places.join(' / '), region })], []);
    return rows.length === 1 && rows[0]!['region'] === 'LATAM';
  }), RUNS);
});

test('scope: sales, art and support titles are dropped; engineering and engineering leadership stay', () => {
  for (const title of ['Account Executive', 'UI Artist', 'Executivo(a) de Vendas Externas', 'Dubbing Specialist (Freelance)', 'Customer Success Manager', 'Senior Mobile Game Designer'])
    assert.equal(inPoolScope({ title, role_tags: [], seniority: 'senior' }), false, title);
  for (const title of ['Senior Software Engineer', 'Senior UI Programmer', 'Staff Machine Learning Engineer', 'Engineering Manager, Platform', 'Head of Engineering'])
    assert.equal(inPoolScope({ title, role_tags: [], seniority: 'senior' }), true, title);
});

test('scope: shapeRows reports what it dropped and keeps the rest unchanged apart from region and industries', () => {
  const kept = row({ id: 'greenhouse:2', title: 'Senior Software Engineer' });
  const { rows, stats } = shapeRows([kept, row({ id: 'greenhouse:3', title: 'Account Executive' })], []);
  assert.equal(stats.outOfScope, 1);
  assert.deepEqual(rows, [{ ...kept, industries: [] }]);
});

const FINTECH = 'We build banking and lending products for financial institutions.';
const BENEFITS = 'Benefits: medical, dental and vision insurance, mental health support, private healthcare, a learning budget.';
test('industry: two distinct terms in a posting, shared by at least a third of a company\'s postings', () => {
  assert.deepEqual(industriesOfText(FINTECH), ['fintech']);
  assert.deepEqual(industriesOfText(BENEFITS), []);
  const m = companyIndustries([
    { company: 'Brisklabs', text: FINTECH }, { company: 'Brisklabs', text: FINTECH }, { company: 'Brisklabs', text: BENEFITS },
    { company: 'Lumenforge', text: FINTECH }, { company: 'Lumenforge', text: BENEFITS }, { company: 'Lumenforge', text: BENEFITS }, { company: 'Lumenforge', text: BENEFITS },
  ]);
  assert.deepEqual(m.get('brisklabs'), ['fintech']);
  assert.equal(m.get('lumenforge'), undefined);
});

test('industry: liked words map to an industry only when they name one', () => {
  assert.equal(industryOfLike(likedEntries('fintech')[0]!), 'fintech');
  assert.equal(industryOfLike(likedEntries('Health tech')[0]!), 'healthtech');
  assert.equal(industryOfLike(likedEntries('developer tools')[0]!), 'devtools');
  assert.equal(industryOfLike(likedEntries('Spotify')[0]!), undefined);
});

const fintechRow = row({ id: 'greenhouse:10', title: 'Senior Software Engineer', company: 'Brisklabs', industries: ['fintech'] });
const pool: PublicPool = { version: 'v-test', checkedRange: { from: fintechRow.status_checked_at, to: fintechRow.status_checked_at }, rows: [
  ...Array.from({ length: 12 }, (_, i) => row({ id: `greenhouse:${100 + i}`, title: 'Senior Software Engineer', company: `Quill${i}` })), fintechRow,
] };
test('industry: naming fintech lifts fintech rows with a reason; a word that names no industry changes nothing', () => {
  const desc = 'Senior software engineer, TypeScript and Node, 8 years';
  const ids = (likes?: string) => { const r = match({ description: desc, region: 'EU', ...(likes ? { likes } : {}) }, pool, { now: new Date('2026-11-23T08:00:00Z') })._unsafeUnwrap(); return r.groups.fitsNow; };
  const base = ids(), fin = ids('fintech'), none = ids('zzz');
  assert.ok(!base.find(x => x.id === 'greenhouse:10')!.reasons.some(r => r.startsWith('In an industry')));
  assert.ok(fin.find(x => x.id === 'greenhouse:10')!.score > base.find(x => x.id === 'greenhouse:10')!.score);
  assert.equal(fin[0]!.id, 'greenhouse:10');
  assert.ok(fin[0]!.reasons.includes('In an industry you named: Fintech'));
  assert.deepEqual(none.map(x => x.id), base.map(x => x.id));
});

test('build: the shipped pool carries facts and links only, never description text', () => {
  const engine = [{ ...row({ id: 'greenhouse:20', title: 'Senior Software Engineer' }), desc: FINTECH, description: FINTECH, content: FINTECH }];
  const { pool: built } = buildPublicPool(engine, [{ company: 'Brisklabs', text: FINTECH }], 'v-test');
  const rows = built._unsafeUnwrap().rows;
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]!).filter(k => /desc|content/.test(k)), []);
  assert.ok(!JSON.stringify(rows).includes('lending products'));
});
