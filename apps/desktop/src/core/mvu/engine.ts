/**
 * Minimal MVU runtime (Elm-style). Zero React / Tauri imports.
 * Model + Msg + pure update + Cmd side effects.
 */

export type Dispatch<Msg> = (msg: Msg) => void

export type Cmd<Msg> = (dispatch: Dispatch<Msg>) => void | (() => void)

export type Update<Model, Msg> = (
  model: Model,
  msg: Msg,
) => readonly [model: Model, cmd?: Cmd<Msg> | Cmd<Msg>[]]

export type Program<Model, Msg> = {
  readonly getModel: () => Model
  readonly dispatch: Dispatch<Msg>
  readonly subscribe: (listener: () => void) => () => void
}

export function createProgram<Model, Msg>(options: {
  init: readonly [model: Model, cmd?: Cmd<Msg> | Cmd<Msg>[]]
  update: Update<Model, Msg>
}): Program<Model, Msg> {
  let model = options.init[0]
  const listeners = new Set<() => void>()

  function notify() {
    for (const listener of listeners) listener()
  }

  function runCmds(cmd: Cmd<Msg> | Cmd<Msg>[] | undefined, dispatch: Dispatch<Msg>) {
    if (!cmd) return
    const list = Array.isArray(cmd) ? cmd : [cmd]
    for (const fn of list) {
      try {
        const cleanup = fn(dispatch)
        if (typeof cleanup === 'function') {
          // Caller owns lifecycle for long-running cmds
          void cleanup
        }
      } catch (cause) {
        console.error('[mvu] command failed', cause)
      }
    }
  }

  function dispatch(msg: Msg) {
    const [next, cmd] = options.update(model, msg)
    model = next
    notify()
    runCmds(cmd, dispatch)
  }

  runCmds(options.init[1], dispatch)

  return {
    getModel: () => model,
    dispatch,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}