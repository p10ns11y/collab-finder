import { X } from 'lucide-react'
import { Chip } from '../ui/chip'
import type { HuntPreset } from '../../core/domain/hunt-rails'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'

type Props = {
  presets: HuntPreset[]
  activeId?: string
  surface: 'mission' | 'sweden'
  dispatch: Dispatch<FinderMsg>
  /** When set, also navigate to this screen after applying a preset (Discover shortcut). */
  navigateTo?: 'mission' | 'sweden'
}

export function HuntPresetsRow({ presets, activeId, surface, dispatch, navigateTo }: Props) {
  if (!presets.length) return null

  const handleSelect = (id: string) => {
    dispatch({ type: 'HuntPresetSelected', id, surface })
    if (navigateTo) {
      dispatch({ type: 'ScreenChanged', screen: navigateTo })
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-ink-faint">Hunt presets</p>
        {activeId ? (
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-[10px] text-ink-faint hover:text-ink"
            onClick={() => dispatch({ type: 'HuntPresetCleared' })}
            title="Restore query before preset"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {presets.map((preset) => (
          <Chip
            key={preset.id}
            active={activeId === preset.id}
            title={preset.q}
            onClick={() => handleSelect(preset.id)}
          >
            {preset.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}
