import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { STATE_VIEW, type FlowEvent, type FlowState } from '../src/flow/machine.ts';
import { flowPaths } from '../src/flow/paths.ts';

const paths = flowPaths();
const shots = process.env['EVIDENCE_DIR'];
const report = process.env['FLOW_E2E_REPORT'];
let passed = 0;

declare global { interface Window { kanithanjFlow: { send: (e: FlowEvent) => void; state: () => string } } }

for (const [i, path] of paths.entries()) {
  test(`flow path ${i} renders every state it reaches`, async ({ page }) => {
    await page.goto('/flow/?replay');
    for (const [j, step] of path.steps.entries()) {
      if (j > 0) await page.evaluate(e => window.kanithanjFlow.send(e), step.event as FlowEvent);
      const state = String(step.state.value) as FlowState;
      await expect(page.locator('main')).toHaveAttribute('data-state', state);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(STATE_VIEW[state]);
      await expect(page.getByText('Applied: no · Sent: no')).toBeVisible();
    }
    passed += 1;
  });
}

test('a person walks sources, find, match, tailor, apply pack and confirm', async ({ page }) => {
  const snap = async (name: string) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }); };
  const requests: string[] = [];
  page.on('request', r => requests.push(r.url()));
  await page.goto('/flow/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(STATE_VIEW.find);
  await snap('1-sources-find');
  await page.getByLabel('What you do').fill('Senior platform engineer, Go');
  await page.getByRole('button', { name: 'Find roles' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(STATE_VIEW.matched);
  await snap('2-match');
  await page.getByRole('button', { name: 'Tailor for pixel-labs' }).click();
  await expect(page.getByText('Lead with: platform, Go')).toBeVisible();
  await snap('3-tailor');
  await page.getByRole('button', { name: 'Show apply pack' }).click();
  await expect(page.getByText('This page does not apply or send for you.')).toBeVisible();
  await snap('4-apply-pack');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('dialog', { name: 'Person confirm' })).toBeVisible();
  await snap('5-person-confirm');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('status')).toHaveText('A person cancelled. Nothing was applied or sent.');
  await expect(page.getByRole('link', { name: 'Open the posting' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('button', { name: 'I confirm' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(STATE_VIEW.confirmed);
  await expect(page.getByText('Applied: no · Sent: no')).toBeVisible();
  await snap('6-confirmed');
  expect(requests.filter(u => !u.startsWith('http://127.0.0.1:4173/'))).toEqual([]);
});

test.afterAll(() => { if (report) writeFileSync(report, JSON.stringify({ generated: paths.length, passed }, null, 2)); });

const call = (page: import('@playwright/test').Page, name: string, input: Record<string, unknown>) =>
  page.evaluate(async ({ name, input }) => {
    const ctx = document.modelContext;
    if (!ctx) throw new Error('modelContext missing');
    const tool = (await ctx.getTools()).find(t => t.name === name);
    if (!tool) throw new Error(`missing ${name}`);
    return JSON.parse(await ctx.executeTool(tool, input)) as Record<string, unknown>;
  }, { name, input });

test('WebMCP tools drive the same machine; apply waits for a person and a cancel never reports confirmed', async ({ page }) => {
  await page.goto('/flow/');
  await expect.poll(async () => page.evaluate(async () => ((await document.modelContext?.getTools()) ?? []).map(t => t.name).sort())).toEqual(['find_roles', 'show_apply_pack', 'tailor_cv']);
  expect((await call(page, 'find_roles', {})).error).toBeTruthy();
  const found = await call(page, 'find_roles', { stateVersion: 0, description: 'Senior platform engineer, Go' });
  expect((found.roles as unknown[]).length).toBe(2);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(STATE_VIEW.matched);
  expect((await call(page, 'find_roles', { stateVersion: 0, description: 'again' })).error).toMatch(/StaleWrite/);
  expect((await call(page, 'tailor_cv', { id: 'nope' })).error).toBeTruthy();
  expect((await call(page, 'tailor_cv', { id: 'sample:1' })).emphasize).toEqual(['platform', 'Go']);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(STATE_VIEW.tailored);
  const pack = await call(page, 'show_apply_pack', { id: 'sample:1' });
  expect(pack).toMatchObject({ applied: false, sent: false, url: 'https://jobs.example.com/sample/1' });
  const cancelled = page.evaluate(async () => {
    const ctx = document.modelContext!;
    const tool = (await ctx.getTools()).find(t => t.name === 'show_apply_pack')!;
    return JSON.parse(await ctx.executeTool(tool, { id: 'sample:1', apply: true })) as Record<string, unknown>;
  });
  await page.getByRole('button', { name: 'Cancel' }).click();
  const c = await cancelled;
  expect(c.confirmed).toBeUndefined();
  expect(c).toMatchObject({ applied: false, sent: false });
  const confirmed = call(page, 'show_apply_pack', { id: 'sample:1', send: true });
  await page.getByRole('button', { name: 'I confirm' }).click();
  expect(await confirmed).toMatchObject({ confirmed: true, applied: false, sent: false });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(STATE_VIEW.confirmed);
  if (shots) await page.screenshot({ path: `${shots}/7-webmcp-confirmed.png`, fullPage: true });
});
