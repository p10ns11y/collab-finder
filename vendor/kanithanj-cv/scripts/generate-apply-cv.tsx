/**
 * Generate a portfolio-styled apply CV from master cvdata + optional pack overlay.
 *
 * Usage:
 *   bun scripts/generate-apply-cv.tsx xai-exceptional-software-engineer-2026-07-17
 *   bun scripts/generate-apply-cv.tsx 17
 *   bun scripts/generate-apply-cv.tsx <pack> --no-submit-copy
 *
 * Output filename rule (always):
 *   {name}-{role}-{id}.pdf
 *   e.g. peramanathan-sathyamoorthy-exceptional-software-engineer-4956028007.pdf
 *
 * Writes:
 *   out/apply/{name-role-id}.pdf          # easy upload path
 *   out/apply/<pack-slug>/{name-role-id}.pdf
 *   out/apply/<pack-slug>/cv.pdf          # alias
 *   application_packs/<slug>/submit/{name-role-id}.pdf  (if submit/ exists)
 *
 * Does NOT mutate src/data/cvdata.json or public/cv.pdf.
 */
import ReactPDF from "@react-pdf/renderer";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import CVDocument from "@/components/cv-document";
import masterData from "@/data/cvdata.json";
import {
  buildApplyCvFilename,
  resolveApplyJobId,
} from "@/lib/apply-cv-filename";
import { applyCvOverlay, type CvOverlayV1 } from "@/lib/cv-overlay";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

type PackManifest = {
  schema?: string;
  opportunity_id?: number;
  company?: string;
  title?: string;
  date?: string;
  slug?: string;
  /** Board / ATS job id when known (Greenhouse numeric id preferred). */
  job_id?: string | number;
  source_url?: string;
  cv_filename?: string;
  files?: string[];
};

function usage(): never {
  console.error(
    "Usage: bun scripts/generate-apply-cv.tsx <pack_slug|opp_N|id> [--no-submit-copy]",
  );
  console.error(
    "Example: bun scripts/generate-apply-cv.tsx xai-exceptional-software-engineer-2026-07-17",
  );
  console.error(
    "Output always: {name}-{role}-{id}.pdf (from cvdata name + pack title + job id)",
  );
  process.exit(1);
}

function readManifest(packDir: string): PackManifest | null {
  const p = join(packDir, "manifest.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PackManifest;
  } catch {
    return null;
  }
}

/** Resolve pack folder by slug, opp_N, bare id, or manifest opportunity_id / slug. */
function resolvePack(
  packsRoot: string,
  packArg: string,
): { packDir: string; folderName: string; manifest: PackManifest | null } {
  const direct = join(packsRoot, packArg);
  if (existsSync(direct)) {
    return {
      packDir: direct,
      folderName: packArg,
      manifest: readManifest(direct),
    };
  }

  const oppMatch = packArg.match(/^(?:opp[_-]?)?(\d+)$/i);
  const wantId = oppMatch ? Number(oppMatch[1]) : null;

  let entries: string[] = [];
  try {
    entries = readdirSync(packsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() || d.isSymbolicLink())
      .map((d) => d.name);
  } catch {
    entries = [];
  }

  for (const name of entries) {
    const dir = join(packsRoot, name);
    const man = readManifest(dir);
    if (wantId != null && man?.opportunity_id === wantId) {
      return { packDir: dir, folderName: name, manifest: man };
    }
    if (man?.slug === packArg) {
      return { packDir: dir, folderName: name, manifest: man };
    }
    if (wantId != null && (name === `opp_${wantId}` || name === `opp-${wantId}`)) {
      return { packDir: dir, folderName: name, manifest: man };
    }
  }

  console.error(`Pack not found: ${packArg}`);
  console.error(`Looked under: ${packsRoot}`);
  if (entries.length) {
    console.error(`Available: ${entries.join(", ")}`);
  }
  process.exit(1);
}

function resolveSlug(
  folderName: string,
  manifest: PackManifest | null,
  overlay: CvOverlayV1 | null,
): string {
  if (manifest?.slug && String(manifest.slug).trim()) {
    return String(manifest.slug).trim();
  }
  const o = overlay as CvOverlayV1 & { slug?: string };
  if (o?.slug && String(o.slug).trim()) {
    return String(o.slug).trim();
  }
  return folderName;
}

const PROJECT_HINTS: Array<[RegExp, string]> = [
  [/collab-finder/i, "collab-finder"],
  [/agent-prompt-tuning-lab|agent-prompt/i, "agent-prompt-tuning-lab"],
  [/elomaxz/i, "elomaxz"],
  [/premflow/i, "premflow"],
  [/thepulimaangani|pulima/i, "thepulimaangani"],
  [/selfie-sign|selfie-signin|rekognition/i, "selfie-signin"],
  [/adaptate/i, "adaptate"],
  [/latex-cv/i, "latex-cv"],
  [/grok-dia/i, "grok-dia"],
];

/** Parse `- suggestion` bullets from cv-suggestions.md */
function parseSuggestionBullets(md: string): string[] {
  return md
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
    .filter((l) => l.length > 8 && !l.startsWith("#"));
}

/**
 * Build a minimal cv_overlay_v1 when export omitted it (so apply PDFs still differ by role).
 * Pure + best-effort; master cvdata is never written.
 */
function synthesizeOverlayFromPackFiles(
  packDir: string,
  manifest: PackManifest | null,
): CvOverlayV1 | null {
  const suggestionsPath = join(packDir, "cv-suggestions.md");
  const exceptionalPath = join(packDir, "exceptional-work.md");
  const researchPath = join(packDir, "research-notes.md");
  const suggestions = existsSync(suggestionsPath)
    ? parseSuggestionBullets(readFileSync(suggestionsPath, "utf8"))
    : [];
  const exceptional = existsSync(exceptionalPath)
    ? readFileSync(exceptionalPath, "utf8")
        .replace(/^#.*$/m, "")
        .trim()
    : "";
  const research = existsSync(researchPath)
    ? readFileSync(researchPath, "utf8")
        .replace(/^#.*$/m, "")
        .trim()
    : "";

  if (!suggestions.length && !exceptional) return null;

  const blob = `${suggestions.join("\n")}\n${exceptional}\n${research}`;
  const featured: string[] = [];
  for (const [re, key] of PROJECT_HINTS) {
    if (re.test(blob) && !featured.includes(key)) featured.push(key);
  }
  for (const def of ["collab-finder", "agent-prompt-tuning-lab", "adaptate"]) {
    if (!featured.includes(def)) featured.push(def);
  }
  featured.splice(6);

  const company = (manifest?.company && String(manifest.company).trim()) || "target";
  const title = (manifest?.title && String(manifest.title).trim()) || "role";

  // 5-beat PROFILE (hook → career → recent ≤2 → seeking). Never dump prep-delta instructions.
  const blobL = blob.toLowerCase();
  const co = company.charAt(0).toUpperCase() + company.slice(1);
  const role = title.replace(/Typescript/g, "TypeScript");
  const secure =
    blobL.includes("secur") || blobL.includes("rekognition") || blobL.includes("auth");
  const hook = secure
    ? "Senior Software Engineer with fullstack web dev specialization, with deep ownership of production integrations, platform reliability, and secure data flows."
    : "Senior Software Engineer with fullstack web dev specialization, with deep ownership of production integrations, platform reliability, and high-signal delivery.";
  let career = exceptional
    ? exceptional.slice(0, 720).trim()
    : "At Oneflow I led full-stack integration and platform work—multi-client systems, Public API reliability, TypeScript migration, and Playwright E2E—with ownership of production quality.";
  for (const junk of [
    "This is production product integration at scale, the same craft I apply when shipping secure, maintainable fullstack systems.",
    "This is production product integration at scale",
  ]) {
    const i = career.indexOf(junk);
    if (i >= 0) career = career.slice(0, i).trim();
  }
  const recentItems: string[] = [];
  if (blobL.includes("rekognition") || blobL.includes("selfie") || featured.includes("selfie-signin")) {
    recentItems.push("AWS Rekognition identity flows");
  }
  if (blobL.includes("zod") || blobL.includes("schema")) {
    recentItems.push("Zod-based schema tooling");
  }
  if (recentItems.length < 2 && featured.includes("collab-finder") && blobL.includes("agent")) {
    recentItems.push("agentic desktop tooling (personal OSS)");
  }
  recentItems.splice(2);
  const recent =
    recentItems.length === 0
      ? ""
      : recentItems.length === 1
        ? `Recent personal work includes ${recentItems[0]}.`
        : `Recent personal work includes ${recentItems[0]} and ${recentItems[1]}.`;
  const seeking = `Seeking the ${role} role at ${co} to own full-stack delivery of internal platforms and integrations.`;
  const profile = [hook, career, recent, seeking].filter(Boolean).join(" ");

  return {
    schema: "cv_overlay_v1",
    featured_keys: featured,
    overrides: {
      profile,
      one_liner: `Senior Software Engineer with fullstack web dev specialization · ${co} · integrations & production craft`,
      // Do not set latest_proffessional_role — header no longer shows it.
    },
  };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const noSubmitCopy = args.includes("--no-submit-copy");
  const packArg = args.find((a) => !a.startsWith("-"));
  if (!packArg) usage();

  const packsRoot = join(root, "application_packs");
  if (!existsSync(packsRoot)) {
    console.error("Missing application_packs/ — run: pnpm link-application-packs");
    process.exit(1);
  }

  const { packDir, folderName, manifest } = resolvePack(packsRoot, packArg);

  const overlayPath = join(packDir, "cv-overlay.json");
  let overlay: CvOverlayV1 | null = null;
  if (existsSync(overlayPath)) {
    overlay = JSON.parse(readFileSync(overlayPath, "utf8")) as CvOverlayV1;
    console.log(`Overlay: ${overlayPath}`);
  } else {
    // Fallback: synthesize from pack markdown (older exports without overlay).
    overlay = synthesizeOverlayFromPackFiles(packDir, manifest);
    if (overlay) {
      console.log("No cv-overlay.json — synthesized from cv-suggestions.md / exceptional-work.md");
      try {
        writeFileSync(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);
        console.log(`Wrote ${overlayPath}`);
      } catch {
        /* non-fatal: still use in-memory overlay */
      }
    } else {
      console.log("No cv-overlay.json and no suggestions — master-style CV for this pack.");
    }
  }

  const slug = resolveSlug(folderName, manifest, overlay);
  const company = manifest?.company ?? null;
  const title =
    (manifest?.title && String(manifest.title).trim()) ||
    "role";
  const date = manifest?.date ?? null;
  const personName =
    typeof masterData.name === "string" && masterData.name.trim()
      ? masterData.name.trim()
      : "candidate";
  const jobId = resolveApplyJobId({
    jobId: manifest?.job_id,
    sourceUrl: manifest?.source_url,
    opportunityId: manifest?.opportunity_id,
  });
  // Canonical rule: name-role-id.pdf (ignore legacy manifest.cv_filename for primary output)
  const cvFileName = buildApplyCvFilename({
    personName,
    roleTitle: title,
    jobId,
  });

  console.log(`Pack: ${folderName}`);
  console.log(`Slug: ${slug}`);
  console.log(`CV file: ${cvFileName}`);
  if (company || title) {
    console.log(`Role: ${[company, title].filter(Boolean).join(" — ")}`);
  }

  const { data, featuredKeys } = applyCvOverlay(masterData, overlay);

  const outDir = join(root, "out", "apply", slug);
  mkdirSync(outDir, { recursive: true });
  const outPdf = join(outDir, cvFileName);

  console.log(`Generating ${outPdf} …`);
  await ReactPDF.render(
    <CVDocument data={data as typeof masterData} featuredKeys={featuredKeys} />,
    outPdf,
  );
  console.log(`Wrote ${outPdf}`);

  // Flat upload path: out/apply/{name-role-id}.pdf
  const flatOutDir = join(root, "out", "apply");
  mkdirSync(flatOutDir, { recursive: true });
  const flatPdf = join(flatOutDir, cvFileName);
  if (flatPdf !== outPdf) {
    copyFileSync(outPdf, flatPdf);
    console.log(`Wrote ${flatPdf}`);
  }

  // Convenience alias for tools that always look for cv.pdf
  copyFileSync(outPdf, join(outDir, "cv.pdf"));

  const snapshot = {
    pack_folder: folderName,
    pack_slug: slug,
    opportunity_id: manifest?.opportunity_id ?? null,
    job_id: jobId,
    source_url: manifest?.source_url ?? null,
    company,
    title,
    date,
    person_name: personName,
    cv_filename: cvFileName,
    cv_filename_rule: "name-role-id.pdf",
    generated_at: new Date().toISOString(),
    overlay_path: existsSync(overlayPath) ? overlayPath : null,
    featured_keys: featuredKeys ?? null,
    projects_shown: (featuredKeys ?? []).map((key) => {
      const p = data.projects.find((proj) => (proj.key ?? proj.name) === key);
      return p ? { key, name: p.name, url: p.url } : { key, missing: true };
    }),
  };
  writeFileSync(join(outDir, "meta.json"), `${JSON.stringify(snapshot, null, 2)}\n`);

  if (!noSubmitCopy) {
    const submitDir = join(packDir, "submit");
    if (existsSync(submitDir)) {
      const submitPdf = join(submitDir, cvFileName);
      copyFileSync(outPdf, submitPdf);
      console.log(`Copied → ${submitPdf}`);
      // Stable aliases for older checklists
      copyFileSync(outPdf, join(submitDir, "resume-devprofile-cv.pdf"));
      copyFileSync(outPdf, join(submitDir, `resume-${slug}.pdf`));
    } else {
      console.log(`No submit/ under pack — skip Greenhouse copy (use ${flatPdf}).`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
