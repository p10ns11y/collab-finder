import { appError, toAppError, type AppError } from '../core/error'
import type { Dispatch } from '../core/mvu/engine'
import type { FinderMsg } from '../core/finder/msg'

let dispatchFatal: Dispatch<FinderMsg> | null = null

export function registerFinderDispatch(dispatch: Dispatch<FinderMsg>) {
  dispatchFatal = dispatch
}

export function reportFatal(cause: unknown) {
  const error: AppError =
    cause instanceof Error && cause.message.includes('Minified React')
      ? appError('global_fatal', 'UI error — see console for details.', cause)
      : toAppError(cause)
  dispatchFatal?.({ type: 'GlobalError', error })
  console.error('[collab-finder]', error, cause)
}

export function installGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    reportFatal(event.error ?? event.message)
    event.preventDefault()
  })

  window.addEventListener('unhandledrejection', (event) => {
    reportFatal(event.reason)
    event.preventDefault()
  })
}