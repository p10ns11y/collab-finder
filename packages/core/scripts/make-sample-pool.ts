// Writes fixtures/pool.sample.json: SYNTHETIC rows only (fictional companies, example.com links). Deterministic.
import { writeFileSync } from 'node:fs';
import { parsePool } from '../src/pool.ts';

const companies = ['Northwind AI', 'Fjordline Systems', 'Lumen Data', 'Kestrel Robotics', 'Polar Payments', 'Brightpath Health Tech', 'Cobalt Cloud', 'Tessellate Labs'];
const titles: Array<[string, string | null, string[]]> = [
  ['Senior Backend Engineer', 'senior', []], ['Staff Backend Engineer, Payments', 'staff', []], ['Backend Engineer', 'mid', []],
  ['Senior Full-Stack Engineer (TypeScript, React)', 'senior', ['typescript', 'react', 'fullstack']], ['Full Stack Developer', null, ['fullstack']],
  ['Senior Frontend Engineer', 'senior', ['frontend', 'react']], ['Platform Engineer', null, ['platform']], ['Senior Platform Engineer, Kubernetes', 'senior', ['platform']],
  ['Machine Learning Engineer', null, ['si-llm']], ['Senior AI Engineer, LLM Applications', 'senior', ['si-llm', 'agentic']], ['Staff Engineer, AI Infrastructure', 'staff', ['si-llm']],
  ['Senior Data Engineer', 'senior', []], ['Forward Deployed Engineer', null, ['forward-deployed']], ['Senior Security Engineer', 'senior', []],
  ['Principal Software Engineer', 'principal', []], ['Software Engineer', null, []], ['Senior Product Engineer', 'senior', ['product-engineer']],
  ['Senior Backend Engineer, Agentic Workflows', 'senior', ['agentic']], ['Embedded Software Engineer, Robotics', null, ['physical']], ['Engineering Manager, Platform', null, []],
  ['Senior Full-Stack Engineer, AI Products', 'senior', ['fullstack', 'si-llm']], ['Staff Backend Engineer, AI Platform', 'staff', ['platform', 'si-llm']],
  ['Senior Backend Engineer, Infrastructure', 'senior', []], ['Senior Software Engineer', 'senior', []],
];
const places: Array<[string, string | null, 'remote' | 'hybrid' | 'onsite' | 'unknown']> = [
  ['Stockholm', 'SE', 'hybrid'], ['Berlin', 'EU', 'onsite'], ['London', 'UK', 'hybrid'], ['New York', 'US', 'onsite'],
  ['Remote (Europe)', 'EU', 'remote'], ['Remote', 'remote-anywhere', 'remote'], ['Gothenburg', 'SE', 'onsite'], ['Unspecified', 'other', 'unknown'],
];
const rows = titles.flatMap(([title, seniority, tags], i) => [0, 1].map(j => {
  const n = i * 2 + j;
  const [location, region, remote] = places[n % places.length]!;
  const company = companies[n % companies.length]!;
  const status = n % 13 === 5 ? 'unknown' : n % 17 === 3 ? 'closed' : 'open';
  return {
    id: `synthetic:${String(n).padStart(4, '0')}`, source: 'synthetic', company, title,
    url: `https://jobs.example.com/${company.toLowerCase().replace(/[^a-z]+/g, '-')}/${n}`,
    location, remote, region, role_tags: tags, seniority, posted_at: null, status,
    status_checked_at: `2026-11-${String(10 + (n % 9)).padStart(2, '0')}T08:00:00Z`,
  };
}));
const pool = { version: 'synthetic-2026-11-19', checkedRange: { from: '2026-11-10', to: '2026-11-18' }, rows };
const ok = parsePool(pool);
if (ok.isErr()) { console.error(JSON.stringify(ok.error)); process.exit(1); }
writeFileSync(new URL('../fixtures/pool.sample.json', import.meta.url), JSON.stringify(pool, null, 1) + '\n');
console.log(`wrote ${rows.length} synthetic rows`);
