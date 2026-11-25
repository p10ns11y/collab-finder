import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, copyFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureTypstBin } from "../../scripts/ensure-typst.ts";
import { buildTypstView } from "./typst-view.ts";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function renderTypstCv(cvdata: unknown, outPdf: string): Promise<void> {
  const typstBin = await ensureTypstBin();
  const view = buildTypstView(cvdata);
  const work = mkdtempSync(join(tmpdir(), "kanithanj-cv-typst-"));
  const typstDir = join(packageRoot, "typst");
  copyFileSync(join(typstDir, "cv.typ"), join(work, "cv.typ"));
  cpSync(join(typstDir, "fonts"), join(work, "fonts"), { recursive: true });
  writeFileSync(join(work, "cvdata.json"), `${JSON.stringify(view)}\n`);
  mkdirSync(dirname(outPdf), { recursive: true });
  const result = spawnSync(
    typstBin,
    ["compile", "--font-path", "fonts", "cv.typ", outPdf],
    { cwd: work, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`typst compile failed: ${result.stderr || result.stdout}`);
  }
}

export { buildTypstView };
