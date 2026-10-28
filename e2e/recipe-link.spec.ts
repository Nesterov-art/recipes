import type { Page } from '@playwright/test';
import { test, expect, openHome, recipes } from './fixtures';

const special = {
  id: 'e2e-special', title: 'Сырники «как у бабушки» & чай #1', category: 'Завтрак', time: 25,
  ingredients: ['Творог 5% — 400 г', 'Сахар — по вкусу 😊'], steps: ['Смешать творог и сахар.', 'Обжарить по 3 минуты — до золотистого цвета.'],
};
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const book = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!) as {
  recipes: { id: string; title: string; ingredients: string[]; steps: string[] }[]; recipeMeta: Record<string, unknown>;
});

// Opens the share screen of a recipe and returns the link it shows.
async function linkOf(page: Page, recipeId: string) {
  await page.goto(`/recipe/${recipeId}`);
  await button(page, 'Поделиться рецептом').click();
  await expect(page).toHaveURL(/\/share-recipe\?id=/);
  const link = await page.getByTestId('recipe-link').innerText();
  expect(link).toMatch(/\/shared-recipe#1\.[A-Za-z0-9_-]+$/);
  return link;
}
async function openImport(page: Page) {
  await openHome(page);
  await button(page, 'Добавить по ссылке').click();
  await expect(page).toHaveURL(/\/import-link$/);
}
async function show(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Ссылка на рецепт', exact: true }).fill(text);
  await button(page, 'Показать рецепт').click();
}

test.describe('sharing', () => {
  test.use({ seedRecipes: [[...recipes, special], { scope: 'test' }] });

  test('a recipe gives a link that says what is sent and can be copied', async ({ page, context, browserName }) => {
    const link = await linkOf(page, special.id);
    await expect(page.getByText('История приготовления, заметки и избранное не передаются.', { exact: false })).toBeVisible();
    // No two buttons do the same: the browser's share menu only where it exists, copying always.
    const canShare = await page.evaluate(() => typeof navigator.share === 'function');
    await expect(button(page, 'Поделиться ссылкой')).toHaveCount(canShare ? 1 : 0);
    await expect(button(page, 'Скопировать ссылку')).toBeVisible();
    test.skip(browserName !== 'chromium', 'Clipboard permissions are a Chromium feature in Playwright.');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await button(page, 'Скопировать ссылку').click();
    await expect(page.getByText('Ссылка скопирована', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  });

  test('the link opens directly in a browser that has no data and never saw the introduction', async ({ page, browser }) => {
    const link = await linkOf(page, special.id);
    // Nothing seeded: no recipes, and the introduction was never completed.
    const stranger = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const view = await stranger.newPage();
    await view.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await expect(view.getByRole('heading', { name: special.title, exact: true })).toBeVisible();
    for (const line of [...special.ingredients, ...special.steps]) await expect(view.getByText(line, { exact: true })).toBeVisible();
    await expect(view.getByText(/Знакомство|Пропустить/)).toHaveCount(0);
    await expect(view.getByRole('tab')).toHaveCount(0);
    // The data stays in the address after the page has loaded; the visitor's storage holds no recipe.
    expect(view.url()).toContain('#1.');
    expect(await view.evaluate(() => localStorage.getItem('recipe-book-v1') ?? '')).not.toContain('Сырники');
    await expect(view.getByText(/Добавить по ссылке/)).toBeVisible();
    await stranger.close();
  });
});

test.describe('text that looks like markup', () => {
  const markup = { id: 'e2e-markup', title: '<img src=x onerror="window.injected=1"> Суп', category: null, time: 5,
    ingredients: ['<b>Соль</b> — 1 г'], steps: ['<script>window.injected=2</script>Варить.'] };
  test.use({ seedRecipes: [[...recipes, markup], { scope: 'test' }] });
  test('is shown as text, runs nothing, and the page asks no other address', async ({ page, browser }) => {
    const link = await linkOf(page, markup.id);
    const stranger = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const view = await stranger.newPage();
    const hosts = new Set<string>();
    view.on('request', request => { hosts.add(new URL(request.url()).host); });
    await view.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await expect(view.getByRole('heading', { name: markup.title, exact: true })).toBeVisible();
    await expect(view.getByText(markup.ingredients[0], { exact: true })).toBeVisible();
    await expect(view.getByText(markup.steps[0], { exact: true })).toBeVisible();
    expect(await view.locator('#root img[src="x"], #root b, #root script').count()).toBe(0);
    expect(await view.evaluate(() => (window as unknown as { injected?: number }).injected)).toBeUndefined();
    // Only the app's own address is asked; the link data never goes anywhere.
    expect([...hosts]).toEqual([new URL(view.url()).host]);
    await stranger.close();
  });
});

test('a link is previewed, cancelling changes nothing, adding saves it once and it survives a restart', async ({ page }) => {
  await page.goto('/recipes');
  const link = await linkOf(page, recipes[0].id);
  // A second book receives the link: a fresh browser with only the soup.
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('recipe-book-v1')!);
    stored.recipes = stored.recipes.filter((recipe: { id: string }) => recipe.id !== 'e2e-omelet');
    localStorage.setItem('recipe-book-v1', JSON.stringify(stored));
    localStorage.setItem('recipes', JSON.stringify(stored.recipes));
  });
  await page.reload();
  const before = await book(page);
  expect(before.recipes.map(recipe => recipe.title)).toEqual(['Томатный суп']);
  await openImport(page);
  await show(page, `Смотри, что я нашёл:\n${link}`);
  const preview = page.getByTestId('recipe-link-preview');
  await expect(preview.getByRole('heading', { name: recipes[0].title, exact: true })).toBeVisible();
  for (const line of recipes[0].ingredients) await expect(preview.getByText(line, { exact: true })).toBeVisible();
  await button(page, 'Отмена').click();
  expect(await book(page)).toEqual(before);

  await openImport(page);
  await show(page, link);
  await button(page, 'Добавить в мою книгу').click();
  await expect(page.getByText('Рецепт добавлен в книгу', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: recipes[0].title, exact: true })).toBeVisible();
  const after = await book(page);
  const added = after.recipes.find(recipe => recipe.title === recipes[0].title)!;
  expect(added).toMatchObject({ ingredients: recipes[0].ingredients, steps: recipes[0].steps });
  expect(added.id).not.toBe(recipes[0].id);
  // The regular import gives every added recipe an empty history; nothing came from the sender.
  expect(after.recipeMeta[added.id]).toEqual({ favorite: false, cookings: [] });

  await page.reload();
  expect((await book(page)).recipes).toHaveLength(2);
  // The same link again: already in the book, nothing to add.
  await openImport(page);
  await show(page, link);
  await expect(page.getByTestId('recipe-link-preview')).toContainText('Такой рецепт уже есть в книге.');
  await expect(button(page, 'Добавить в мою книгу')).toHaveCount(0);
  expect((await book(page)).recipes).toHaveLength(2);
});

test('other text, damaged or cut links and a newer version are explained without any change', async ({ page }) => {
  await page.goto('/recipes');
  const link = await linkOf(page, recipes[1].id);
  await openImport(page);
  const before = await book(page);
  for (const [text, message] of [
    ['https://example.com/recipes/42', 'Это не ссылка на рецепт Monorec.'],
    [link.slice(0, -10), 'Ссылка повреждена или обрезана. Попроси отправить её ещё раз.'],
    [link.replace('#1.', '#7.'), 'Эта ссылка создана в более новой версии Monorec. Обнови приложение.'],
  ] as const) {
    await show(page, text);
    await expect(page.getByRole('alert')).toHaveText(message);
    await expect(page.getByTestId('recipe-link-preview')).toHaveCount(0);
  }
  expect(await book(page)).toEqual(before);
  await page.goto(link.replace(/^https?:\/\/[^/]+/, '').replace('#1.', '#7.'));
  await expect(page.getByRole('alert')).toHaveText('Эта ссылка создана в более новой версии Monorec. Обнови приложение.');
});

test.describe('English, dark theme', () => {
  test.use({ seedSettings: { theme: 'dark', language: 'en', shoppingCompletedBehavior: 'moveDown' } });
  test('sharing and adding by link are translated', async ({ page }) => {
    await page.goto(`/recipe/${recipes[0].id}`);
    await button(page, 'Share recipe').click();
    await expect(button(page, 'Copy link')).toBeVisible();
    await expect(page.getByText('Cooking history, notes and favourites are not sent.', { exact: false })).toBeVisible();
    await page.goto('/recipes');
    await button(page, 'Add from link').click();
    await expect(page.getByRole('textbox', { name: 'Recipe link', exact: true })).toBeVisible();
    await button(page, 'Show recipe').click();
    await expect(page.getByRole('alert')).toHaveText('This is not a Monorec recipe link.');
  });
});
