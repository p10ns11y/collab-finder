export { match, findPii, redactPii, validateProfile, understand, CORE_VERSION, MIN_CHARS, MAX_CHARS, STALE_DAYS, DEFAULT_LIMIT } from './match.ts';
export type { MatchProfile, MatchOptions, MatchRow, MatchResult, MatchError, Understood, RegionPref, RemotePref, PiiSpan } from './match.ts';
export { parsePool } from './pool.ts';
export { recover, OUT_OF_SCOPE_MSG, type Recovery } from './pipeline.ts';
export { PublicRowSchema, privacyScan, exportRow, PERSONAL_KEYS, type PublicRow, type PublicPool } from './schema.ts';
export type { GroupKey } from './decisions.ts';
export type { VisitorError, Warning, AppError } from './errors.ts';
