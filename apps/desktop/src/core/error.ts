/** Stable error surface — UI and logs never depend on thrown shapes. */
export type AppErrorCode =
  | 'unknown'
  | 'network'
  | 'credentials_missing'
  | 'credentials_invalid'
  | 'credentials_store_failed'
  | 'x_api'
  | 'reactor'
  | 'global_fatal'
  | 'persist'

export type AppError = {
  code: AppErrorCode
  message: string
  cause?: string
}

export function appError(code: AppErrorCode, message: string, cause?: unknown): AppError {
  return {
    code,
    message,
    cause: cause === undefined ? undefined : formatCause(cause),
  }
}

export function toAppError(cause: unknown): AppError {
  if (isAppError(cause)) return cause
  const message = cause instanceof Error ? cause.message : String(cause)
  if (
    /credentials|bearer|keychain|not configured|secure storage|no matching entry/i.test(
      message,
    )
  ) {
    return appError('credentials_missing', message, cause)
  }
  if (/X API|api\.x\.com/i.test(message)) {
    return appError('x_api', message, cause)
  }
  if (/fetch|network|ECONNREFUSED/i.test(message)) {
    return appError('network', message, cause)
  }
  return appError('unknown', message || 'Something went wrong', cause)
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as AppError).message === 'string'
  )
}

function formatCause(cause: unknown): string {
  if (cause instanceof Error) return cause.stack ?? cause.message
  return String(cause)
}

export function errorMessage(error: AppError | null | undefined): string | null {
  return error?.message ?? null
}