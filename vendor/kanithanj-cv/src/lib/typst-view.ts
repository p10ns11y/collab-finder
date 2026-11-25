export type TypstLink = { url: string; label: string };
export type TypstSpan = { text: string; href?: string; prefix?: string };
export type TypstItem = { key?: string; lead?: string | null; text: string; links?: TypstLink[] };
export type TypstJob = {
  title: string;
  org?: string | null;
  dates: string;
  items: TypstItem[];
  note?: string | null;
};
export type TypstPub = {
  title: string;
  org?: string | null;
  dates: string;
  detail?: { venue: string; link?: TypstLink } | null;
};
export type TypstView = {
  document: {
    title: string;
    author: string;
    description: string;
    keywords: string[];
  };
  name: string;
  headline: string;
  contact_line: TypstSpan[];
  social_line: TypstSpan[];
  profile_line: TypstSpan[];
  summary: string;
  skills: [string, string][];
  independent: {
    title: string;
    org?: string | null;
    dates: string;
    note: string;
    note_link: TypstLink;
    items: TypstItem[];
  };
  experience: TypstJob[];
  profile_in_brief: string;
  publications: TypstPub[];
  education: { title: string; org?: string | null; dates: string }[];
};

export type TypstViewOptions = {
  featuredKeys?: readonly string[];
  upsertedKeys?: readonly string[];
};

export type ProjectShown = { key: string; name: string; url?: string };

export type CvProjectInput = {
  key?: string;
  name: string;
  description?: string;
  url?: string;
  [key: string]: unknown;
};

type JsonMap = Record<string, unknown>;

const KANITHANJ_HE =
  "Kanithanj began as a private desktop app he uses daily and is now heading to public use once fully actualized.";
const KANITHANJ_I =
  "Began as a private desktop app I use daily and is now heading to public use once fully actualized.";

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asMap(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonMap) : {};
}

function asProjects(value: unknown): CvProjectInput[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is CvProjectInput => !!row && typeof row === "object" && typeof (row as CvProjectInput).name === "string");
}

function projectId(project: CvProjectInput): string {
  return project.key ?? project.name;
}

function requireView(stored: JsonMap): TypstView {
  const required = [
    "document",
    "name",
    "headline",
    "contact_line",
    "social_line",
    "profile_line",
    "summary",
    "skills",
    "independent",
    "experience",
    "profile_in_brief",
    "publications",
    "education",
  ];
  const missing = required.filter((key) => stored[key] == null);
  if (missing.length) {
    throw new Error(`cvdata.cv_pdf is missing typst fields: ${missing.join(", ")}`);
  }
  return stored as unknown as TypstView;
}

function linkLabel(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function itemUrls(item: TypstItem): string[] {
  return (item.links ?? []).map((link) => link.url);
}

export function matchProjectKey(item: TypstItem, projects: readonly CvProjectInput[]): string | undefined {
  if (item.key) return item.key;
  const lead = (item.lead ?? "").trim();
  const urls = new Set(itemUrls(item));
  for (const project of projects) {
    const id = projectId(project);
    if (lead && (lead === project.key || lead === project.name)) return id;
    if (project.url && urls.has(project.url)) return id;
  }
  return undefined;
}

function itemFromProject(project: CvProjectInput): TypstItem {
  const description = (project.description ?? "").trim();
  const text = description ? (description.startsWith("—") || description.startsWith("–") ? ` ${description}` : ` — ${description}`) : "";
  const links = project.url ? [{ url: project.url, label: linkLabel(project.url) }] : [];
  return { key: projectId(project), lead: project.name, text, links };
}

function applyUpsert(item: TypstItem, project: CvProjectInput): TypstItem {
  const next: TypstItem = { ...item, key: item.key ?? projectId(project) };
  const description = (project.description ?? "").trim();
  if (description) {
    next.text = description.startsWith("—") || description.startsWith("–") ? ` ${description}` : ` — ${description}`;
  }
  if (project.url) {
    next.links = [{ url: project.url, label: linkLabel(project.url) }];
  }
  return next;
}

function tailorIndependentItems(
  items: TypstItem[],
  projects: readonly CvProjectInput[],
  options: TypstViewOptions,
): TypstItem[] {
  const byId = new Map(projects.map((project) => [projectId(project), project]));
  const upserted = new Set(options.upsertedKeys ?? []);
  const annotated = items.map((item) => {
    const key = matchProjectKey(item, projects);
    return key ? { ...item, key } : item;
  });
  const keyed = annotated.filter((item) => item.key);
  const unkeyed = annotated.filter((item) => !item.key);
  const byKey = new Map<string, TypstItem>();
  for (const item of keyed) {
    if (item.key && !byKey.has(item.key)) byKey.set(item.key, item);
  }

  const useFeatured = options.featuredKeys !== undefined;
  const useUpserts = upserted.size > 0;
  if (!useFeatured && !useUpserts) return annotated;

  const refresh = (item: TypstItem, key: string): TypstItem => {
    const project = byId.get(key);
    if (project && upserted.has(key)) return applyUpsert(item, project);
    return item;
  };

  if (useFeatured) {
    const out: TypstItem[] = [];
    for (const key of options.featuredKeys ?? []) {
      const existing = byKey.get(key);
      if (existing) out.push(refresh(existing, key));
      else {
        const project = byId.get(key);
        if (project) out.push(itemFromProject(project));
      }
    }
    return [...out, ...unkeyed];
  }

  const out = annotated.map((item) => (item.key && upserted.has(item.key) ? refresh(item, item.key) : item));
  for (const key of upserted) {
    if (byKey.has(key)) continue;
    const project = byId.get(key);
    if (project) out.push(itemFromProject(project));
  }
  return out;
}

function firstPerson<T>(value: T): T {
  if (typeof value === "string") return value.split(KANITHANJ_HE).join(KANITHANJ_I) as T;
  if (Array.isArray(value)) return value.map((row) => firstPerson(row)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = firstPerson(child);
    }
    return out as T;
  }
  return value;
}

export function projectsShownFromView(view: TypstView): ProjectShown[] {
  const shown: ProjectShown[] = [];
  const seen = new Set<string>();
  for (const item of view.independent.items) {
    if (!item.key || seen.has(item.key)) continue;
    seen.add(item.key);
    const url = item.links?.[0]?.url;
    shown.push({ key: item.key, name: (item.lead ?? item.key).trim() || item.key, url });
  }
  return shown;
}

export function buildTypstView(cvdata: unknown, options: TypstViewOptions = {}): TypstView {
  const raw = asMap(cvdata);
  const stored = requireView(asMap(raw.cv_pdf));
  const name = asString(raw.name) || stored.name;
  const landing = asMap(raw.landing);
  const headline = asString(landing.role) || stored.headline;
  const summary = asString(raw.profile) || stored.summary;
  const projects = asProjects(raw.projects);
  const items = tailorIndependentItems(stored.independent.items ?? [], projects, options);
  const view: TypstView = {
    ...stored,
    name,
    headline,
    summary,
    document: {
      ...stored.document,
      author: name || stored.document.author,
    },
    independent: {
      ...stored.independent,
      items,
    },
  };
  return firstPerson(view);
}
