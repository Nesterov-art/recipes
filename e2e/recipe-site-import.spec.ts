import { Buffer } from 'node:buffer';
import type { Page, Route } from '@playwright/test';
import { test, expect, openHome } from './fixtures';

// Cooking sites are played by page.route: nothing in this file reaches a real site. Any
// request that leaves the test server and is not a stubbed site is refused and recorded.
const SITE = 'https://recipes.example';
type Reply = { status?: number; body?: string | Buffer; type?: string | null; headers?: Record<string, string>; delay?: number; abort?: boolean; hold?: Promise<void> };
async function sites(page: Page, reply: (url: string) => Reply) {
  const requests: string[] = [], strays: string[] = [];
  await page.route(url => url.hostname !== '127.0.0.1', route => { strays.push(route.request().url()); return route.abort('blockedbyclient'); });
  await page.route('https://*.example/**', async (route: Route) => {
    const url = route.request().url();
    requests.push(url);
    const r = reply(url);
    if (r.hold) await r.hold;
    if (r.delay) await new Promise(resolve => setTimeout(resolve, r.delay));
    try {
      if (r.abort) return await route.abort('failed');
      await route.fulfill({
        status: r.status ?? 200, body: r.body ?? '',
        headers: { ...(r.type === null ? {} : { 'content-type': r.type ?? 'text/html; charset=utf-8' }), 'access-control-allow-origin': '*', ...r.headers },
      });
    } catch { /* The page already gave up on this request (cancel, timeout, left the screen). */ }
  });
  return { requests, strays };
}
const page_ = (...ld: unknown[]) => `<!doctype html><html><head><title>Рецепт</title>${ld.map(x => `<script type="application/ld+json">${typeof x === 'string' ? x : JSON.stringify(x)}</script>`).join('')}</head><body><h1>Рецепт</h1></body></html>`;
const syrniki = (over: Record<string, unknown> = {}) => ({
  '@context': 'https://schema.org', '@type': 'Recipe', name: 'Сырники из творога 😊', recipeCategory: 'Завтрак', totalTime: 'PT30M',
  recipeIngredient: ['Творог 5% — 400 г', 'Яйцо — 1 шт.', 'Мука — 3 ст. л.'],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Смешать творог, яйцо и муку.' }, { '@type': 'HowToStep', text: 'Обжарить по 3 минуты.' }], ...over,
});
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const storage = (page: Page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
async function openImport(page: Page) {
  await openHome(page);
  await button(page, 'Добавить рецепт').click();
  await button(page, 'Добавить по ссылке').click();
  await expect(page).toHaveURL(/\/import-link$/);
}
async function find(page: Page, text: string, label = 'Ссылка на рецепт', action = 'Найти рецепт') {
  await page.getByRole('textbox', { name: label, exact: true }).fill(text);
  await button(page, action).click();
}
const preview = (page: Page) => page.getByTestId('recipe-site-preview');
const alert = (page: Page) => page.getByRole('alert');

test('a Monorec link still opens as before and asks no website', async ({ page }) => {
  const { requests, strays } = await sites(page, () => ({ body: page_(syrniki()) }));
  const payload = { t: 'Омлет по ссылке', c: 'b', m: 10, i: ['Яйца — 2 шт'], s: ['Взбить.'] };
  const link = `https://neyroshi-recipes.expo.app/shared-recipe#1.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  await openImport(page);
  await find(page, `Смотри: ${link}`);
  await expect(page.getByTestId('recipe-link-preview').getByRole('heading', { name: 'Омлет по ссылке', exact: true })).toBeVisible();
  await expect(button(page, 'Добавить в мою книгу')).toBeVisible();
  await expect(preview(page)).toHaveCount(0);
  expect([...requests, ...strays]).toEqual([]);
});

test('a recipe page is loaded, read and previewed in full; nothing is saved and no save button is offered', async ({ page }) => {
  const { requests, strays } = await sites(page, () => ({ body: page_({ '@type': 'Organization', name: 'Сайт' }, syrniki()) }));
  await openImport(page);
  const before = await storage(page);
  await find(page, `${SITE}/recepty/syrniki`);
  const view = preview(page);
  await expect(view.getByRole('heading', { name: 'Сырники из творога 😊', exact: true })).toBeVisible();
  await expect(view.getByText('Завтрак · 30 мин', { exact: true })).toBeVisible();
  await expect(view.getByText('3 ингредиента', { exact: true })).toBeVisible();
  for (const line of ['Творог 5% — 400 г', 'Яйцо — 1 шт.', 'Мука — 3 ст. л.', 'Смешать творог, яйцо и муку.', 'Обжарить по 3 минуты.']) await expect(view.getByText(line, { exact: true })).toBeVisible();
  await expect(view.getByText('Источник: recipes.example', { exact: true })).toBeVisible();
  await expect(view.getByText(/Это предпросмотр/)).toBeVisible();
  await expect(page.getByTestId('recipe-site-problems')).toHaveCount(0);
  for (const name of ['Добавить в мою книгу', 'Изменить', 'Сохранить']) await expect(button(page, name)).toHaveCount(0);
  expect(requests).toEqual([`${SITE}/recepty/syrniki`]);
  expect(strays).toEqual([]);
  expect(await storage(page)).toEqual(before);
  await page.reload();
  expect(await storage(page)).toEqual(before);
});

test('a partial recipe shows everything found and names what is missing; unknown time is never 0 minutes', async ({ page }) => {
  const recipe = syrniki({ recipeCategory: 'Выпечка', totalTime: undefined });
  await sites(page, () => ({ body: page_(recipe) }));
  await openImport(page);
  const before = await storage(page);
  await find(page, `${SITE}/partial`);
  const view = preview(page);
  await expect(view.getByRole('heading', { name: 'Сырники из творога 😊', exact: true })).toBeVisible();
  await expect(view.getByText('Время не указано', { exact: true })).toBeVisible();
  await expect(view.getByText(/(^|· )0 мин$/)).toHaveCount(0);
  const problems = page.getByTestId('recipe-site-problems');
  await expect(problems).toContainText('Рецепт найден не полностью');
  await expect(problems).toContainText('Время на странице не указано.');
  await expect(problems).toContainText('Категория не определена.');
  for (const line of ['Творог 5% — 400 г', 'Обжарить по 3 минуты.']) await expect(view.getByText(line, { exact: true })).toBeVisible();
  expect(await storage(page)).toEqual(before);
});

test('an explicit 0 minutes on the page is shown as unknown time, with its own warning', async ({ page }) => {
  await sites(page, () => ({ body: page_(syrniki({ totalTime: 'PT0M' })) }));
  await openImport(page);
  await find(page, `${SITE}/zero`);
  await expect(preview(page).getByText('Завтрак · Время не указано', { exact: true })).toBeVisible();
  await expect(page.getByTestId('recipe-site-problems')).toContainText('На странице указано 0 минут — это время не взято.');
  // The details line never reads "0 мин" (the warning above says "0 минут" on purpose).
  await expect(preview(page).getByText(/(^|· )0 мин$/)).toHaveCount(0);
});

test('no ingredients, no steps, no title: shown as missing, the rest of the recipe stays', async ({ page }) => {
  await sites(page, url => ({ body: page_(url.endsWith('/bare')
    ? syrniki({ recipeIngredient: [], recipeInstructions: [] })
    : syrniki({ name: '' })) }));
  await openImport(page);
  await find(page, `${SITE}/bare`);
  const problems = page.getByTestId('recipe-site-problems');
  await expect(problems).toContainText('Ингредиенты не найдены.');
  await expect(problems).toContainText('Шаги не найдены.');
  await expect(preview(page).getByRole('heading', { name: 'Сырники из творога 😊', exact: true })).toBeVisible();
  await find(page, `${SITE}/untitled`);
  await expect(preview(page).getByRole('heading', { name: 'Без названия', exact: true })).toBeVisible();
  await expect(problems).toContainText('Название не найдено.');
  await expect(preview(page).getByText('Творог 5% — 400 г', { exact: true })).toBeVisible();
});

test('pages without a usable recipe and HTTP errors are explained, with no preview', async ({ page }) => {
  const replies: Record<string, Reply> = {
    '/broken': { body: page_('{"@type": "Recipe", "name": "Сломано",}') },
    '/none': { body: page_({ '@type': 'Organization', name: 'Сайт' }) },
    '/forbidden': { status: 403, body: '<title>Just a moment...</title>' },
    '/missing': { status: 404 },
    '/busy': { status: 429, headers: { 'retry-after': '60' } },
    '/down': { status: 500 },
    '/pdf': { type: 'application/pdf', body: '%PDF' },
  };
  await sites(page, url => replies[new URL(url).pathname]);
  await openImport(page);
  const before = await storage(page);
  for (const [path, message] of [
    ['/broken', 'Данные рецепта на странице повреждены.'],
    ['/none', 'На странице не нашлось рецепта в формате, который понимает Monorec. Не все сайты его указывают — рецепт можно создать вручную.'],
    ['/forbidden', 'Сайт не разрешил загрузить страницу. Рецепт можно создать вручную.'],
    ['/missing', 'Страница не найдена. Проверь адрес.'],
    ['/busy', 'Сайт временно ограничил запросы. Попробуй позже.'],
    ['/down', 'Сайт ответил ошибкой (500). Попробуй позже.'],
    ['/pdf', 'По этому адресу не веб-страница, а файл другого типа.'],
  ]) {
    await find(page, `${SITE}${path}`);
    await expect(alert(page)).toHaveText(message);
    await expect(preview(page)).toHaveCount(0);
  }
  expect(await storage(page)).toEqual(before);
});

// A response fulfilled by page.route skips the browser's CORS check, so a CORS refusal cannot be
// staged here; to the page it is the same TypeError as a dropped connection, which is.
test('a network failure reads as "may limit browser access", without naming CORS', async ({ page }) => {
  await sites(page, () => ({ abort: true }));
  await openImport(page);
  await find(page, `${SITE}/offline`);
  await expect(alert(page)).toHaveText('Не удалось загрузить страницу. Возможно, сайт ограничивает доступ из браузера. Попробуй позже или создай рецепт вручную.');
  await expect(preview(page)).toHaveCount(0);
  await expect(button(page, 'Найти рецепт')).toBeVisible();
});

test('addresses that are not loaded: http, the Monorec site itself, text without an address', async ({ page }) => {
  const { requests, strays } = await sites(page, () => ({ body: page_(syrniki()) }));
  await openImport(page);
  for (const [text, message] of [
    ['http://recipes.example/x', 'Открываются только адреса, начинающиеся с https://.'],
    ['recipes.example/x', 'Не похоже на адрес страницы. Вставь ссылку целиком, начиная с https://.'],
    ['https://neyroshi-recipes.expo.app/recipes', 'Это ссылка на страницу Monorec, а не на рецепт. Попроси ссылку через «Поделиться рецептом».'],
    ['https://192.168.0.1/recipe', 'Этот адрес открыть нельзя: Monorec загружает только страницы общедоступных сайтов.'],
    ['Посмотри рецепт сырников', 'Это не ссылка на рецепт Monorec.'],
  ]) {
    await find(page, text);
    await expect(alert(page)).toHaveText(message);
  }
  expect([...requests, ...strays]).toEqual([]);
  // A name that only looks like Monorec's is another site and is loaded as one.
  await find(page, 'https://neyroshi-recipes.expo.app.example/r');
  await expect(preview(page).getByText('Источник: neyroshi-recipes.expo.app.example', { exact: true })).toBeVisible();
});

test('loading can be cancelled; then another link can be looked up', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const { requests } = await sites(page, url => (url.endsWith('/slow') ? { hold: held, body: page_(syrniki({ name: 'Старый' })) } : { body: page_(syrniki({ name: 'Новый' })) }));
  await openImport(page);
  await find(page, `${SITE}/slow`);
  await expect(page.getByTestId('recipe-site-loading')).toContainText('Ищем рецепт на странице…');
  // While loading there is no second "Find recipe" to press.
  await expect(button(page, 'Найти рецепт')).toHaveCount(0);
  await button(page, 'Отмена').click();
  await expect(page.getByText('Загрузка отменена. Можно вставить другую ссылку.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('recipe-site-loading')).toHaveCount(0);
  release();
  await find(page, `${SITE}/fast`);
  await expect(preview(page).getByRole('heading', { name: 'Новый', exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('heading', { name: 'Старый', exact: true })).toHaveCount(0);
  expect(requests).toEqual([`${SITE}/slow`, `${SITE}/fast`]);
});

test('a new address while loading replaces the old load; its late answer never shows', async ({ page }) => {
  await sites(page, url => (url.endsWith('/slow') ? { delay: 1500, body: page_(syrniki({ name: 'Медленный' })) } : { body: page_(syrniki({ name: 'Быстрый' })) }));
  await openImport(page);
  await find(page, `${SITE}/slow`);
  await expect(page.getByTestId('recipe-site-loading')).toBeVisible();
  // Typing a new address stops the running load, then it is looked up.
  await find(page, `${SITE}/fast`);
  await expect(preview(page).getByRole('heading', { name: 'Быстрый', exact: true })).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(page.getByRole('heading', { name: 'Медленный', exact: true })).toHaveCount(0);
  await expect(preview(page).getByRole('heading', { name: 'Быстрый', exact: true })).toBeVisible();
  // The replaced load ends without a word: no "cancelled" notice, no loading row left behind.
  await expect(page.getByText(/Загрузка отменена/)).toHaveCount(0);
  await expect(page.getByTestId('recipe-site-loading')).toHaveCount(0);
});

test('leaving the screen while loading stops it quietly', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await sites(page, () => ({ hold: held, body: page_(syrniki()) }));
  await openImport(page);
  const before = await storage(page);
  await find(page, `${SITE}/slow`);
  await expect(page.getByTestId('recipe-site-loading')).toBeVisible();
  await button(page, 'Закрыть').click();
  await expect(page).not.toHaveURL(/\/import-link$/);
  release();
  await page.waitForTimeout(800);
  await expect(page.getByRole('heading', { name: 'Сырники из творога 😊', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await storage(page)).toEqual(before);
});

test('a site that does not answer in 15 seconds is reported as such', async ({ page }) => {
  test.setTimeout(60_000);
  await sites(page, () => ({ hold: new Promise<void>(() => {}) }));
  await openImport(page);
  await find(page, `${SITE}/silent`);
  await expect(alert(page)).toHaveText('Сайт слишком долго не отвечает. Попробуй ещё раз позже.', { timeout: 25_000 });
  await expect(page.getByTestId('recipe-site-loading')).toHaveCount(0);
  await expect(button(page, 'Найти рецепт')).toBeVisible();
});

test('a very long address is kept whole and loaded', async ({ page }) => {
  const { requests } = await sites(page, () => ({ body: page_(syrniki()) }));
  await openImport(page);
  const address = `${SITE}/recipe?ref=${'a1b2c3'.repeat(500)}`;
  const field = page.getByRole('textbox', { name: 'Ссылка на рецепт', exact: true });
  await field.fill(address);
  await expect(field).toHaveValue(address);
  await expect(button(page, 'Найти рецепт')).toBeInViewport();
  await button(page, 'Найти рецепт').click();
  await expect(preview(page).getByRole('heading', { name: 'Сырники из творога 😊', exact: true })).toBeVisible();
  expect(requests).toEqual([address]);
});

test.describe('English, dark theme', () => {
  test.use({ seedSettings: { theme: 'dark', language: 'en', shoppingCompletedBehavior: 'moveDown' } });
  test('preview, partial details and errors are in English', async ({ page }) => {
    await sites(page, url => (url.endsWith('/missing') ? { status: 404 } : { body: page_(syrniki({ name: 'Pancakes', recipeCategory: undefined, totalTime: undefined, recipeIngredient: ['200 g flour'], recipeInstructions: 'Mix.\nFry.' })) }));
    await page.goto('/import-link');
    await find(page, `${SITE}/pancakes`, 'Recipe link', 'Find recipe');
    const view = preview(page);
    await expect(view.getByRole('heading', { name: 'Pancakes', exact: true })).toBeVisible();
    await expect(view.getByText('Time not given', { exact: true })).toBeVisible();
    await expect(view.getByText('Source: recipes.example', { exact: true })).toBeVisible();
    await expect(page.getByTestId('recipe-site-problems')).toContainText('The page gives no time.');
    await expect(page.getByTestId('recipe-site-problems')).toContainText('No category found.');
    await expect(view.getByText(/This is a preview/)).toBeVisible();
    await find(page, `${SITE}/missing`, 'Recipe link', 'Find recipe');
    await expect(alert(page)).toHaveText('Page not found. Check the address.');
  });
});
