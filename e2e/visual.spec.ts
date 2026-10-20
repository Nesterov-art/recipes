import { test, expect, openHome, shopping, visualReady } from './fixtures';

for (const theme of ['light', 'dark'] as const) {
  test.describe(theme, () => {
    test.use({ seedShopping: [shopping, { scope: 'test' }], seedSettings: {
      theme, language: 'ru', shoppingCompletedBehavior: 'moveDown',
    } });
    test.beforeEach(async ({ page }) => {
      // Freeze only wall-clock time. Animation/gesture timers continue normally.
      await page.clock.setFixedTime(new Date('2026-10-15T12:00:00+03:00'));
    });
    test('main screens @visual', async ({ page }) => {
      await openHome(page);
      await visualReady(page);
      await expect(page).toHaveScreenshot('home.png');
      await page.getByRole('button', { name: 'Открыть список покупок', exact: true }).click();
      await expect(page.getByTestId('shopping-row')).toHaveCount(3);
      await visualReady(page);
      await expect(page).toHaveScreenshot('shopping.png');
      await page.getByRole('button', { name: 'Назад', exact: true }).click();
      await page.getByRole('button', { name: 'Добавить рецепт', exact: true }).click();
      await expect(page.getByPlaceholder('Название рецепта')).toBeVisible();
      await visualReady(page);
      await expect(page).toHaveScreenshot('form.png');
      await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
      await page.getByRole('button', { name: 'Настройки', exact: true }).click();
      await expect(page.getByRole('button', { name: 'English', exact: true })).toBeVisible();
      await visualReady(page);
      await expect(page).toHaveScreenshot('settings.png');
      await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
      await expect(page.getByText('Как в системе', { exact: true }).last()).toBeVisible();
      await visualReady(page);
      await expect(page).toHaveScreenshot('settings-large-text.png');
    });
    test.describe('empty', () => {
      test.use({ seedRecipes: [], seedShopping: [] });
      test('empty states @visual', async ({ page }) => {
        await openHome(page);
        await expect(page.getByText(/Пока нет рецептов/)).toBeVisible();
        await visualReady(page);
        await expect(page).toHaveScreenshot('empty-recipes.png');
        await page.getByRole('button', { name: 'Открыть список покупок', exact: true }).click();
        await expect(page.getByText('Список покупок пуст', { exact: true })).toBeVisible();
        await visualReady(page);
        await expect(page).toHaveScreenshot('empty-shopping.png');
      });
    });
  });
}
