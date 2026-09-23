/**
 * Cover-letter PDF planning. The letter text is whatever prep already wrote.
 * An empty file produces no PDF and no extra sentences.
 */
import { buildApplyCvFilename, type ApplyCvFilenameInput } from "@/lib/apply-cv-filename";

const COVER_LETTER_HEADING = /^#+\s*cover letter\s*$/i;

/** Body prose from `cover-letter.md`, or null when the file has no letter text. */
export function coverLetterBody(markdown: string | null | undefined): string | null {
  if (!markdown) return null;
  const lines = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i += 1;
  if (i < lines.length && COVER_LETTER_HEADING.test(lines[i].trim())) i += 1;
  const body = lines.slice(i).join("\n").trim();
  return body.length > 0 ? body : null;
}

/** Paragraphs split on blank lines. Wording inside each paragraph is unchanged. */
export function coverLetterParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/**
 * Sibling of `{name}-{role}-{id}.pdf`: `{name}-{role}-{id}-cover-letter.pdf`.
 */
export function buildCoverLetterFilename(input: ApplyCvFilenameInput): string {
  return buildApplyCvFilename(input).replace(/\.pdf$/i, "-cover-letter.pdf");
}

export type CoverLetterPlan =
  | { action: "skip"; reason: "empty"; filename: string }
  | { action: "write"; filename: string; body: string };

export function planCoverLetterPdf(
  markdown: string | null | undefined,
  filenameInput: ApplyCvFilenameInput,
): CoverLetterPlan {
  const filename = buildCoverLetterFilename(filenameInput);
  const body = coverLetterBody(markdown);
  if (!body) return { action: "skip", reason: "empty", filename };
  return { action: "write", filename, body };
}

/** Email already stored on the facts file. Missing email stays missing. */
export function contactEmailFromCvdata(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const contact = record.contact;
  if (contact && typeof contact === "object") {
    const email = (contact as Record<string, unknown>).email;
    if (typeof email === "string" && email.trim()) return email.trim();
  }
  if (typeof record.email === "string" && record.email.trim()) return record.email.trim();
  return null;
}
