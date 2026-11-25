import type { AppError } from './error'

/** Explicit async lifecycle — no ambiguous boolean flags. */
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'failed'; error: AppError }

export const idle = <T>(): AsyncState<T> => ({ status: 'idle' })

export function isLoading<T>(state: AsyncState<T>): boolean {
  return state.status === 'loading'
}

export function isBusy(model: { search: AsyncState<unknown>; cycle: AsyncState<unknown> }): boolean {
  return isLoading(model.search) || isLoading(model.cycle)
}