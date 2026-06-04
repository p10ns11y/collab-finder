import { invoke } from '@tauri-apps/api/core'
import { toAppError, type AppError } from '../../core/error'
import { fromPromise, type Result } from '../../core/result'

/** Only place that touches @tauri-apps/api — swap adapter to test or port to web. */
export async function safeInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<Result<T, AppError>> {
  return fromPromise(invoke<T>(command, args), toAppError)
}