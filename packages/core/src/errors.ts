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
  | { kind: 'ZeroResults'; widen: ReadonlyArray<'region' | 'seniority' | 'remote' | 'goal' | 'productOnly'> }
  | { kind: 'StreamDropped'; receivedEvents: number; partial: true }
  | { kind: 'PostingClosed'; postingId: string };

export type AgentError =
  | { kind: 'WebMcpUnavailable' }
  | { kind: 'StaleWrite'; baseVersion: number; currentVersion: number; by: Actor }
  | { kind: 'ToolUiDrift'; toolVersion: number; uiVersion: number };

export type PoolError =
  | { kind: 'PersonalFieldLeak'; keys: ReadonlyArray<string> }
  | { kind: 'UnknownField'; keys: ReadonlyArray<string> }
  | { kind: 'PartialRefresh'; failed: ReadonlyArray<Source>; countDrop: Partial<Record<Source, number>> }
  | { kind: 'EvalRegressed'; before: number; after: number }
  | { kind: 'SchemaInvalid'; issues: ReadonlyArray<string> };

export type SurfaceError =
  | { kind: 'SurfaceDrift'; surface: Surface; firstDiffPath: string }
  | { kind: 'VersionSkew'; surface: Surface; core: string; pool: string };

export type IntelError =
  | { kind: 'MissingKey'; provider: string }
  | { kind: 'ConsentDenied'; what: 'spend' | 'publish' }
  | { kind: 'ProviderShapeMismatch'; provider: string; issues: ReadonlyArray<string> }
  | { kind: 'PackDivergence'; packId: string; firstDiffPath: string };

export type PackError =
  | { kind: 'UnsourcedClaim'; claim: string }
  | { kind: 'UnshippedClaim'; claim: string; feature: string }
  | { kind: 'NameMismatch'; expected: string; found: string; where: string };

export type AppError = VisitorError | AgentError | PoolError | SurfaceError | IntelError | PackError;

export type Warning =
  | { kind: 'PoolStale'; checkedAt: string; ageDays: number }
  | { kind: 'StaleOpenStatus'; ids: ReadonlyArray<string> }
  | { kind: 'VirtualizedPartial'; shown: number; total: number };
