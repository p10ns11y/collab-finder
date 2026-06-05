import { useEffect } from 'react'
import { selectFinderView } from '../core/finder/selectors'
import { registerFinderDispatch } from '../runtime/global-errors'
import { getFinderProgram } from '../runtime/finder-runtime'
import { useProgram } from '../runtime/react/use-program'
import { FinderAppView } from '../view/finder-app-view'
import type { FinderScreen } from '../core/finder/model'

/** React entry — wires MVU program to view. No domain logic. */
export function FinderApp() {
  const program = getFinderProgram()
  const { model, dispatch } = useProgram(program)
  const view = selectFinderView(model)

  useEffect(() => {
    registerFinderDispatch(dispatch)
  }, [dispatch])

  useEffect(() => {
    const SCREEN_BY_KEY: Record<string, FinderScreen> = {
      '1': 'discover',
      '2': 'stats',
      '3': 'history',
      '4': 'data',
      '5': 'lookup',
      '6': 'settings',
    }
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        dispatch({ type: 'PaletteToggled' })
        return
      }
      if ((e.metaKey || e.ctrlKey) && SCREEN_BY_KEY[e.key]) {
        e.preventDefault()
        dispatch({ type: 'ScreenChanged', screen: SCREEN_BY_KEY[e.key] })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  return <FinderAppView view={view} dispatch={dispatch} />
}