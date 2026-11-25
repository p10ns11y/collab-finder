/**
 * Build typst/fixtures/word-joiner-text.pdf with typst 0.15.1.
 * typst 0.13.1 does not leak U+2060 into the text layer, so this
 * fixture must be compiled with 0.15.1 and --no-pdf-tags.
 *
 *   TYPST15_BIN=/path/to/typst-0.15.1 bun scripts/generate-word-joiner-fixture.ts
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const typ = join(root, "typst/fixtures/word-joiner.typ");
const out = join(root, "typst/fixtures/word-joiner-text.pdf");
const typst = process.env.TYPST15_BIN;
if (!typst) {
  console.error("set TYPST15_BIN to a typst 0.15.1 binary");
  process.exit(1);
}

function run(cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

const version = run(typst, ["--version"]).trim();
if (!version.includes("0.15.1")) {
  console.error(`TYPST15_BIN must be typst 0.15.1, got: ${version}`);
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
run(typst, ["compile", "--no-pdf-tags", typ, out]);
console.log(`wrote ${out} with ${version}`);
