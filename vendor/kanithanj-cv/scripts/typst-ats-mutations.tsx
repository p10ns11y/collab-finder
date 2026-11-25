import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureTypstBin } from "./ensure-typst.ts";
import { TYPST_SOURCE_DATE_EPOCH } from "../src/lib/typst-pin.ts";
import { buildTypstView } from "../src/lib/typst-view.ts";
import { evaluatePdf, FIXTURE_MARKERS, type NamedCheck } from "./typst-ats-smoke.tsx";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const typstDir = join(root, "typst");

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function compileWithTemplate(template: string, outPdf: string): Promise<void> {
  const typstBin = await ensureTypstBin();
  const cvdata = JSON.parse(readFileSync(join(typstDir, "fixtures/ada-cvdata.json"), "utf8"));
  const view = buildTypstView(cvdata);
  const work = mkdtempSync(join(tmpdir(), "typst-mut-"));
  cpSync(join(typstDir, "fonts"), join(work, "fonts"), { recursive: true });
  writeFileSync(join(work, "cv.typ"), template);
  writeFileSync(join(work, "cvdata.json"), `${JSON.stringify(view)}\n`);
  const result = spawnSync(typstBin, ["compile", "--font-path", "fonts", "cv.typ", outPdf], {
    cwd: work,
    encoding: "utf8",
    env: { ...process.env, SOURCE_DATE_EPOCH: process.env.SOURCE_DATE_EPOCH ?? TYPST_SOURCE_DATE_EPOCH },
  });
  rmSync(work, { recursive: true, force: true });
  if (result.status !== 0) {
    fail(`typst compile failed: ${result.stderr || result.stdout}`);
  }
}

function requireFail(layout: NamedCheck[], name: string, label: string): void {
  const check = layout.find((row) => row.name === name);
  if (!check) fail(`${label}: missing layout check ${name}`);
  if (check.pass) fail(`${label}: expected ${name} to fail, but it passed`);
  console.log(`OK mutation caught: ${label} (${name}: ${check.detail})`);
}

function swapSections(src: string, first: string, second: string, until: string): string {
  const a = src.indexOf(`#section("${first}")`);
  const b = src.indexOf(`#section("${second}")`);
  const c = src.indexOf(`#section("${until}")`);
  if (a < 0 || b < 0 || c < 0 || !(a < b && b < c)) {
    fail(`cannot swap typst sections ${first} / ${second}`);
  }
  return src.slice(0, a) + src.slice(b, c) + src.slice(a, b) + src.slice(c);
}

async function main() {
  const src = readFileSync(join(typstDir, "cv.typ"), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "typst-ats-mutations-"));
  try {
    const hyphenPdf = join(dir, "hyphen.pdf");
    const hyphenSrc =
      src.replace(
        "#section(\"Summary\")\n#prose(data.summary)",
        "#section(\"Summary\")\n#prose(data.summary)\n#block(width: 18pt)[\n  #set text(hyphenate: true)\n  TypeScript\n]",
      );
    await compileWithTemplate(hyphenSrc, hyphenPdf);
    requireFail(evaluatePdf(hyphenPdf, FIXTURE_MARKERS).layout, "hyphenation", "keyword hyphenation");

    const orderPdf = join(dir, "order.pdf");
    const orderSrc = swapSections(src, "Independent Work", "Experience", "Profile in Brief");
    await compileWithTemplate(orderSrc, orderPdf);
    requireFail(evaluatePdf(orderPdf, FIXTURE_MARKERS).layout, "reading-order", "Experience above Independent Work");

    const pagesPdf = join(dir, "pages.pdf");
    const pagesSrc = `${src}\n#pagebreak()\nThree-page mutation filler.\n`;
    await compileWithTemplate(pagesSrc, pagesPdf);
    requireFail(evaluatePdf(pagesPdf, FIXTURE_MARKERS).layout, "pages", "3 pages");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("OK typst ATS mutations (hyphenation, reading-order, pages)");
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
