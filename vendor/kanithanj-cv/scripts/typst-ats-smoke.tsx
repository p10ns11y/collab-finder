/**
 * ATS checks for the Typst CV renderer: 13 content markers + 8 layout checks.
 *
 *   bun scripts/typst-ats-smoke.tsx              # fixture typst PDF
 *   bun scripts/typst-ats-smoke.tsx --pdf <file>  # already-built PDF
 *   bun scripts/typst-ats-smoke.tsx --pdf <file> --personal
 *
 * Requires poppler `pdftotext` and `pdfinfo` on PATH.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { renderTypstCv } from "../src/lib/render-typst-cv.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UNBROKEN = "UNBROKEN_SENTINEL_ORIENTATION_TOKEN";
const FIXTURE_MARKERS = [
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

const PERSONAL_MARKERS = [
  "Peramanathan Sathyamoorthy",
  "AI/SI agentic workflows",
  "EU work",
  "sathyam.peram@gmail.com",
  "linkedin.com/in/sathyam-peram",
  "9+ years",
  "Oneflow",
  "TypeScript",
  "two weeks",
  "Adaptate",
  "Kanithanj began as a private desktop app he uses daily and is now heading to public use once fully actualized.",
  "Ensembly",
  "Uppsala",
] as const;

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

type Word = { x: number; y: number; xMax: number; text: string };

function bboxWords(pdf: string): Word[] {
  const html = run("pdftotext", ["-bbox", pdf, "-"]);
  const words: Word[] = [];
  for (const match of html.matchAll(
    /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)"[^>]*>([^<]*)<\/word>/g,
  )) {
    words.push({
      x: Number(match[1]),
      y: Number(match[2]),
      xMax: Number(match[3]),
      text: match[4],
    });
  }
  if (words.length === 0) fail("bbox extract returned no words");
  return words;
}

function checkPdf(pdf: string, markers: readonly string[], personal: boolean): void {
  const contentFails: string[] = [];
  const layoutFails: string[] = [];
  const rawText = run("pdftotext", [pdf, "-"]);
  const text = rawText.replace(/\s+/g, " ");

  if (rawText.trim().length < 200) layoutFails.push("extracted text is too short to be a real text layer");

  let cursor = -1;
  for (const marker of markers) {
    const at = text.indexOf(marker);
    if (at < 0) contentFails.push(`missing extractable text: ${marker}`);
    else if (at <= cursor) layoutFails.push(`"${marker}" is out of reading order`);
    else cursor = at;
  }

  const words = bboxWords(pdf);
  const skills = words.find((word) => word.text === "SKILLS");
  if (!skills) layoutFails.push("SKILLS heading missing from bbox");
  else if (skills.x > 80) {
    layoutFails.push(`SKILLS heading is indented like a side column (x=${skills.x})`);
  }

  const info = run("pdfinfo", [pdf]);
  const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] || 0);
  if (personal) {
    if (pages !== 2) layoutFails.push(`expected 2 pages, got ${pages}`);
  } else if (pages < 1) {
    layoutFails.push(`pdfinfo has no page count:\n${info}`);
  }
  if (/Encrypted:\s+yes/.test(info)) layoutFails.push("PDF is encrypted");
  const pageWidth = Number(info.match(/Page size:\s+([\d.]+)/)?.[1]);
  if (!pageWidth) layoutFails.push(`pdfinfo has no page width:\n${info}`);
  else if (Math.abs(pageWidth - 595.276) > 1) {
    layoutFails.push(`page width ${pageWidth} is not A4`);
  }
  if (pageWidth) {
    for (const word of words) {
      if (word.xMax > pageWidth - 8) {
        layoutFails.push(
          `token overflows the page ("${word.text.slice(0, 48)}" xMax=${word.xMax} page=${pageWidth})`,
        );
        break;
      }
    }
  }

  if (text.includes("Ori-") || text.includes(`${UNBROKEN.slice(0, 24)}-`) || text.includes("Type-\nScript") || text.includes("\u00ad")) {
    layoutFails.push("hyphenator split a keyword");
  }

  const contentPassed = markers.length - contentFails.length;
  const layoutTotal = 8;
  const layoutPassed = layoutTotal - Math.min(layoutFails.length, layoutTotal);
  console.log(`ATS content ${contentPassed}/${markers.length}`);
  console.log(`ATS layout ${layoutPassed}/${layoutTotal}`);
  if (contentFails.length || layoutFails.length) {
    for (const row of [...contentFails, ...layoutFails]) console.error(`FAIL: ${row}`);
    process.exit(1);
  }
  console.log(`OK typst ATS 13/13 + 8/8 (${pdf}, ${text.trim().length} chars)`);
}

async function main() {
  const args = process.argv.slice(2);
  const pdfFlag = args.indexOf("--pdf");
  const personal = args.includes("--personal");
  const markers = personal ? PERSONAL_MARKERS : FIXTURE_MARKERS;
  if (markers.length !== 13) fail("ATS content suite must be 13 markers");

  if (pdfFlag >= 0) {
    const pdf = args[pdfFlag + 1];
    if (!pdf) fail("--pdf needs a path");
    checkPdf(pdf, markers, personal);
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "typst-ats-"));
  const pdf = join(dir, "sample.pdf");
  try {
    const cvdata = JSON.parse(readFileSync(join(root, "typst/fixtures/ada-cvdata.json"), "utf8"));
    await renderTypstCv(cvdata, pdf);
    checkPdf(pdf, markers, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
