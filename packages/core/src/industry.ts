export const INDUSTRIES = {
  fintech: { label: 'Fintech', likes: ['fintech', 'finance', 'financial', 'payments', 'payment', 'banking', 'bank', 'lending', 'insurtech', 'insurance', 'wealth', 'trading'], text: /\b(?:fintech|payments? (?:platform|infrastructure|processing|provider|company)|banking|neobank|lending|loans|credit cards?|financial services|financial institutions|insurtech|insurance (?:company|provider|platform|products?|carriers?)|wealth management|brokerage|trading platform|money transfers?|spend management|accounts payable|card issuing)\b/gi },
  crypto: { label: 'Crypto and web3', likes: ['crypto', 'web3', 'blockchain', 'defi', 'bitcoin', 'ethereum'], text: /\b(?:crypto(?:currency|currencies)?|blockchain|web3|defi|stablecoins?|bitcoin|ethereum|on-?chain|digital assets)\b/gi },
  healthtech: { label: 'Health', likes: ['healthtech', 'health', 'healthcare', 'medtech', 'medical', 'clinical', 'biotech', 'pharma'], text: /\b(?:healthcare (?:providers?|systems?|industry|organi[sz]ations?|companies|professionals)|health ?tech|patients?|clinical|clinicians?|medical (?:devices?|records|imaging|software|data)|hospitals?|physicians?|biotech|pharma(?:ceutical)?s?|drug discovery|care providers?|telehealth)\b/gi },
  climate: { label: 'Climate and energy', likes: ['climate', 'climatetech', 'cleantech', 'energy', 'sustainability', 'renewables', 'carbon'], text: /\b(?:climate (?:change|tech|crisis|action)|carbon (?:removal|emissions|accounting|capture)|decarboni[sz]ation|renewables?|renewable energy|clean energy|solar|wind (?:power|farms?)|emissions|net[- ]zero|power grid|energy transition|batter(?:y|ies) storage|heat pumps?)\b/gi },
  devtools: { label: 'Developer tools', likes: ['devtools', 'developer tools', 'developer tooling', 'developer experience', 'dx', 'open source', 'observability'], text: /\b(?:developer tools?|devtools|developer platform|developer tooling|for developers|developers love|used by (?:millions of |thousands of )?developers|millions of developers|developer community|developer-first)\b/gi },
  security: { label: 'Security', likes: ['security', 'cybersecurity', 'infosec', 'appsec', 'identity'], text: /\b(?:cyber ?security|security platform|threats?|threat detection|zero trust|vulnerabilit(?:y|ies)|identity (?:security|and access)|endpoint security|security operations|soc 2 automation|attack surface)\b/gi },
  gaming: { label: 'Games', likes: ['gaming', 'games', 'game', 'gamedev', 'videogames'], text: /\b(?:video games?|gaming|games? studio|game development|game designers?|mobile games?|game engine|unreal engine|live games?)\b/gi },
  edtech: { label: 'Education', likes: ['edtech', 'education', 'learning', 'elearning'], text: /\b(?:edtech|education (?:platform|technology|company)|learners|teachers|classrooms?|online learning|e-?learning|tutoring|universities and schools)\b/gi },
  ecommerce: { label: 'Commerce and retail', likes: ['ecommerce', 'e-commerce', 'commerce', 'retail', 'marketplace', 'marketplaces'], text: /\b(?:e-?commerce|online retail|retailers?|merchants?|marketplaces?|shoppers?|checkout|storefronts?)\b/gi },
  mobility: { label: 'Mobility and logistics', likes: ['mobility', 'logistics', 'transport', 'transportation', 'automotive', 'delivery', 'supply chain'], text: /\b(?:mobility|logistics|supply chain|freight|shipping|fleets?|autonomous (?:vehicles?|trucks?|driving)|automotive|transportation|last[- ]mile|deliver(?:y|ies) network)\b/gi },
  legaltech: { label: 'Legal', likes: ['legaltech', 'legal', 'law', 'lawyers'], text: /\b(?:legal ?tech|lawyers?|law firms?|legal teams?|attorneys?|contracts? (?:review|management)|in-house legal)\b/gi },
} as const satisfies Record<string, { label: string; likes: ReadonlyArray<string>; text: RegExp }>;

export type Industry = keyof typeof INDUSTRIES;
export const INDUSTRY_IDS = Object.keys(INDUSTRIES) as [Industry, ...Industry[]];
export const MIN_DISTINCT_TERMS = 2;
export const MIN_COMPANY_SHARE = 0.34;

const distinctTerms = (re: RegExp, text: string): number => new Set([...text.matchAll(re)].map(m => m[0].toLowerCase())).size;

export const industriesOfText = (text: string): ReadonlyArray<Industry> =>
  INDUSTRY_IDS.filter(id => distinctTerms(INDUSTRIES[id].text, text) >= MIN_DISTINCT_TERMS);

export function companyIndustries(postings: Iterable<{ company: string; text: string }>): ReadonlyMap<string, ReadonlyArray<Industry>> {
  const seen = new Map<string, { n: number; hits: Map<Industry, number> }>();
  for (const { company, text } of postings) {
    const key = company.trim().toLowerCase();
    const entry = seen.get(key) ?? { n: 0, hits: new Map<Industry, number>() };
    entry.n += 1;
    for (const id of industriesOfText(text)) entry.hits.set(id, (entry.hits.get(id) ?? 0) + 1);
    seen.set(key, entry);
  }
  const out = new Map<string, ReadonlyArray<Industry>>();
  for (const [key, { n, hits }] of seen) {
    const kept = INDUSTRY_IDS.filter(id => (hits.get(id) ?? 0) / n >= MIN_COMPANY_SHARE);
    if (kept.length) out.set(key, kept);
  }
  return out;
}

const fold = (s: string): string => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
const LIKE_TO_INDUSTRY: ReadonlyMap<string, Industry> = new Map(INDUSTRY_IDS.flatMap(id => INDUSTRIES[id].likes.map(w => [fold(w), id] as const)));

export const industryOfLike = (entry: ReadonlyArray<string>): Industry | undefined => {
  const joined = entry.join(' ');
  return LIKE_TO_INDUSTRY.get(joined) ?? LIKE_TO_INDUSTRY.get(joined.replace(/ (?:tech|industry|sector|companies|startups?)$/, ''));
};
