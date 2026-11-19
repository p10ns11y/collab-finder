// One typed error union. Every trap/broken state in TRAPS.md is a variant here; nothing is thrown across a boundary.
export type Source = 'ashby' | 'greenhouse' | 'lever' | 'platsbanken';
export type Surface = 'web' | 'cli' | 'mcp' | 'skill' | 'webmcp';
export type Actor = 'human' | 'agent';
export type PiiKind = 'email' | 'phone' | 'name' | 'address' | 'id-number';

export type VisitorError =
  | { kind: 'InputEmpty' }
  | { kind: 'InputTooShort'; minChars: number; got: number }
  | { kind: 'InputAbusive' }
  | { kind: 'InputTooLong'; maxChars: number; got: number }
  | { kind: 'OutOfScope'; reason: 'no-engineering-terms' | 'junior' | 'outside-pool-roles' }
  | { kind: 'PiiDetected'; from: Actor; spans: ReadonlyArray<{ start: number; end: number; pii: PiiKind }> }
  | { kind: 'RateLimited'; retryAfterS: number }
  | { kind: 'ZeroResults'; widen: ReadonlyArray<'region' | 'seniority' | 'remote' | 'goal'> }
  | { kind: 'StreamDropped'; receivedEvents: number; partial: true }
  | { kind: 'PostingClosed'; postingId: string };

export type AgentError =
  | { kind: 'WebMcpUnavailable' }                       // handled: switch to ui-sdk path, never a dead end
  | { kind: 'StaleWrite'; baseVersion: number; currentVersion: number; by: Actor }
  | { kind: 'ToolUiDrift'; toolVersion: number; uiVersion: number };

export type PoolError =
  | { kind: 'PersonalFieldLeak'; keys: ReadonlyArray<string> }
  | { kind: 'UnknownField'; keys: ReadonlyArray<string> }
  | { kind: 'PartialRefresh'; failed: ReadonlyArray<Source>; countDrop: Partial<Record<Source, number>> }
  | { kind: 'SchemaInvalid'; issues: ReadonlyArray<string> };
// 'WriteBackAttempt' has no variant: the export only receives a read-only handle (see effects.ts).

export type SurfaceError =
  | { kind: 'SurfaceDrift'; surface: Surface; firstDiffPath: string }
  | { kind: 'VersionSkew'; surface: Surface; core: string; pool: string };
// 'NetworkInLocalMode' has no variant: LocalFx has no Network handler, so the call cannot typecheck.

export type IntelError =
  | { kind: 'MissingKey'; provider: string }
  | { kind: 'ConsentDenied'; what: 'spend' | 'publish' }
  | { kind: 'ProviderShapeMismatch'; provider: string; issues: ReadonlyArray<string> }
  | { kind: 'PackDivergence'; packId: string; firstDiffPath: string };
// 'PaidCallWithoutApproval' has no variant: AiCall requires a SpendApproval token only UserConsent can mint.

export type PackError =
  | { kind: 'UnsourcedClaim'; claim: string }
  | { kind: 'UnshippedClaim'; claim: string; feature: string }
  | { kind: 'NameMismatch'; expected: string; found: string; where: string };

export type AppError = VisitorError | AgentError | PoolError | SurfaceError | IntelError | PackError;

/** Non-fatal: rides the success track. */
export type Warning =
  | { kind: 'PoolStale'; checkedAt: string; ageDays: number }
  | { kind: 'StaleOpenStatus'; ids: ReadonlyArray<string> }
  | { kind: 'VirtualizedPartial'; shown: number; total: number };
