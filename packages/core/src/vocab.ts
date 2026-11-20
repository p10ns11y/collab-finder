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
  t('leadership', 'engineering leadership', 'role', 'engineering manager|(?:engineering|software|development) (?:manager|director|leadership)|manager,? (?:software )?engineering|vp|vice president|head of|director|cto|ciso|chief technology officer|chief information security officer'),
  t('agents', 'AI agents', 'domain', 'agentic|agents?|multi-agent|agent (?:platform|systems?|frameworks?|sdk|infrastructure|runtime)'),
  t('physical', 'physical products', 'domain', 'physical (?:products?|ai|world)|devices?|robots?|robotics|vehicles?|hardware|drones?|satellites?|embedded|embodied|autonomous (?:vehicles?|driving|robots?|drones?)'),
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
  t('java', 'Java', 'skill', 'java|jvm|scala'),
  t('kotlin', 'Kotlin', 'skill', 'kotlin'),
  t('spring', 'Spring', 'skill', 'spring(?: boot)?'),
  t('kafka', 'Kafka', 'skill', 'kafka'),
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
  const text = inEnglish(raw).replace(MTS, ' ').replace(NOT_MY_LEVEL, ' ');
  for (const [lvl, re] of LEVEL_RE) if (re.test(text)) return lvl;
  const y = /(\d{1,2})\+?\s*(?:years|yrs|yoe)/i.exec(text);
  if (y?.[1]) { const n = Number(y[1]); return n < 2 ? 'junior' : n < 5 ? 'mid' : 'senior'; }
  return null;
};

export const levelOfPool = (s: string | null): Level | null =>
  s === 'mid' ? 'mid' : s === 'senior' ? 'senior' : s === 'staff' || s === 'lead' ? 'staff' : s === 'principal' ? 'principal' : s === 'junior' || s === 'intern' ? 'junior' : null;

const LANG = 'python|rust|java|kotlin|scala|typescript|javascript|ts|js|node(?:\\.?js)?|c\\+\\+|c#|ruby|elixir|php|swift|react|postgres(?:ql)?|sql|kubernetes|k8s|docker|aws|gcp|grpc|kafka|terraform';
const GO_CAPITAL = /(^|[^A-Za-z-])Go(?![A-Za-z-])(?!\s+to\b)/g;
const GO_NOUN_NEXT = /^\s+(?!(?:engineer|developer|programming|backend|services|microservices|and|or|code|is|was|has|are)\b)[a-z]/;
const GO_LOWER = new RegExp(`(^\\s*|[,/(&+]\\s*|\\b(?:in|with|of|using)\\s+|\\b(?:${LANG})\\s+(?:and|or|&)\\s+)go(?=\\s*[/)&+]|(?<=(?:^\\s*|[,/(&+]\\s*)go)\\s*,|\\s*,\\s*(?:${LANG})\\b|\\s+(?:and|or|&)\\s+(?:${LANG})\\b|\\s+(?:developer|engineer|programming|backend|services|microservices)\\b|\\s*[.;]?\\s*$)`, 'gi');
const sentenceStart = (before: string): boolean => /(?:^|[.!?])\s*$/.test(before);
export const languageGo = (text: string): string => text
  .replace(GO_CAPITAL, (m: string, pre: string, at: number) => {
    const after = text.slice(at + m.length, at + m.length + 40);
    return sentenceStart(text.slice(0, at + pre.length)) && GO_NOUN_NEXT.test(after) ? m : `${pre} golang `;
  })
  .replace(GO_LOWER, (_m: string, pre: string) => `${pre} golang `);
export const SWEDISH: ReadonlyArray<readonly [string, string]> = [
  ['systemutvecklare', 'software developer'], ['mjukvaruutvecklare', 'software developer'], ['programutvecklare', 'software developer'],
  ['mjukvaruingenjör', 'software engineer'], ['programvaruingenjör', 'software engineer'], ['webbutvecklare', 'web developer'], ['apputvecklare', 'mobile developer'],
  ['systemutveckling', 'software development'], ['mjukvaruutveckling', 'software development'], ['webbutveckling', 'web development'],
  ['utvecklingschef', 'engineering manager'], ['teknikchef', 'head of engineering'], ['it-chef', 'head of engineering'], ['teamledare', 'team lead'],
  ['backendutvecklare', 'backend developer'], ['frontendutvecklare', 'frontend developer'], ['fullstackutvecklare', 'fullstack developer'],
  ['dataingenjör', 'data engineer'], ['utvecklare', 'developer'], ['ingenjör', 'engineer'], ['erfarenhet', 'experience'], ['års', 'years'], ['år', 'years'],
  ['maskininlärning', 'machine learning'], ['artificiell intelligens', 'artificial intelligence'], ['molntjänster', 'cloud'], ['moln', 'cloud'],
  ['infrastruktur', 'infrastructure'], ['plattform', 'platform'], ['informationssäkerhet', 'security'], ['säkerhet', 'security'],
  ['distribuerade system', 'distributed systems'], ['inbyggda system', 'embedded systems'], ['robotik', 'robotics'], ['hårdvara', 'hardware'],
  ['fordon', 'vehicles'], ['drönare', 'drones'], ['webbapplikationer', 'web applications'], ['utvecklarverktyg', 'developer tools'],
  ['praktikant', 'intern'], ['nyexaminerad', 'new grad'],
];
const SV_SUFFIX = '(?:n|en|er|na|erna|et)?(?![\\p{L}\\p{N}])';
const SV_WORDS = new Map(SWEDISH);
const SV_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${[...SV_WORDS.keys()].sort((a, b) => b.length - a.length).join('|')})${SV_SUFFIX}`, 'giu');
const SV_COMPOUND = new RegExp(`(utvecklare|ingenjör)(?=${SV_SUFFIX})`, 'giu');
export const inEnglish = (text: string): string => text
  .replace(SV_RE, (_m: string, w: string) => ` ${SV_WORDS.get(w.toLowerCase()) ?? w} `)
  .replace(SV_COMPOUND, (_m: string, w: string) => (w.toLowerCase() === 'utvecklare' ? ' developer' : ' engineer'));
export const mostlyNonLatin = (text: string): boolean => {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  return letters > 0 && latin * 2 < letters;
};
export const termsIn = (text: string): Set<string> => {
  const t = languageGo(inEnglish(text));
  return new Set(TERMS.filter(x => x.re.test(t)).map(x => x.key));
};
export const label = (key: string): string => TERMS.find(x => x.key === key)?.label ?? key;
export const kindOf = (key: string): TermKind => TERMS.find(x => x.key === key)?.kind ?? 'skill';
export const ENGINEERING_TITLE = /(?:^|[^a-z])(?:engineer(?:ing)?|developer|scientist|architect|programmer|sre|devops|swe|utvecklare|ingenj[öo]r|member of technical staff|mts)(?=$|[^a-z])/i;
export const NON_ENGINEERING_TITLE = /(?:^|[^a-z])(?:sales|account executive|account manager|marketing|recruit(?:er|ing)|talent|customer success|customer service|support|workplace|it (?:engineer|support)|help ?desk|field service|facilities|mechanical|electrical|civil|manufacturing|technician|quality assurance technician)(?=$|[^a-z])/i;
export const MANAGER_TITLE = /(?:^|[^a-z])(?:manager|director|head of|vp|vice president|chief)(?=$|[^a-z])/i;
const LEADERSHIP_VETO = /(?:^|[^a-z0-9])(?:business development|assistant|chief of staff|to the|sox|startups?|partner(?:ship)?s?|accounting|sales|design|operations|counsel)(?=$|[^a-z0-9])/i;
export const LEADERSHIP_PHRASES: ReadonlyArray<string> = ['application security', 'product security', 'information security', 'security engineering', 'data engineering', 'data science', 'machine learning', 'ai engineering', 'head of ai', 'it platform', 'vp engineering', 'vp eng', 'engineering', 'software', 'devops', 'sre', 'platform', 'infrastructure', 'ciso', 'ml', 'cto'];
const LEADERSHIP_PHRASE_RE = new RegExp(`(?:^|[^a-z0-9])(?:${[...LEADERSHIP_PHRASES].sort((a, b) => b.length - a.length).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[^a-z0-9])`, 'i');
const LEADERSHIP_TERM = TERMS.find(x => x.key === 'leadership')!.re;
const leadershipOk = (english: string): boolean => LEADERSHIP_TERM.test(languageGo(english)) && !LEADERSHIP_VETO.test(english) && LEADERSHIP_PHRASE_RE.test(english);
export const hasLeadershipPhrase = (text: string): boolean => {
  const t = inEnglish(text);
  return !LEADERSHIP_VETO.test(t) && LEADERSHIP_PHRASE_RE.test(t);
};
export const leadsEngineering = (text: string): boolean => leadershipOk(inEnglish(text));
const SV_TEST = new RegExp(SV_RE.source, 'iu');
const SV_COMPOUND_TEST = new RegExp(SV_COMPOUND.source, 'iu');
export const hasSwedish = (text: string): boolean => SV_TEST.test(text) || SV_COMPOUND_TEST.test(text);
const ENGLISH_ROLE = /(?:^|[^a-z])(?:engineer|developer|programmer|manager|software|backend|frontend|fullstack|platform)(?=$|[^a-z])/i;
export const swedishOnlyTitle = (title: string): boolean => hasSwedish(title) && !ENGLISH_ROLE.test(title);
export const isLearner = (text: string): boolean => /^\s*(?:an?\s+)?student learning\b/i.test(text) || /^\s*learning html\b/i.test(text);
export const isLeadershipRow = (row: { title: string }): boolean => {
  const t = inEnglish(row.title);
  return leadershipOk(t) && !NON_ENGINEERING_TITLE.test(t);
};
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

export const AGENCY_TITLE = /(?:^|[^a-z])(?:freelanc(?:e|er|ing)|contractor|(?:fixed[- ]term )?contract (?:role|position|basis|assignment)|\(contract\)|consultants?|konsult(?:er)?|underkonsult|it-konsult|uppdrag|interim|for (?:our|a) client|on behalf of|för (?:vår|en) kund|hos (?:vår|en) kund|bli rekryterad|staff augmentation|nearshore|offshore)(?=$|[^a-z])/i;
export const CLIENT_PLACEMENT = /(?:[Dd]eveloper|[Ee]ngineer|[Uu]tvecklare|[Aa]rchitect|[Aa]rkitekt|[Ss]pecialist|[Kk]onsult|[Tt]ester|[Dd]esigner)s?\s+(?:to|till)\s+(?!(?:Join|Work|Help|Build|Lead|Shape|Scale|Grow|Our|The|A)\b)[A-ZÅÄÖ][\w&.-]*(?:\s+[A-ZÅÄÖ][\w&.-]*){0,3}\s*!?\s*$/;
export const AGENCY_COMPANY = /(?:^|[^a-z])(?:consult(?:ing|ancy|ants?)?|konsult(?:er|bolag)?|recruit(?:ment|ing|ers)?|rekryter(?:ing)?|staffing|bemanning|talent|agency|byr[åa]|outsourc(?:e|ing)|freelanc(?:e|ers?)|it[- ]services|tech[- ]services|nearshore|offshore|headhunt(?:ing|ers)?)(?=$|[^a-z])/i;
export const isAgencyRow = (row: { title: string; company: string }): boolean => AGENCY_TITLE.test(row.title) || CLIENT_PLACEMENT.test(row.title) || AGENCY_COMPANY.test(row.company);

const PLACE_WORDS = new Set(('remote hybrid onsite on-site site anywhere worldwide global emea europe european eu uk us usa united states kingdom americas america apac latam nordics nordic dach benelux cee '
  + 'sweden swedish stockholm gothenburg göteborg goteborg malmö malmo uppsala lund linköping linkoping örebro västerås umeå '
  + 'london manchester edinburgh cambridge oxford bristol leeds glasgow belfast england scotland wales ireland dublin '
  + 'new york nyc san francisco bay area seattle austin boston chicago los angeles denver atlanta miami washington dc texas california '
  + 'canada toronto vancouver montreal mexico brazil sao são paulo argentina buenos aires '
  + 'berlin munich münchen hamburg frankfurt cologne köln stuttgart düsseldorf germany deutschland amsterdam rotterdam utrecht eindhoven netherlands '
  + 'paris lyon toulouse nantes france madrid barcelona valencia seville spain lisbon porto portugal rome milan turin italy '
  + 'copenhagen aarhus denmark oslo bergen norway helsinki espoo tampere finland warsaw krakow kraków wroclaw wrocław gdansk poland '
  + 'vienna austria zurich zürich geneva lausanne basel bern switzerland brussels antwerp belgium luxembourg prague czech czechia '
  + 'budapest hungary bucharest romania sofia bulgaria athens greece tallinn estonia riga latvia vilnius lithuania belgrade serbia zagreb croatia '
  + 'kyiv ukraine istanbul turkey tel aviv israel dubai uae india bangalore bengaluru hyderabad pune singapore tokyo japan seoul korea sydney melbourne australia canberra auckland').split(' '));
const PLACE_FILLER = new Set('and or in based only office first time zone zones timezone friendly the of within across from area region country countries city cities x f m d w h genders all gender'.split(' '));
export type PlaceRegion = 'SE' | 'EU' | 'UK' | 'US' | 'other' | 'remote-anywhere';
const foldPlace = (s: string): string => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
const placeWords = (s: string): string[] => foldPlace(s).split(/[^a-z0-9]+/).filter(Boolean);
const placeHas = (words: ReadonlyArray<string>, w: string): boolean => words.includes(w);
const placePhrase = (words: ReadonlyArray<string>, p: string): boolean => ` ${words.join(' ')} `.includes(` ${p} `);
const LATAM = new Set('brazil brasil argentina mexico chile colombia peru uruguay paraguay bolivia ecuador venezuela panama guatemala cuba honduras nicaragua latam'.split(' '));
const LATAM_PHRASE = ['porto alegre', 'sao paulo', 'rio de janeiro', 'buenos aires', 'mexico city', 'costa rica', 'puerto rico', 'latin america'];
const OTHER_COUNTRY = new Set('canada india singapore australia japan china israel uae korea brazil'.split(' '));
const SE_WORD = new Set('sweden sverige stockholm gothenburg goteborg malmo uppsala'.split(' '));
const UK_WORD = new Set('uk england scotland wales london manchester edinburgh cambridge bristol oxford belfast glasgow'.split(' '));
const US_STATE = new Set('al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc'.split(' '));
const US_NAME = new Set('alabama alaska arizona arkansas california colorado connecticut delaware florida georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada ohio oklahoma oregon pennsylvania tennessee texas utah vermont virginia washington wisconsin wyoming'.split(' '));
const CA_PROVINCE = new Set('on bc qc ab mb sk ns nb'.split(' '));
const EU_COUNTRY = new Set('germany deutschland france netherlands holland spain portugal italy ireland austria belgium poland denmark norway finland switzerland iceland estonia latvia lithuania czech czechia hungary romania greece croatia bulgaria slovakia slovenia luxembourg europe eu emea'.split(' '));
const EU_CITY = new Set('berlin munich munchen amsterdam paris madrid barcelona lisbon lisboa dublin copenhagen kobenhavn helsinki oslo warsaw vienna zurich porto hamburg frankfurt cologne brussels prague tallinn rome milan lyon toulouse rotterdam eindhoven'.split(' '));
const STATE_COLLIDE = new Set('de in me la id md co pa'.split(' '));
export const regionOf = (location: string): PlaceRegion | null => {
  const words = placeWords(location);
  if (!words.length) return null;
  const has = (w: string) => placeHas(words, w);
  const phrase = (p: string) => placePhrase(words, p);
  if (phrase('multiple locations') || (words.length === 1 && has('hybrid'))) return null;
  const remote = has('remote');
  if (remote && (has('us') || has('usa') || phrase('united states'))) return 'US';
  if (remote && (has('europe') || has('eu') || has('emea'))) return 'EU';
  if (remote && (has('uk') || phrase('united kingdom'))) return 'UK';
  if (remote && (has('sweden') || has('sverige'))) return 'SE';
  if (remote && (has('global') || has('worldwide') || has('anywhere'))) return 'remote-anywhere';
  if (words.length === 1 && (has('remote') || has('anywhere') || has('worldwide'))) return 'remote-anywhere';
  if (phrase('new mexico') || phrase('united states') || has('usa')) return 'US';
  if (LATAM_PHRASE.some(phrase) || words.some(w => LATAM.has(w))) return 'other';
  if (phrase('united kingdom')) return 'UK';
  if (words.some(w => SE_WORD.has(w))) return 'SE';
  const last = words[words.length - 1]!;
  if (CA_PROVINCE.has(last) || words.some(w => OTHER_COUNTRY.has(w))) return 'other';
  if (words.some(w => UK_WORD.has(w))) return 'UK';
  const euCity = words.some(w => EU_CITY.has(w));
  if ((US_STATE.has(last) || US_NAME.has(last)) && !(STATE_COLLIDE.has(last) && euCity)) return 'US';
  if (words.some(w => EU_COUNTRY.has(w)) || euCity) return 'EU';
  if (words.some(w => US_NAME.has(w))) return 'US';
  return null;
};
export const isPlaceWord = (word: string): boolean => PLACE_WORDS.has(word.toLowerCase());
export const isLocationPart = (text: string): boolean => {
  const words = text.toLowerCase().split(/[^a-zà-öø-ÿ]+/).filter(Boolean);
  if (!words.length) return false;
  if (words.every(w => PLACE_FILLER.has(w))) return /[xfmdwh]\s*\/\s*[xfmdwh]|genders?/i.test(text);
  return words.every(w => PLACE_WORDS.has(w) || PLACE_FILLER.has(w)) && words.some(w => PLACE_WORDS.has(w));
};
