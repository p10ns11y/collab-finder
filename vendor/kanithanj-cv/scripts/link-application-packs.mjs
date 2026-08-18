#!/usr/bin/env node
/**
 * Symlink collab-finder application packs into this repo (gitignored).
 *
 * Default target:
 *   ~/.local/share/collab-finder/application_packs
 * → ./application_packs
 *
 * Override:
 *   COLLAB_FINDER_PACKS=/path/to/packs node scripts/link-application-packs.mjs
 */
import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const linkPath = join(root, "application_packs");
const defaultTarget = join(homedir(), ".local/share/collab-finder/application_packs");
const target = resolve(process.env.COLLAB_FINDER_PACKS || defaultTarget);

if (!existsSync(target)) {
  console.error(`Pack source missing: ${target}`);
  console.error("Export a pack from collab-finder first (Discover → Export pack),");
  console.error("or set COLLAB_FINDER_PACKS to an existing packs directory.");
  process.exit(1);
}

if (existsSync(linkPath) || isSymlink(linkPath)) {
  const stat = lstatSync(linkPath);
  if (stat.isSymbolicLink()) {
    const current = readlinkSync(linkPath);
    if (resolve(root, current) === target || current === target) {
      console.log(`OK (already linked): application_packs → ${target}`);
      process.exit(0);
    }
    unlinkSync(linkPath);
  } else {
    console.error(`Refusing to replace non-symlink path: ${linkPath}`);
    process.exit(1);
  }
}

mkdirSync(join(root), { recursive: true });
symlinkSync(target, linkPath, "dir");
console.log(`Linked: application_packs → ${target}`);

function isSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
