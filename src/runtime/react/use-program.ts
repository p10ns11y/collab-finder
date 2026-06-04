import { useSyncExternalStore } from 'react'
import type { Program } from '../../core/mvu/engine'

/**
 * Sole React ↔ MVU bridge. Views subscribe to model; dispatch sends Msg.
 * No business logic here — keeps framework code thin.
 */
export function useProgram<Model, Msg>(program: Program<Model, Msg>) {
  const model = useSyncExternalStore(
    program.subscribe,
    program.getModel,
    program.getModel,
  )

  return { model, dispatch: program.dispatch }
}