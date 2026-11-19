import type { LocalFx, AiCall, SpendApproval } from './effects.ts';
import type { PublicRow } from './schema.ts';
import { refresh } from './pipeline.ts';
import type { DecideRefreshSwap } from './decisions.ts';

declare const localFx: LocalFx;
declare const swap: DecideRefreshSwap;
declare const ai: AiCall;
declare const row: PublicRow;

// @ts-expect-error
refresh(localFx, swap, () => { throw 0; });

// @ts-expect-error
ai.complete('rank', { approvedBy: 'Peramanathan', scope: 'x', maxUsd: 1, expiresAt: '' });

// @ts-expect-error
const leak: PublicRow = { ...row, fit_score: 94 };

declare const engine: import('./effects.ts').ExportFx['engine'];
// @ts-expect-error
engine.write([]);
export type _ = [SpendApproval, typeof leak];
