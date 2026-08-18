/**
 * Merge collab-finder application-pack overlays onto master cvdata for apply-time PDFs.
 * Never writes master `src/data/cvdata.json` — pure function only.
 */

export type CvProjectLike = {
  key?: string;
  name: string;
  description: string;
  url: string;
  type?: string;
  technologies?: string[];
  impact?: string;
  is_open_source?: boolean;
  [key: string]: unknown;
};

export type CvOverlayV1 = {
  schema?: string;
  /** Keys to show in the PDF projects column (2–3 recommended). */
  featured_keys?: string[];
  /** Upsert into projects[] by `key` (or `name` if no key). */
  projects_upsert?: CvProjectLike[];
  /** Shallow field overrides on the root CV object (profile, one_liner, role, etc.). */
  overrides?: Record<string, unknown>;
};

export type CvDataLike = {
  projects: CvProjectLike[];
  [key: string]: unknown;
};

function projectId(p: CvProjectLike): string {
  return p.key ?? p.name;
}

function githubBlurbTruncated(text: string | undefined): boolean {
  const t = (text ?? "").trim();
  return t.endsWith("…") || t.endsWith("...");
}

/** Deep-ish merge: shallow root overrides + projects upsert by key. */
export function applyCvOverlay<T extends CvDataLike>(
  master: T,
  overlay: CvOverlayV1 | null | undefined,
): { data: T; featuredKeys: readonly string[] | undefined } {
  if (!overlay) {
    return { data: master, featuredKeys: undefined };
  }

  let projects = [...(master.projects ?? [])];
  for (const incoming of overlay.projects_upsert ?? []) {
    const id = projectId(incoming);
    const idx = projects.findIndex((p) => projectId(p) === id);
    if (idx >= 0) {
      const previous = projects[idx];
      const merged = { ...previous, ...incoming };
      if (githubBlurbTruncated(incoming.description) && previous.description) {
        merged.description = previous.description;
      }
      projects[idx] = merged;
    } else {
      projects = [incoming, ...projects];
    }
  }

  const data = {
    ...master,
    ...(overlay.overrides ?? {}),
    projects,
  } as T;

  return {
    data,
    featuredKeys: overlay.featured_keys,
  };
}
