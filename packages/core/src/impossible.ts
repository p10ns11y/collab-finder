// Compile-time proofs: each line below MUST fail to typecheck. If one starts compiling, tsc fails on the unused @ts-expect-error.
import type { LocalFx, AiCall, SpendApproval } from './effects.ts';
import type { PublicRow } from './schema.ts';
import { refresh } from './pipeline.ts';
import type { DecideRefreshSwap } from './decisions.ts';

declare const localFx: LocalFx;
declare const swap: DecideRefreshSwap;
declare const ai: AiCall;
declare const row: PublicRow;

// 1. Local-only mode cannot make a network call: LocalFx has no `fetch` handler.
// @ts-expect-error — Property 'fetch' is missing in type 'LocalFx'
refresh(localFx, swap, () => { throw 0; });

// 2. No paid AI call without an approval minted by UserConsent.
// @ts-expect-error — a plain object is not a branded SpendApproval
ai.complete('rank', { approvedBy: 'Peramanathan', scope: 'x', maxUsd: 1, expiresAt: '' });

// 3. Personal fields cannot exist on a public row.
// @ts-expect-error — fit_score is `never` on PublicRow
const leak: PublicRow = { ...row, fit_score: 94 };

// 4. Read-only engine: there is no write method to call.
declare const engine: import('./effects.ts').ExportFx['engine'];
// @ts-expect-error — EngineReader has no `write`
engine.write([]);
export type _ = [SpendApproval, typeof leak];
