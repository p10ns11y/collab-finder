import { useEffect } from 'react'
import { selectFinderView } from '../core/finder/selectors'
import { resolveShellHotkey } from '../core/domain/finder-keyboard'
import { registerFinderDispatch } from '../runtime/global-errors'
import { getFinderProgram } from '../runtime/finder-runtime'
import { useProgram } from '../runtime/react/use-program'
import { FinderAppView } from '../view/finder-app-view'

/** React entry — wires MVU program to view. No domain logic. */
export function FinderApp() {
  const program = getFinderProgram()
  const { model, dispatch } = useProgram(program)
  const view = selectFinderView(model)

  // External sync: global error bridge needs dispatch reference.
  useEffect(() => {
    registerFinderDispatch(dispatch)
  }, [dispatch])

  // External sync: window keyboard shortcuts → MVU messages.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const action = resolveShellHotkey(e.key, {
        meta: e.metaKey,
        ctrl: e.ctrlKey,
      })
      if (action.kind === 'none') return
      e.preventDefault()
      if (action.kind === 'palette') {
        dispatch({ type: 'PaletteToggled' })
        return
      }
      dispatch({ type: 'ScreenChanged', screen: action.screen })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  return <FinderAppView view={view} dispatch={dispatch} />
}
