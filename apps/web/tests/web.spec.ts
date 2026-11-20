import { expect, test, type Page, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ABUSE_INPUTS } from '../../../packages/core/test/abuse.ts';
import { GOLDEN_INPUTS } from '../../../packages/core/test/golden-inputs.ts';
import { parsePool } from '../../../packages/core/src/index.ts';
import { runMatch } from '../../../packages/core/src/surface.ts';

const MARKER = 'quokkazebra';
const DESCRIPTION = `Senior backend engineer, Go and Postgres, distributed systems ${MARKER}`;

const carries = (r: Request, needle: string) => {
  const enc = encodeURIComponent(needle);
  const body = r.postData() ?? '';
  const headers = Object.values(r.headers()).join('\n');
  return [r.url(), body, headers].some(s => s.includes(needle) || s.includes(enc));
};

const fill = async (page: Page, description: string, goal = '', likes = '') => {
  await page.getByLabel('About you').fill(description);
  await page.getByLabel(/Where do you want to grow/).fill(goal);
  await page.getByLabel(/Companies or interests you like/).fill(likes);
  await page.getByRole('button', { name: 'Find roles' }).click();
};

test('0 network requests carry the description, goal or likes; nothing is stored; 3 groups render', async ({ page }) => {
  const requests: Request[] = [];
  page.on('request', r => requests.push(r));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await fill(page, DESCRIPTION, `AI infrastructure ${MARKER}`, `Wombatlike Labs, ${MARKER}`);
  await expect(page.getByTestId('results')).toBeVisible();
  for (const g of ['fitsNow', 'stepTowardGoal', 'stretch']) await expect(page.getByTestId(`group-${g}`)).toBeVisible();
  await page.waitForTimeout(500);
  const stored = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]));
  expect(stored).not.toContain(MARKER);
  const leaking = requests.filter(r => carries(r, MARKER) || carries(r, 'Postgres, distributed') || carries(r, 'Wombatlike'));
  console.log(`REQUESTS total=${requests.length} carrying_description=${leaking.length}`);
  expect(leaking).toHaveLength(0);
  expect(requests.every(r => new URL(r.url()).origin === 'http://127.0.0.1:4173')).toBe(true);
  await expect(page.getByTestId('results')).not.toContainText(MARKER);
});

test('trap states: out of scope, zero results, PII warning, input error', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await fill(page, 'Registered nurse with 8 years in intensive care');
  await expect(page.getByTestId('out-of-scope')).toContainText('software & AI engineering roles');
  await fill(page, 'hi');
  await expect(page.getByTestId('input-error')).toBeVisible();
  await page.getByLabel('About you').fill(`Senior backend engineer, write to ${['someone', 'example.com'].join('@')}`);
  await expect(page.getByTestId('pii-warning')).toBeVisible();
  await page.getByRole('button', { name: 'Find roles' }).click();
  await expect(page.getByTestId('pii-blocked')).toBeVisible();
  await page.getByTestId('pii-blocked').getByRole('button', { name: 'Remove them' }).click();
  await expect(page.getByTestId('pii-warning')).toHaveCount(0);
  await expect(page.getByLabel('About you')).toHaveValue(/\[email removed\]/);
  await page.getByLabel('United States', { exact: true }).check();
  await page.getByLabel('Work mode').selectOption('remote');
  await fill(page, 'Principal embedded firmware engineer for robotics hardware in Rust');
  const zero = page.getByTestId('zero-results');
  const results = page.getByTestId('results');
  await expect(zero.or(results)).toBeVisible();
});

test('works offline after the first load', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await fill(page, DESCRIPTION);
  await expect(page.getByTestId('results')).toBeVisible();
  await context.setOffline(false);
});

test('30 abuse inputs: no page errors, no console errors, page stays usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  expect(ABUSE_INPUTS).toHaveLength(30);
  for (const input of ABUSE_INPUTS) {
    await fill(page, input, input.slice(0, 200), input.slice(0, 300));
    await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  }
  const dialogs: string[] = [];
  page.on('dialog', d => { dialogs.push(d.message()); void d.dismiss(); });
  console.log(`ABUSE inputs=${ABUSE_INPUTS.length} errors=${errors.length}`);
  expect(errors).toEqual([]);
  expect(dialogs).toEqual([]);
});

test('axe: no WCAG A/AA violations on results and trap states', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const scan = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => v.id);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  const found: string[] = [...await scan()];
  await fill(page, DESCRIPTION, 'AI infrastructure');
  await expect(page.getByTestId('results')).toBeVisible();
  found.push(...await scan());
  await fill(page, 'Registered nurse with 8 years in intensive care');
  await expect(page.getByTestId('out-of-scope')).toBeVisible();
  found.push(...await scan());
  await page.getByLabel('About you').fill(`Senior backend engineer, write to ${['someone', 'example.com'].join('@')}`);
  await page.getByRole('button', { name: 'Find roles' }).click();
  await expect(page.getByTestId('pii-blocked')).toBeVisible();
  found.push(...await scan());
  console.log(`AXE violations=${found.length} ${[...new Set(found)].join(',')}`);
  expect(found).toEqual([]);
});

test('any form change clears shown results, as the spec Edit step does', async ({ page }) => {
  for (const change of [
    () => page.getByLabel('About you').fill(`${DESCRIPTION} and Rust`),
    () => page.getByLabel(/Where do you want to grow/).fill('developer tools'),
    () => page.getByLabel(/Companies or interests you like/).fill('robotics'),
    () => page.getByLabel('United Kingdom', { exact: true }).check(),
    () => page.getByLabel('EU (includes Sweden)', { exact: true }).check(),
    () => page.getByLabel('Work mode').selectOption('hybrid'),
    () => page.getByLabel(/Product companies only/).check(),
  ]) {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
    await fill(page, DESCRIPTION);
    await expect(page.getByTestId('results')).toBeVisible();
    await change();
    await expect(page.getByTestId('results')).toHaveCount(0);
  }
});

test('identical output: the page shows the same ids per group as core, CLI and MCP on the golden inputs', async ({ page }) => {
  const pool = parsePool(JSON.parse(readFileSync(new URL('../public/pool.json', import.meta.url), 'utf8')))._unsafeUnwrap();
  const formable = GOLDEN_INPUTS.filter((x): x is { description: string; goal?: string; likes?: string; region?: string | string[]; remote?: string; productOnly?: boolean } =>
    typeof x === 'object' && x !== null && !('limit' in x) && !('unknownKey' in x));
  let compared = 0;
  for (const input of formable) {
    const want = runMatch(input, pool);
    if (!want.ok) continue;
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
    const regions = input.region === undefined || input.region === 'any' ? [] : typeof input.region === 'string' ? [input.region] : input.region;
    for (const [v, l] of [['SE', 'Sweden'], ['EU', 'EU (includes Sweden)'], ['UK', 'United Kingdom'], ['US', 'United States']] as const) if (regions.includes(v)) await page.getByLabel(l, { exact: true }).check();
    if (input.remote) await page.getByLabel('Work mode').selectOption(input.remote);
    if (input.productOnly) await page.getByLabel(/Product companies only/).check();
    await fill(page, input.description, input.goal ?? '', input.likes ?? '');
    await expect(page.getByTestId('results')).toBeVisible();
    for (const g of ['fitsNow', 'stepTowardGoal', 'stretch'] as const) {
      const shown = await page.getByTestId(`group-${g}`).locator('[data-posting-id]').evaluateAll(els => els.map(e => e.getAttribute('data-posting-id')));
      expect(shown, `${input.description} ${g}`).toEqual(want.value.groups[g].map(r => r.id));
    }
    compared += 1;
  }
  console.log(`IDENTICAL web inputs=${compared}`);
  expect(compared).toBeGreaterThanOrEqual(5);
});

test('product companies only is off by default and can be turned on', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await expect(page.getByLabel(/Product companies only/)).not.toBeChecked();
  await page.getByLabel(/Product companies only/).check();
  await fill(page, DESCRIPTION);
  await expect(page.getByTestId('results').or(page.getByTestId('zero-results'))).toBeVisible();
});
