import { credentialsPortForEffects } from '../adapters/tauri/credentials-adapter'
import { createTauriCredentialsPort } from '../adapters/tauri/credentials-adapter'
import { createTauriFinderPort, finderPortForEffects } from '../adapters/tauri/finder-adapter'
import { createFinderProgram } from '../core/finder/program'
import type { Program } from '../core/mvu/engine'
import type { FinderModel } from '../core/finder/model'
import type { FinderMsg } from '../core/finder/msg'

let singleton: Program<FinderModel, FinderMsg> | null = null

export function getFinderProgram(): Program<FinderModel, FinderMsg> {
  if (!singleton) {
    const credentials = credentialsPortForEffects(createTauriCredentialsPort())
    const finder = finderPortForEffects(createTauriFinderPort())
    singleton = createFinderProgram({ credentials, finder })
  }
  return singleton
}