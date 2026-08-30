import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type PacksRoot =
  | { kind: "env"; path: string }
  | { kind: "xdg"; path: string }
  | { kind: "linked"; path: string }
  | { kind: "missing"; tried: string[] };

export type InstallRecord = {
  source: "vendor" | "remote";
  remote: string;
  ref: string;
  vendorPath?: string;
  installedAt: string;
};

export type EnvLike = Record<string, string | undefined>;

export function xdgDataHome(env: EnvLike = process.env): string {
  const configured = env.XDG_DATA_HOME?.trim();
  if (configured) return resolve(configured);
  return join(homedir(), ".local", "share");
}

export function xdgConfigHome(env: EnvLike = process.env): string {
  const configured = env.XDG_CONFIG_HOME?.trim();
  if (configured) return resolve(configured);
  return join(homedir(), ".config");
}

export function defaultCollabFinderPacks(env: EnvLike = process.env): string {
  return join(xdgDataHome(env), "collab-finder", "application_packs");
}

export function defaultCvdataConfigPath(env: EnvLike = process.env): string {
  return join(xdgConfigHome(env), "kanithanj.cv", "cvdata.json");
}

function isExistingDir(path: string): boolean {
  try {
    const stat = lstatSync(path);
    if (stat.isDirectory()) return true;
    if (stat.isSymbolicLink()) return existsSync(path);
    return false;
  } catch {
    return false;
  }
}

export function resolvePacksRoot(home: string, env: EnvLike = process.env): PacksRoot {
  const tried: string[] = [];

  const fromEnv = env.COLLAB_FINDER_PACKS?.trim();
  if (fromEnv) {
    const path = resolve(fromEnv);
    tried.push(path);
    if (isExistingDir(path)) return { kind: "env", path };
  }

  const xdg = defaultCollabFinderPacks(env);
  tried.push(xdg);
  if (isExistingDir(xdg)) return { kind: "xdg", path: xdg };

  const linked = join(home, "application_packs");
  tried.push(linked);
  if (isExistingDir(linked)) return { kind: "linked", path: linked };

  return { kind: "missing", tried };
}

export function packsRootPath(resolved: PacksRoot): string | null {
  return resolved.kind === "missing" ? null : resolved.path;
}

export function readInstallRecord(home: string): InstallRecord | null {
  const path = join(home, ".install.json");
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as InstallRecord;
    if (parsed.source !== "vendor" && parsed.source !== "remote") return null;
    if (!parsed.remote || !parsed.ref || !parsed.installedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export type CvdataPointer =
  | { kind: "env"; path: string }
  | { kind: "config"; path: string }
  | { kind: "linked"; path: string; linkTarget: string }
  | { kind: "bundled"; path: string }
  | { kind: "missing"; tried: string[] };

export function resolveCvdataPointer(home: string, env: EnvLike = process.env): CvdataPointer {
  const bundled = join(home, "src", "data", "cvdata.json");
  const configPath = defaultCvdataConfigPath(env);
  const tried: string[] = [];

  const fromEnv = env.CVDATA_SRC?.trim();
  if (fromEnv) {
    const path = resolve(fromEnv);
    tried.push(path);
    if (existsSync(path)) return { kind: "env", path };
  }

  tried.push(configPath);
  if (existsSync(configPath)) return { kind: "config", path: configPath };

  if (existsSync(bundled)) {
    try {
      const stat = lstatSync(bundled);
      if (stat.isSymbolicLink()) {
        return { kind: "linked", path: bundled, linkTarget: readlinkSync(bundled) };
      }
    } catch {
      /* bundled file still counts */
    }
    return { kind: "bundled", path: bundled };
  }

  tried.push(bundled);
  return { kind: "missing", tried };
}

export function cvdataStatus(home: string): {
  path: string;
  present: boolean;
  linkTarget: string | null;
} {
  const pointer = resolveCvdataPointer(home);
  if (pointer.kind === "missing") {
    return { path: join(home, "src", "data", "cvdata.json"), present: false, linkTarget: null };
  }
  if (pointer.kind === "linked") {
    return { path: pointer.path, present: true, linkTarget: pointer.linkTarget };
  }
  return { path: pointer.path, present: true, linkTarget: null };
}

export type PackRow = {
  folderName: string;
  company: string | null;
  title: string | null;
  slug: string | null;
  opportunityId: number | null;
  hasOverlay: boolean;
};

export function listPackRows(packsRoot: string): PackRow[] {
  let names: string[] = [];
  try {
    names = readdirSync(packsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }

  return names.map((folderName) => {
    const packDir = join(packsRoot, folderName);
    const manifestPath = join(packDir, "manifest.json");
    let company: string | null = null;
    let title: string | null = null;
    let slug: string | null = null;
    let opportunityId: number | null = null;
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
          company?: string;
          title?: string;
          slug?: string;
          opportunity_id?: number;
        };
        company = manifest.company?.trim() || null;
        title = manifest.title?.trim() || null;
        slug = manifest.slug?.trim() || null;
        opportunityId =
          typeof manifest.opportunity_id === "number" ? manifest.opportunity_id : null;
      } catch {
        /* keep nulls */
      }
    }
    return {
      folderName,
      company,
      title,
      slug,
      opportunityId,
      hasOverlay: existsSync(join(packDir, "cv-overlay.json")),
    };
  });
}
