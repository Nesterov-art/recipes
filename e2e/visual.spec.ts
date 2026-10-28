import { test, expect, openHome, recipes, revealShoppingActions, rows, settingRow, shopping, visualReady } from './fixtures';

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
      await page.getByRole('tab', { name: 'Покупки', exact: true }).click();
      await expect(page.getByTestId('shopping-row')).toHaveCount(3);
      await visualReady(page);
      await expect(page).toHaveScreenshot('shopping.png');
      await page.getByRole('tab', { name: 'Рецепты', exact: true }).click();
      await page.getByRole('button', { name: 'Добавить рецепт', exact: true }).click();
      await expect(page.getByPlaceholder('Название рецепта')).toBeVisible();
      await visualReady(page);
      await expect(page).toHaveScreenshot('form.png');
      await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
      await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
      await expect(settingRow(page, 'Язык')).toBeVisible();
      await visualReady(page);
      await expect(page).toHaveScreenshot('settings.png');
      await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
      await expect(page.getByText('Оформление', { exact: true })).toBeVisible();
      await visualReady(page);
      await expect(page).toHaveScreenshot('settings-large-text.png');
    });
    test('shopping matches @visual', async ({ page }) => {
      await page.goto('/shopping-matches');
      await expect(page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true })).toBeVisible();
      await visualReady(page);
      await expect(page).toHaveScreenshot('shopping-matches.png');
    });
    test('shopping card actions @visual', async ({ page }) => {
      await page.goto('/shopping');
      await expect(rows(page)).toHaveCount(3);
      await revealShoppingActions(page, rows(page).first());
      await expect(page.getByRole('button', { name: 'Удалить', exact: true }).first()).toBeVisible();
      await page.waitForTimeout(400); // Let the open animation settle before the snapshot.
      await page.mouse.move(0, 0);
      await expect(page).toHaveScreenshot('shopping-actions.png');
    });
    test.describe('choice', () => {
      // One recipe keeps the random pick deterministic.
      test.use({ seedRecipes: [[recipes[0]], { scope: 'test' }] });
      test('choice welcome and result @visual', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('button', { name: 'Выбрать блюдо', exact: true })).toBeVisible();
        await visualReady(page);
        await expect(page).toHaveScreenshot('choice-welcome.png');
        await page.getByRole('button', { name: 'Выбрать блюдо', exact: true }).click();
        await expect(page.getByTestId('choice-result')).toContainText(recipes[0].title);
        await visualReady(page);
        await expect(page).toHaveScreenshot('choice-result.png');
      });
    });
    test.describe('choice, empty book', () => {
      test.use({ seedRecipes: [] });
      test('choice empty @visual', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('button', { name: 'Выбрать блюдо', exact: true }).click();
        await expect(page.getByText('Твоя книга пока пуста', { exact: true })).toBeVisible();
        await visualReady(page);
        await expect(page).toHaveScreenshot('choice-empty.png');
      });
    });
    test('cooking step and finish @visual', async ({ page }) => {
      await page.goto(`/cooking?id=${recipes[0].id}`);
      await expect(page.getByTestId('cooking-step')).toHaveText(recipes[0].steps[0]);
      await visualReady(page);
      await expect(page).toHaveScreenshot('cooking-step.png');
      await page.getByRole('button', { name: 'Следующий шаг', exact: true }).click();
      await page.getByRole('button', { name: 'Завершить', exact: true }).click();
      await expect(page.getByTestId('cooking-done')).toBeVisible();
      await visualReady(page);
      await expect(page).toHaveScreenshot('cooking-done.png');
    });
    test('recipe, history and edit form @visual', async ({ page }) => {
      await openHome(page);
      await expect.poll(() => page.evaluate(() => localStorage.getItem('recipe-book-v1'))).not.toBeNull();
      await page.evaluate(() => {
        const book = JSON.parse(localStorage.getItem('recipe-book-v1')!);
        book.recipeMeta = {
          'e2e-omelet': { favorite: true, cookings: [
            { id: 'o2', cookedAt: '2026-10-12T09:00:00.000Z', note: 'Больше сыра' },
            { id: 'o1', cookedAt: '2026-09-20T09:00:00.000Z', rating: 'great' },
          ] },
          'e2e-soup': { favorite: false, cookings: [{ id: 's1', cookedAt: '2026-10-05T12:00:00.000Z' }] },
        };
        localStorage.setItem('recipe-book-v1', JSON.stringify(book));
      });
      await page.goto('/recipe/e2e-omelet');
      await expect(page.getByText('«Больше сыра»', { exact: true })).toBeVisible();
      await visualReady(page);
      await expect(page).toHaveScreenshot('recipe.png');
      await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
      await visualReady(page);
      await expect(page).toHaveScreenshot('recipe-large-text.png');
      await page.goto('/history');
      await expect(page.getByTestId('history-entry')).toHaveCount(3);
      await visualReady(page);
      await expect(page).toHaveScreenshot('history.png');
      await page.goto('/form?id=e2e-omelet');
      await expect(page.getByPlaceholder('Название рецепта')).toHaveValue(recipes[0].title);
      await visualReady(page);
      await expect(page).toHaveScreenshot('form-edit.png');
      await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
      await visualReady(page);
      await expect(page).toHaveScreenshot('form-large-text.png');
    });
    test('backup screen @visual', async ({ page }) => {
      await page.goto('/backup');
      await expect(page.getByRole('button', { name: 'Восстановить из файла', exact: true })).toBeVisible();
      await visualReady(page);
      await expect(page).toHaveScreenshot('backup.png');
    });
    test('about screen @visual', async ({ page }) => {
      await page.goto('/about');
      await expect(page.getByTestId('about-screen').getByText('Monorec', { exact: true })).toBeVisible();
      await visualReady(page);
      await expect(page).toHaveScreenshot('about.png');
    });
    test.describe('empty', () => {
      test.use({ seedRecipes: [], seedShopping: [] });
      test('empty states @visual', async ({ page }) => {
        await openHome(page);
        await expect(page.getByText(/Пока нет рецептов/)).toBeVisible();
        await visualReady(page);
        await expect(page).toHaveScreenshot('empty-recipes.png');
        await page.getByRole('tab', { name: 'Покупки', exact: true }).click();
        await expect(page.getByText('Список покупок пуст', { exact: true })).toBeVisible();
        await visualReady(page);
        await expect(page).toHaveScreenshot('empty-shopping.png');
      });
    });
  });
}
