import { createProgram, type Program, type Update } from '../mvu/engine'
import { effectForMsg, type FinderPorts } from './effects'
import { initialFinderModel, type FinderModel } from './model'
import type { FinderMsg } from './msg'
import { updateFinder } from './update'

export function createFinderProgram(ports: FinderPorts): Program<FinderModel, FinderMsg> {
  const update: Update<FinderModel, FinderMsg> = (model, msg) => {
    const [next] = updateFinder(model, msg)
    const cmd = effectForMsg(ports, next, msg)
    return cmd ? [next, cmd] : [next]
  }

  return createProgram({
    // Init hook: the AppStarted msg (dispatched here) triggers effects including cvLoadCmd
    // (see effects.ts) which reads localStorage and dispatches CvSummaryChanged if present.
    // Because init[1] cmds run synchronously before createProgram returns, the model
    // observed on first getModel()/use has the persisted CV (or default). Persists via
    // effect on CvSummaryChanged.
    init: [initialFinderModel(), (dispatch) => dispatch({ type: 'AppStarted' })],
    update,
  })
}