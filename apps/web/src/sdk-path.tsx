import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  createChange, createListbox, createPopup, createSelection, createTypeahead, createVirtualizer, definePrimitive,
  isTypeaheadKey, popupContent, popupState, popupTitle, popupTrigger,
  type ListData, type PopupState, type VirtualItem,
} from '@ui-sdk/core';
import { popoverPreset } from '@ui-sdk/core/popover';
import { usePart, usePrimitive, type PrimitiveHandle } from '@ui-sdk/react/primitive';
import type { GroupKey, MatchResult, MatchRow } from '../../../packages/core/src/index.ts';

import { REGIONS, type Place } from './regions.ts';
const GROUP_TITLE: Record<GroupKey, string> = {
  fitsNow: 'Fits now', stepTowardGoal: 'Step toward your goal', stretch: 'Stretch',
};
const displayCompany = (company: string) =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(company) ? company.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : company;

const visibleItems = (data: ListData<string>): { value: string; label: string }[] => {
  const out: { value: string; label: string }[] = [];
  for (const entry of data) {
    if (typeof entry === 'string') out.push({ value: entry, label: entry });
    else if (typeof entry === 'object' && entry !== null && 'value' in entry && !('type' in entry)) out.push({ value: String(entry.value), label: entry.label });
  }
  return out;
};

type RegionOptions = {
  value?: readonly string[];
  onValueChange?: (value: string[]) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean, details: { reason: string }) => void;
};
type RegionState = PopupState & { value: string[]; highlighted: string | null; query: string };
const regionPicker = definePrimitive({
  name: 'region-picker',
  options: { value: 'value', onValueChange: 'callback', open: 'boolean', defaultOpen: 'boolean', onOpenChange: 'callback' },
  state: (options: RegionOptions): RegionState => ({ ...popupState(options), value: [...(options.value ?? [])], highlighted: null, query: '' }),
  sync: (options: RegionOptions) => (options.value === undefined ? {} : { value: [...options.value] }),
  api: (context) => {
    const change = createChange(context);
    const popup = createPopup(context, { preset: popoverPreset });
    const typeahead = createTypeahead();
    const listbox = createListbox<RegionState, string>(context, {
      key: 'highlighted',
      focus: 'virtual',
      items: () => REGIONS.map(([value, label]) => ({ value, label })),
      query: () => context.store.get().query,
    });
    const selection = createSelection(context, {
      key: 'value',
      multiple: () => true,
      order: () => visibleItems(listbox.items()).map(item => item.value),
      set: (value, details) => change('value', value, details),
    });
    return {
      ...popup,
      listbox,
      selection,
      setQuery(query: string) {
        context.store.set({ query });
        const items = visibleItems(listbox.items());
        typeahead.reset();
        let at = 0;
        for (const key of query) {
          const next = typeahead(key, items.map(item => item.label), at);
          if (next >= 0) at = next;
        }
        const hit = query ? items[at] : undefined;
        if (hit) listbox.highlight(hit.value);
        else listbox.move('first');
      },
      onKey(event: KeyboardEvent) {
        if (isTypeaheadKey(event)) return;
        if (event.key === 'ArrowDown' && context.store.get().highlighted === null) listbox.move('first', event);
        listbox.keydown(event);
        if (event.key === 'Enter') {
          event.preventDefault();
          const key = context.store.get().highlighted;
          if (key) selection.toggle(key, { reason: 'item-press', event });
        }
      },
    };
  },
  slots: (slot) => ({
    trigger: popupTrigger(slot),
    title: popupTitle(slot),
    content: popupContent(slot),
    search: slot({
      attrs: (_state, part) => ({
        'aria-label': 'Filter regions',
        'aria-autocomplete': 'list',
        'aria-controls': `${part.id}-regions`,
        'aria-activedescendant': part.api.listbox.activeId(_state),
      }),
      on: {
        input: (event, { api }) => { if (event.target instanceof HTMLInputElement) api.setQuery(event.target.value); },
        keydown: (event, { api }) => api.onKey(event),
      },
    }),
    list: slot({
      attrs: (_state, part) => ({
        id: `${part.id}-regions`,
        role: 'listbox',
        'aria-label': 'Regions',
        'aria-multiselectable': 'true',
      }),
    }),
    option: slot<{ value: string; label: string }>({
      role: 'option',
      focus: 'active-descendant',
      props: { value: 'string', label: 'string' },
      attrs: (state, part) => ({
        ...part.api.listbox.attrs(state, part),
        'aria-selected': part.api.selection.isSelected(part.key) ? 'true' : 'false',
      }),
      press: ({ key, api }, event) => api.selection.toggle(key, event ? { reason: 'item-press', event } : { reason: 'item-press' }),
      bind: (el, part) => part.api.listbox.bind(el, part),
    }),
  }),
});

type Listed = { id: string; label: string };
type MatchOptions = { rows: ReadonlyArray<Listed> };
type MatchState = { highlighted: string | null; value: string[] };
const matchList = definePrimitive({
  name: 'match-list',
  options: { rows: 'value' },
  state: (_options: MatchOptions): MatchState => ({ highlighted: null, value: [] }),
  api: (context) => {
    const change = createChange(context);
    const typeahead = createTypeahead();
    const virtual = createVirtualizer({
      count: () => context.options().rows.length,
      estimate: () => 88,
      overscan: 4,
      key: (index) => context.options().rows[index]?.id ?? String(index),
      keep: () => {
        const id = context.store.get().highlighted;
        const index = context.options().rows.findIndex(row => row.id === id);
        return index < 0 ? [] : [index];
      },
    });
    const listbox = createListbox<MatchState, string>(context, {
      key: 'highlighted',
      focus: 'virtual',
      items: () => context.options().rows.map(row => ({ value: row.id, label: row.label })),
      onHighlight: (_key, details) => { if (details.index >= 0) virtual.scrollToIndex(details.index); },
    });
    const selection = createSelection(context, {
      key: 'value',
      multiple: () => false,
      order: () => context.options().rows.map(row => row.id),
      set: (value, details) => change('value', value, details),
    });
    const choose = (id: string, event: Event) => {
      listbox.highlight(id);
      selection.choose(id, { reason: 'item-press', event });
      const index = context.options().rows.findIndex(row => row.id === id);
      if (index >= 0) virtual.scrollToIndex(index);
    };
    return {
      listbox, selection, virtual, count: () => context.options().rows.length,
      onKey(event: KeyboardEvent) {
        const rows = context.options().rows;
        if (isTypeaheadKey(event)) {
          const labels = rows.map(row => row.label);
          const current = Math.max(0, rows.findIndex(row => row.id === context.store.get().highlighted));
          const index = typeahead(event.key, labels, current);
          const row = index >= 0 ? rows[index] : undefined;
          if (!row) return;
          event.preventDefault();
          choose(row.id, event);
          return;
        }
        const moved = listbox.keydown(event);
        if (moved) choose(moved, event);
      },
    };
  },
  slots: (slot) => ({
    scroller: slot({
      attrs: (state, part) => ({
        role: 'listbox',
        'aria-label': 'Your matches',
        tabindex: '0',
        'aria-activedescendant': part.api.listbox.activeId(state),
      }),
      on: { keydown: (event, { api }) => api.onKey(event) },
      bind: (el, part) => part.api.virtual.connect(el),
    }),
    option: slot<{ value: string; label: string; index: number; start: number }>({
      role: 'option',
      focus: 'active-descendant',
      props: { value: 'string', label: 'string', index: 'number', start: 'number' },
      attrs: (state, part) => ({
        ...part.api.listbox.attrs(state, part),
        'aria-selected': part.api.selection.isSelected(part.key) ? 'true' : 'false',
        'aria-posinset': String(part.props.index + 1),
        'aria-setsize': String(part.api.count()),
        'data-posting-id': part.key,
      }),
      press: ({ key, api }, event) => {
        if (event) api.listbox.highlight(key, { event });
        else api.listbox.highlight(key);
        api.selection.choose(key, event ? { reason: 'item-press', event } : { reason: 'item-press' });
      },
      bind: (el, part) => {
        el.style.position = 'absolute';
        el.style.top = `${part.props.start}px`;
        el.style.left = '0';
        el.style.right = '0';
        const stopList = part.api.listbox.bind(el, part);
        const stopMeasure = part.api.virtual.measure(part.props.index, el);
        return () => { stopList(); stopMeasure(); };
      },
    }),
  }),
});

const subscribe = (handle: { instance: { subscribe: (listener: () => void) => () => void } }) => (notify: () => void) => handle.instance.subscribe(notify);

function RegionTrigger({ handle }: { handle: PrimitiveHandle<typeof regionPicker> }) {
  return usePart(handle, 'trigger', {}, {
    type: 'button',
    className: 'inline-flex items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium',
    'aria-describedby': 'region-help',
    children: 'Regions',
  }, 'button');
}

function RegionTitle() {
  return usePart(regionPicker, 'title', {}, { className: 'text-sm font-medium', children: 'Regions' }, 'h3');
}

function RegionSearch() {
  return usePart(regionPicker, 'search', {}, {
    id: 'region-query',
    type: 'text',
    autoComplete: 'off',
    className: 'mt-2 w-full rounded-md border border-border bg-bg px-3 text-base text-text',
  }, 'input');
}

function RegionOption({ value, label }: { value: string; label: string }) {
  return usePart(regionPicker, 'option', { value, label }, {
    className: 'rounded-md px-3 text-sm',
    children: label,
  }, 'div');
}

function RegionPopup({ handle }: { handle: PrimitiveHandle<typeof regionPicker> }) {
  const state = useSyncExternalStore(subscribe(handle), () => handle.instance.get() as RegionState, () => handle.instance.get() as RegionState);
  const items = visibleItems(handle.api.listbox.items());
  return usePart(handle, 'content', { initialFocus: '#region-query' }, {
    className: 'mt-2 rounded-lg border border-border bg-surface p-3',
    children: (
      <>
        <RegionTitle />
        <RegionSearch />
        <RegionList key={state.query} items={items} />
      </>
    ),
  }, 'div');
}

function RegionList({ items }: { items: { value: string; label: string }[] }) {
  return usePart(regionPicker, 'list', {}, {
    className: 'mt-2 grid gap-2',
    children: items.map(item => <RegionOption key={item.value} value={item.value} label={item.label} />),
  }, 'div');
}

export function SdkRegion({ value, onValueChange }: { value: ReadonlyArray<Place>; onValueChange: (next: Place[]) => void }) {
  const picker = usePrimitive(regionPicker, {
    value,
    onValueChange: (next) => onValueChange(next.filter((code): code is Place => REGIONS.some(([place]) => place === code))),
  });
  const labels = value.map(code => REGIONS.find(([place]) => place === code)?.[1]).filter((label): label is string => label !== undefined);
  return (
    <div className="grid gap-2">
      <RegionTrigger handle={picker} />
      <RegionPopup handle={picker} />
      <p className="text-xs text-text-muted">{labels.length ? labels.join(', ') : 'Anywhere'}</p>
      <p id="region-help" className="text-xs text-text-muted">Worldwide until you pick a region.</p>
    </div>
  );
}

type Flat = MatchRow & { group: string };

function ResultOption({ row, index, start }: { row: Flat; index: number; start: number }) {
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    el.style.position = 'absolute';
    el.style.top = `${start}px`;
    el.style.left = '0';
    el.style.right = '0';
  }, [start]);
  return (
    <div ref={frame} role="presentation">
      {usePart(matchList, 'option', { value: row.id, label: `${row.title} ${displayCompany(row.company)}`, index, start }, {
        className: 'border border-border bg-surface p-3',
        children: (
          <>
            <p className="text-base font-semibold">{row.title}</p>
            <p className="text-sm text-text-muted">{displayCompany(row.company)}{row.location ? ` · ${row.location}` : ''} · {row.group}</p>
          </>
        ),
      }, 'div')}
    </div>
  );
}

function MatchScroller({ handle, rows, items }: { handle: PrimitiveHandle<typeof matchList>; rows: readonly Flat[]; items: readonly VirtualItem[] }) {
  const box = useRef<HTMLDivElement>(null);
  const size = handle.api.virtual.size();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.position = 'relative';
    el.style.height = `${size}px`;
  }, [size]);
  return usePart(handle, 'scroller', {}, {
    className: 'rounded-lg border border-border',
    children: (
      <div ref={box}>
        {items.map(item => {
          const row = rows[item.index];
          return row ? <ResultOption key={item.key} row={row} index={item.index} start={item.start} /> : null;
        })}
      </div>
    ),
  }, 'div');
}

export function SdkResults({ result, ms }: { result: MatchResult; ms: number }) {
  const rows = useMemo(() => (['fitsNow', 'stepTowardGoal', 'stretch'] as const).flatMap(key => result.groups[key].map(row => ({ ...row, group: GROUP_TITLE[key] }))), [result]);
  const listed = useMemo(() => rows.map(row => ({ id: row.id, label: `${row.title} ${displayCompany(row.company)}` })), [rows]);
  const handle = usePrimitive(matchList, { rows: listed });
  const items = useSyncExternalStore(
    (notify) => {
      const stopRows = handle.api.virtual.subscribe(notify);
      const stopState = handle.instance.subscribe(() => notify());
      return () => { stopRows(); stopState(); };
    },
    () => handle.api.virtual.items(),
    () => handle.api.virtual.items(),
  );
  const state = useSyncExternalStore(subscribe(handle), () => handle.instance.get() as MatchState, () => handle.instance.get() as MatchState);
  const selected = rows.find(row => row.id === state.value[0]);
  const understood = [...result.understood.roles, ...result.understood.skills].join(', ');
  const stale = result.warnings.find(warning => warning.kind === 'PoolStale');
  useEffect(() => { handle.api.virtual.refresh(); }, [listed, handle.api.virtual]);
  return (
    <section aria-labelledby="results-title" data-testid="results">
      <h2 id="results-title" className="text-2xl font-semibold">Your matches</h2>
      {result.likesMiss && <p className="mt-2 text-sm text-text-muted" data-testid="likes-miss">None of those words matched.</p>}
      <p className="mt-1 text-sm text-text-muted">
        Matched in {ms} ms in your browser. Read as: {understood || 'general software engineering'}
        {result.understood.seniority ? `, ${result.understood.seniority} level` : ''}{result.understood.goal.length ? `; goal: ${result.understood.goal.join(', ')}` : ''}.
      </p>
      {stale && stale.kind === 'PoolStale' && (
        <p className="mt-4 text-sm text-text-muted" data-testid="stale-banner">
          Statuses were last checked {stale.checkedAt} ({stale.ageDays} days ago). Some roles may have closed since; check the posting.
        </p>
      )}
      <div className="mt-6">
        <MatchScroller handle={handle} rows={rows} items={items} />
        {selected && (
          <a className="mt-3 inline-block text-sm font-medium text-text underline underline-offset-2" href={selected.url} target="_blank" rel="noopener noreferrer">
            View posting for {selected.title} at {displayCompany(selected.company)} (opens in a new tab)
          </a>
        )}
      </div>
    </section>
  );
}
