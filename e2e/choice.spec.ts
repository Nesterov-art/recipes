import type { Page } from '@playwright/test';
import { test, expect, recipes } from './fixtures';

const pickButton = (page: Page) => page.getByRole('button', { name: 'Выбрать блюдо', exact: true });
const result = (page: Page) => page.getByTestId('choice-result');
const book = (page: Page) => page.evaluate(() => localStorage.getItem('recipe-book-v1'));
const titles = recipes.map(recipe => recipe.title);

async function openChoice(page: Page) {
  await page.goto('/');
  await expect(pickButton(page)).toBeVisible();
  // Let the existing first-run migration of the seeded legacy keys finish.
  await expect.poll(() => book(page)).not.toBeNull();
}

test('the welcome comes first and nothing is picked until the button is pressed', async ({ page }) => {
  await openChoice(page);
  await expect(page.getByRole('heading', { name: 'Что приготовим?', exact: true })).toBeVisible();
  await expect(page.getByText('Давай найдём идею', { exact: true })).toBeVisible();
  await expect(result(page)).toHaveCount(0);
  for (const title of titles) await expect(page.getByText(title, { exact: true })).toHaveCount(0);
});

test('a pick shows a real recipe; another option and opening it keep the data', async ({ page }) => {
  await openChoice(page);
  const before = await book(page);
  await pickButton(page).click();
  await expect(page.getByRole('heading', { name: 'Вот что приготовим.', exact: true })).toBeVisible();
  const first = (await result(page).textContent()) ?? '';
  const firstTitle = titles.find(title => first.includes(title))!;
  expect(firstTitle).toBeTruthy();
  const firstRecipe = recipes.find(recipe => recipe.title === firstTitle)!;
  await expect(result(page)).toContainText(`${firstRecipe.time} мин`);
  // With two recipes the existing rule never repeats the previous pick.
  await page.getByRole('button', { name: 'Другой вариант', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Хорошая идея.', exact: true })).toBeVisible();
  const secondTitle = titles.find(title => title !== firstTitle)!;
  await expect(result(page)).toContainText(secondTitle);
  const second = recipes.find(recipe => recipe.title === secondTitle)!;

  await page.getByRole('button', { name: 'Открыть рецепт', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/recipe/${second.id}$`));
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  // Back from the recipe keeps the result.
  await expect(result(page)).toContainText(secondTitle);
  // Picking never writes to storage.
  expect(await book(page)).toBe(before);
});

test('a new visit to the tab returns to the welcome', async ({ page }) => {
  await openChoice(page);
  await pickButton(page).click();
  await expect(result(page)).toBeVisible();
  await page.getByRole('tab', { name: 'Рецепты', exact: true }).click();
  await page.getByRole('tab', { name: 'Выбор', exact: true }).click();
  await expect(result(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Что приготовим?', exact: true })).toBeVisible();
  // Tapping the selected Choice tab also starts over.
  await pickButton(page).click();
  await expect(result(page)).toBeVisible();
  await page.getByRole('tab', { name: 'Выбор', exact: true }).click();
  await expect(result(page)).toHaveCount(0);
});

test('search and filters of the Recipes tab do not narrow the pick', async ({ page }) => {
  await page.goto('/recipes');
  await page.getByRole('textbox', { name: 'Поиск рецептов', exact: true }).fill('нет такого');
  await page.getByRole('button', { name: 'Любимые', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Открыть рецепт / })).toHaveCount(0);
  const before = await book(page);
  await page.getByRole('tab', { name: 'Выбор', exact: true }).click();
  await pickButton(page).click();
  await expect(result(page)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await book(page)).toBe(before);
});

test.describe('a single recipe', () => {
  test.use({ seedRecipes: [[recipes[0]], { scope: 'test' }] });
  test('has no fake alternative', async ({ page }) => {
    await openChoice(page);
    await pickButton(page).click();
    await expect(result(page)).toContainText(recipes[0].title);
    await expect(page.getByRole('button', { name: 'Другой вариант', exact: true })).toHaveCount(0);
  });
});

test.describe('an empty book', () => {
  test.use({ seedRecipes: [] });
  test('keeps the same welcome, then offers to add the first recipe without creating one', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Что приготовим?', exact: true })).toBeVisible();
    await pickButton(page).click();
    await expect(page.getByRole('heading', { name: 'Начнём с первого.', exact: true })).toBeVisible();
    await expect(page.getByText('Твоя книга пока пуста', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Вернуться к выбору', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Что приготовим?', exact: true })).toBeVisible();
    await pickButton(page).click();
    await page.getByRole('button', { name: 'Добавить первый рецепт', exact: true }).click();
    await expect(page).toHaveURL(/\/form$/);
    await expect(page.getByPlaceholder('Название рецепта', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!).recipes)).toEqual([]);
  });
});

test.describe('English, dark theme', () => {
  test.use({ seedRecipes: [], seedSettings: { language: 'en', theme: 'dark', shoppingCompletedBehavior: 'keep' } });
  test('the Choice tab is translated', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'What shall we cook?', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pick a dish', exact: true }).click();
    await expect(page.getByText('Your book is empty for now', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add your first recipe', exact: true })).toBeVisible();
  });
});

test.describe('narrow screen with large text', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test('fits without horizontal scroll and keeps the title words whole', async ({ page }) => {
    await openChoice(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
    const title = page.getByRole('heading', { name: 'Что приготовим?', exact: true });
    // Two lines at most: "Что" and "приготовим?", never a word split across lines.
    await expect.poll(() => title.evaluate(element => {
      const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
      return lineHeight > 40 && element.getBoundingClientRect().height <= lineHeight * 2 + 1;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await pickButton(page).scrollIntoViewIfNeeded();
    await pickButton(page).click();
    await expect(result(page)).toBeVisible();
  });
});
