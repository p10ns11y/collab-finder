import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
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

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function typstVersionLine(bin: string): string {
  const result = spawnSync(bin, ["--version"], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`typst --version failed for ${bin}: ${result.stderr || result.stdout}`);
  }
  return (result.stdout || "").trim();
}

function assertTypst0131(bin: string): void {
  const line = typstVersionLine(bin);
  if (!/^typst\s+0\.13\.1\b/.test(line)) {
    throw new Error(`TYPST_BIN must be typst ${TYPST_VERSION}, got: ${line || "(empty)"}`);
  }
}

export async function ensureTypstBin(): Promise<string> {
  const override = process.env.TYPST_BIN?.trim();
  if (override) {
    if (!existsSync(override)) fail(`TYPST_BIN does not exist: ${override}`);
    try {
      assertTypst0131(override);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
    return override;
  }

  const archive = typstArchiveFor(process.platform, process.arch);
  const dir = cacheRoot();
  mkdirSync(dir, { recursive: true });
  const bin = join(dir, "typst");
  if (existsSync(bin) && sha256File(bin) === archive.binarySha256) {
    try {
      assertTypst0131(bin);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
    return bin;
  }

  const url = `${TYPST_RELEASE}/${archive.file}`;
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

  const tarPath = join(dir, archive.file);
  const extract = join(tmpdir(), `typst-extract-${process.pid}-${Date.now()}`);
  mkdirSync(extract, { recursive: true });
  let extractError: Error | undefined;
  try {
    writeFileSync(tarPath, bytes);
    const unpacked = spawnSync("tar", ["-xJf", tarPath, "-C", extract], { encoding: "utf8" });
    if (unpacked.status !== 0) {
      throw new Error(`tar extract failed: ${unpacked.stderr}`);
    }
    const found = spawnSync("find", [extract, "-type", "f", "-name", "typst"], { encoding: "utf8" });
    const typstSrc = (found.stdout || "").trim().split("\n").filter(Boolean)[0];
    if (!typstSrc) throw new Error("typst binary missing from official archive");
    const binaryDigest = sha256File(typstSrc);
    if (binaryDigest !== archive.binarySha256) {
      throw new Error(`Typst binary SHA-256 mismatch: got ${binaryDigest}, expected ${archive.binarySha256}`);
    }
    writeFileSync(bin, readFileSync(typstSrc));
    chmodSync(bin, 0o755);
    assertTypst0131(bin);
  } catch (error) {
    extractError = error instanceof Error ? error : new Error(String(error));
  } finally {
    rmSync(extract, { recursive: true, force: true });
    rmSync(tarPath, { force: true });
  }
  if (extractError) fail(extractError.message);
  return bin;
}

if (import.meta.main) {
  ensureTypstBin()
    .then((path) => {
      const ver = spawnSync(path, ["--version"], { encoding: "utf8" });
      process.stdout.write((ver.stdout || "").trim() + "\n" + path + "\n");
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
