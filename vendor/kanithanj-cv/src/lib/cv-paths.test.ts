import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { listPackRows, resolvePacksRoot } from "./cv-paths";

function scratch(label: string): string {
  const dir = join(tmpdir(), `kanithanj-cv-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("resolvePacksRoot", () => {
  test("prefers COLLAB_FINDER_PACKS over XDG and a local link", () => {
    const root = scratch("env");
    const envPacks = join(root, "from-env");
    const xdgHome = join(root, "xdg");
    const home = join(root, "cv-home");
    mkdirSync(envPacks, { recursive: true });
    mkdirSync(join(xdgHome, "collab-finder", "application_packs"), { recursive: true });
    mkdirSync(join(home, "application_packs"), { recursive: true });

    const resolved = resolvePacksRoot(home, {
      COLLAB_FINDER_PACKS: envPacks,
      XDG_DATA_HOME: xdgHome,
    });
    expect(resolved).toEqual({ kind: "env", path: envPacks });
  });

  test("uses XDG collab-finder packs when env is unset", () => {
    const root = scratch("xdg");
    const xdgHome = join(root, "xdg");
    const packs = join(xdgHome, "collab-finder", "application_packs");
    const home = join(root, "cv-home");
    mkdirSync(packs, { recursive: true });
    mkdirSync(home);

    const resolved = resolvePacksRoot(home, { XDG_DATA_HOME: xdgHome });
    expect(resolved).toEqual({ kind: "xdg", path: packs });
  });

  test("falls back to a local application_packs dir", () => {
    const root = scratch("linked");
    const home = join(root, "cv-home");
    const linked = join(home, "application_packs");
    mkdirSync(linked, { recursive: true });

    const resolved = resolvePacksRoot(home, {
      XDG_DATA_HOME: join(root, "empty-xdg"),
    });
    expect(resolved).toEqual({ kind: "linked", path: linked });
  });

  test("follows a local symlink to XDG packs", () => {
    const root = scratch("symlink");
    const xdgHome = join(root, "xdg");
    const packs = join(xdgHome, "collab-finder", "application_packs");
    const home = join(root, "cv-home");
    mkdirSync(packs, { recursive: true });
    mkdirSync(home);
    symlinkSync(packs, join(home, "application_packs"), "dir");

    const resolved = resolvePacksRoot(home, {
      XDG_DATA_HOME: join(root, "other-xdg"),
    });
    expect(resolved).toEqual({ kind: "linked", path: join(home, "application_packs") });
  });

  test("reports every path tried when nothing exists", () => {
    const root = scratch("missing");
    const home = join(root, "cv-home");
    mkdirSync(home);
    const xdgHome = join(root, "empty-xdg");

    const resolved = resolvePacksRoot(home, { XDG_DATA_HOME: xdgHome });
    expect(resolved.kind).toBe("missing");
    if (resolved.kind !== "missing") return;
    expect(resolved.tried).toContain(join(xdgHome, "collab-finder", "application_packs"));
    expect(resolved.tried).toContain(join(home, "application_packs"));
  });
});

describe("listPackRows", () => {
  test("reads manifest fields and overlay presence", () => {
    const packs = join(scratch("rows"), "packs");
    const packDir = join(packs, "xai-exceptional-software-engineer-2026-07-17");
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, "manifest.json"),
      JSON.stringify({
        company: "xAI",
        title: "Exceptional Software Engineer",
        slug: "xai-exceptional-software-engineer-2026-07-17",
        opportunity_id: 17,
      }),
    );
    writeFileSync(join(packDir, "cv-overlay.json"), "{}");

    expect(listPackRows(packs)).toEqual([
      {
        folderName: "xai-exceptional-software-engineer-2026-07-17",
        company: "xAI",
        title: "Exceptional Software Engineer",
        slug: "xai-exceptional-software-engineer-2026-07-17",
        opportunityId: 17,
        hasOverlay: true,
      },
    ]);
  });
});
