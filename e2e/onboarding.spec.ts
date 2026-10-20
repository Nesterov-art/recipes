import { test, expect, recipes, shopping, visualReady } from './fixtures';

const book = 'Своя книга рецептов';
const purchases = 'Покупки без лишних списков';
const storage = 'Твои рецепты — на устройстве';
const heading = (page: import('@playwright/test').Page, name: string) => page.getByRole('heading', { name, exact: true });

test.describe('new installation', () => {
  test.use({ freshProfile: true });

  test('next, back, completion and empty book persist in a new tab', async ({ page, context }) => {
    await page.goto('/');
    await expect(heading(page, book)).toBeVisible();
    await page.getByRole('button', { name: 'Дальше', exact: true }).click();
    await expect(heading(page, purchases)).toBeVisible();
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
    await expect(heading(page, book)).toBeVisible();
    await page.getByRole('button', { name: 'Дальше', exact: true }).click();
    await page.getByRole('button', { name: 'Дальше', exact: true }).click();
    await expect(heading(page, storage)).toBeVisible();
    await expect(page.getByText(/Сохраняй копию в настройках/)).toBeVisible();
    await page.getByRole('button', { name: 'Начать', exact: true }).click();
    await expect(page.getByText(/Пока нет рецептов/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Открыть рецепт / })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('app-onboarding-v1'))).toBe('completed');
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto('/');
    await expect(reopened.getByText(/Пока нет рецептов/)).toBeVisible();
    await expect(reopened.getByTestId('onboarding')).toHaveCount(0);
  });

  test('unfinished introduction remains available after reload despite saved empty data', async ({ page }) => {
    await page.goto('/');
    await expect(heading(page, book)).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('recipes'))).toBe('[]');
    await page.getByRole('button', { name: 'Дальше', exact: true }).click();
    await page.reload();
    await expect(heading(page, book)).toBeVisible();
    await page.getByRole('button', { name: 'Пропустить', exact: true }).click();
    await expect(page.getByText(/Пока нет рецептов/)).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
    await expect(page.getByText(/Пока нет рецептов/)).toBeVisible();
  });

  test('skipping preserves a shopping deep link', async ({ page }) => {
    await page.goto('/shopping');
    await expect(heading(page, book)).toBeVisible();
    await page.getByRole('button', { name: 'Пропустить', exact: true }).click();
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
    await page.goto('/');
    await page.getByRole('button', { name: 'Пропустить', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Не удалось сохранить. Попробуй ещё раз.');
    await expect(heading(page, book)).toBeVisible();
    await page.getByRole('button', { name: 'Пропустить', exact: true }).click();
    await expect(page.getByText(/Пока нет рецептов/)).toBeVisible();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`onboarding ${theme} @visual`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/');
      for (const [index, title] of [book, purchases, storage].entries()) {
        await expect(heading(page, title)).toBeVisible();
        await visualReady(page);
        await expect(page).toHaveScreenshot(`onboarding-${index + 1}.png`);
        if (index < 2) await page.getByRole('button', { name: 'Дальше', exact: true }).click();
      }
    });
  }
});

test.describe('existing installations', () => {
  test.use({ seedShopping: [shopping, { scope: 'test' }] });
  test('migration skips introduction and preserves recipes, groceries and settings', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true })).toBeVisible();
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('app-onboarding-v1'))).toBe('completed');
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await page.getByRole('button', { name: 'Знакомство с приложением', exact: true }).click();
    await expect(heading(page, book)).toBeVisible();
    await page.getByRole('button', { name: 'Пропустить', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recipes')!))).toEqual(recipes);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1')!))).toEqual(shopping);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('app-settings-v1')!))).toMatchObject({ language: 'ru', theme: 'light' });
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
    await page.goto('/');
    for (const title of ['Your own recipe book', 'Ingredients to groceries', 'Saved on this device']) {
      const titleElement = heading(page, title);
      await expect(titleElement).toBeVisible();
      const box = await titleElement.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(320);
      const next = page.getByRole('button', { name: title === 'Saved on this device' ? 'Get started' : 'Next', exact: true });
      await expect(next).toBeInViewport();
      await next.click();
    }
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
  });
});
