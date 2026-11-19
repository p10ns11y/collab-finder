import { expect, test, type Page, type Request } from '@playwright/test';
import { ABUSE_INPUTS } from '../../../packages/core/test/abuse.ts';

const MARKER = 'quokkazebra';
const DESCRIPTION = `Senior backend engineer, Go and Postgres, distributed systems ${MARKER}`;

const carries = (r: Request, needle: string) => {
  const enc = encodeURIComponent(needle);
  const body = r.postData() ?? '';
  const headers = Object.values(r.headers()).join('\n');
  return [r.url(), body, headers].some(s => s.includes(needle) || s.includes(enc));
};

const fill = async (page: Page, description: string, goal = '') => {
  await page.getByLabel('About you').fill(description);
  await page.getByLabel(/Where do you want to grow/).fill(goal);
  await page.getByRole('button', { name: 'Find roles' }).click();
};

test('0 network requests carry the description or goal; 3 groups render', async ({ page }) => {
  const requests: Request[] = [];
  page.on('request', r => requests.push(r));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await fill(page, DESCRIPTION, `AI infrastructure ${MARKER}`);
  await expect(page.getByTestId('results')).toBeVisible();
  for (const g of ['fitsNow', 'stepTowardGoal', 'stretch']) await expect(page.getByTestId(`group-${g}`)).toBeVisible();
  await page.waitForTimeout(500);
  const leaking = requests.filter(r => carries(r, MARKER) || carries(r, 'Postgres, distributed'));
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
  await page.getByLabel('Region').selectOption('US');
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
    await fill(page, input, input.slice(0, 200));
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
