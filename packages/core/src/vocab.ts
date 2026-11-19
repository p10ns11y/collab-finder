export type TermKind = 'role' | 'skill' | 'generic' | 'domain';
export type Term = { key: string; label: string; kind: TermKind; re: RegExp };

const t = (key: string, label: string, kind: TermKind, src: string): Term => ({ key, label, kind, re: new RegExp(`(?:^|[^a-z0-9+#])(?:${src})(?=$|[^a-z0-9+#])`, 'i') });

export const TERMS: ReadonlyArray<Term> = [
  t('backend', 'backend', 'role', 'back[- ]?end|server[- ]side|apis?'),
  t('frontend', 'frontend', 'role', 'front[- ]?end|ui engineer(?:ing)?|web (?:engineer|developer)|web applications?|web apps?|web development'),
  t('fullstack', 'full-stack', 'role', 'full[- ]?stack|web applications?|web apps?|web development'),
  t('platform', 'platform', 'role', 'platform'),
  t('infra', 'infrastructure', 'role', 'infra(?:structure)?|cloud|kubernetes|k8s|devops|sre|site reliability|reliability|observability'),
  t('data', 'data engineering', 'role', 'data (?:engineer(?:ing)?|platform|infrastructure|pipelines?)|analytics engineer(?:ing)?|etl|spark|data warehouse'),
  t('ml', 'machine learning', 'role', 'machine learning|ml|mlops|deep learning|computer vision|applied scientist|research engineer(?:ing)?|model training'),
  t('ai', 'AI / LLM', 'role', 'ai|ia|a\\.i\\.|artificial intelligence|llms?|gen ?ai|generative|ai agents?|agents? (?:engineer(?:ing)?|platform|systems?|infrastructure|sdk)|agentic|nlp|inference|rag'),
  t('security', 'security', 'role', 'security|appsec|infosec|application security'),
  t('product', 'product engineering', 'role', 'product engineer(?:ing)?'),
  t('fde', 'forward-deployed', 'role', 'forward[- ]deployed|fde|solutions? engineer(?:ing)?|customer engineer(?:ing)?|deployment engineer'),
  t('distributed', 'distributed systems', 'role', 'distributed systems?|systems engineer(?:ing)?'),
  t('agents', 'AI agents', 'domain', 'agentic|agents?|multi-agent|agent (?:platform|systems?|frameworks?|sdk|infrastructure|runtime)'),
  t('physical', 'physical products', 'domain', 'physical (?:products?|ai|world|systems?)|devices?|robots?|robotics|vehicles?|autonomous|autonomy|drones?|hardware|embodied|automotive'),
  t('frontier', 'frontier AI labs', 'domain', 'frontier (?:ai )?(?:labs?|models?|research)|ai labs?|research labs?|foundation models?'),
  t('productteams', 'product teams', 'domain', 'product (?:teams?|companies|company|orgs?|organi[sz]ations?)|product-led'),
  t('embedded', 'embedded / robotics', 'role', 'embedded|firmware|robotics?|autonomy|hardware'),
  t('devtools', 'developer tools', 'role', 'developer tools|devtools|developer experience|devex|compilers?|build systems?'),
  t('typescript', 'TypeScript', 'skill', 'typescript|javascript|node(?:\\.?js)?'),
  t('react', 'React', 'skill', 'react(?:\\.?js)?|next\\.?js'),
  t('python', 'Python', 'skill', 'python|django|fastapi'),
  t('go', 'Go', 'skill', 'golang|go (?:engineer|developer)'),
  t('rust', 'Rust', 'skill', 'rust'),
  t('cpp', 'C++', 'skill', 'c\\+\\+|cpp'),
  t('java', 'Java / Kotlin', 'skill', 'java|kotlin|jvm|spring boot|scala'),
  t('sql', 'SQL / Postgres', 'skill', 'sql|postgres(?:ql)?'),
  t('software', 'software engineering', 'generic', 'software (?:engineer(?:ing)?|developer|development)|swe|programmer|developer|coder|member of technical staff|mts'),
];

export const TAG_TERMS: Readonly<Record<string, string>> = {
  typescript: 'typescript', react: 'react', platform: 'platform', frontend: 'frontend', fullstack: 'fullstack',
  'forward-deployed': 'fde', 'product-engineer': 'product',
};

export const OUTSIDE_POOL = /(?:^|[^a-z])(?:nurse|nursing|doctor|physician|teacher|sales|account executive|marketing|recruit(?:er|ing)|accountant|accounting|lawyer|legal|cashier|driver|chef|waiter|ios|android|mobile|swift|customer support|customer service|hr|human resources|copywriter|translator)(?=$|[^a-z])/i;

export const NOT_MY_LEVEL = /(?:mentor|coach|manag|lead|led|onboard|hire|hiring|hired|train|support|teach|taught|guid)[a-z]*\s+(?:(?:of|for|the|our|new|a|team|several|many|\d+)\s+)*(?:junior|graduate|intern|trainee|new grad)s?|(?:post)?graduate (?:degree|diploma|studies|program(?:me)?|school)|graduated/gi;
export const PAST_CLAUSE = /(?:^|[.;,!?\n]|\band\b)\s*(?:i\s+)?(?:was|were|former(?:ly)?|ex-|previously|used to be|earlier|prior to that|before that)[^.;!?\n]*/gi;
export const currentLevel = (text: string): Level | null => levelOf(text.replace(PAST_CLAUSE, ' '));
export const LEVELS = ['junior', 'mid', 'senior', 'staff', 'principal'] as const;
export type Level = (typeof LEVELS)[number];
const LEVEL_RE: ReadonlyArray<[Level, RegExp]> = [
  ['principal', /(?:^|[^a-z])(?:principal|distinguished)(?=$|[^a-z])/i],
  ['staff', /(?:^|[^a-z])(?:staff|lead|tech lead)(?=$|[^a-z])/i],
  ['senior', /(?:^|[^a-z])(?:senior|sr\.?)(?=$|[^a-z])/i],
  ['junior', /(?:^|[^a-z])(?:junior|jr\.?|intern(?:ship)?|graduate|entry[- ]level|new grad|trainee)(?=$|[^a-z])/i],
  ['mid', /(?:^|[^a-z])(?:mid[- ]?level|intermediate|mid)(?=$|[^a-z])/i],
];
export const MTS = /member of technical staff|(?:^|[^a-z])mts(?=$|[^a-z])/gi;
export const levelOf = (raw: string): Level | null => {
  const text = raw.replace(MTS, ' ').replace(NOT_MY_LEVEL, ' ');
  for (const [lvl, re] of LEVEL_RE) if (re.test(text)) return lvl;
  const y = /(\d{1,2})\+?\s*(?:years|yrs|yoe)/i.exec(text);
  if (y?.[1]) { const n = Number(y[1]); return n < 2 ? 'junior' : n < 5 ? 'mid' : 'senior'; }
  return null;
};

export const levelOfPool = (s: string | null): Level | null =>
  s === 'mid' ? 'mid' : s === 'senior' ? 'senior' : s === 'staff' || s === 'lead' ? 'staff' : s === 'principal' ? 'principal' : s === 'junior' || s === 'intern' ? 'junior' : null;

export const termsIn = (text: string): Set<string> => new Set(TERMS.filter(x => x.re.test(text)).map(x => x.key));
export const label = (key: string): string => TERMS.find(x => x.key === key)?.label ?? key;
export const kindOf = (key: string): TermKind => TERMS.find(x => x.key === key)?.kind ?? 'skill';
export const ENGINEERING_TITLE = /(?:^|[^a-z])(?:engineer(?:ing)?|developer|scientist|architect|programmer|sre|devops|swe|utvecklare|ingenj[öo]r|member of technical staff|mts)(?=$|[^a-z])/i;
export const NON_ENGINEERING_TITLE = /(?:^|[^a-z])(?:sales|account executive|account manager|marketing|recruit(?:er|ing)|talent|customer success|customer service|support|workplace|it (?:engineer|support)|help ?desk|field service|facilities|mechanical|electrical|civil|manufacturing|technician|quality assurance technician)(?=$|[^a-z])/i;
export const MANAGER_TITLE = /(?:^|[^a-z])(?:manager|director|head of|vp|vice president|chief)(?=$|[^a-z])/i;
export const MOBILE_TITLE = /(?:^|[^a-z])(?:mobile|ios|android|swift|kotlin multiplatform|react native|flutter)(?=$|[^a-z])/i;
export const NARROWING_ROLES: ReadonlySet<string> = new Set(['frontend', 'backend', 'embedded', 'security', 'data', 'ml', 'fde']);
export const COVERS: Readonly<Record<string, ReadonlyArray<string>>> = {
  fullstack: ['frontend', 'backend'], ml: ['ai', 'data'], ai: ['ml'], platform: ['infra', 'backend'], infra: ['platform'], distributed: ['backend'], product: ['frontend', 'backend', 'fullstack'],
};
export const PLACES: ReadonlyArray<[string, RegExp]> = [
  ['SE', /(?:^|[^a-z])(?:sweden|stockholm|gothenburg|g[öo]teborg|malm[öo]|uppsala|swedish)(?=$|[^a-z])/i],
  ['UK', /(?:^|[^a-z])(?:uk|united kingdom|london|manchester|edinburgh|cambridge)(?=$|[^a-z])/i],
  ['US', /(?:^|[^a-z])(?:usa|united states|new york|nyc|san francisco|bay area|seattle|austin|boston)(?=$|[^a-z])/i],
  ['EU', /(?:^|[^a-z])(?:berlin|munich|amsterdam|paris|madrid|barcelona|lisbon|dublin|copenhagen|helsinki|oslo|warsaw|vienna|zurich|europe)(?=$|[^a-z])/i],
];

export const AGENCY_TITLE = /(?:^|[^a-z])(?:freelanc(?:e|er|ing)|contractor|(?:fixed[- ]term )?contract (?:role|position|basis|assignment)|\(contract\)|consultants?|consulting|konsult(?:er)?|underkonsult|it-konsult|uppdrag|interim|for (?:our|a) client|on behalf of|för (?:vår|en) kund|hos (?:vår|en) kund|bli rekryterad|staff augmentation|nearshore|offshore)(?=$|[^a-z])/i;
export const CLIENT_PLACEMENT = /(?:[Dd]eveloper|[Ee]ngineer|[Uu]tvecklare|[Aa]rchitect|[Aa]rkitekt|[Ss]pecialist|[Kk]onsult|[Tt]ester|[Dd]esigner)s?\s+(?:to|till)\s+(?!(?:Join|Work|Help|Build|Lead|Shape|Scale|Grow|Our|The|A)\b)[A-ZÅÄÖ][\w&.-]*(?:\s+[A-ZÅÄÖ][\w&.-]*){0,3}\s*!?\s*$/;
export const AGENCY_COMPANY = /(?:^|[^a-z])(?:consult(?:ing|ancy|ants?)?|konsult(?:er|bolag)?|recruit(?:ment|ing|ers)?|rekryter(?:ing)?|staffing|bemanning|talent|agency|byr[åa]|outsourc(?:e|ing)|freelanc(?:e|ers?)|it[- ]services|tech[- ]services|nearshore|offshore|headhunt(?:ing|ers)?)(?=$|[^a-z])/i;
export const isAgencyRow = (row: { title: string; company: string }): boolean => AGENCY_TITLE.test(row.title) || CLIENT_PLACEMENT.test(row.title) || AGENCY_COMPANY.test(row.company);
