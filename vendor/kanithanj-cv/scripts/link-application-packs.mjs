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
const xdgData = process.env.XDG_DATA_HOME || join(homedir(), ".local/share");
const defaultTarget = join(xdgData, "collab-finder", "application_packs");
const target = resolve(process.env.COLLAB_FINDER_PACKS || defaultTarget);

if (!existsSync(target)) {
  mkdirSync(target, { recursive: true });
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
