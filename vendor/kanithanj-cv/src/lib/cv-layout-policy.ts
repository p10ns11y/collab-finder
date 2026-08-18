/**
 * CV PDF layout contract — single knobs file for density + flow.
 *
 * Target (user contract): **2-page stable, no large voids**, no orphan job titles.
 * Content length (overlay PROFILE, bullets) must not reintroduce all-or-nothing
 * page jumps; those come from atomic multi-bullet job blocks, not from these knobs.
 *
 * Flow mode: soft-job — title+dates atomic; bullets soft-flow.
 * Density: clamp profile / bullets / tools so H_var stays bounded across packs.
 */

export const CV_LAYOUT_POLICY = {
  /** Product bar for apply + master PDF. */
  targetPages: 2,

  /**
   * soft-job: only job header is wrap={false}.
   * atomic-job: whole job block atomic (void risk — avoid).
   */
  flowMode: "soft-job" as const,

  /** pt: room for title+dates + ~1 body line before page break. */
  jobHeaderMinPresenceAhead: 28,

  /** Jobs with index <= earlyJobCount use maxBulletsEarly. */
  earlyJobCount: 2,
  maxBulletsEarly: 3,
  maxBulletsLate: 3,
  maxTools: 10,

  /** Soft clamp apply/master PROFILE before render (sentence-aware). */
  profileMaxChars: 900,

  jobMarginBottom: 5,
} as const;

export type CvLayoutPolicy = typeof CV_LAYOUT_POLICY;

export function maxBulletsForJobIndex(
  index: number,
  policy: Pick<CvLayoutPolicy, "earlyJobCount" | "maxBulletsEarly" | "maxBulletsLate"> = CV_LAYOUT_POLICY,
): number {
  return index <= policy.earlyJobCount ? policy.maxBulletsEarly : policy.maxBulletsLate;
}

export function sliceJobBullets<T>(
  bullets: readonly T[],
  index: number,
  policy: Pick<
    CvLayoutPolicy,
    "earlyJobCount" | "maxBulletsEarly" | "maxBulletsLate"
  > = CV_LAYOUT_POLICY,
): T[] {
  return bullets.slice(0, maxBulletsForJobIndex(index, policy));
}

export function sliceJobTools<T>(
  tools: readonly T[],
  policy: Pick<CvLayoutPolicy, "maxTools"> = CV_LAYOUT_POLICY,
): T[] {
  return tools.slice(0, policy.maxTools);
}

/**
 * Clamp PROFILE for density budget. Prefer ending on a sentence boundary
 * when the cut is not too early; otherwise word-boundary + ellipsis.
 */
export function clampProfile(
  profile: string,
  maxChars: number = CV_LAYOUT_POLICY.profileMaxChars,
): string {
  const t = profile.trim();
  if (t.length <= maxChars) return t;

  const cut = t.slice(0, maxChars);
  const lastStop = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
    cut.endsWith(".") ? cut.length - 1 : -1,
  );
  if (lastStop >= maxChars * 0.55) {
    const end = cut[lastStop] === "." ? lastStop + 1 : lastStop + 1;
    return cut.slice(0, end).trim();
  }
  const word = cut.replace(/\s+\S*$/, "").trim();
  return `${word || cut.trim()}…`;
}
