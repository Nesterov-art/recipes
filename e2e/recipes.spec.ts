import { test, expect, openHome } from './fixtures';

test('search matches title, ingredients and all terms; clearing restores results', async ({ page }) => {
  await openHome(page);
  const search = page.getByRole('textbox', { name: 'Поиск рецептов' });
  const cards = page.getByRole('button', { name: /^Открыть рецепт / });
  await expect(cards).toHaveCount(2);
  for (const query of ['ОМЛЕТ', 'яйца', 'сыр, яйца']) {
    await search.fill(query);
    await expect(cards).toHaveCount(1);
    await expect(cards).toHaveAccessibleName('Открыть рецепт Омлет с сыром');
  }
  await search.fill('сыр томаты');
  await expect(cards).toHaveCount(0);
  await expect(page.getByText(/Ничего не нашлось/)).toBeVisible();
  await search.fill('');
  await expect(cards).toHaveCount(2);
  await page.getByRole('button', { name: 'Любимые', exact: true }).click();
  await expect(cards).toHaveCount(0);
  await page.getByRole('button', { name: 'Все', exact: true }).click();
  await expect(cards).toHaveCount(2);
});

test.describe('empty book', () => {
  test.use({ seedRecipes: [] });
  test('empty state persists and a recipe created through the UI survives reload', async ({ page, context }) => {
    await openHome(page);
    await expect(page.getByText(/Пока нет рецептов/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Пока нет рецептов/)).toBeVisible();
    await page.getByRole('button', { name: 'Добавить рецепт', exact: true }).click();
    await page.getByPlaceholder('Название рецепта', { exact: true }).fill('Тестовый салат');
    await page.getByPlaceholder('15', { exact: true }).fill('5');
    await page.getByPlaceholder('Ингредиент — количество', { exact: true }).fill('Огурец — 1 шт\nСыр — 50 г');
    await page.getByPlaceholder('Шаги приготовления', { exact: true }).fill('Нарезать.\nПеремешать.');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Открыть рецепт Тестовый салат', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('recipes') ?? '[]')[0]?.title)).toBe('Тестовый салат');
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto('/');
    await reopened.getByRole('button', { name: 'Открыть рецепт Тестовый салат', exact: true }).click();
    await expect(reopened.getByText('Огурец — 1 шт', { exact: true })).toBeVisible();
    await expect(reopened.getByText('Перемешать.', { exact: true })).toBeVisible();
  });
});

test('favorite and appearance settings survive reload', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить в любимое', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('recipe-meta-v1') ?? '{}')['e2e-omelet']?.favorite)).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Убрать из любимого', exact: true })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: 'Любимые', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Открыть рецепт / })).toHaveCount(1);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: /Тёмная$/ }).click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('app-settings-v1') ?? '{}'))).toMatchObject({ theme: 'dark', language: 'en' });
  await page.reload();
  for (const label of ['Dark', 'English']) {
    await expect(page.getByRole('button', { name: new RegExp(`${label}$`) })).toHaveAttribute('aria-selected', 'true');
  }
});

