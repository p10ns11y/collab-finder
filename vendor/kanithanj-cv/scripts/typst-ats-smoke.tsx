import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderTypstCv } from "../src/lib/render-typst-cv.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UNBROKEN = "UNBROKEN_SENTINEL_ORIENTATION_TOKEN";

export const FIXTURE_MARKERS = [
  "Ada Fixture",
  "AI/SI agentic workflows",
  "ada.fixture@example.com",
  "PROFILE_SENTINEL_ALPHA",
  "SKILL_SENTINEL_SYSTEM",
  UNBROKEN,
  "ROLE_SENTINEL_INDEPENDENT",
  "PROJECT_SENTINEL_COLLAB",
  "ROLE_SENTINEL_ONEFLOW",
  "BULLET_SENTINEL_ZOD",
  "COURSE_SENTINEL_CILIUM",
  "PUB_SENTINEL_ENERGY",
  "EDU_SENTINEL_UPPSALA",
] as const;

export const SECTION_HEADINGS = [
  "SUMMARY",
  "SKILLS",
  "INDEPENDENT WORK",
  "EXPERIENCE",
  "PROFILE IN BRIEF",
  "PUBLICATIONS AND CERTIFICATION",
  "EDUCATION",
] as const;

export const KEYWORD_HYPHEN_TARGETS = [
  "TypeScript",
  "JavaScript",
  "Playwright",
  "GraphQL",
  "Kubernetes",
  "PostgreSQL",
  "Tailwind",
  "Next.js",
  "React",
  "Rust",
  "Python",
  "Docker",
  "Zod",
] as const;

export type NamedCheck = { name: string; pass: boolean; detail?: string };

type Word = { page: number; x: number; y: number; xMax: number; text: string };

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function run(cmd: string, args: string[]): string {
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  if (result.error) fail(`${cmd} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`${cmd} ${args.join(" ")} exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout;
}

function bboxWords(pdf: string): Word[] {
  const html = run("pdftotext", ["-bbox", pdf, "-"]);
  const words: Word[] = [];
  let page = 0;
  const tokens = html.split(/(?=<page\b)|(?=<word\b)/);
  for (const token of tokens) {
    if (token.startsWith("<page")) {
      page += 1;
      continue;
    }
    const match = token.match(
      /^<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)"[^>]*>([^<]*)<\/word>/,
    );
    if (!match) continue;
    words.push({
      page: page || 1,
      x: Number(match[1]),
      y: Number(match[2]),
      xMax: Number(match[3]),
      text: match[4],
    });
  }
  if (words.length === 0) fail("bbox extract returned no words");
  return words;
}

function headingPosition(words: Word[], heading: string): number | null {
  const parts = heading.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const first = words[i];
    if (first.text !== parts[0]) continue;
    let ok = true;
    for (let j = 1; j < parts.length; j++) {
      const next = words[i + j];
      if (!next || next.page !== first.page || Math.abs(next.y - first.y) > 2 || next.text !== parts[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return first.page * 100_000 + first.y * 10 + first.x / 1000;
  }
  return null;
}

function groupLines(words: Word[]): Word[][] {
  const lines: Word[][] = [];
  for (const word of words) {
    const prev = lines[lines.length - 1];
    const last = prev?.[prev.length - 1];
    if (last && last.page === word.page && Math.abs(last.y - word.y) <= 2) prev.push(word);
    else lines.push([word]);
  }
  return lines;
}

function hyphenSplitKeywords(rawText: string, words: Word[], keywords: readonly string[]): string[] {
  const hits = new Set<string>();
  if (rawText.includes("\u00ad")) hits.add("soft-hyphen");
  const consider = (left: string, right: string) => {
    if (!left || !right) return;
    const joined = left.endsWith("-") ? `${left.slice(0, -1)}${right}` : `${left}${right}`;
    if (keywords.some((word) => word.toLowerCase() === joined.toLowerCase())) hits.add(joined);
  };
  const lines = groupLines(words);
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i][0].page !== lines[i + 1][0].page) continue;
    consider(lines[i][lines[i].length - 1]?.text ?? "", lines[i + 1][0]?.text ?? "");
  }
  const rawLines = rawText.split(/\n/);
  for (let i = 0; i < rawLines.length - 1; i++) {
    const leftParts = rawLines[i].trim().split(/\s+/);
    const rightParts = rawLines[i + 1].trim().split(/\s+/);
    consider(leftParts[leftParts.length - 1] ?? "", rightParts[0] ?? "");
  }
  return [...hits];
}

export function evaluatePdf(pdf: string, markers: readonly string[]): { content: NamedCheck[]; layout: NamedCheck[] } {
  const rawText = run("pdftotext", [pdf, "-"]);
  const text = rawText.replace(/\s+/g, " ");
  const words = bboxWords(pdf);
  const info = run("pdfinfo", [pdf]);
  const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] || 0);
  const pageWidth = Number(info.match(/Page size:\s+([\d.]+)/)?.[1]);
  const pageHeight = Number(info.match(/Page size:\s+[\d.]+\s+x\s+([\d.]+)/)?.[1]);

  const content: NamedCheck[] = markers.map((marker) => {
    const at = text.indexOf(marker);
    return at < 0
      ? { name: `marker:${marker}`, pass: false, detail: `missing extractable text: ${marker}` }
      : { name: `marker:${marker}`, pass: true };
  });

  const layout: NamedCheck[] = [];

  const joiner = rawText.includes("\u2060");
  const short = rawText.trim().length < 200;
  layout.push({
    name: "text-layer",
    pass: !short && !joiner,
    detail: short
      ? "extracted text is too short to be a real text layer"
      : joiner
        ? "text layer contains U+2060 word joiners; typst 0.13.1 must not leak them"
        : undefined,
  });

  const positions = SECTION_HEADINGS.map((heading) => [heading, headingPosition(words, heading)] as const);
  const missingHeads = positions.filter(([, pos]) => pos == null).map(([heading]) => heading);
  let orderOk = missingHeads.length === 0;
  let last = -1;
  const orderDetail: string[] = [];
  if (missingHeads.length) orderDetail.push(`missing headings: ${missingHeads.join(", ")}`);
  for (const [heading, pos] of positions) {
    if (pos == null) {
      orderOk = false;
      continue;
    }
    if (pos < last) {
      orderOk = false;
      orderDetail.push(`${heading} is above a preceding section heading`);
    }
    last = pos;
  }
  layout.push({
    name: "reading-order",
    pass: orderOk,
    detail: orderDetail.length ? orderDetail.join("; ") : undefined,
  });

  const splits = hyphenSplitKeywords(rawText, words, KEYWORD_HYPHEN_TARGETS);
  layout.push({
    name: "hyphenation",
    pass: splits.length === 0,
    detail: splits.length ? `hyphen-split keywords: ${splits.join(", ")}` : undefined,
  });

  const skills = words.find((word) => word.text === "SKILLS");
  layout.push({
    name: "skills-column",
    pass: !!skills && skills.x <= 80,
    detail: !skills
      ? "SKILLS heading missing from bbox"
      : skills.x > 80
        ? `SKILLS heading is indented like a side column (x=${skills.x})`
        : undefined,
  });

  layout.push({
    name: "pages",
    pass: pages === 2,
    detail: pages === 2 ? undefined : `expected 2 pages, got ${pages}`,
  });

  layout.push({
    name: "unencrypted",
    pass: !/Encrypted:\s+yes/.test(info),
    detail: /Encrypted:\s+yes/.test(info) ? "PDF is encrypted" : undefined,
  });

  const a4 =
    Number.isFinite(pageWidth) &&
    Number.isFinite(pageHeight) &&
    Math.abs(pageWidth - 595.276) <= 1 &&
    Math.abs(pageHeight - 841.89) <= 1;
  layout.push({
    name: "a4",
    pass: a4,
    detail: a4 ? undefined : `page size ${pageWidth} x ${pageHeight} is not A4`,
  });

  const overflow = pageWidth
    ? words.find((word) => word.xMax > pageWidth - 8)
    : undefined;
  layout.push({
    name: "overflow",
    pass: !overflow,
    detail: overflow
      ? `token overflows the page ("${overflow.text.slice(0, 48)}" xMax=${overflow.xMax} page=${pageWidth})`
      : undefined,
  });

  return { content, layout };
}

export function printReport(content: NamedCheck[], layout: NamedCheck[]): void {
  const contentPassed = content.filter((row) => row.pass).length;
  const layoutPassed = layout.filter((row) => row.pass).length;
  console.log(`ATS content ${contentPassed}/${content.length}`);
  console.log(`ATS layout ${layoutPassed}/${layout.length}`);
  for (const row of [...content, ...layout]) {
    if (row.pass) console.log(`  OK ${row.name}`);
    else console.error(`  FAIL ${row.name}: ${row.detail}`);
  }
}

export function checkPdf(pdf: string, markers: readonly string[]): void {
  const { content, layout } = evaluatePdf(pdf, markers);
  printReport(content, layout);
  const failed = [...content, ...layout].filter((row) => !row.pass);
  if (failed.length) {
    process.exit(1);
  }
  const rawLen = run("pdftotext", [pdf, "-"]).trim().length;
  console.log(`OK typst ATS ${content.length}/${content.length} + ${layout.length}/${layout.length} (${pdf}, ${rawLen} chars)`);
}

export function loadMarkersFile(path: string): string[] {
  const raw = readFileSync(path, "utf8");
  const trimmed = raw.trim();
  const markers = trimmed.startsWith("[")
    ? (JSON.parse(trimmed) as unknown[])
    : trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!Array.isArray(markers) || markers.some((row) => typeof row !== "string")) {
    fail(`markers file must be 13 strings (JSON array or one per line): ${path}`);
  }
  const list = markers as string[];
  if (list.length !== 13) fail(`ATS content suite must be 13 markers, got ${list.length} in ${path}`);
  return list;
}

async function main() {
  const args = process.argv.slice(2);
  const pdfFlag = args.indexOf("--pdf");
  const markersFlag = args.indexOf("--markers-file");
  const markers = markersFlag >= 0 ? loadMarkersFile(args[markersFlag + 1] ?? fail("--markers-file needs a path")) : FIXTURE_MARKERS;
  if (markers.length !== 13) fail("ATS content suite must be 13 markers");

  if (pdfFlag >= 0) {
    const pdf = args[pdfFlag + 1];
    if (!pdf) fail("--pdf needs a path");
    checkPdf(pdf, markers);
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "typst-ats-"));
  const pdf = join(dir, "sample.pdf");
  try {
    const cvdata = JSON.parse(readFileSync(join(root, "typst/fixtures/ada-cvdata.json"), "utf8"));
    await renderTypstCv(cvdata, pdf);
    checkPdf(pdf, markers);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
