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
    init: [initialFinderModel(), (dispatch) => dispatch({ type: 'AppStarted' })],
    update,
  })
}

// Note: AppStarted (in effects) + OpportunitySelected now drive CV localStorage load + lastActiveOppId +
// target hydrate from DB getOpportunities({id}) + screen restore. (PR3 / TD-004+020 + continuity)
