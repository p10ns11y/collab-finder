import { getSimplePaths } from '@xstate/graph';
import { flow, type FlowEvent } from './machine.ts';
import { SAMPLE } from './sample.ts';


export const PLAN: ReadonlyArray<FlowEvent> = [
  { type: 'POOL_LOADED', size: 2 },
  { type: 'POOL_FAILED', error: 'Sources did not load.' },
  { type: 'RETRY' },
  { type: 'FIND', query: 'Senior platform engineer, Go' },
  { type: 'FIND', query: '  ' },
  { type: 'MATCHED', roles: SAMPLE },
  { type: 'MATCHED', roles: [] },
  { type: 'MATCH_FAILED', error: 'Matching failed.' },
  { type: 'PICK', id: 'sample:1' },
  { type: 'PICK', id: 'missing' },
  { type: 'TAILORED', outline: { roleId: 'sample:1', emphasize: ['platform', 'Go'] } },
  { type: 'TAILORED', outline: { roleId: 'sample:2', emphasize: [] } },
  { type: 'PACK' },
  { type: 'REQUEST_CONFIRM' },
  { type: 'CONFIRM' },
  { type: 'CANCEL' },
  { type: 'CONFIRM_FAILED', error: 'The confirm dialog did not load.' },
  { type: 'BACK' },
];

export const flowPaths = () => getSimplePaths(flow, {
  events: [...PLAN],
  serializeState: s => `${JSON.stringify(s.value)}|${s.context.picked?.id ?? '-'}|${s.context.confirmed}|${s.context.roles.length}`,
});
