import { test, expect, recipes, shopping, visualReady } from './fixtures';

// The three approved Monorec 3.1 screens, ONB-01..03.
const book = 'Все рецепты в одном месте';
const choice = 'Что приготовить сегодня?';
const purchases = 'Покупки без лишнего';
const heading = (page: import('@playwright/test').Page, name: string) => page.getByRole('heading', { name, exact: true });
const button = (page: import('@playwright/test').Page, name: string) => page.getByRole('button', { name, exact: true });

test.describe('new installation', () => {
  test.use({ freshProfile: true });

  test('next, back, completion and empty book persist in a new tab', async ({ page, context }) => {
    await page.goto('/recipes');
    await expect(heading(page, book)).toBeVisible();
    await expect(page.getByText('1 / 3', { exact: true })).toBeVisible();
    // The first screen offers only Skip; Back appears from the second one.
    await expect(button(page, 'Назад')).toHaveCount(0);
    await button(page, 'Продолжить').click();
    await expect(heading(page, choice)).toBeVisible();
    await expect(page.getByLabel('Шаг 2 из 3', { exact: true })).toBeVisible();
    await button(page, 'Назад').click();
    await expect(heading(page, book)).toBeVisible();
    await button(page, 'Продолжить').click();
    await button(page, 'Продолжить').click();
    await expect(heading(page, purchases)).toBeVisible();
    await expect(page.getByText('Собирайте продукты и отмечайте купленное в одном списке.', { exact: true })).toBeVisible();
    await button(page, 'Начать').click();
    await expect(page.getByText(/Пока нет рецептов/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Открыть рецепт / })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('app-onboarding-v1'))).toBe('completed');
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto('/recipes');
    await expect(reopened.getByText(/Пока нет рецептов/)).toBeVisible();
    await expect(reopened.getByTestId('onboarding')).toHaveCount(0);
  });

  test('unfinished introduction remains available after reload despite saved empty data', async ({ page }) => {
    await page.goto('/recipes');
    await expect(heading(page, book)).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('recipes'))).toBe('[]');
    await button(page, 'Продолжить').click();
    await page.reload();
    await expect(heading(page, book)).toBeVisible();
    await button(page, 'Пропустить').click();
    await expect(page.getByText(/Пока нет рецептов/)).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
    await expect(page.getByText(/Пока нет рецептов/)).toBeVisible();
  });

  test('skipping preserves a shopping deep link', async ({ page }) => {
    await page.goto('/shopping');
    await expect(heading(page, book)).toBeVisible();
    await button(page, 'Пропустить').click();
    await expect(page.getByText('Список покупок пуст', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/shopping$/);
  });

  test('failed completion can be retried without losing the introduction', async ({ page }) => {
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      let reject = true;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'app-onboarding-v1' && value === 'completed' && reject) {
          reject = false;
          throw new Error('Test: storage unavailable');
        }
        return original.call(this, key, value);
      };
    });
    await page.goto('/recipes');
    await button(page, 'Пропустить').click();
    await expect(page.getByRole('alert')).toHaveText('Не удалось сохранить изменения');
    // The introduction remains mounted behind the storage error dialog.
    await expect(page.getByTestId('onboarding')).toHaveCount(1);
    expect(await page.evaluate(() => localStorage.getItem('app-onboarding-v1'))).toBe('pending');
    await button(page, 'Повторить сохранение').click();
    await expect(page.getByText(/Пока нет рецептов/)).toBeVisible();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`onboarding ${theme} @visual`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/recipes');
      for (const [index, title] of [book, choice, purchases].entries()) {
        await expect(heading(page, title)).toBeVisible();
        await visualReady(page);
        await expect(page).toHaveScreenshot(`onboarding-${index + 1}.png`);
        if (index < 2) await button(page, 'Продолжить').click();
      }
    });
  }
});

test.describe('existing installations', () => {
  test.use({ seedShopping: [shopping, { scope: 'test' }] });
  test('migration skips introduction; replaying it keeps recipes, groceries, history and settings', async ({ page }) => {
    await page.goto('/recipes');
    await expect(page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true })).toBeVisible();
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('app-onboarding-v1'))).toBe('completed');
    // A cooking in the history, so the replay has every kind of data to keep.
    await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('recipe-book-v1')!);
      stored.recipeMeta = { 'e2e-omelet': { favorite: true, cookings: [{ id: 'c1', cookedAt: '2026-10-10T09:00:00.000Z', note: 'Заметка' }] } };
      localStorage.setItem('recipe-book-v1', JSON.stringify(stored));
    });
    await page.reload();
    const keys = ['recipe-book-v1', 'recipes', 'recipe-meta-v1', 'shopping-list-v1', 'app-settings-v1'];
    const snapshot = () => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), keys);
    await expect(page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true })).toBeVisible();
    const before = await snapshot();
    await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
    await button(page, 'Знакомство').click();
    await expect(heading(page, book)).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('app-onboarding-v1'))).toBe('pending');
    await button(page, 'Пропустить').click();
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Рецепты', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true })).toBeVisible();
    // Only the introduction marker changed; every data key is byte-for-byte the same.
    expect(await snapshot()).toEqual(before);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recipes')!))).toEqual(recipes);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1')!))).toEqual(shopping);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('app-settings-v1')!))).toMatchObject({ language: 'ru', theme: 'light' });
  });

  test('an existing profile never sees the introduction on its own, also after reloads', async ({ page }) => {
    for (const path of ['/', '/recipes', '/shopping', '/settings']) {
      await page.goto(path);
      await expect(page.getByRole('tab', { name: 'Выбор', exact: true })).toBeVisible();
      await expect(page.getByTestId('onboarding')).toHaveCount(0);
    }
  });
});

test.describe('accessibility and translation', () => {
  test.use({ seedRecipes: [], seedSettings: { theme: 'dark', language: 'en', shoppingCompletedBehavior: 'moveDown' } });
  test('pending introduction supports English and large text on a narrow screen', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('app-onboarding-v1')) localStorage.setItem('app-onboarding-v1', 'pending');
    });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '20px'; }, { once: true }); });
    await page.goto('/recipes');
    for (const title of ['All your recipes in one place', 'What to cook today?', 'Groceries, nothing extra']) {
      const titleElement = heading(page, title);
      await expect(titleElement).toBeVisible();
      const box = await titleElement.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(320);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      // Large text never pushes the actions off screen: they stay below the scrolling page.
      await expect(button(page, 'Skip')).toBeInViewport();
      const next = button(page, title === 'Groceries, nothing extra' ? 'Get started' : 'Continue');
      await expect(next).toBeInViewport();
      await next.click();
    }
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
  });
});
