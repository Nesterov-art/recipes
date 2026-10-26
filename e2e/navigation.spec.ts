import type { Page } from '@playwright/test';
import { test, expect, shopping } from './fixtures';

const TABS = ['Выбор', 'Рецепты', 'Покупки', 'Настройки'];
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const storageSnapshot = (page: Page) => page.evaluate(() => Object.fromEntries(
  ['recipe-book-v1', 'recipes', 'recipe-meta-v1', 'shopping-list-v1', 'app-settings-v1', 'app-onboarding-v1']
    .map(key => [key, localStorage.getItem(key)]),
));

test.use({ seedShopping: [shopping, { scope: 'test' }] });

test('the app opens on Choice and every tab has its own address', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Что приготовим?', exact: true })).toBeVisible();
  for (const name of TABS) await expect(tab(page, name)).toBeVisible();
  await expect(tab(page, 'Выбор')).toHaveAttribute('aria-selected', 'true');
  for (const [name, path, heading] of [
    ['Рецепты', '/recipes', 'Monorec'],
    ['Покупки', '/shopping', 'Список покупок'],
    ['Настройки', '/settings', 'Настройки'],
    ['Выбор', '/', 'Что приготовим?'],
  ]) {
    await tab(page, name).click();
    await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/' : path}$`));
    await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
});

test('direct links and reloads restore the tab', async ({ page }) => {
  for (const [path, name] of [['/recipes', 'Рецепты'], ['/shopping', 'Покупки'], ['/settings', 'Настройки']]) {
    await page.goto(path);
    await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
    await page.reload();
    await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
});

test('browser Back walks through the visited tabs', async ({ page }) => {
  await page.goto('/recipes');
  await tab(page, 'Покупки').click();
  await expect(page).toHaveURL(/\/shopping$/);
  await tab(page, 'Настройки').click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/shopping$/);
  await expect(tab(page, 'Покупки')).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(tab(page, 'Рецепты')).toHaveAttribute('aria-selected', 'true');
});

test('nested screens hide the tab bar and return to the tab they came from', async ({ page }) => {
  await page.goto('/recipes');
  await page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true }).click();
  await expect(page).toHaveURL(/\/recipe\/e2e-omelet$/);
  await expect(tab(page, 'Рецепты')).toBeHidden();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(tab(page, 'Рецепты')).toHaveAttribute('aria-selected', 'true');

  await tab(page, 'Покупки').click();
  await page.getByRole('button', { name: 'Что можно приготовить?', exact: true }).click();
  await expect(page).toHaveURL(/\/shopping-matches$/);
  await expect(tab(page, 'Покупки')).toBeHidden();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(tab(page, 'Покупки')).toHaveAttribute('aria-selected', 'true');

  await tab(page, 'Настройки').click();
  await page.getByRole('button', { name: 'О Monorec', exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(tab(page, 'Настройки')).toBeHidden();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(tab(page, 'Настройки')).toHaveAttribute('aria-selected', 'true');

  for (const path of ['/recipe/e2e-omelet', '/form', '/history?id=e2e-omelet', '/about', '/shopping-matches']) {
    await page.goto(path);
    await expect(page.getByRole('button').first()).toBeVisible();
    await expect(tab(page, 'Выбор')).toBeHidden();
  }
});

test('switching tabs keeps the search, the draft and the stored data', async ({ page }) => {
  await page.goto('/recipes');
  // The seed uses the legacy keys; let the existing first-run migration finish.
  await expect.poll(async () => (await storageSnapshot(page))['app-onboarding-v1']).toBe('completed');
  await expect.poll(async () => (await storageSnapshot(page))['recipe-book-v1']).not.toBeNull();
  const before = await storageSnapshot(page);
  const search = page.getByRole('textbox', { name: 'Поиск рецептов', exact: true });
  await search.fill('сыр');
  await search.blur();
  await tab(page, 'Покупки').click();
  const draft = page.getByPlaceholder('Добавить продукт', { exact: true });
  await draft.fill('Кефир');
  await draft.blur();
  await tab(page, 'Настройки').click();
  await tab(page, 'Выбор').click();
  await tab(page, 'Рецепты').click();
  await expect(search).toHaveValue('сыр');
  await expect(page.getByRole('button', { name: /^Открыть рецепт / })).toHaveCount(1);
  await tab(page, 'Покупки').click();
  await expect(draft).toHaveValue('Кефир');
  // Navigation alone never writes to storage.
  expect(await storageSnapshot(page)).toEqual(before);
});

test('controls of hidden tabs cannot take keyboard focus', async ({ page }) => {
  await page.goto('/recipes');
  await tab(page, 'Настройки').click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /^Оформление: / })).toBeFocused();
});
