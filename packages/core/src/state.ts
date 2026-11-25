import { err, ok, type Result } from 'neverthrow';
import type { Actor, AgentError } from './errors.ts';
import type { GroupKey, MatchInput } from './decisions.ts';

declare const v: unique symbol;
export type StateVersion = number & { readonly [v]: 'StateVersion' };
export type CardView = { id: string; title: string; company: string; url: string; why: string; lastChecked: string };
export type PageState = {
  input: MatchInput;
  groups: Record<GroupKey, ReadonlyArray<CardView>>;
  totals: Record<GroupKey, number>;
  lock: { holder: Actor; since: string } | null;
};
export type Versioned<T> = { readonly version: StateVersion; readonly by: Actor; readonly value: T };
export type Write<T> = { baseVersion: StateVersion; by: Actor; next: (cur: T) => T };

export function applyWrite<T>(cur: Versioned<T>, w: Write<T>): Result<Versioned<T>, AgentError> {
  if (w.baseVersion !== cur.version) return err({ kind: 'StaleWrite', baseVersion: w.baseVersion, currentVersion: cur.version, by: w.by });
  return ok({ version: (cur.version + 1) as StateVersion, by: w.by, value: w.next(cur.value) });
}

export type ToolResult<T> = { stateVersion: StateVersion; data: T };
