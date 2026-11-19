// Versioned shared state for human + agent on one page (UI and WebMCP tools read/write the same store).
import { err, ok, type Result } from 'neverthrow';
import type { Actor, AgentError } from './errors.ts';
import type { GroupKey, MatchInput } from './decisions.ts';

declare const v: unique symbol;
export type StateVersion = number & { readonly [v]: 'StateVersion' };
export type CardView = { id: string; title: string; company: string; url: string; why: string; lastChecked: string };
export type PageState = {
  input: MatchInput;
  groups: Record<GroupKey, ReadonlyArray<CardView>>;
  totals: Record<GroupKey, number>;                 // lets a path-2 agent see rows beyond the virtualized viewport
  lock: { holder: Actor; since: string } | null;    // "Agent is working" banner + Stop
};
export type Versioned<T> = { readonly version: StateVersion; readonly by: Actor; readonly value: T };
export type Write<T> = { baseVersion: StateVersion; by: Actor; next: (cur: T) => T };

/** Compare-and-set: a write based on an old version is a typed StaleWrite, never a silent overwrite. */
export function applyWrite<T>(cur: Versioned<T>, w: Write<T>): Result<Versioned<T>, AgentError> {
  if (w.baseVersion !== cur.version) return err({ kind: 'StaleWrite', baseVersion: w.baseVersion, currentVersion: cur.version, by: w.by });
  return ok({ version: (cur.version + 1) as StateVersion, by: w.by, value: w.next(cur.value) });
}
/** Every tool result carries the version it was computed from; the UI rejects results that don't match. */
export type ToolResult<T> = { stateVersion: StateVersion; data: T };
export function checkToolMatchesUi<T>(r: ToolResult<T>, ui: Versioned<unknown>): Result<ToolResult<T>, AgentError> {
  return r.stateVersion === ui.version ? ok(r) : err({ kind: 'ToolUiDrift', toolVersion: r.stateVersion, uiVersion: ui.version });
}
