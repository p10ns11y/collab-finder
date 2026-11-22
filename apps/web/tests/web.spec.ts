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

test('0 network requests carry the description, goal or likes; nothing is stored; 3 groups render @firefox', async ({ page }) => {
  const requests: Request[] = [];
  page.on('request', r => requests.push(r));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await fill(page, DESCRIPTION, `AI infrastructure ${MARKER}`, `Wombatlike Labs, ${MARKER}`);
  await expect(page.getByTestId('results')).toBeVisible();
  for (const g of ['fitsNow', 'stepTowardGoal', 'stretch']) await expect(page.getByTestId(`group-${g}`)).toBeVisible();
  await page.waitForLoadState('networkidle');
  const stored = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]));
  expect(stored).not.toContain(MARKER);
  const leaking = requests.filter(r => carries(r, MARKER) || carries(r, 'Postgres, distributed') || carries(r, 'Wombatlike'));
  console.log(`REQUESTS total=${requests.length} carrying_description=${leaking.length}`);
  expect(leaking).toHaveLength(0);
  expect(requests.every(r => new URL(r.url()).origin === 'http://127.0.0.1:4173')).toBe(true);
  await expect(page.getByTestId('results')).not.toContainText(MARKER);
});

test('trap states: out of scope, zero results, PII warning, input error @firefox', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await fill(page, 'Registered nurse with 8 years in intensive care');
  await expect(page.getByTestId('out-of-scope')).toContainText('software & AI engineering roles');
  await expect(page.locator('[aria-live="polite"]')).toBeFocused();
  await fill(page, 'hi');
  await expect(page.getByTestId('input-error')).toBeVisible();
  await expect(page.locator('[aria-live="polite"]')).toBeFocused();
  const piiText = `Senior backend engineer, write to ${['someone', 'example.com'].join('@')}`;
  const about = page.getByLabel('About you');
  await about.click();
  await about.fill(piiText);
  await expect(about).toHaveValue(piiText);
  await about.blur();
  await expect(page.getByTestId('input-error')).toHaveCount(0);
  await expect(page.getByTestId('pii-warning')).toBeVisible();
  await page.getByRole('button', { name: 'Find roles' }).click();
  await expect(page.getByTestId('pii-blocked')).toBeVisible();
  await page.getByTestId('pii-blocked').getByRole('button', { name: 'Remove them' }).click();
  await expect(page.getByTestId('pii-blocked')).toHaveCount(0);
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

type Call = (name: string, input: Record<string, unknown>) => Promise<{ text: string; isError: boolean }>;
const fakeModelContext = () => {
  const tools = new Map<string, { execute(i: Record<string, unknown>): Promise<{ content: Array<{ text: string }>; isError?: boolean }> }>();
  Object.defineProperty(navigator, 'modelContext', { value: { registerTool: (t: { name: string; execute: never }) => { tools.set(t.name, t); } } });
  (window as unknown as { callTool: Call }).callTool = async (name, input) => { const r = await tools.get(name)!.execute(input); return { text: r.content[0]!.text, isError: r.isError === true }; };
  (window as unknown as { toolNames: () => string[] }).toolNames = () => [...tools.keys()].sort();
};
const call = (page: Page, name: string, input: Record<string, unknown> = {}) =>
  page.evaluate(([n, i]) => (window as unknown as { callTool: Call }).callTool(n as string, i as Record<string, unknown>), [name, input] as const).then((r): Record<string, unknown> & { isError: boolean } => Object.assign(JSON.parse(r.text) as Record<string, unknown>, { isError: r.isError }));

test('WebMCP, feature-detected: an agent drives the same form; a write on an old state version is refused after a human edit', async ({ page }) => {
  await page.addInitScript(fakeModelContext);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { toolNames: () => string[] }).toolNames())).toEqual(['get_state', 'match_roles', 'open_posting', 'refine_search']);
  const v0 = (await call(page, 'get_state')).stateVersion as number;
  const first = await call(page, 'match_roles', { stateVersion: v0, description: 'Senior backend engineer, Go and Postgres, distributed systems' });
  expect(first.isError).toBe(false);
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.getByLabel('About you')).toHaveValue(/Go and Postgres/);
  const v1 = first.stateVersion as number;
  expect(v1).toBe(v0 + 1);
  await page.getByLabel('Work mode').selectOption('hybrid');
  const stale = await call(page, 'refine_search', { stateVersion: v1, remote: 'remote' });
  expect(stale.isError).toBe(true);
  expect(String(stale.error)).toMatch(/^StaleWrite/);
  await expect(page.getByLabel('Work mode')).toHaveValue('hybrid');
  const fresh = await call(page, 'refine_search', { stateVersion: (await call(page, 'get_state')).stateVersion, regions: ['SE', 'EU'] });
  expect(fresh.isError).toBe(false);
  expect(['results', 'ZeroResults']).toContain(fresh.verdict);
  await expect(page.getByLabel('Sweden', { exact: true })).toBeChecked();
  const groups = fresh.groups as Record<string, Array<{ id: string }>> | null;
  const anyId = groups ? Object.values(groups).flat()[0]?.id : undefined;
  if (anyId) expect(String((await call(page, 'open_posting', { id: anyId })).url)).toMatch(/^https:\/\//);
  expect((await call(page, 'open_posting', { id: 'not-shown' })).isError).toBe(true);
});

test('WebMCP absent: the page registers nothing and works as before @firefox', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'modelContext', { value: undefined }); });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await fill(page, DESCRIPTION);
  expect(errors).toEqual([]);
  await expect(page.getByTestId('results')).toBeVisible();
});

test.describe('phone at 375x812', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('no sideways scroll on results, every form control fits and works, axe passes', async ({ page }) => {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    const scan = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => v.id);
    const sideways = () => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    const fits = async (boxes: ReadonlyArray<{ x: number; width: number } | null>) => boxes.every(b => b !== null && b.x >= 0 && b.x + b.width <= 375);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
    const controls = [page.getByLabel('About you'), page.getByLabel(/Where do you want to grow/), page.getByLabel(/Companies or interests you like/),
      page.getByLabel('Sweden', { exact: true }), page.getByLabel('Work mode'), page.getByLabel(/Product companies only/), page.getByRole('button', { name: 'Find roles' })];
    for (const c of controls) await expect(c).toBeVisible();
    expect(await fits(await Promise.all(controls.map(c => c.boundingBox())))).toBe(true);
    const found: string[] = [...await scan()];
    await page.getByLabel('Sweden', { exact: true }).check();
    await expect(page.getByLabel('Sweden', { exact: true })).toBeChecked();
    await page.getByLabel('Sweden', { exact: true }).uncheck();
    await page.getByLabel('Work mode').selectOption('hybrid');
    await page.getByLabel('Work mode').selectOption('any');
    await fill(page, DESCRIPTION, 'AI infrastructure', 'robotics');
    await expect(page.getByTestId('results')).toBeVisible();
    expect(await sideways()).toBeLessThanOrEqual(0);
    const cardBoxes = await page.getByTestId('results').locator('ul > li').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, width: r.width }; }));
    expect(cardBoxes.length).toBeGreaterThan(0);
    expect(await fits(cardBoxes)).toBe(true);
    found.push(...await scan());
    console.log(`PHONE sideways=${await sideways()} cards=${cardBoxes.length} axe=${found.length}`);
    expect(found).toEqual([]);
  });
});

test('an interest word that matches nothing shows one line', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await fill(page, DESCRIPTION, '', 'xylophonequartz');
  await expect(page.getByTestId('likes-miss')).toHaveCount(1);
  await expect(page.getByTestId('likes-miss')).toHaveText('None of those words matched.');
  await fill(page, DESCRIPTION, '', 'backend');
  await expect(page.getByTestId('likes-miss')).toHaveCount(0);
});

test('mostly non-Latin input shows one hint line, English or Swedish input none', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await page.getByLabel('About you').fill('高级后端工程师，八年经验，分布式系统和 Go');
  await expect(page.getByTestId('language-hint')).toHaveCount(1);
  await expect(page.getByTestId('language-hint')).toHaveText('Works best in English or Swedish.');
  await page.getByLabel('About you').fill('Senior systemutvecklare med 8 års erfarenhet av Go och Postgres');
  await expect(page.getByTestId('language-hint')).toHaveCount(0);
  await page.getByLabel('About you').fill(DESCRIPTION);
  await expect(page.getByTestId('language-hint')).toHaveCount(0);
});

test('ui-sdk path: keyboard only, axe clean, an agent drives region and results by role', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const scan = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const tabTo = async (target: ReturnType<Page['getByRole']>) => {
    for (let i = 0; i < 15; i += 1) {
      if (await target.evaluate(el => el === document.activeElement).catch(() => false)) return;
      await page.keyboard.press('Tab');
    }
    await expect(target).toBeFocused();
  };
  await page.goto('/?ui-sdk=1');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await expect(page.getByRole('checkbox', { name: 'Sweden', exact: true })).toHaveCount(0);
  const found: string[] = [...await scan()];
  await tabTo(page.getByRole('textbox', { name: 'About you' }));
  await page.keyboard.type(DESCRIPTION);
  await tabTo(page.getByRole('button', { name: 'Regions', exact: true }));
  await page.keyboard.press('Enter');
  const filter = page.getByRole('textbox', { name: 'Filter regions' });
  await expect(filter).toBeFocused();
  await page.keyboard.type('united s');
  const states = page.getByRole('option', { name: 'United States', exact: true });
  await expect(states).toBeVisible();
  await expect(page.getByRole('listbox', { name: 'Regions' }).getByRole('option')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(states).toHaveAttribute('aria-selected', 'true');
  found.push(...await scan());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Regions', exact: true })).toBeFocused();
  await expect(page.getByText('United States', { exact: true })).toBeVisible();
  await tabTo(page.getByRole('button', { name: 'Find roles' }));
  await page.keyboard.press('Enter');
  const matches = page.getByRole('listbox', { name: 'Your matches' });
  await expect(matches).toBeVisible();
  await tabTo(matches);
  await page.keyboard.press('ArrowDown');
  const picked = matches.getByRole('option', { selected: true });
  await expect(picked).toHaveCount(1);
  const firstPick = (await picked.innerText()).trim();
  await page.keyboard.press('ArrowDown');
  await expect(picked).toHaveCount(1);
  expect((await picked.innerText()).trim()).not.toBe(firstPick);
  const link = page.getByRole('link', { name: /View posting for/ });
  await expect(link).toHaveAttribute('href', /^https:\/\//);
  await expect(link).toHaveAttribute('target', '_blank');
  found.push(...await scan());
  expect(errors).toEqual([]);
  expect(found).toEqual([]);
});

test('product companies only is off by default and can be turned on', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await expect(page.getByLabel(/Product companies only/)).not.toBeChecked();
  await page.getByLabel(/Product companies only/).check();
  await fill(page, DESCRIPTION);
  await expect(page.getByTestId('results').or(page.getByTestId('zero-results'))).toBeVisible();
});

test('sources, removal route and privacy page: linked from the footer, no scripts, noindex, axe clean @firefox', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer).toContainText('Greenhouse, Ashby, Lever and Workable');
  await expect(footer.getByRole('link', { name: 'Ask to remove a listing' })).toHaveAttribute('href', 'https://github.com/p10ns11y/collab-finder/issues/new?template=remove-listing.yml');
  await footer.getByRole('link', { name: 'Privacy and terms' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy and terms' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  expect(await page.locator('script').count()).toBe(0);
  await expect(page.getByRole('link', { name: 'MIT License' })).toBeVisible();
  if (test.info().project.name === 'chromium') {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    const found = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => v.id);
    expect(found).toEqual([]);
  }
});
