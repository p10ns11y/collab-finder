/**
 * Normalize Tauri IPC payloads for application pack / apply-CV results.
 * Accepts snake_case (Rust serde default) or camelCase (some IPC layers).
 */

export type ApplicationPackExportWire = {
  opportunity_id: number
  pack_dir: string
  pack_slug: string
  company?: string | null
  title?: string | null
  files: string[]
  file_count: number
}

export type GenerateApplyCvWire = {
  opportunity_id: number
  pack_slug: string
  pack_dir: string
  pdf_path: string
  flat_pdf_path?: string | null
  submit_pdf_path?: string | null
  stdout_tail?: string
  /** Files written by the re-export that precedes generate. */
  export_files?: string[]
  export_file_count?: number
}

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return ''
}

function pickNum(obj: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  }
  return 0
}

function pickStrArr(obj: Record<string, unknown>, ...keys: string[]): string[] {
  for (const k of keys) {
    const v = obj[k]
    if (Array.isArray(v)) {
      return v.filter((x): x is string => typeof x === 'string')
    }
  }
  return []
}

/** Normalize export_application_pack result from IPC. */
export function normalizeApplicationPackExport(raw: unknown): ApplicationPackExportWire {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const files = pickStrArr(o, 'files', 'file_names')
  const counted = pickNum(o, 'file_count', 'fileCount')
  // Prefer length of files when present (avoids 0 when only camelCase count is missing).
  const file_count = files.length > 0 ? files.length : counted
  return {
    opportunity_id: pickNum(o, 'opportunity_id', 'opportunityId'),
    pack_dir: pickStr(o, 'pack_dir', 'packDir'),
    pack_slug: pickStr(o, 'pack_slug', 'packSlug'),
    company: (pickStr(o, 'company') || null) as string | null,
    title: (pickStr(o, 'title') || null) as string | null,
    files,
    file_count,
  }
}

/** Recover pack folder from opportunity notes (`export_path=… pack_slug=…`). */
export function packExportFromOpportunityNotes(
  notes?: string | null,
): { pack_dir: string; pack_slug: string } | null {
  if (!notes || !notes.trim()) return null
  let pack_dir = ''
  let pack_slug = ''
  for (const part of notes.split(/\s+/)) {
    if (part.startsWith('export_path=')) pack_dir = part.slice('export_path='.length).trim()
    if (part.startsWith('pack_slug=')) pack_slug = part.slice('pack_slug='.length).trim()
  }
  if (!pack_dir) return null
  return { pack_dir, pack_slug }
}

/** Normalize generate_apply_cv result from IPC. */
export function normalizeGenerateApplyCv(raw: unknown): GenerateApplyCvWire {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const export_files = pickStrArr(o, 'export_files', 'exportFiles', 'files')
  const export_file_count =
    export_files.length > 0
      ? export_files.length
      : pickNum(o, 'export_file_count', 'exportFileCount', 'file_count', 'fileCount')
  return {
    opportunity_id: pickNum(o, 'opportunity_id', 'opportunityId'),
    pack_slug: pickStr(o, 'pack_slug', 'packSlug'),
    pack_dir: pickStr(o, 'pack_dir', 'packDir'),
    pdf_path: pickStr(o, 'pdf_path', 'pdfPath'),
    flat_pdf_path: pickStr(o, 'flat_pdf_path', 'flatPdfPath') || null,
    submit_pdf_path: pickStr(o, 'submit_pdf_path', 'submitPdfPath') || null,
    stdout_tail: pickStr(o, 'stdout_tail', 'stdoutTail') || undefined,
    export_files,
    export_file_count,
  }
}
