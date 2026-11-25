/**
 * Download the official Typst 0.13.1 musl binary and verify SHA-256.
 * Usage: bun scripts/ensure-typst.ts
 * Prints the typst binary path on success.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  chmodSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { typstArchiveFor, TYPST_RELEASE, TYPST_VERSION } from "../src/lib/typst-pin.ts";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function cacheRoot(): string {
  const env = process.env.KANITHANJ_TYPST_CACHE?.trim();
  if (env) return env;
  const xdg = process.env.XDG_CACHE_HOME?.trim();
  if (xdg) return join(xdg, "kanithanj.cv", "typst", TYPST_VERSION);
  return join(homedir(), ".cache", "kanithanj.cv", "typst", TYPST_VERSION);
}

export async function ensureTypstBin(): Promise<string> {
  const override = process.env.TYPST_BIN?.trim();
  if (override) {
    if (!existsSync(override)) fail(`TYPST_BIN does not exist: ${override}`);
    return override;
  }

  const archive = typstArchiveFor(process.platform, process.arch);
  const dir = cacheRoot();
  mkdirSync(dir, { recursive: true });
  const bin = join(dir, "typst");
  const stamp = join(dir, `${archive.file}.sha256`);
  if (existsSync(bin) && existsSync(stamp) && readFileSync(stamp, "utf8").trim() === archive.sha256) {
    return bin;
  }

  const url = `${TYPST_RELEASE}/${archive.file}`;
  const tarPath = join(dir, archive.file);
  const res = await fetch(url);
  if (!res.ok) fail(`Failed to download ${url}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length !== archive.size) {
    fail(`Typst archive size ${bytes.length} != pinned ${archive.size} (${archive.file})`);
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== archive.sha256) {
    fail(`Typst archive SHA-256 mismatch for ${archive.file}: got ${digest}, expected ${archive.sha256}`);
  }
  writeFileSync(tarPath, bytes);

  const extract = join(tmpdir(), `typst-extract-${process.pid}`);
  mkdirSync(extract, { recursive: true });
  const unpacked = spawnSync("tar", ["-xJf", tarPath, "-C", extract], { encoding: "utf8" });
  if (unpacked.status !== 0) fail(`tar extract failed: ${unpacked.stderr}`);
  const found = spawnSync("find", [extract, "-type", "f", "-name", "typst"], { encoding: "utf8" });
  const typstSrc = (found.stdout || "").trim().split("\n").filter(Boolean)[0];
  if (!typstSrc) fail("typst binary missing from official archive");
  writeFileSync(bin, readFileSync(typstSrc));
  chmodSync(bin, 0o755);
  writeFileSync(stamp, `${archive.sha256}\n`);
  return bin;
}

if (import.meta.main) {
  ensureTypstBin().then((path) => {
    const ver = spawnSync(path, ["--version"], { encoding: "utf8" });
    process.stdout.write((ver.stdout || "").trim() + "\n" + path + "\n");
  });
}
