import type { ResultAsync } from 'neverthrow';
import type { IntelError, PoolError } from './errors.ts';
import type { PublicPool } from './schema.ts';

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type SpendApproval = Brand<{ approvedBy: 'Peramanathan'; scope: string; maxUsd: number; expiresAt: string }, 'SpendApproval'>;
export type EngineRow = Brand<Readonly<Record<string, unknown>>, 'EngineRow'>;

export interface Clock { now(): Date }

export type LogEvent = { evt: 'match' | 'refresh' | 'export' | 'tool_call'; ms: number; count?: number; errorKind?: string };
export interface Log { emit(e: LogEvent): void }
export interface Network { readonly egress: true }
export interface Fetch { getJson(url: URL): ResultAsync<unknown, { kind: 'FetchFailed'; status: number | 'timeout' }> }
export interface PoolStore { read(): ResultAsync<PublicPool, PoolError>; swap(next: PublicPool): ResultAsync<void, PoolError> }
export interface EngineReader { rows(): AsyncIterable<EngineRow> }
export interface UserConsent { requestSpend(scope: string, maxUsd: number): ResultAsync<SpendApproval, IntelError> }
export interface AiCall { complete(prompt: string, approval: SpendApproval): ResultAsync<unknown, IntelError> }

export type MakeFetch = (net: Network) => Fetch;

export type HostedFx = { clock: Clock; log: Log; pool: PoolStore; network: Network; fetch: Fetch; consent: UserConsent; ai?: AiCall };
export type LocalFx  = { clock: Clock; log: Log; pool: PoolStore };
export type TestFx   = HostedFx & { readonly fake: true };
export type AgentFx  = HostedFx & { session: { actor: 'agent'; agentId: string } };
export type ExportFx = { clock: Clock; log: Log; engine: EngineReader; pool: PoolStore };
export type Mode = 'hosted' | 'local' | 'test' | 'agent';
export type FxFor<M extends Mode> = M extends 'hosted' ? HostedFx : M extends 'local' ? LocalFx : M extends 'test' ? TestFx : AgentFx;
