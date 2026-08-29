/**
 * Projects shown on the master CV (web + PDF).
 *
 * Data: ISO `created` / `updated`. Eligibility: `updated` on/after March 2026.
 * Master pins 3 high-quality unique products. Overlay `keys` still pin a pack.
 */
export const CV_FEATURED_SINCE = "2026-03-01";
export const CV_MASTER_PROJECT_KEYS = [
  "collab-finder",
  "thepulimaangani",
  "devprofile",
] as const;
export const CV_REACH_PROJECT_KEY = "collab-finder";
export const CV_FEATURED_MAX = 3;

/** @deprecated Use CV_MASTER_PROJECT_KEYS. Kept for overlay-era callers. */
export const CV_FEATURED_PROJECT_KEYS = CV_MASTER_PROJECT_KEYS;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export type CvProjectRef = {
  key?: string;
  name: string;
  url: string;
  description: string;
  created?: string;
  updated?: string;
  reach?: boolean;
};

export type FeaturedSelectOptions = {
  since?: string;
  masterKeys?: readonly string[];
  maxTotal?: number;
};

export function projectLookupId(project: CvProjectRef): string {
  return project.key ?? project.name;
}

export function isIsoDay(value: string | undefined): value is string {
  return Boolean(value && ISO_DAY.test(value));
}

export function isUpdatedSince(project: CvProjectRef, since: string = CV_FEATURED_SINCE): boolean {
  if (!isIsoDay(project.updated) || !isIsoDay(since)) return false;
  return project.updated >= since;
}

export function isReachProject(project: CvProjectRef): boolean {
  return project.reach === true || projectLookupId(project) === CV_REACH_PROJECT_KEY;
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function monthYearLabel(isoDay: string): string {
  const year = Number(isoDay.slice(0, 4));
  const monthIndex = Number(isoDay.slice(5, 7)) - 1;
  return `${MONTH_LABELS[monthIndex]} ${year}`;
}

export function formatProjectDateRange(
  created: string | undefined,
  updated: string | undefined,
): string | undefined {
  if (isIsoDay(created) && isIsoDay(updated)) {
    const startLabel = monthYearLabel(created);
    const endLabel = monthYearLabel(updated);
    return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
  }
  if (isIsoDay(updated)) return monthYearLabel(updated);
  if (isIsoDay(created)) return monthYearLabel(created);
  return undefined;
}

export function projectDateRangeLabel(project: CvProjectRef): string | undefined {
  return formatProjectDateRange(project.created, project.updated);
}

export function isCvFeaturedProject(
  project: CvProjectRef,
  keys: readonly string[],
): boolean {
  return keys.includes(projectLookupId(project));
}

function projectsInKeyOrder<T extends CvProjectRef>(
  projects: T[],
  keys: readonly string[],
): T[] {
  const projectById = new Map(
    projects.map((project) => [projectLookupId(project), project] as const),
  );
  const ordered: T[] = [];
  for (const projectKey of keys) {
    const project = projectById.get(projectKey);
    if (project) ordered.push(project);
  }
  return ordered;
}

/** Master: pinned quality keys that were updated since March 2026. */
export function selectMasterCvProjects<T extends CvProjectRef>(
  projects: T[],
  options: FeaturedSelectOptions = {},
): T[] {
  const since = options.since ?? CV_FEATURED_SINCE;
  const masterKeys = options.masterKeys ?? CV_MASTER_PROJECT_KEYS;
  const maxTotal = options.maxTotal ?? CV_FEATURED_MAX;
  const eligible = projects.filter((project) => isUpdatedSince(project, since));
  return projectsInKeyOrder(eligible, masterKeys).slice(0, maxTotal);
}

/**
 * Overlay `keys` pin order. Otherwise the March–now master three.
 */
export function getCvFeaturedProjects<T extends CvProjectRef>(
  projects: T[],
  keys?: readonly string[],
  options?: FeaturedSelectOptions,
): T[] {
  if (keys && keys.length > 0) {
    return projectsInKeyOrder(projects, keys);
  }
  return selectMasterCvProjects(projects, options);
}
