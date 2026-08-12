import { safeInvoke } from './safe-invoke'

/** Open http(s) in the system browser. Tauri webview ignores target=_blank. */
export function openExternalUrl(url: string): void {
  const t = url.trim()
  if (!t) return
  void safeInvoke<void>('open_external_url', { url: t })
}
