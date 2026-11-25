import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { EDGES, coverPaths, covered, LIFECYCLE } from './flow-model.ts';

const paths = coverPaths();
const sample = readFileSync(new URL('../../../packages/core/fixtures/pool.sample.json', import.meta.url), 'utf8');
const DESCRIPTION = 'Senior backend engineer with Go and Postgres, distributed systems';
const shots = process.env['EVIDENCE_DIR'];
let passed = 0;

type Answer = { stateVersion: number; groups?: Record<string, Array<{ id: string }>>; error?: string; confirmed?: boolean; applied?: boolean; sent?: boolean };

declare global { interface Window { pendingForTest: Promise<Answer> | null } }

const invoke = async (name: string, input: Record<string, unknown>): Promise<Answer> => {
  const ctx = document.modelContext;
  if (!ctx) throw new Error('modelContext missing');
  const tool = (await ctx.getTools()).find(t => t.name === name);
  if (!tool) throw new Error(`missing ${name}`);
  return JSON.parse(await ctx.executeTool(tool, input)) as Answer;
};

const call = (page: Page, name: string, input: Record<string, unknown>) =>
  page.evaluate(async ({ source, name, input }) => (await (0, eval)(`(${source})`)(name, input)) as Answer, { source: invoke.toString(), name, input });

const requestConfirm = (page: Page, id: string) =>
  page.evaluate(({ source, id }) => {
    const older = window.pendingForTest;
    window.pendingForTest = (0, eval)(`(${source})`)('show_apply_pack', { id, apply: true }) as Promise<Answer>;
    return older;
  }, { source: invoke.toString(), id });

const toolsReady = (page: Page) => expect.poll(() => page.evaluate(async () => ((await document.modelContext?.getTools()) ?? []).length)).toBe(3);

test.describe('path replays', () => {
test.use({ serviceWorkers: 'block' });
for (const [i, path] of paths.entries()) {
  test(`flow path ${i}: ${path.map(e => e.event).join(' > ')}`, async ({ page, context }) => {
    let pool: 'fail' | 'hold' | 'serve' = path[0]?.event === 'POOL_FAILED' ? 'fail' : 'serve';
    await page.route(/\/pool\.json/, route => pool === 'fail' ? route.abort() : pool === 'serve' ? route.fulfill({ contentType: 'application/json', body: sample }) : undefined);
    if (path.some(e => e.event === 'CONFIRM_FAILED')) await context.route(/person-confirm/, route => route.abort());
    await page.goto('/?all');
    await toolsReady(page);
    const root = page.locator('[data-step]');
    let version = 0;
    let id = '';
    for (const edge of path) {
      switch (edge.event) {
        case 'POOL_LOADED': break;
        case 'POOL_FAILED': break;
        case 'RETRY':
          pool = 'hold';
          await page.getByRole('button', { name: 'Try again' }).click();
          break;
        case 'EDIT': await page.getByLabel('About you').fill(`Edited profile ${i}`); break;
        case 'MATCHED': {
          const a = await call(page, 'find_roles', { stateVersion: version, description: DESCRIPTION });
          expect(a.error ?? null).toBe(null);
          expect(a.stateVersion).toBe(version + 1);
          id = Object.values(a.groups ?? {}).flat()[0]!.id;
          await expect(page.getByTestId('results')).toBeVisible();
          break;
        }
        case 'MATCH_FAILED': {
          const a = await call(page, 'find_roles', { stateVersion: version, description: 'Registered nurse with 8 years in intensive care' });
          expect(a.stateVersion).toBe(version + 1);
          await expect(page.getByTestId('out-of-scope')).toBeVisible();
          break;
        }
        case 'TAILOR': {
          const a = await call(page, 'tailor_cv', { id });
          expect(a.error ?? null).toBe(null);
          expect(a.stateVersion).toBe(version + 1);
          await expect(page.getByTestId('cv-outline')).toBeVisible();
          break;
        }
        case 'PACK': {
          const a = await call(page, 'show_apply_pack', { id });
          expect(a.error ?? null).toBe(null);
          expect(a.stateVersion).toBe(version + 1);
          await expect(page.getByTestId('apply-pack')).toBeVisible();
          await expect(page.getByTestId('person-confirm')).toHaveCount(0);
          break;
        }
        case 'REQUEST_CONFIRM': {
          const older = await requestConfirm(page, id);
          if (older) { expect(older.confirmed).toBeUndefined(); expect(older.error).toMatch(/cancelled/); }
          if (!path.some(e => e.event === 'CONFIRM_FAILED')) await expect(page.getByTestId('person-confirm')).toBeVisible();
          break;
        }
        case 'CONFIRM':
        case 'CANCEL':
        case 'CONFIRM_FAILED': {
          if (edge.event === 'CONFIRM') await page.getByRole('button', { name: 'Confirm', exact: true }).click();
          if (edge.event === 'CANCEL') await page.keyboard.press('Escape');
          const a = await page.evaluate(() => { const p = window.pendingForTest; window.pendingForTest = null; return p; });
          expect(a?.applied).toBe(false);
          expect(a?.sent).toBe(false);
          if (edge.event === 'CONFIRM') {
            expect(a?.confirmed).toBe(true);
            await expect(page.getByTestId('confirmed')).toBeVisible();
          } else {
            expect(a?.confirmed).toBeUndefined();
            expect(a?.error).toMatch(edge.event === 'CANCEL' ? /cancelled/ : /could not be shown/);
          }
          expect(a?.stateVersion).toBe(version + 1);
          await expect(page.getByTestId('person-confirm')).toHaveCount(0);
          break;
        }
      }
      if (!LIFECYCLE.has(edge.event)) version += 1;
      if (edge.event === 'REQUEST_CONFIRM' && path.some(e => e.event === 'CONFIRM_FAILED')) continue;
      await expect(root).toHaveAttribute('data-step', edge.to);
    }
    passed += 1;
  });
}

test('a pending confirm refuses other tools with a clear error and keeps the version', async ({ page }) => {
  await page.goto('/?all');
  await toolsReady(page);
  const a = await call(page, 'find_roles', { stateVersion: 0, description: DESCRIPTION });
  const id = Object.values(a.groups ?? {}).flat()[0]!.id;
  await requestConfirm(page, id);
  await expect(page.getByTestId('person-confirm')).toBeVisible();
  for (const [name, input] of [['find_roles', { stateVersion: 2, description: DESCRIPTION }], ['tailor_cv', { id }], ['show_apply_pack', { id }]] as const) {
    const r = await call(page, name, input);
    expect(r.error).toMatch(/^confirm pending/);
    expect(r.stateVersion).toBe(2);
  }
  await expect(page.getByTestId('person-confirm')).toBeVisible();
  await page.keyboard.press('Escape');
  expect((await page.evaluate(() => window.pendingForTest))?.error).toMatch(/cancelled/);
});

test('a person walks find, match, tailor, apply pack and confirm on the main page', async ({ page }) => {
  const snap = async (name: string) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }); };
  await page.goto('/?all');
  await toolsReady(page);
  await expect(page.locator('[data-step]')).toHaveAttribute('data-step', 'find');
  await snap('1-find');
  await page.getByLabel('About you').fill(DESCRIPTION);
  await page.getByRole('button', { name: 'Find roles' }).click();
  await expect(page.locator('[data-step]')).toHaveAttribute('data-step', 'matched');
  await snap('2-matched');
  const a = await call(page, 'find_roles', { stateVersion: 2 });
  const id = Object.values(a.groups ?? {}).flat()[0]!.id;
  await call(page, 'tailor_cv', { id });
  await expect(page.locator('[data-step]')).toHaveAttribute('data-step', 'tailored');
  await snap('3-tailored');
  await call(page, 'show_apply_pack', { id });
  await expect(page.locator('[data-step]')).toHaveAttribute('data-step', 'pack');
  await snap('4-pack');
  await requestConfirm(page, id);
  await expect(page.getByTestId('person-confirm')).toBeVisible();
  await snap('5-confirming');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('[data-step]')).toHaveAttribute('data-step', 'confirmed');
  const done = await page.evaluate(() => window.pendingForTest);
  expect(done?.confirmed).toBe(true);
  expect(done?.applied).toBe(false);
  expect(done?.sent).toBe(false);
  await snap('6-confirmed');
});
});

test('offline right after the first load: the flow, tools and confirm chunks come from the precache', async ({ page, context }) => {
  await page.goto('/?all');
  await expect(page.locator('[data-step]')).toHaveAttribute('data-step', 'find');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-step]')).toHaveAttribute('data-step', 'find');
  await toolsReady(page);
  const a = await call(page, 'find_roles', { stateVersion: 0, description: DESCRIPTION });
  const id = Object.values(a.groups ?? {}).flat()[0]!.id;
  await requestConfirm(page, id);
  await expect(page.getByTestId('person-confirm')).toBeVisible();
  await page.keyboard.press('Escape');
  await context.setOffline(false);
});

test.afterAll(() => {
  const out = process.env['FLOW_E2E_REPORT'];
  if (out) writeFileSync(out, JSON.stringify({ paths: paths.length, transitions: EDGES.length, covered: covered(paths), passed }, null, 2));
});
