/**
 * Projects shown on the CV (web + PDF). Landing / GitHub dashboards use broader lists —
 * keep this as the single filter until featured-project sourcing is unified.
 *
 * Apply packs may pass a different `keys` list via cv-overlay.json (see generate-apply-cv).
 */
export const CV_FEATURED_PROJECT_KEYS = ["selfie-signin", "adaptate"] as const;

export type CvProjectRef = {
  key?: string;
  name: string;
  url: string;
  description: string;
};

export function isCvFeaturedProject(
  project: CvProjectRef,
  keys: readonly string[] = CV_FEATURED_PROJECT_KEYS,
): boolean {
  const id = project.key ?? project.name;
  return keys.includes(id);
}

export function getCvFeaturedProjects<T extends CvProjectRef>(
  projects: T[],
  keys: readonly string[] = CV_FEATURED_PROJECT_KEYS,
): T[] {
  return projects.filter((p) => isCvFeaturedProject(p, keys));
}
