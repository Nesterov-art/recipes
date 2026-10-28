/// <reference types="node" />
import type { Page } from '@playwright/test';
import { test, expect, openBackups, openHome, recipes, openNewRecipeForm } from './fixtures';

const [omelet, soup] = recipes;
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const book = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!) as {
  recipes: { id: string; title: string; ingredients: string[]; steps: string[] }[];
  recipeMeta: Record<string, { favorite: boolean; cookings: { id: string; cookedAt: string; rating?: string; note?: string }[] }>;
});

// Older and current entries side by side: a rated one, a noted one, and one left
// behind by a recipe that no longer exists.
const storedMeta = {
  [omelet.id]: { favorite: true, cookings: [
    { id: 'o2', cookedAt: '2026-10-12T09:00:00.000Z', note: 'Больше сыра' },
    { id: 'o1', cookedAt: '2026-09-20T09:00:00.000Z', rating: 'great' },
  ] },
  [soup.id]: { favorite: false, cookings: [{ id: 's1', cookedAt: '2026-10-05T12:00:00.000Z' }] },
  'gone-recipe': { favorite: false, cookings: [{ id: 'g1', cookedAt: '2026-08-01T12:00:00.000Z' }] },
};

async function seedHistory(page: Page) {
  await openHome(page);
  // Let the existing first-run migration of the seeded legacy keys finish first.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('recipe-book-v1'))).not.toBeNull();
  await page.evaluate(meta => {
    const stored = JSON.parse(localStorage.getItem('recipe-book-v1')!);
    stored.recipeMeta = meta;
    localStorage.setItem('recipe-book-v1', JSON.stringify(stored));
  }, storedMeta);
  await page.reload();
  await expect(button(page, 'Добавить рецепт')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T12:00:00+03:00'));
});

test('the recipe shows its details, ingredients, steps and actions; no "Another option"', async ({ page }) => {
  await page.goto(`/recipe/${omelet.id}`);
  await expect(page.getByRole('heading', { name: omelet.title, exact: true })).toBeVisible();
  await expect(page.getByText('Моя книга / Завтрак', { exact: true })).toBeVisible();
  await expect(page.getByText('Ещё не готовили', { exact: true })).toBeVisible();
  // Name and amount are shown apart; the row still reads as the stored line.
  await expect(page.getByLabel('Яйца — 2 шт', { exact: true })).toBeVisible();
  await expect(page.getByText('Яйца', { exact: true })).toBeVisible();
  await expect(page.getByText('2 шт', { exact: true })).toBeVisible();
  for (const step of omelet.steps) await expect(page.getByText(step, { exact: true })).toBeVisible();
  for (const name of ['Начать готовить', 'Добавить в покупки', 'Изменить', 'Удалить рецепт', 'Добавить в любимое']) {
    await expect(button(page, name)).toBeVisible();
  }
  // With steps, cookings are recorded at the end of step-by-step cooking only.
  await expect(button(page, 'Я приготовил')).toHaveCount(0);
  // Random picks live on the Choice tab now; the old link parameter is simply ignored.
  await page.goto(`/recipe/${omelet.id}?fromRandom=true`);
  await expect(page.getByRole('heading', { name: omelet.title, exact: true })).toBeVisible();
  await expect(button(page, 'Другой вариант')).toHaveCount(0);
});

test('ingredients go to the shopping list from the recipe', async ({ page }) => {
  await page.goto(`/recipe/${omelet.id}`);
  await button(page, 'Добавить в покупки').click();
  await expect(page).toHaveURL(/\/shopping-select\?id=e2e-omelet$/);
  await page.getByRole('button', { name: /^Добавить 2 / }).click();
  await expect(page).toHaveURL(new RegExp(`/recipe/${omelet.id}$`));
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('shopping-list-v1') ?? '[]') as { text: string }[]).map(item => item.text)))
    // The list's existing normalisation writes the unit as "шт.".
    .toEqual(['Яйца — 2 шт.', 'Сыр — 50 г']);
});

test('editing keeps the id, the untouched fields, the favourite and the history', async ({ page }) => {
  await seedHistory(page);
  await page.goto(`/recipe/${omelet.id}`);
  await button(page, 'Изменить').click();
  await expect(page).toHaveURL(/\/form\?id=e2e-omelet$/);
  await expect(page.getByRole('heading', { name: 'Редактирование', exact: true })).toBeVisible();
  const title = page.getByPlaceholder('Название рецепта', { exact: true });
  await expect(title).toHaveValue(omelet.title);
  await expect(page.getByPlaceholder('Ингредиент — количество', { exact: true })).toHaveValue(omelet.ingredients.join('\n'));
  await expect(page.getByPlaceholder('Шаги приготовления', { exact: true })).toHaveValue(omelet.steps.join('\n'));
  await expect(button(page, 'Завтрак')).toHaveAttribute('aria-selected', 'true');
  await title.fill('Омлет с сыром и зеленью, очень длинное название для проверки переноса строки');
  await button(page, 'Сохранить').click();
  await expect(page).toHaveURL(new RegExp(`/recipe/${omelet.id}$`));
  await expect(page.getByRole('heading', { name: /^Омлет с сыром и зеленью/ })).toBeVisible();
  const stored = await book(page);
  const saved = stored.recipes.find(recipe => recipe.id === omelet.id)!;
  expect(saved).toMatchObject({ ingredients: omelet.ingredients, steps: omelet.steps, category: 'Завтрак', time: omelet.time });
  expect(stored.recipes.map(recipe => recipe.id)).toEqual([omelet.id, soup.id]);
  expect(stored.recipeMeta).toEqual(storedMeta);
});

test('closing a changed form asks first; declining keeps the input, confirming saves nothing', async ({ page }) => {
  await openHome(page);
  await openNewRecipeForm(page);
  await page.getByPlaceholder('Название рецепта', { exact: true }).fill('Черновик');
  const dialogs: string[] = [];
  page.once('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  await button(page, 'Закрыть').click();
  await expect.poll(() => dialogs).toEqual(['Закрыть без сохранения?\n\nВведённые изменения не сохранятся.']);
  await expect(page).toHaveURL(/\/form$/);
  await expect(page.getByPlaceholder('Название рецепта', { exact: true })).toHaveValue('Черновик');
  page.once('dialog', dialog => void dialog.accept());
  await button(page, 'Закрыть').click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.getByRole('button', { name: /^Открыть рецепт / })).toHaveCount(2);
  expect((await book(page)).recipes.map(recipe => recipe.title)).not.toContain('Черновик');
});

test('an unchanged form closes without a question', async ({ page }) => {
  await page.goto(`/recipe/${omelet.id}`);
  await button(page, 'Изменить').click();
  page.on('dialog', dialog => { throw new Error(`Unexpected dialog: ${dialog.message()}`); });
  await button(page, 'Закрыть').click();
  await expect(page).toHaveURL(new RegExp(`/recipe/${omelet.id}$`));
});

test('validation keeps the form open with every field as typed', async ({ page }) => {
  await page.goto('/form');
  await page.getByPlaceholder('Например, 15', { exact: true }).fill('-5');
  await page.getByPlaceholder('Ингредиент — количество', { exact: true }).fill('Мука — 200 г');
  await button(page, 'Сохранить').click();
  await expect(page.getByText('Впиши, как называется блюдо', { exact: true })).toBeVisible();
  await expect(page.getByText('Укажи количество минут числом от нуля', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/form$/);
  await expect(page.getByPlaceholder('Ингредиент — количество', { exact: true })).toHaveValue('Мука — 200 г');
});

test('deleting asks first, then removes the recipe and its history only', async ({ page }) => {
  await seedHistory(page);
  await page.goto(`/recipe/${soup.id}`);
  page.once('dialog', dialog => void dialog.dismiss());
  await button(page, 'Удалить рецепт').click();
  await expect(page.getByRole('heading', { name: soup.title, exact: true })).toBeVisible();
  page.once('dialog', dialog => void dialog.accept());
  await button(page, 'Удалить рецепт').click();
  await expect(page).toHaveURL(/\/recipes$/);
  const stored = await book(page);
  expect(stored.recipes.map(recipe => recipe.id)).toEqual([omelet.id]);
  expect(stored.recipeMeta[omelet.id]).toEqual(storedMeta[omelet.id]);
  expect(stored.recipeMeta[soup.id]).toBeUndefined();
});

test('the shared history opens from Recipes, groups by month and leads to the recipe', async ({ page }) => {
  await seedHistory(page);
  await button(page, 'История приготовлений').click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole('tab', { name: 'Рецепты', exact: true })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'История', exact: true })).toBeVisible();
  await expect(page.getByTestId('history-total')).toHaveText('4 раза');
  const months = page.getByRole('heading').filter({ hasText: /\d{4}$/ });
  await expect(months).toHaveText(['Октябрь 2026', 'Сентябрь 2026', 'Август 2026']);
  await expect(page.getByTestId('history-entry')).toHaveCount(4);
  await expect(page.getByText('«Больше сыра»', { exact: true })).toBeVisible();
  // A cooking of a deleted recipe stays visible but is not a link.
  await expect(page.getByText('Удалённый рецепт', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Удалённый рецепт/ })).toHaveCount(0);
  // Ratings are kept in storage and never shown.
  await expect(page.getByText(/Отлично|Оценка/)).toHaveCount(0);
  await button(page, 'Томатный суп, 5 октября').click();
  await expect(page).toHaveURL(new RegExp(`/recipe/${soup.id}$`));
  await button(page, 'Назад').click();
  await expect(page).toHaveURL(/\/history$/);
  await button(page, 'Назад').click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.getByRole('tab', { name: 'Рецепты', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect((await book(page)).recipeMeta).toEqual(storedMeta);
});

test('one recipe\'s history lists its own cookings', async ({ page }) => {
  await seedHistory(page);
  await page.goto(`/recipe/${omelet.id}`);
  await expect(page.getByText('Готовили: 2 раза', { exact: true })).toBeVisible();
  await button(page, 'Открыть историю приготовлений').click();
  await expect(page).toHaveURL(/\/history\?id=e2e-omelet$/);
  await expect(page.getByRole('heading', { name: omelet.title, exact: true })).toBeVisible();
  await expect(page.getByTestId('history-entry')).toHaveCount(2);
});

test.describe('no cookings yet', () => {
  test('the shared history has an empty state', async ({ page }) => {
    await page.goto('/history');
    await expect(page.getByTestId('history-empty')).toBeVisible();
    await expect(page.getByText('Пока ничего не приготовлено', { exact: true })).toBeVisible();
  });
});

test('search, filter and list position survive a visit to a recipe and the history', async ({ page }) => {
  await openHome(page);
  const search = page.getByRole('textbox', { name: 'Поиск рецептов', exact: true });
  await search.fill('суп');
  await button(page, 'Обед').click();
  await button(page, 'Открыть рецепт Томатный суп').click();
  await button(page, 'Назад').click();
  await expect(search).toHaveValue('суп');
  await expect(button(page, 'Обед')).toHaveAttribute('aria-selected', 'true');
  await button(page, 'История приготовлений').click();
  await button(page, 'Назад').click();
  await expect(search).toHaveValue('суп');
  await expect(page.getByRole('button', { name: /^Открыть рецепт / })).toHaveCount(1);
});

test('a recipe backup with older history imports and shows in the shared history', async ({ page }) => {
  await openBackups(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('recipe-book-v1'))).not.toBeNull();
  const backup = {
    format: 'recipes-backup', version: 1, exportedAt: '2026-09-01T10:00:00Z',
    recipes: [{ id: 'imported-pie', title: 'Пирог', category: null, time: 60, ingredients: [], steps: ['Испечь.'] }],
    recipeMeta: { 'imported-pie': { favorite: false, cookings: [{ id: 'p1', cookedAt: '2026-07-14T10:00:00.000Z', rating: 'good', note: 'Старый формат' }] } },
  };
  await page.getByTestId('recipe-file-input').setInputFiles({ name: 'recipes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await button(page, 'Добавить в мою книгу').click();
  await expect(page.getByTestId('recipe-import-preview')).toHaveCount(0);
  await expect.poll(async () => (await book(page)).recipeMeta['imported-pie']?.cookings[0]).toMatchObject({ rating: 'good', note: 'Старый формат' });
  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'Июль 2026', exact: true })).toBeVisible();
  await expect(page.getByText('«Старый формат»', { exact: true })).toBeVisible();
  await button(page, 'Пирог, 14 июля').click();
  await expect(page).toHaveURL(/\/recipe\/imported-pie$/);
});
