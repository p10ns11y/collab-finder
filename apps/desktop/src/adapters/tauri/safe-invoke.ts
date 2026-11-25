import { invoke } from '@tauri-apps/api/core'
import { toAppError, type AppError } from '../../core/error'
import { err, ok, type Result } from '../../core/result'
import { DESKTOP_APP_NEEDED, isTauri, webPreviewResult } from './web-preview'

export { DESKTOP_APP_NEEDED, isTauri }

const ipcDebug = typeof import.meta.env !== 'undefined' && Boolean(import.meta.env.DEV)

function summarizeIpcArgs(command: string, args?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!args) return args
  if (command !== 'analyze_opportunity_target' && command !== 'prep_opportunity_target') {
    return args
  }
  const cv = args.cvSummary ?? args.cv_summary
  const cvStr = typeof cv === 'string' ? cv : ''
  return {
    ...args,
    cvSummary: cvStr
      ? cvStr.length > 72
        ? `${cvStr.slice(0, 72)}… (${cvStr.length} chars)`
        : `${cvStr} (${cvStr.length} chars)`
      : '(missing — Rust will use default CV packet)',
  }
}

/** Only place that touches @tauri-apps/api — swap adapter to test or port to web. */
export async function safeInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<Result<T, AppError>> {
  if (!isTauri()) {
    return webPreviewResult<T>(command) as Result<T, AppError>
  }

  const t0 = ipcDebug ? performance.now() : 0
  if (ipcDebug) {
    console.debug('[ipc →]', command, summarizeIpcArgs(command, args))
  }

  let result: Result<T, AppError>
  try {
    result = ok(await invoke<T>(command, args))
  } catch (cause) {
    result = err(toAppError(cause))
  }

  if (ipcDebug) {
    const ms = (performance.now() - t0).toFixed(0)
    if (result.ok && command === 'analyze_opportunity_target') {
      const r = result.value as {
        cv_chars_sent?: number
        cv_ipc_chars?: number
        cv_used_fallback?: boolean
        packet_preview_truncated?: boolean
        prompt_tokens?: number
      }
      console.debug('[ipc ←]', command, `${ms}ms`, {
        cv_chars_sent: r.cv_chars_sent,
        cv_ipc_chars: r.cv_ipc_chars,
        cv_used_fallback: r.cv_used_fallback,
        packet_preview_truncated: r.packet_preview_truncated,
        prompt_tokens: r.prompt_tokens,
      })
    } else {
      console.debug('[ipc ←]', command, `${ms}ms`, result.ok ? 'ok' : result.error)
    }
  }

  return result
}
