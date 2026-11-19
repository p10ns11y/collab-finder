export type TermKind = 'role' | 'skill' | 'generic';
export type Term = { key: string; label: string; kind: TermKind; re: RegExp };

const t = (key: string, label: string, kind: TermKind, src: string): Term => ({ key, label, kind, re: new RegExp(`(?:^|[^a-z0-9+#])(?:${src})(?=$|[^a-z0-9+#])`, 'i') });

export const TERMS: ReadonlyArray<Term> = [
  t('backend', 'backend', 'role', 'back[- ]?end|server[- ]side|apis?'),
  t('frontend', 'frontend', 'role', 'front[- ]?end|ui engineer(?:ing)?|web (?:engineer|developer)'),
  t('fullstack', 'full-stack', 'role', 'full[- ]?stack'),
  t('platform', 'platform', 'role', 'platform'),
  t('infra', 'infrastructure', 'role', 'infra(?:structure)?|cloud|kubernetes|k8s|devops|sre|site reliability|reliability|observability'),
  t('data', 'data engineering', 'role', 'data (?:engineer(?:ing)?|platform|infrastructure|pipelines?)|analytics engineer(?:ing)?|etl|spark|data warehouse'),
  t('ml', 'machine learning', 'role', 'machine learning|ml|mlops|deep learning|computer vision|applied scientist|research engineer(?:ing)?|model training'),
  t('ai', 'AI / LLM', 'role', 'ai|a\\.i\\.|artificial intelligence|llms?|gen ?ai|generative|agents?|agentic|nlp|inference|rag'),
  t('security', 'security', 'role', 'security|appsec|infosec|application security'),
  t('product', 'product engineering', 'role', 'product engineer(?:ing)?'),
  t('fde', 'forward-deployed', 'role', 'forward[- ]deployed|fde|solutions? engineer(?:ing)?|customer engineer(?:ing)?|deployment engineer'),
  t('distributed', 'distributed systems', 'role', 'distributed systems?|systems engineer(?:ing)?'),
  t('embedded', 'embedded / robotics', 'role', 'embedded|firmware|robotics?|autonomy|hardware'),
  t('devtools', 'developer tools', 'role', 'developer tools|devtools|developer experience|devex|compilers?|build systems?'),
  t('typescript', 'TypeScript', 'skill', 'typescript|javascript|node(?:\\.?js)?'),
  t('react', 'React', 'skill', 'react(?:\\.?js)?|next\\.?js'),
  t('python', 'Python', 'skill', 'python|django|fastapi'),
  t('go', 'Go', 'skill', 'golang|go (?:engineer|developer)'),
  t('rust', 'Rust', 'skill', 'rust'),
  t('cpp', 'C++', 'skill', 'c\\+\\+|cpp'),
  t('sql', 'SQL / Postgres', 'skill', 'sql|postgres(?:ql)?'),
  t('software', 'software engineering', 'generic', 'software (?:engineer(?:ing)?|developer|development)|swe|programmer|developer|coder'),
];

export const TAG_TERMS: Readonly<Record<string, string>> = {
  typescript: 'typescript', react: 'react', platform: 'platform', frontend: 'frontend', fullstack: 'fullstack',
  'forward-deployed': 'fde', 'product-engineer': 'product',
};

export const OUTSIDE_POOL = /(?:^|[^a-z])(?:nurse|nursing|doctor|physician|teacher|sales|account executive|marketing|recruit(?:er|ing)|accountant|accounting|lawyer|legal|cashier|driver|chef|waiter|ios|android|mobile|swift|kotlin|java|customer support|customer service|hr|human resources|copywriter|translator)(?=$|[^a-z])/i;

export const LEVELS = ['junior', 'mid', 'senior', 'staff', 'principal'] as const;
export type Level = (typeof LEVELS)[number];
const LEVEL_RE: ReadonlyArray<[Level, RegExp]> = [
  ['principal', /(?:^|[^a-z])(?:principal|distinguished)(?=$|[^a-z])/i],
  ['staff', /(?:^|[^a-z])(?:staff|lead|tech lead)(?=$|[^a-z])/i],
  ['senior', /(?:^|[^a-z])(?:senior|sr\.?)(?=$|[^a-z])/i],
  ['junior', /(?:^|[^a-z])(?:junior|jr\.?|intern(?:ship)?|graduate|entry[- ]level|new grad|trainee)(?=$|[^a-z])/i],
  ['mid', /(?:^|[^a-z])(?:mid[- ]?level|intermediate|mid)(?=$|[^a-z])/i],
];
export const levelOf = (text: string): Level | null => {
  for (const [lvl, re] of LEVEL_RE) if (re.test(text)) return lvl;
  const y = /(\d{1,2})\+?\s*(?:years|yrs|yoe)/i.exec(text);
  if (y?.[1]) { const n = Number(y[1]); return n < 2 ? 'junior' : n < 5 ? 'mid' : 'senior'; }
  return null;
};

export const levelOfPool = (s: string | null): Level | null =>
  s === 'mid' ? 'mid' : s === 'senior' ? 'senior' : s === 'staff' || s === 'lead' ? 'staff' : s === 'principal' ? 'principal' : s === 'junior' ? 'junior' : null;

export const termsIn = (text: string): Set<string> => new Set(TERMS.filter(x => x.re.test(text)).map(x => x.key));
export const label = (key: string): string => TERMS.find(x => x.key === key)?.label ?? key;
export const kindOf = (key: string): TermKind => TERMS.find(x => x.key === key)?.kind ?? 'skill';
export const MANAGER_TITLE = /(?:^|[^a-z])(?:manager|director|head of|vp|vice president|chief)(?=$|[^a-z])/i;
