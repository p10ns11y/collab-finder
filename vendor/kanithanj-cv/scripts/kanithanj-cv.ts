import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as stdinStream, stdout as stdoutStream } from "node:process";
import { fileURLToPath } from "node:url";
import { HELP, parseArgv, type Command } from "@/lib/cv-cli";
import {
  cvdataStatus,
  defaultCollabFinderPacks,
  listPackRows,
  packsRootPath,
  readInstallRecord,
  resolvePacksRoot,
  type PackRow,
} from "@/lib/cv-paths";

const home = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function isTty(): boolean {
  return Boolean(stdinStream.isTTY && stdoutStream.isTTY);
}

function requirePacksRoot(): string {
  const resolved = resolvePacksRoot(home, process.env);
  const path = packsRootPath(resolved);
  if (!path) {
    const tried = resolved.kind === "missing" ? resolved.tried.join("\n  ") : "";
    console.error("No application packs found.");
    if (tried) console.error(`Tried:\n  ${tried}`);
    console.error("Export a pack from kanithanj.ai, or set COLLAB_FINDER_PACKS.");
    process.exit(1);
  }
  return path;
}

function printPacks(rows: PackRow[], packsRoot: string, kind: string): void {
  console.log(`packs (${kind}): ${packsRoot}`);
  if (rows.length === 0) {
    console.log("(none)");
    return;
  }
  for (const [index, row] of rows.entries()) {
    const role = [row.company, row.title].filter(Boolean).join(" — ") || row.folderName;
    const overlay = row.hasOverlay ? "overlay" : "no-overlay";
    console.log(`${String(index + 1).padStart(2)}  ${row.folderName}  ${role}  ${overlay}`);
  }
}

function listCommand(): void {
  const resolved = resolvePacksRoot(home, process.env);
  if (resolved.kind === "missing") {
    console.log("packs: missing");
    for (const path of resolved.tried) console.log(`  tried ${path}`);
    return;
  }
  printPacks(listPackRows(resolved.path), resolved.path, resolved.kind);
}

function statusCommand(): void {
  const resolved = resolvePacksRoot(home, process.env);
  const cvdata = cvdataStatus(home);
  const install = readInstallRecord(home);
  const cli = join(homedir(), ".local", "bin", "kanithanj.cv");
  console.log(`home:    ${home}`);
  console.log(`cli:     ${existsSync(cli) ? cli : "missing"}`);
  console.log(
    `cvdata:  ${cvdata.present ? cvdata.path : "missing"}${cvdata.linkTarget ? ` → ${cvdata.linkTarget}` : ""}`,
  );
  if (resolved.kind === "missing") {
    console.log("packs:   missing");
    for (const path of resolved.tried) console.log(`  tried ${path}`);
  } else {
    const rows = listPackRows(resolved.path);
    console.log(`packs:   ${resolved.kind} ${resolved.path} (${rows.length})`);
  }
  if (install) {
    console.log(`source:  ${install.source} ${install.remote} @ ${install.ref}`);
    if (install.vendorPath) console.log(`vendor:  ${install.vendorPath}`);
  } else {
    console.log("source:  unrecorded (re-run install to enable sync)");
  }
  const lastPdf = findLastPdf();
  console.log(`last:    ${lastPdf ?? "none"}`);
}

function findLastPdf(): string | null {
  const applyDir = join(home, "out", "apply");
  const alias = join(applyDir, "cv.pdf");
  if (existsSync(alias)) return alias;
  if (!existsSync(applyDir)) return null;
  let newest: { path: string; mtime: number } | null = null;
  const stack = [applyDir];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) break;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const path = join(dir, name);
      try {
        const stat = statSync(path);
        if (stat.isDirectory()) {
          stack.push(path);
        } else if (name.endsWith(".pdf") && (!newest || stat.mtimeMs > newest.mtime)) {
          newest = { path, mtime: stat.mtimeMs };
        }
      } catch {
        /* skip */
      }
    }
  }
  return newest?.path ?? null;
}

function packPdf(packRef: string): string | null {
  const packsRoot = requirePacksRoot();
  const rows = listPackRows(packsRoot);
  const oppMatch = packRef.match(/^(?:opp[_-]?)?(\d+)$/i);
  const wantId = oppMatch ? Number(oppMatch[1]) : null;
  const match =
    rows.find((row) => row.folderName === packRef || row.slug === packRef) ??
    (wantId != null ? rows.find((row) => row.opportunityId === wantId) : undefined);
  if (!match) {
    console.error(`Pack not found: ${packRef}`);
    process.exit(1);
  }
  const slug = match.slug ?? match.folderName;
  const named = join(home, "out", "apply", slug, "cv.pdf");
  if (existsSync(named)) return named;
  return findLastPdf();
}

async function openPath(path: string): Promise<void> {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const proc = Bun.spawn([opener, path], { stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  if (code !== 0) process.exit(code);
}

async function openCommand(target: "last" | { pack: string }): Promise<void> {
  const path = target === "last" ? findLastPdf() : packPdf(target.pack);
  if (!path) {
    console.error("No PDF to open. Run: kanithanj.cv generate <pack>");
    process.exit(1);
  }
  console.log(path);
  await openPath(path);
}

async function runGenerate(pack: "master" | { ref: string }, noSubmitCopy: boolean): Promise<void> {
  const script = join(home, "scripts", "generate-apply-cv.tsx");
  const args = pack === "master" ? [] : [pack.ref];
  if (noSubmitCopy) args.push("--no-submit-copy");
  const proc = Bun.spawn(["bun", script, ...args], {
    cwd: home,
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  process.exit(await proc.exited);
}

async function linkCommand(): Promise<void> {
  const script = join(home, "scripts", "link-application-packs.mjs");
  const packs = process.env.COLLAB_FINDER_PACKS?.trim() || defaultCollabFinderPacks(process.env);
  const proc = Bun.spawn(["node", script], {
    cwd: home,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, COLLAB_FINDER_PACKS: packs },
  });
  process.exit(await proc.exited);
}

async function syncCommand(): Promise<void> {
  const installer = join(home, "scripts", "install-kanithanj-cv.sh");
  if (!existsSync(installer)) {
    console.error("sync needs scripts/install-kanithanj-cv.sh in this home. Re-install from collab-finder.");
    process.exit(1);
  }
  const proc = Bun.spawn(["bash", installer, "--sync"], {
    cwd: home,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, KANITHANJ_CV_HOME: home },
  });
  process.exit(await proc.exited);
}

async function pickCommand(): Promise<void> {
  const packsRoot = requirePacksRoot();
  const resolved = resolvePacksRoot(home, process.env);
  const rows = listPackRows(packsRoot);
  if (rows.length === 0) {
    console.error("No packs to pick.");
    process.exit(1);
  }
  printPacks(rows, packsRoot, resolved.kind === "missing" ? "packs" : resolved.kind);
  if (!isTty()) {
    console.error("Not a TTY. Run: kanithanj.cv generate <pack>");
    process.exit(1);
  }
  const prompt = createInterface({ input: stdinStream, output: stdoutStream });
  const answer = (await prompt.question("Pack number or slug: ")).trim();
  prompt.close();
  const asNumber = Number(answer);
  const row =
    Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= rows.length
      ? rows[asNumber - 1]
      : rows.find((item) => item.folderName === answer || item.slug === answer);
  if (!row) {
    console.error(`Unknown pack: ${answer}`);
    process.exit(1);
  }
  await runGenerate({ ref: row.folderName }, false);
}

async function defaultCommand(): Promise<void> {
  const resolved = resolvePacksRoot(home, process.env);
  if (resolved.kind === "missing") {
    listCommand();
    return;
  }
  const rows = listPackRows(resolved.path);
  if (isTty() && rows.length > 0) {
    await pickCommand();
    return;
  }
  listCommand();
}

async function dispatch(command: Command): Promise<void> {
  switch (command.name) {
    case "help":
      console.log(HELP);
      return;
    case "list":
      listCommand();
      return;
    case "status":
      statusCommand();
      return;
    case "open":
      await openCommand(command.target);
      return;
    case "link":
      await linkCommand();
      return;
    case "sync":
      await syncCommand();
      return;
    case "pick":
      await pickCommand();
      return;
    case "generate":
      await runGenerate(command.pack, command.noSubmitCopy);
      return;
    case "default":
      await defaultCommand();
      return;
  }
}

await dispatch(parseArgv(process.argv.slice(2)));
