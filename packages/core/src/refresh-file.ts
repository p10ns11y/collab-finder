import { readFile, rename, writeFile } from 'node:fs/promises';
import { parsePool } from './pool.ts';
import type { PublicPool } from './schema.ts';
import type { SwapStore } from './refresh.ts';

export const fileSwapStore = (path: string, beforeRename: () => Promise<void> = async () => {}): SwapStore => ({
  read: async () => {
    const p = parsePool(JSON.parse(await readFile(path, 'utf8')));
    if (p.isErr()) throw new Error(`live pool unreadable: ${p.error.kind}`);
    return p.value;
  },
  swap: async (next: PublicPool) => {
    const tmp = `${path}.next-${process.pid}`;
    await writeFile(tmp, JSON.stringify(next));
    await beforeRename();
    await rename(tmp, path);
  },
});
