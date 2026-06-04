import { useEffect } from 'react'
import { selectFinderView } from '../core/finder/selectors'
import { registerFinderDispatch } from '../runtime/global-errors'
import { getFinderProgram } from '../runtime/finder-runtime'
import { useProgram } from '../runtime/react/use-program'
import { FinderAppView } from '../view/finder-app-view'

/** React entry — wires MVU program to view. No domain logic. */
export function FinderApp() {
  const program = getFinderProgram()
  const { model, dispatch } = useProgram(program)
  const view = selectFinderView(model)

  useEffect(() => {
    registerFinderDispatch(dispatch)
  }, [dispatch])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        dispatch({ type: 'PaletteToggled' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  return <FinderAppView view={view} dispatch={dispatch} />
}