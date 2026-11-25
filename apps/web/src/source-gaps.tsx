import { useMemo } from 'react';
import type { MatchProfile, PublicPool } from '../../../packages/core/src/index.ts';
import type { View } from './flow.ts';
import { gapGuidance, type GapGuidance } from '../../../packages/core/src/source-gaps.ts';

const KIND: Readonly<Record<GapGuidance['suggestions'][number]['kind'], string>> = {
  careers_page: 'Careers page', ats_board: 'Job board', community_list: 'Community list', open_dataset: 'Open dataset',
};

export default function SourceGaps({ last, view, keptZero = false }: { last: { ask: MatchProfile; pool: PublicPool }; view: View; keptZero?: boolean }) {
  const gap = useMemo(() => {
    if (keptZero) return gapGuidance(last.ask, last.pool, null);
    if (view.kind === 'results' || view.kind === 'zeroResults') return gapGuidance(last.ask, last.pool, view.kind === 'results' ? view.result : null);
    return null;
  }, [last, view, keptZero]);
  if (!gap) return null;
  return (
    <section aria-labelledby="source-gaps-title" data-testid="source-gaps" data-topic={gap.topic} data-region={gap.region} className="my-6 rounded-lg border border-border bg-surface p-4">
      <h3 id="source-gaps-title" className="text-base font-semibold">Sources to add</h3>
      <p className="mt-1 text-sm" data-testid="gap-message">{gap.message}</p>
      <ul className="mt-3 grid gap-1 text-sm text-text-muted">
        {gap.suggestions.map(s => <li key={s.kind} data-kind={s.kind}><span className="font-semibold text-text">{KIND[s.kind]}:</span> {s.hint}</li>)}
      </ul>
    </section>
  );
}
