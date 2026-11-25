export type TypstLink = { url: string; label: string };
export type TypstSpan = { text: string; href?: string; prefix?: string };
export type TypstItem = { lead?: string | null; text: string; links?: TypstLink[] };
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

type JsonMap = Record<string, unknown>;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asMap(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonMap) : {};
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

/**
 * Build the Typst-view JSON. Canonical site fields win for name, headline
 * and summary when present. All typst page facts live in `cvdata.cv_pdf`.
 * This package does not ship a personal record.
 */
export function buildTypstView(cvdata: unknown): TypstView {
  const raw = asMap(cvdata);
  const stored = requireView(asMap(raw.cv_pdf));
  const name = asString(raw.name) || stored.name;
  const landing = asMap(raw.landing);
  const headline = asString(landing.role) || stored.headline;
  const summary = asString(raw.profile) || stored.summary;
  return {
    ...stored,
    name,
    headline,
    summary,
    document: {
      ...stored.document,
      author: name || stored.document.author,
    },
  };
}
