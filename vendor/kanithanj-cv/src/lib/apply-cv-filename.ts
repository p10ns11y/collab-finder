/**
 * Apply CV PDF naming: always `{name}-{role}-{id}.pdf`
 * Example: peramanathan-sathyamoorthy-exceptional-software-engineer-4956028007.pdf
 */

/** Lowercase ASCII slug: alnum runs joined by single hyphens. */
export function slugifyFilenameSegment(s: string, maxLen = 64): string {
  let out = "";
  let prevHyphen = false;
  for (const ch of s.normalize("NFKD")) {
    if (/[a-zA-Z0-9]/.test(ch)) {
      out += ch.toLowerCase();
      prevHyphen = false;
    } else if (out.length > 0 && !prevHyphen) {
      out += "-";
      prevHyphen = true;
    }
  }
  while (out.endsWith("-")) out = out.slice(0, -1);
  out = out.slice(0, maxLen).replace(/-+$/, "");
  return out || "unknown";
}

/**
 * External job id from board URLs (Greenhouse …/jobs/123456).
 * Returns null when no numeric board id is present.
 */
export function extractJobIdFromSourceUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const m = url.match(/\/jobs\/(\d+)\b/i) || url.match(/[?&](?:gh_jid|job_id)=(\d+)/i);
  return m?.[1] ?? null;
}

export type ApplyCvFilenameInput = {
  /** Person name from master cvdata (e.g. "Peramanathan Sathyamoorthy"). */
  personName: string;
  /** Role / job title (e.g. "Exceptional Software Engineer"). */
  roleTitle: string;
  /**
   * Prefer board job id (Greenhouse). Fallbacks: opportunity id as string, then "unknown".
   */
  jobId: string;
};

/**
 * Canonical apply CV basename: `{name}-{role}-{id}.pdf`
 */
export function buildApplyCvFilename(input: ApplyCvFilenameInput): string {
  const name = slugifyFilenameSegment(input.personName);
  const role = slugifyFilenameSegment(input.roleTitle);
  const id = slugifyFilenameSegment(String(input.jobId).trim() || "unknown", 32);
  return `${name}-${role}-${id}.pdf`;
}

/** Resolve job id: explicit → source_url → opportunity_id → "unknown". */
export function resolveApplyJobId(opts: {
  jobId?: string | number | null;
  sourceUrl?: string | null;
  opportunityId?: string | number | null;
}): string {
  if (opts.jobId != null && String(opts.jobId).trim() !== "") {
    return String(opts.jobId).trim();
  }
  const fromUrl = extractJobIdFromSourceUrl(opts.sourceUrl ?? undefined);
  if (fromUrl) return fromUrl;
  if (opts.opportunityId != null && String(opts.opportunityId).trim() !== "") {
    return String(opts.opportunityId).trim();
  }
  return "unknown";
}
