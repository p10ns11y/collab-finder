/**
 * Generate a fixture apply PDF and check positional text extraction.
 *
 * The old two-column layout made `pdftotext` (and ATS readers that sort
 * glyphs by position) interleave a role with the skills column, and the
 * hyphenator split words (`Orientation` → `Ori-` / `entation`).
 *
 *   bun scripts/ats-pdf-smoke.tsx
 * Requires poppler `pdftotext` on PATH.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToFile } from "@react-pdf/renderer";
import CVDocument from "@/components/cv-document";

const UNBROKEN = "UNBROKEN_SENTINEL_ORIENTATION_TOKEN";

const data = {
  name: "Ada Fixture",
  contact: {
    email: "ada.fixture@example.com",
    phone: "+1 555 0100",
    phone_public: true,
    citizenship: "Exampleland",
  },
  cv_social_links: {
    github: "https://github.com/ada-fixture",
    x: "https://x.com/adafixture",
    x_handle: "@adafixture",
  },
  profile:
    "PROFILE_SENTINEL_ALPHA Senior engineer who ships TypeScript platforms and keeps hiring parsers honest with plain sentences.",
  work_experience: [
    {
      title: "ROLE_SENTINEL_ONEFLOW",
      company: "Northwind Labs",
      location: "Example City",
      start_date: "January 2023",
      end_date: "December 2024",
      responsibilities: [
        "BULLET_SENTINEL_ZOD integrated TypeScript and Zod inference across a legacy JavaScript codebase.",
      ],
      tools: ["TypeScript", "Zod"],
    },
    {
      kind: "independent_work",
      title: "ROLE_SENTINEL_INDEPENDENT",
      company: "Fixture Studio",
      location: "Remote",
      start_date: "January 2025",
      end_date: "Present",
      responsibilities: ["Shipped a small public tool used by the fixture suite."],
      tools: ["Rust"],
    },
  ],
  skills: {
    product: ["SKILL_SENTINEL_SYSTEM", "Detail Orientation", UNBROKEN],
    practices: ["Test Driven Development"],
  },
  projects: [
    {
      key: "collab-finder",
      name: "PROJECT_SENTINEL_COLLAB",
      url: "https://example.com/collab",
      description: "Desktop hunt reactor fixture project.",
      created: "2026-03-02",
      updated: "2026-04-01",
      public_url: "https://example.com",
    },
  ],
  courses: [
    {
      name: "COURSE_SENTINEL_CILIUM",
      url: "https://example.com/course",
      domain: "Security",
      provider: "Fixture Academy",
      completionDate: "2026-03-24",
    },
  ],
  technologies: {
    Languages: ["TECH_SENTINEL_RUST", "TypeScript"],
  },
  publications: [
    {
      title: "PUB_SENTINEL_ENERGY",
      url: "https://example.com/paper",
      doi_url: "https://doi.org/10.0000/fixture",
      journal: { name: "Fixture Journal" },
      first_published: "2017-11-07",
    },
  ],
  education: [
    {
      degree: "EDU_SENTINEL_UPPSALA",
      institution: "Example University",
      years: "2010 - 2016",
    },
  ],
  languages: {
    English: "Proficient",
  },
};

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

type Word = { x: number; y: number; text: string };

function bboxWords(pdf: string): Word[] {
  const html = run("pdftotext", ["-bbox", pdf, "-"]);
  const words: Word[] = [];
  for (const match of html.matchAll(
    /<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>([^<]*)<\/word>/g,
  )) {
    words.push({ x: Number(match[1]), y: Number(match[2]), text: match[3] });
  }
  if (words.length === 0) fail("bbox extract returned no words");
  return words;
}

function sharesBand(words: Word[], left: string, right: string): boolean {
  const band = (text: string) =>
    words.filter((word) => word.text === text).map((word) => Math.round(word.y / 4) * 4);
  const rightBands = new Set(band(right));
  return band(left).some((y) => rightBands.has(y));
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "ats-cv-"));
  const pdf = join(dir, "sample.pdf");
  try {
    await renderToFile(
      <CVDocument data={data as never} featuredKeys={["collab-finder"]} />,
      pdf,
    );
    const text = run("pdftotext", [pdf, "-"]);
    if (text.trim().length < 200) fail("extracted text is too short to be a real text layer");

    const order = [
      "Ada Fixture",
      "ada.fixture@example.com",
      "PROFILE_SENTINEL_ALPHA",
      "ROLE_SENTINEL_INDEPENDENT",
      "Shipped a small public tool",
      "ROLE_SENTINEL_ONEFLOW",
      "BULLET_SENTINEL_ZOD",
      "SKILL_SENTINEL_SYSTEM",
      "Detail Orientation",
      UNBROKEN,
      "PROJECT_SENTINEL_COLLAB",
      "COURSE_SENTINEL_CILIUM",
      "TECH_SENTINEL_RUST",
      "PUB_SENTINEL_ENERGY",
      "EDU_SENTINEL_UPPSALA",
      "English: Proficient",
    ];
    let cursor = -1;
    for (const marker of order) {
      const at = text.indexOf(marker);
      if (at < 0) fail(`missing extractable text: ${marker}`);
      if (at <= cursor) {
        fail(`"${marker}" is out of reading order (at ${at}, previous ended ${cursor})`);
      }
      cursor = at;
    }
    if (text.includes("Ori-") || text.includes(`${UNBROKEN.slice(0, 24)}-`)) {
      fail("hyphenator split a keyword");
    }

    const words = bboxWords(pdf);
    if (sharesBand(words, "INDEPENDENT", "SKILLS")) {
      fail("INDEPENDENT WORK and SKILLS still share a vertical band");
    }
    if (sharesBand(words, "ROLE_SENTINEL_INDEPENDENT", "Product:")) {
      fail("a role line still shares a band with the skills column");
    }
    const skills = words.find((word) => word.text === "SKILLS");
    if (!skills) fail("SKILLS heading missing from bbox");
    if (skills.x > 80) fail(`SKILLS heading is indented like a side column (x=${skills.x})`);

    const info = run("pdfinfo", [pdf]);
    if (!/Pages:\s+[1-9]/.test(info)) fail(`pdfinfo has no page count:\n${info}`);
    if (/Encrypted:\s+yes/.test(info)) fail("PDF is encrypted");

    console.log(`OK ats pdf smoke (${pdf}, ${text.trim().length} chars)`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
