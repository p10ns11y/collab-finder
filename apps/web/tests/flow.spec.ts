import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { EDGES, ORACLE_EDGES, MACHINE_STEPS, STEPS, coverPaths, covered, LIFECYCLE } from './flow-model.ts';

const paths = coverPaths();
test('runtime machine matches the independent transition oracle', () => {
  const key = (e: { from: string; event: string; to: string }) => `${e.from}:${e.event}:${e.to}`;
  expect(EDGES.map(key).sort()).toEqual(ORACLE_EDGES.map(key).sort());
  expect([...MACHINE_STEPS].sort()).toEqual([...STEPS].sort());
});
const sample = readFileSync(new URL('../../../packages/core/fixtures/pool.sample.json', import.meta.url), 'utf8');
const DESCRIPTION = 'Senior backend engineer with Go and Postgres, distributed systems';
const shots = process.env['EVIDENCE_DIR'];
let passed = 0;

type Answer = { stateVersion: number; groups?: Record<string, Array<{ id: string; title: string; company: string }>>; error?: string; confirmed?: boolean; applied?: boolean; sent?: boolean };

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

type Role = { id: string; label: string };
type Shown = { outlined?: Role; packed?: Role; asked?: Role; visible?: Role | null; closed?: boolean };

const twoRoles = (a: Answer): [Role, Role] => {
  const all = Object.values(a.groups ?? {}).flat().map(r => ({ id: r.id, label: `${r.title} at ${r.company}` }));
  const first = all[0]!;
  const second = all.find(r => !r.label.includes(first.label) && !first.label.includes(r.label));
  if (!second) throw new Error('need two distinct roles');
  return [first, second];
};

const shows = async (page: Page, step: string, dialog: boolean, seen: Shown = {}) => {
  const count = (id: string, n: number) => expect(page.getByTestId(id)).toHaveCount(n);
  if (step === 'loading') await expect(page.getByRole('status').filter({ hasText: 'Loading roles' })).toBeVisible();
  if (step === 'failed') await expect(page.getByRole('alert').filter({ hasText: 'Could not load the roles' })).toBeVisible();
  if (['loading', 'failed', 'find'].includes(step)) { await count('results', 0); await count('cv-outline', 0); await count('apply-pack', 0); }
  else await expect(page.getByTestId('results')).toBeVisible();
  if (step === 'tailored') { await expect(page.getByTestId('cv-outline')).toContainText(seen.outlined!.label); await count('apply-pack', 0); }
  if (step === 'pack' || step === 'confirmed') await expect(page.getByTestId('apply-pack')).toContainText(seen.packed!.label);
  if (step === 'confirming' && dialog) {
    await expect(page.getByTestId('person-confirm')).toContainText(seen.asked!.label);
    if (seen.packed?.id !== seen.asked?.id) {
      const pack = page.getByTestId('apply-pack');
      if (await pack.count()) await expect(pack).not.toContainText(seen.asked!.label);
    }
  }
  if (seen.closed) {
    const pack = page.getByTestId('apply-pack');
    if (seen.visible) await expect(pack).toContainText(seen.visible.label);
    else await count('apply-pack', 0);
    if (seen.asked && seen.asked.id !== seen.visible?.id && await pack.count()) await expect(pack).not.toContainText(seen.asked.label);
  }
  await count('confirmed', step === 'confirmed' ? 1 : 0);
  await count('person-confirm', step === 'confirming' && dialog ? 1 : 0);
};

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
    await expect(root).toHaveAttribute('data-step', path[0]?.event === 'POOL_FAILED' ? 'failed' : 'find');
    let version = 0;
    let roles: [Role, Role] | null = null;
    const seen: Shown = {};
    for (const [k, edge] of path.entries()) {
      const role = () => roles![k % 2]!;
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
          roles = twoRoles(a);
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
          seen.outlined = role();
          seen.visible = null;
          const a = await call(page, 'tailor_cv', { id: role().id });
          expect(a.error ?? null).toBe(null);
          expect(a.stateVersion).toBe(version + 1);
          await expect(page.getByTestId('cv-outline')).toBeVisible();
          break;
        }
        case 'PACK': {
          seen.packed = role();
          seen.visible = role();
          const a = await call(page, 'show_apply_pack', { id: role().id });
          expect(a.error ?? null).toBe(null);
          expect(a.stateVersion).toBe(version + 1);
          await expect(page.getByTestId('apply-pack')).toBeVisible();
          await expect(page.getByTestId('person-confirm')).toHaveCount(0);
          break;
        }
        case 'REQUEST_CONFIRM': {
          seen.asked = role();
          const older = await requestConfirm(page, role().id);
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
            seen.packed = seen.asked!;
            seen.visible = seen.asked!;
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
      if (['MATCHED', 'MATCH_FAILED', 'EDIT'].includes(edge.event)) seen.visible = null;
      seen.closed = edge.event === 'CANCEL' || edge.event === 'CONFIRM_FAILED';
      if (!LIFECYCLE.has(edge.event)) version += 1;
      if (edge.event === 'REQUEST_CONFIRM' && path.some(e => e.event === 'CONFIRM_FAILED')) continue;
      await expect(root).toHaveAttribute('data-step', edge.to);
      await shows(page, edge.to, true, seen);
    }
    passed += 1;
  });
}

for (const first of ['confirm', 'pack'] as const) {
  test(`content: ${first} A, then confirm B shows B's dialog and pack`, async ({ page }) => {
    await page.goto('/?all');
    await toolsReady(page);
    const roles = twoRoles(await call(page, 'find_roles', { stateVersion: 0, description: DESCRIPTION }));
    if (first === 'pack') {
      await call(page, 'show_apply_pack', { id: roles[0].id });
      await expect(page.getByTestId('apply-pack')).toContainText(roles[0].label);
    } else {
      await requestConfirm(page, roles[0].id);
      await expect(page.getByTestId('person-confirm')).toContainText(roles[0].label);
    }
    const older = await requestConfirm(page, roles[1].id);
    if (first === 'confirm') expect(older?.error).toMatch(/cancelled/);
    await expect(page.getByTestId('person-confirm')).toContainText(roles[1].label);
    await expect(page.getByTestId('person-confirm')).not.toContainText(roles[0].label);
    if (first === 'pack') await expect(page.getByTestId('apply-pack')).not.toContainText(roles[1].label);
    else await expect(page.getByTestId('apply-pack')).toHaveCount(0);
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    expect((await page.evaluate(() => window.pendingForTest))?.confirmed).toBe(true);
    await expect(page.getByTestId('apply-pack')).toContainText(roles[1].label);
    await expect(page.getByTestId('apply-pack')).not.toContainText(roles[0].label);
  });
}

test('content: pack A, then cancel B keeps A and never shows B', async ({ page }) => {
  await page.goto('/?all');
  await toolsReady(page);
  const roles = twoRoles(await call(page, 'find_roles', { stateVersion: 0, description: DESCRIPTION }));
  await call(page, 'show_apply_pack', { id: roles[0].id });
  await expect(page.getByTestId('apply-pack')).toContainText(roles[0].label);
  await requestConfirm(page, roles[1].id);
  await expect(page.getByTestId('person-confirm')).toContainText(roles[1].label);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await page.evaluate(() => window.pendingForTest))?.error).toMatch(/cancelled/);
  await expect(page.locator('[data-step]')).toHaveAttribute('data-step', 'matched');
  await expect(page.getByTestId('apply-pack')).toContainText(roles[0].label);
  await expect(page.getByTestId('apply-pack')).not.toContainText(roles[1].label);
});

test('confirm after the full view is closed reports the pack as not shown, never confirmed', async ({ page }) => {
  await page.goto('/#all');
  await toolsReady(page);
  const roles = twoRoles(await call(page, 'find_roles', { stateVersion: 0, description: DESCRIPTION }));
  await requestConfirm(page, roles[0].id);
  await expect(page.getByTestId('person-confirm')).toContainText(roles[0].label);
  await page.evaluate(() => { window.location.hash = ''; });
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const a = await page.evaluate(() => window.pendingForTest);
  expect(a?.confirmed).toBeUndefined();
  expect(a?.error).toMatch(/could not be shown/);
  await expect(page.getByTestId('apply-pack')).toHaveCount(0);
});

test('flow chunk retries on the next request while the pool fetch starts in parallel', async ({ page, context }) => {
  let unblock: (() => void) | undefined;
  let flowBlocked = true;
  const flowWait = new Promise<void>(resolve => { unblock = resolve; });
  let fetched = false;
  const urls: string[] = [];
  await context.route(/\/assets\/flow-/, async route => { urls.push(route.request().url()); if (flowBlocked) { await flowWait; await route.abort(); } else await route.continue(); });
  await page.route(/\/pool\.json/, async route => { fetched = true; await route.fulfill({ contentType: 'application/json', body: sample }); });
  await page.goto('/?all');
  await expect.poll(() => fetched).toBe(true);
  await expect(page.locator('[data-step]')).toHaveAttribute('data-step', 'loading');
  unblock?.();
  await expect(page.locator('[data-step]')).toHaveAttribute('data-step', 'failed');
  flowBlocked = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('[data-step]')).toHaveAttribute('data-step', 'find');
  expect(urls).toHaveLength(2);
  expect(urls[1]).not.toBe(urls[0]);
  await page.getByLabel('About you').fill(DESCRIPTION);
  await page.getByRole('button', { name: 'Find roles' }).click();
  await expect(page.getByTestId('results')).toBeVisible();
});

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

test('flow design: a form rail and a state-driven stage, hairline matches and no reviewer copy', async ({ page }) => {
  await page.goto('/?all');
  await toolsReady(page);
  await expect(page.getByTestId('flow-stage')).toContainText('Find your next role');
  const roles = twoRoles(await call(page, 'find_roles', { stateVersion: 0, description: DESCRIPTION }));
  await expect(page.getByTestId('flow-stage')).toContainText('Your matches');
  await expect(page.getByTestId('flow-stage').locator('[data-posting-id]').first()).toHaveAttribute('data-layout', 'row');
  await call(page, 'tailor_cv', { id: roles[0].id });
  await expect(page.getByTestId('cv-outline')).toContainText('Lead with');
  await call(page, 'show_apply_pack', { id: roles[0].id });
  await expect(page.getByTestId('apply-pack')).toContainText('Before you apply');
  await requestConfirm(page, roles[1].id);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByTestId('confirmed')).toContainText('✓');
  await expect(page.locator('body')).not.toContainText(/nothing was applied|does not apply or send|nothing was sent/i);
});
