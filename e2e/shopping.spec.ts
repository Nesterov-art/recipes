import { test, expect, openHome, addItem, rows, expectOrder, shopping } from './fixtures';

test('manual add, compatible quantity merge, edit, check and clear persist', async ({ page, context }) => {
  await openHome(page);
  await page.getByRole('button', { name: 'Открыть список покупок' }).click();
  await expect(page.getByText('Список покупок пуст', { exact: true })).toBeVisible();
  await addItem(page, 'Молоко — 500 мл');
  await addItem(page, ' молоко — 1 л ');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).getByTestId('shopping-drag')).toHaveText('Молоко — 1500 мл');
  await addItem(page, 'Хлеб');
  const bread = rows(page).nth(1);
  await bread.getByRole('button', { name: 'Изменить' }).click();
  await bread.getByRole('textbox').fill('Хлеб — 2 шт');
  await bread.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expectOrder(page, ['Молоко — 1500 мл', 'Хлеб — 2 шт.']);
  await rows(page).first().getByRole('checkbox').click();
  await expectOrder(page, ['Хлеб — 2 шт.', 'Молоко — 1500 мл']);
  await expect(rows(page).last().getByRole('checkbox')).toBeChecked();
  await expect.poll(() => page.evaluate(() => {
    const items = JSON.parse(localStorage.getItem('shopping-list-v1') ?? '[]');
    return items.find((item: { name: string; checked: boolean }) => item.name === 'Молоко')?.checked;
  })).toBe(true);
  await page.reload();
  await expectOrder(page, ['Хлеб — 2 шт.', 'Молоко — 1500 мл']);
  await expect(rows(page).last().getByRole('checkbox')).toBeChecked();
  await page.getByRole('button', { name: 'Удалить отмеченные' }).click();
  await expectOrder(page, ['Хлеб — 2 шт.']);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1') ?? '[]').length)).toBe(1);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/shopping');
  await expectOrder(reopened, ['Хлеб — 2 шт.']);
});

test('selected recipe ingredients reach shopping list and recipe matching', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true }).click();
  await page.getByRole('button', { name: /Добавить в покупки$/ }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  await page.getByRole('checkbox').nth(1).click();
  await page.getByRole('button', { name: 'Добавить 1 позицию', exact: true }).click();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть список покупок', exact: true }).click();
  await expectOrder(page, ['Яйца — 2 шт.']);
  await page.getByRole('button', { name: 'Что можно приготовить?', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true })).toContainText('Совпало: 1 из 2');
});

test.describe('completed item preference', () => {
  test.use({ seedShopping: [shopping, { scope: 'test' }] });
  test('keep in place is saved and used after reopening shopping', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await page.getByRole('button', { name: 'Оставлять на месте', exact: true }).click();
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
    await page.getByRole('button', { name: 'Открыть список покупок', exact: true }).click();
    await rows(page).first().getByRole('checkbox').click();
    await expectOrder(page, shopping.map(item => item.text));
    await expect(rows(page).first().getByRole('checkbox')).toBeChecked();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('app-settings-v1') ?? '{}').shoppingCompletedBehavior)).toBe('keep');
    await page.reload();
    await expectOrder(page, shopping.map(item => item.text));
    await expect(rows(page).first().getByRole('checkbox')).toBeChecked();
  });
});
