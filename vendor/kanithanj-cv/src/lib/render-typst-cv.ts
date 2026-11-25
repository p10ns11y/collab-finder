import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, copyFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureTypstBin } from "../../scripts/ensure-typst.ts";
import { TYPST_SOURCE_DATE_EPOCH } from "./typst-pin.ts";
import {
  buildTypstView,
  projectsShownFromView,
  type ProjectShown,
  type TypstView,
  type TypstViewOptions,
} from "./typst-view.ts";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function renderTypstCv(
  cvdata: unknown,
  outPdf: string,
  options: TypstViewOptions = {},
): Promise<{ view: TypstView; projectsShown: ProjectShown[] }> {
  const typstBin = await ensureTypstBin();
  const view = buildTypstView(cvdata, options);
  const projectsShown = projectsShownFromView(view);
  const absOut = resolve(outPdf);
  const work = mkdtempSync(join(tmpdir(), "kanithanj-cv-typst-"));
  try {
    const typstDir = join(packageRoot, "typst");
    copyFileSync(join(typstDir, "cv.typ"), join(work, "cv.typ"));
    cpSync(join(typstDir, "fonts"), join(work, "fonts"), { recursive: true });
    writeFileSync(join(work, "cvdata.json"), `${JSON.stringify(view)}\n`);
    mkdirSync(dirname(absOut), { recursive: true });
    const result = spawnSync(typstBin, ["compile", "--font-path", "fonts", "cv.typ", absOut], {
      cwd: work,
      encoding: "utf8",
      env: { ...process.env, SOURCE_DATE_EPOCH: process.env.SOURCE_DATE_EPOCH ?? TYPST_SOURCE_DATE_EPOCH },
    });
    if (result.status !== 0) {
      throw new Error(`typst compile failed: ${result.stderr || result.stdout}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return { view, projectsShown };
}

export { buildTypstView, projectsShownFromView };
