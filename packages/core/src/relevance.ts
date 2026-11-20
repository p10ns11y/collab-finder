import type { PublicRow } from './schema.ts';
import { isPlaceWord, languageGo } from './vocab.ts';

const STOP = new Set([
  'a', 'an', 'and', 'or', 'the', 'of', 'in', 'on', 'at', 'for', 'to', 'with', 'by', 'from', 'as', 'is', 'are', 'be', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
  'it', 'its', 'this', 'that', 'into', 'over', 'about', 'who', 'what', 'where', 'how', 'than', 'then', 'also', 'like', 'such', 'want', 'wants', 'looking', 'work',
  'working', 'worked', 'build', 'building', 'built', 'years', 'year', 'yrs', 'experience', 'based', 'mostly', 'some', 'very', 'more', 'most', 'new', 'own',
  'junior', 'mid', 'level', 'senior', 'sr', 'staff', 'lead', 'principal', 'distinguished', 'intern', 'graduate', 'ii', 'iii', 'iv', 'm', 'f', 'd', 'x', 'w',
  'all', 'genders', 'remote', 'hybrid', 'onsite', 'site', 'team', 'teams', 'role', 'position', 'job', 'jobs', 'm/f/d', 'was', 'former', 'ex', 'previously', 'med', 'och', 'till', 'som', 'en', 'ett',
  'go', 'us', 'further', 'grow', 'help', 'get', 'make', 'do', 'can', 'will', 'would', 'love', 'happy', 'let', 'lets', 'really', 'just',
]);

const SYNONYMS: ReadonlyArray<[RegExp, string]> = [
  [/\bfull[\s-]?stack\b/g, ' fullstack '],
  [/\bfront[\s-]?end\b/g, ' frontend '],
  [/\bback[\s-]?end\b/g, ' backend '],
  [/\bmachine learning\b/g, ' ml '],
  [/\bartificial intelligence\b/g, ' ai '],
  [/\bgen\s?ai\b|\bgenerative ai\b/g, ' ai generative '],
  [/\bforward[\s-]deployed\b/g, ' fde '],
  [/\bsite reliability\b/g, ' sre '],
  [/\bdistributed systems?\b/g, ' distributed '],
  [/\bdeveloper (?:tools|experience)\b/g, ' devtools '],
  [/\bmember of technical staff\b/g, ' mts '],
  [/\bweb (?:applications?|apps?)\b/g, ' web fullstack '],
  [/\bproduct engineer(?:ing)?\b/g, ' productengineer '],
  [/\bdata engineer(?:ing)?\b/g, ' dataengineer '],
  [/\bnode\.?js\b/g, ' node '],
  [/\bnext\.?js\b/g, ' react '],
  [/\breact\.?js\b/g, ' react '],
  [/\breact native\b/g, ' react mobile '],
  [/\bc\+\+/g, ' cpp '],
  [/\bc#/g, ' csharp '],
  [/\.net\b/g, ' dotnet '],
  [/\bspring boot\b/g, ' java '],
  [/\bgo (?=engineer|developer)/g, ' golang '],
];
const TOKEN_MAP: Readonly<Record<string, string>> = {
  ia: 'ai', llms: 'llm', agentic: 'agent', agents: 'agent', ml: 'ml', mlops: 'ml', k8s: 'kubernetes', javascript: 'typescript', js: 'typescript',
  ts: 'typescript', postgresql: 'postgres', sql: 'postgres', swe: 'engineer', engineers: 'engineer', engineering: 'engineer', developer: 'engineer', developers: 'engineer',
  dev: 'engineer', programmer: 'engineer', utvecklare: 'engineer', mjukvaruutvecklare: 'engineer', ingenjör: 'engineer', systemutvecklare: 'engineer', fullstackutvecklare: 'fullstack',
  robots: 'robot', robotics: 'robot', vehicles: 'vehicle', devices: 'device', drones: 'drone', satellites: 'satellite', apis: 'api', services: 'service', systems: 'system',
  platforms: 'platform', products: 'product', models: 'model', pipelines: 'pipeline', infra: 'infrastructure', devops: 'infrastructure', cloud: 'infrastructure', sre: 'infrastructure',
  ios: 'mobile', android: 'mobile', swift: 'mobile', kotlin: 'java', jvm: 'java', scala: 'java', django: 'python', fastapi: 'python', flask: 'python', rails: 'ruby',
  appsec: 'security', infosec: 'security', firmware: 'embedded', ui: 'frontend', ux: 'frontend', compilers: 'compiler', inference: 'inference', rag: 'llm',
};

export const tokensOf = (text: string): string[] => {
  let t = ` ${languageGo(text).toLowerCase()} `;
  for (const [re, to] of SYNONYMS) t = t.replace(re, to);
  return t.split(/[^a-z0-9+#åäöéü]+/).filter(Boolean).map(w => TOKEN_MAP[w] ?? w).filter(w => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
};
const tagTokens = (tag: string): string[] => (tag.toLowerCase() === 'go' ? ['golang'] : tokensOf(tag.replace(/[-_]/g, ' ')));
export const rowTokens = (row: Pick<PublicRow, 'title' | 'role_tags'>): string[] => [...tokensOf(row.title), ...row.role_tags.flatMap(tagTokens)];

export type CorpusStats = { readonly n: number; readonly avgLen: number; readonly df: ReadonlyMap<string, number> };
export const corpusStats = (rows: ReadonlyArray<Pick<PublicRow, 'title' | 'role_tags' | 'status'>>): CorpusStats => {
  const df = new Map<string, number>();
  let n = 0;
  let total = 0;
  for (const r of rows) {
    if (r.status === 'closed') continue;
    const toks = rowTokens(r);
    n += 1;
    total += toks.length;
    for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return { n, avgLen: n ? total / n : 1, df };
};

export const SKILL_TOKENS: ReadonlySet<string> = new Set(['typescript', 'react', 'python', 'golang', 'rust', 'java', 'node', 'postgres', 'kubernetes', 'cpp', 'csharp', 'dotnet', 'ruby',
  'php', 'vue', 'angular', 'svelte', 'aws', 'gcp', 'azure', 'docker', 'terraform', 'graphql', 'kafka', 'redis', 'elixir', 'haskell', 'swift', 'mobile', 'laravel', 'html', 'css']);
export const FOCUS_ROLE_TOKENS: ReadonlySet<string> = new Set(['frontend', 'backend', 'fullstack', 'ml', 'llm', 'infrastructure', 'platform', 'security', 'dataengineer', 'embedded',
  'mobile', 'devtools', 'compiler', 'distributed', 'inference', 'robot', 'productengineer', 'fde', 'api', 'web', 'search', 'payments', 'growth']);
export const FOCUS_ROLE_CAP = 2;
export type TitleFocus = { readonly skill: boolean; readonly roles: number };
export const titleFocus = (query: ReadonlySet<string>, title: string): TitleFocus => {
  const own = new Set(tokensOf(title));
  const hits = [...own].filter(t => query.has(t));
  return { skill: !namesSkillList({ title }) && hits.some(t => SKILL_TOKENS.has(t)), roles: Math.min(FOCUS_ROLE_CAP, hits.filter(t => FOCUS_ROLE_TOKENS.has(t)).length) };
};
export const SKILL_LIST_FACTOR = 0.5;
const titleSkills = (title: string): { skills: number; distinct: number } => {
  const distinct = new Set(tokensOf(title));
  return { skills: [...distinct].filter(t => SKILL_TOKENS.has(t)).length, distinct: distinct.size };
};
export const isSkillList = (row: Pick<PublicRow, 'title'>): boolean => {
  const { skills, distinct } = titleSkills(row.title);
  return skills >= 3 && skills / distinct >= 0.4;
};
export const namesSkillList = (row: Pick<PublicRow, 'title'>): boolean => titleSkills(row.title).skills >= 2;
const K1 = 1.2;
const B = 0.75;
const withoutPlaces = (text: string): string => text.split(/([^a-zà-öø-ÿ]+)/i).map(w => (isPlaceWord(w) ? ' ' : w)).join('');
export const queryTokens = (description: string, goal = ''): ReadonlySet<string> => new Set([...tokensOf(withoutPlaces(description)), ...tokensOf(withoutPlaces(goal))]);
export const relevance = (query: ReadonlySet<string>, row: Pick<PublicRow, 'title' | 'role_tags'>, stats: CorpusStats): number => {
  const toks = rowTokens(row);
  if (!toks.length) return 0;
  const norm = 1 - B + B * (toks.length / (stats.avgLen || 1));
  let s = 0;
  for (const t of [...new Set(toks)].sort()) {
    if (!query.has(t)) continue;
    const df = stats.df.get(t) ?? 0;
    const idf = Math.log(1 + (stats.n - df + 0.5) / (df + 0.5));
    s += idf * (K1 + 1) / (1 + K1 * norm);
  }
  return Math.round(s * (isSkillList(row) ? SKILL_LIST_FACTOR : 1) * 1e4) / 1e4;
};
