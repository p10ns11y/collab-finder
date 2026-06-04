import { appError, type AppError } from '../error'
import type { Result } from '../result'
import { err, ok } from '../result'

/** Pure credential rules — no I/O, no framework. */
export function validateBearerDraft(draft: string): Result<string, AppError> {
  const trimmed = draft.trim()
  if (!trimmed) {
    return err(appError('credentials_invalid', 'Bearer token cannot be empty.'))
  }
  if (trimmed.length < 20) {
    return err(appError('credentials_invalid', 'Token looks too short — check X Developer Portal keys.'))
  }
  if (/\s/.test(trimmed)) {
    return err(appError('credentials_invalid', 'Token must not contain spaces.'))
  }
  return ok(trimmed)
}

export function requireConnection(connected: boolean): Result<true, AppError> {
  if (connected) return ok(true)
  return err(
    appError(
      'credentials_missing',
      'Connect X first — save your bearer token (OS keyring preferred; file fallback if keyring unavailable).',
    ),
  )
}