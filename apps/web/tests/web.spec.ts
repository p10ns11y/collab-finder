import { expect, test, type Page, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ABUSE_INPUTS } from '../../../packages/core/test/abuse.ts';
import { GOLDEN_INPUTS } from '../../../packages/core/test/golden-inputs.ts';
import { companyCount, parsePool } from '../../../packages/core/src/index.ts';
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
  await page.goto('/?all');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await fill(page, DESCRIPTION, `AI infrastructure ${MARKER}`, `Wombatlike Labs, ${MARKER}`);
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.getByTestId('group-fitsNow')).toBeVisible();
  for (const g of await page.locator('[data-testid^="group-"]').all()) expect(await g.locator('[data-posting-id]').count()).toBeGreaterThan(0);
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
  await page.goto('/?all');
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
  await page.goto('/?all');
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
  await page.goto('/?all');
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
  await page.goto('/?all');
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
    await page.goto('/?all');
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
    await page.goto('/?all');
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

const toolNames = (page: Page) =>
  page.evaluate(async () => ((await document.modelContext?.getTools()) ?? []).map(t => t.name).sort());
const call = (page: Page, name: string, input: Record<string, unknown> = {}) =>
  page.evaluate(async ({ name, input }) => {
    const ctx = document.modelContext;
    if (!ctx) throw new Error('modelContext missing');
    const tool = (await ctx.getTools()).find(t => t.name === name);
    if (!tool) throw new Error(`missing ${name}`);
    const raw = await ctx.executeTool(tool, input);
    return JSON.parse(raw) as Record<string, unknown>;
  }, { name, input });

test('WebMCP polyfill: find_roles updates the form; a stale state version is refused after a human edit', async ({ page }) => {
  await page.goto('/?all');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await expect.poll(async () => toolNames(page)).toEqual(['find_roles', 'show_apply_pack', 'tailor_cv']);
  const first = await call(page, 'find_roles', { stateVersion: 0, description: 'Senior backend engineer, Go and Postgres, distributed systems' });
  expect(first.error ?? null).toBe(null);
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.getByLabel('About you')).toHaveValue(/Go and Postgres/);
  const v1 = first.stateVersion as number;
  expect(v1).toBe(1);
  await page.getByLabel('Work mode').selectOption('hybrid');
  const stale = await call(page, 'find_roles', { stateVersion: v1, remote: 'remote' });
  expect(String(stale.error)).toMatch(/^StaleWrite/);
  await expect(page.getByLabel('Work mode')).toHaveValue('hybrid');
  const fresh = await call(page, 'find_roles', { stateVersion: stale.stateVersion, regions: ['SE', 'EU'] });
  expect(fresh.error ?? null).toBe(null);
  expect(['results', 'ZeroResults']).toContain(fresh.verdict);
  await expect(page.getByLabel('Sweden', { exact: true })).toBeChecked();
});

test('WebMCP polyfill: tailor_cv and show_apply_pack update the page; apply or send needs a person confirm and still does not send', async ({ page }) => {
  const requests: Request[] = [];
  page.on('request', r => requests.push(r));
  await page.goto('/?all');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await expect.poll(async () => toolNames(page)).toEqual(['find_roles', 'show_apply_pack', 'tailor_cv']);
  const first = await call(page, 'find_roles', { stateVersion: 0, description: `Senior backend engineer, Go and Postgres, distributed systems ${MARKER}` });
  expect(first.error ?? null).toBe(null);
  await expect(page.getByTestId('results')).toBeVisible();
  const groups = first.groups as Record<string, Array<{ id: string }>> | null;
  const anyId = groups ? Object.values(groups).flat()[0]?.id : undefined;
  expect(anyId).toBeTruthy();
  expect((await call(page, 'tailor_cv', { id: 'not-shown' })).error).toMatch(/not a role shown on the page/);
  const outline = await call(page, 'tailor_cv', { id: anyId });
  expect(outline.error ?? null).toBe(null);
  await expect(page.getByTestId('cv-outline')).toBeVisible();
  await expect(page.getByTestId('cv-outline')).toContainText('not a submitted CV');
  const pack = await call(page, 'show_apply_pack', { id: anyId });
  expect(pack.error ?? null).toBe(null);
  expect(String(pack.url)).toMatch(/^https:\/\//);
  await expect(page.getByTestId('apply-pack')).toBeVisible();
  await expect(page.getByTestId('apply-pack')).toContainText('does not apply or send');
  const pending = call(page, 'show_apply_pack', { id: anyId, apply: true });
  await expect(page.getByTestId('person-confirm')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  const cancelled = await pending;
  expect(cancelled.applied).toBe(false);
  expect(cancelled.sent).toBe(false);
  const pendingYes = call(page, 'show_apply_pack', { id: anyId, send: true });
  await expect(page.getByTestId('person-confirm')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm' }).click();
  const confirmed = await pendingYes;
  expect(confirmed.confirmed).toBe(true);
  expect(confirmed.applied).toBe(false);
  expect(confirmed.sent).toBe(false);
  expect(String(confirmed.url)).toMatch(/^https:\/\//);
  await expect(page.getByTestId('apply-pack')).toBeVisible();
  await page.waitForLoadState('networkidle');
  const leaking = requests.filter(r => carries(r, MARKER) || carries(r, 'Postgres, distributed'));
  expect(leaking).toHaveLength(0);
});

test('WebMCP confirm: Escape cancels and a second request reopens the dialog', async ({ page }) => {
  await page.goto('/?all');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await expect.poll(async () => toolNames(page)).toEqual(['find_roles', 'show_apply_pack', 'tailor_cv']);
  const first = await call(page, 'find_roles', { stateVersion: 0, description: 'Senior backend engineer, Go and Postgres, distributed systems' });
  expect(first.error ?? null).toBe(null);
  const groups = first.groups as Record<string, Array<{ id: string }>> | null;
  const anyId = groups ? Object.values(groups).flat()[0]?.id : undefined;
  expect(anyId).toBeTruthy();
  const pending = call(page, 'show_apply_pack', { id: anyId, apply: true });
  await expect(page.getByTestId('person-confirm')).toBeVisible();
  await page.keyboard.press('Escape');
  const cancelled = await pending;
  expect(cancelled.applied).toBe(false);
  expect(cancelled.sent).toBe(false);
  expect(String(cancelled.error)).toMatch(/cancelled/);
  expect(cancelled.confirmed).toBeUndefined();
  await expect(page.getByTestId('person-confirm')).toHaveCount(0);
  const pendingAgain = call(page, 'show_apply_pack', { id: anyId, apply: true });
  await expect(page.getByTestId('person-confirm')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  const cancelledAgain = await pendingAgain;
  expect(cancelledAgain.applied).toBe(false);
  expect(cancelledAgain.sent).toBe(false);
  expect(String(cancelledAgain.error)).toMatch(/cancelled/);
  expect(cancelledAgain.confirmed).toBeUndefined();
});


test('tailor_cv returns at once when the form is hidden after clearing the hash', async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => toolNames(page)).toEqual(['find_roles', 'show_apply_pack', 'tailor_cv']);
  const first = await call(page, 'find_roles', { stateVersion: 0, description: 'Senior backend engineer, Go and Postgres, distributed systems' });
  expect(first.error ?? null).toBe(null);
  const groups = first.groups as Record<string, Array<{ id: string }>> | null;
  const anyId = groups ? Object.values(groups).flat()[0]?.id : undefined;
  expect(anyId).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeVisible();
  await page.evaluate(() => { location.hash = ''; });
  await expect(page.getByRole('button', { name: 'Find roles' })).toHaveCount(0);
  const outline = await Promise.race([
    call(page, 'tailor_cv', { id: anyId }),
    new Promise<Record<string, unknown>>(resolve => setTimeout(() => resolve({ error: 'hung' }), 3000)),
  ]);
  expect(String(outline.error)).toMatch(/could not be shown/);
  expect(outline.confirmed).toBeUndefined();
  await expect(page.getByTestId('cv-outline')).toHaveCount(0);
});

test('WebMCP polyfill: find_roles on the home page reveals the form and results', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('reveal')).toBeVisible();
  await expect.poll(async () => toolNames(page)).toEqual(['find_roles', 'show_apply_pack', 'tailor_cv']);
  const first = await call(page, 'find_roles', { stateVersion: 0, description: 'Senior backend engineer, Go and Postgres, distributed systems' });
  expect(first.error ?? null).toBe(null);
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.getByLabel('About you')).toHaveValue(/Go and Postgres/);
});

test.describe(() => {
  test.use({ serviceWorkers: 'block' });
  test('WebMCP tools register after the polyfill chunk loads lazily', async ({ context, page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => { release = resolve; });
    const hits: string[] = [];
    await context.route(/webmcp-polyfill/, async route => {
      hits.push(route.request().url());
      await held;
      await route.continue();
    });
    await page.goto('/?all');
    await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
    expect(await toolNames(page)).toEqual([]);
    await expect.poll(async () => hits.length).toBeGreaterThan(0);
    expect(await toolNames(page)).toEqual([]);
    release();
    await expect.poll(async () => toolNames(page)).toEqual(['find_roles', 'show_apply_pack', 'tailor_cv']);
  });

  test('native navigator.modelContext registers tools without loading the polyfill', async ({ context, page }) => {
    const hits: string[] = [];
    await context.route(/webmcp-polyfill/, async route => {
      hits.push(route.request().url());
      await route.abort();
    });
    await page.addInitScript(() => {
      const tools = new Map<string, { name: string }>();
      const modelContext = {
        registerTool: async (tool: { name: string }, options?: { signal?: AbortSignal }) => {
          tools.set(tool.name, tool);
          options?.signal?.addEventListener('abort', () => { tools.delete(tool.name); }, { once: true });
        },
        getTools: async () => [...tools.values()],
      };
      Object.defineProperty(navigator, 'modelContext', { configurable: true, enumerable: true, value: modelContext });
    });
    await page.goto('/?all');
    await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
    await expect.poll(async () => page.evaluate(async () => {
      const nav = navigator as unknown as { modelContext?: { getTools: () => Promise<Array<{ name: string }>> } };
      return ((await nav.modelContext?.getTools()) ?? []).map(t => t.name).sort();
    })).toEqual(['find_roles', 'show_apply_pack', 'tailor_cv']);
    await page.waitForLoadState('networkidle');
    expect(hits).toEqual([]);
  });

  test('a failed person-confirm chunk cancels the request and leaves the form visible', async ({ context, page }) => {
    let block = true;
    await context.route(/person-confirm/, route => block ? route.abort() : route.continue());
    await page.goto('/?all');
    await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
    await expect.poll(async () => toolNames(page)).toEqual(['find_roles', 'show_apply_pack', 'tailor_cv']);
    const first = await call(page, 'find_roles', { stateVersion: 0, description: 'Senior backend engineer, Go and Postgres, distributed systems' });
    expect(first.error ?? null).toBe(null);
    const groups = first.groups as Record<string, Array<{ id: string }>> | null;
    const anyId = groups ? Object.values(groups).flat()[0]?.id : undefined;
    expect(anyId).toBeTruthy();
    const pending = call(page, 'show_apply_pack', { id: anyId, apply: true });
    const cancelled = await pending;
    expect(cancelled.applied).toBe(false);
    expect(cancelled.sent).toBe(false);
    expect(String(cancelled.error)).toMatch(/could not be shown/);
    expect(cancelled.confirmed).toBeUndefined();
    await expect(page.getByRole('button', { name: 'Find roles' })).toBeVisible();
    await expect(page.getByLabel('About you')).toBeVisible();
    await expect(page.getByTestId('person-confirm')).toHaveCount(0);
    const outline = await call(page, 'tailor_cv', { id: anyId });
    expect(String(outline.error)).toMatch(/could not be shown/);
    await expect(page.getByTestId('cv-outline')).toHaveCount(0);
    const pack = await call(page, 'show_apply_pack', { id: anyId });
    expect(String(pack.error)).toMatch(/could not be shown/);
    await expect(page.getByTestId('apply-pack')).toHaveCount(0);
  });

  test('a failed person-confirm chunk is retried on the next request', async ({ context, page }) => {
    let block = true;
    await context.route(/person-confirm/, route => block ? route.abort() : route.continue());
    await page.goto('/?all');
    await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
    await expect.poll(async () => toolNames(page)).toEqual(['find_roles', 'show_apply_pack', 'tailor_cv']);
    const first = await call(page, 'find_roles', { stateVersion: 0, description: 'Senior backend engineer, Go and Postgres, distributed systems' });
    expect(first.error ?? null).toBe(null);
    const groups = first.groups as Record<string, Array<{ id: string }>> | null;
    const anyId = groups ? Object.values(groups).flat()[0]?.id : undefined;
    expect(anyId).toBeTruthy();
    const failed = await call(page, 'tailor_cv', { id: anyId });
    expect(String(failed.error)).toMatch(/could not be shown/);
    await expect(page.getByTestId('cv-outline')).toHaveCount(0);
    block = false;
    const recovered = await call(page, 'tailor_cv', { id: anyId });
    expect(recovered.error ?? null).toBe(null);
    await expect(page.getByTestId('cv-outline')).toBeVisible();
  });
});

test('WebMCP polyfill stays out of the way of the ordinary form @firefox', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?all');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await expect.poll(async () => (await toolNames(page)).length).toBeGreaterThan(0);
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
    await page.goto('/?all');
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
  await page.goto('/?all');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await fill(page, DESCRIPTION, '', 'xylophonequartz');
  await expect(page.getByTestId('likes-miss')).toHaveCount(1);
  await expect(page.getByTestId('likes-miss')).toHaveText('None of those words matched.');
  await fill(page, DESCRIPTION, '', 'backend');
  await expect(page.getByTestId('likes-miss')).toHaveCount(0);
});

test('mostly non-Latin input shows one hint line, English or Swedish input none', async ({ page }) => {
  await page.goto('/?all');
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
  await page.goto('/?ui-sdk=1&all');
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
  await page.goto('/?all');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await expect(page.getByLabel(/Product companies only/)).not.toBeChecked();
  await page.getByLabel(/Product companies only/).check();
  await fill(page, DESCRIPTION);
  await expect(page.getByTestId('results').or(page.getByTestId('zero-results'))).toBeVisible();
});

test('sources, removal route and privacy page: linked from the footer, no scripts, indexable, axe clean @firefox', async ({ page }) => {
  await page.goto('/?all');
  const footer = page.locator('footer');
  await expect(footer).toContainText('Greenhouse, Ashby, Lever and Workable');
  await expect(footer.getByRole('link', { name: 'Ask to remove a listing' })).toHaveAttribute('href', 'https://github.com/p10ns11y/collab-finder/issues/new?template=remove-listing.yml');
  await footer.getByRole('link', { name: 'Privacy and terms' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy and terms' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  expect(await page.locator('script').count()).toBe(0);
  await expect(page.getByRole('link', { name: 'MIT License' })).toBeVisible();
  if (test.info().project.name === 'chromium') {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    const found = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => v.id);
    expect(found).toEqual([]);
  }
});

test('scope banner counts unique companies in the loaded pool', async ({ page, request }) => {
  const head = await (await request.get('/pool.json')).json() as { version?: unknown; checkedRange?: unknown; rows?: unknown[]; shards?: string[] };
  const rows = head.shards ? (await Promise.all(head.shards.map(async f => ((await (await request.get(`/${f}`)).json()) as { rows: unknown[] }).rows))).flat() : head.rows;
  const n = companyCount(parsePool({ version: head.version, checkedRange: head.checkedRange, rows })._unsafeUnwrap());
  await page.goto('/?all');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await expect(page.getByText(`roles at ${n.toLocaleString('en')} tech companies`)).toBeVisible();
});

test.describe('roles load retry', () => {
  test.use({ serviceWorkers: 'block' });
  for (const [name, broken] of [['the first roles fetch fails', 'status'], ['the first roles response does not parse', 'schema']] as const) {
    test(`stale tab: when ${name}, one silent cache-busted retry loads the roles with no error @firefox`, async ({ page }) => {
      const seen: string[] = [];
      let first = true;
      await page.route(/\/pool(-\d+)?\.json(\?.*)?$/, async route => {
        seen.push(new URL(route.request().url()).search);
        if (!first) return route.continue();
        if (broken === 'status') { first = false; return route.fulfill({ status: 503, body: '' }); }
        const res = await route.fetch();
        const body = await res.json() as { rows?: Array<Record<string, unknown>> };
        if (!body.rows) return route.fulfill({ response: res });
        first = false;
        return route.fulfill({ response: res, json: { ...body, rows: body.rows.map(r => ({ ...r, status: 42 })) } });
      });
      await page.goto('/?all');
      await expect(page.getByTestId('freshness')).toContainText(/[\d,]+ engineering roles at [\d,]+ tech companies/);
      await expect(page.getByText('Could not load the roles')).toHaveCount(0);
      expect(seen[0]).toBe('');
      expect(seen.some(s => /^\?r=\d+$/.test(s))).toBe(true);
      await fill(page, DESCRIPTION, 'AI infrastructure');
      await expect(page.getByTestId('results')).toBeVisible();
    });
  }

  test('both attempts failing shows the error once with a working retry button', async ({ page }) => {
    let calls = 0;
    await page.route(/\/pool(-\d+)?\.json(\?.*)?$/, route => { calls += 1; return calls <= 2 ? route.fulfill({ status: 503, body: '' }) : route.continue(); });
    await page.goto('/?all');
    await expect(page.getByText('Could not load the roles')).toBeVisible();
    expect(calls).toBe(2);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('freshness')).toContainText(/[\d,]+ engineering roles at [\d,]+ tech companies/);
    await expect(page.getByText('Could not load the roles')).toHaveCount(0);
  });
});

test('second visit: /privacy and /privacy.html load through the installed worker, also offline @firefox', async ({ page, context }) => {
  await page.goto('/?all');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const heading = page.getByRole('heading', { level: 1, name: 'Privacy and terms' });
  await page.locator('footer').getByRole('link', { name: 'Privacy and terms' }).click();
  await expect(heading).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  for (const path of ['/privacy', '/privacy.html', '/privacy/']) {
    await page.goto(path);
    await expect(heading).toBeVisible();
  }
  await context.setOffline(true);
  await page.goto('/privacy');
  await expect(heading).toBeVisible();
  await page.goto('/?all');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await context.setOffline(false);
});

const chip = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test('reveal: one question first, then breadth, strengths, first 3 fits, growth, never an empty group @firefox', async ({ page }) => {
  const requests: Request[] = [];
  page.on('request', r => requests.push(r));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What have you been doing these last years?' })).toBeVisible();
  for (const id of ['live-count', 'read-back', 'first-fits', 'results', 'found-line']) await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Find roles' })).toHaveCount(0);
  await expect(page.getByTestId('progress')).toHaveAttribute('aria-label', '0 of 4 unlocked');

  await chip(page, 'Back-end systems').click();
  await expect(page.getByTestId('live-count')).toHaveText(/^[\d,]+ roles .*in \d+ countr/);
  await expect(page.getByRole('heading', { name: 'Where do you live now?' })).toBeVisible();
  await expect(page.getByTestId('read-back')).toHaveCount(0);

  await page.getByTestId('free-text').fill(`I use Go and Postgres every day ${MARKER}`);
  await chip(page, '10+ years').click();
  await chip(page, 'Sweden').click();
  await expect(page.getByTestId('read-back')).toContainText('Your strengths carry across fields: 10+ years of seeing work through');
  await expect(page.getByTestId('read-back')).toContainText('hands-on with Go');
  await expect(page.getByTestId('read-back')).not.toContainText(/You sound like an? /);
  const fits = page.getByTestId('first-fits').locator('[data-posting-id]');
  await expect(fits).toHaveCount(3);
  for (const why of await page.getByTestId('first-fits').getByTestId('why').allInnerTexts()) expect(why).toMatch(/^[A-Z].+\.$/);
  await expect(page.getByTestId('first-fits').getByTestId('pick-label')).toContainText(['Outside Sweden, worth a look']);
  await expect(page.getByTestId('first-fits')).not.toContainText(/Seniority not stated|Last checked/);
  await expect(page.getByRole('heading', { name: 'Where do you want to grow?' })).toBeVisible();
  await expect(page.locator('[data-testid^="group-"]')).toHaveCount(0);

  await chip(page, 'AI and machine learning').click();
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.getByTestId('progress')).toHaveAttribute('aria-label', '4 of 4 unlocked');
  const groups = page.locator('[data-testid^="group-"]');
  await expect(groups.first()).toBeVisible();
  for (const g of await groups.all()) expect(await g.locator('[data-posting-id]').count()).toBeGreaterThan(0);
  await page.getByTestId('first-fits').getByTestId('new-to-me').first().click();
  await expect(page.getByTestId('found-line')).toHaveText(/^You found 1 new option in \d+ seconds\.$/);
  const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('kanithanj.found') ?? 'null'))).toMatchObject({ found: 1, firstMs: expect.any(Number) });
  expect(stored).not.toContain(MARKER);
  expect(requests.filter(r => carries(r, MARKER) || carries(r, 'Postgres every'))).toHaveLength(0);
});

test('reveal: where the pool has fields, the count spans them and one fit is a gentle pivot', async ({ page }) => {
  const sample = JSON.parse(readFileSync(new URL('../public/pool.json', import.meta.url), 'utf8')) as { rows: Array<Record<string, unknown>> };
  const cycle = ['fintech', 'healthtech', 'climate', 'devtools', 'security', 'ecommerce'];
  const pool = { ...sample, rows: sample.rows.map((r, i) => ({ ...r, industries: [cycle[i % cycle.length]] })) };
  await page.route(/\/pool\.json(\?.*)?$/, route => route.fulfill({ json: pool }));
  await page.goto('/');
  await chip(page, 'Back-end systems').click();
  await expect(page.getByTestId('live-count')).toHaveText(/roles across \d+ fields in \d+ countr/);
  await chip(page, 'United States').click();
  await expect(page.getByTestId('first-fits').getByTestId('pick-label').first()).toHaveText(/^A pivot worth a look: /);
  await expect(page.getByTestId('read-back')).toContainText(/Here they are wanted in /);
});

test('after load, using the reveal and the proof taps makes no network requests', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('freshness')).toHaveText(/[\d,]+ engineering roles at [\d,]+ tech companies/);
  await page.waitForLoadState('networkidle');
  const after: string[] = [];
  page.on('request', r => { const u = new URL(r.url()); if (!(u.origin === 'http://127.0.0.1:4173' && /^\/assets\//.test(u.pathname))) after.push(r.url()); });
  await chip(page, 'Data and reporting').click();
  await chip(page, 'Back-end systems').click();
  await chip(page, '15+ years').click();
  await chip(page, 'United Kingdom').click();
  await page.getByTestId('first-fits').getByTestId('new-to-me').first().click();
  await chip(page, 'Not sure yet').click();
  await expect(page.getByTestId('found-line')).toBeVisible();
  await page.waitForTimeout(500);
  expect(after).toEqual([]);
});

test('reveal respects reduced motion: no animation on revealed parts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await chip(page, 'Back-end systems').click();
  await expect(page.getByTestId('live-count')).toBeVisible();
  expect(await page.getByTestId('live-count').evaluate(e => getComputedStyle(e).animationName)).toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await page.getByTestId('live-count').evaluate(e => getComputedStyle(e).animationName)).toBe('rise');
});

test.describe('mobile reveal', () => {
  test.use({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
  test('one tap puts a live result above the fold and it stays in view', async ({ page }) => {
    await page.goto('/');
    await chip(page, 'Whole products, end to end').tap();
    await expect(page.getByTestId('live-count')).toBeInViewport({ ratio: 1 });
    await page.mouse.wheel(0, 400);
    await expect(page.getByTestId('live-count')).toBeInViewport({ ratio: 1 });
  });
});

test('all options: empty groups never render and a goal nudge replaces the empty goal group', async ({ page }) => {
  await page.goto('/?all');
  await expect(page.getByRole('button', { name: 'Find roles' })).toBeEnabled();
  await fill(page, 'Senior backend engineer, Go and Postgres, distributed systems');
  await expect(page.getByTestId('results')).toBeVisible();
  for (const g of await page.locator('[data-testid^="group-"]').all()) expect(await g.locator('[data-posting-id]').count()).toBeGreaterThan(0);
  await expect(page.getByText(/\(0 of 0\)/)).toHaveCount(0);
  await expect(page.getByTestId('goal-nudge')).toBeVisible();
});
