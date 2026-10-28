import { test, expect, recipes } from './fixtures';

// Addresses of the published PWA before the redesign: an open tab, a bookmark or a shared
// address must still land on the matching screen.
test('the old cooking address opens step-by-step cooking of the same recipe', async ({ page }) => {
  await page.goto(`/cook?id=${recipes[0].id}`);
  await expect(page).toHaveURL(new RegExp(`/cooking\\?id=${recipes[0].id}$`));
  await expect(page.getByText(recipes[0].steps[0], { exact: true })).toBeVisible();
  await expect(page.getByText(/Unmatched|не найден/i)).toHaveCount(0);
});

test('the old cooking address with an unknown recipe behaves like the new one', async ({ page }) => {
  await page.goto('/cook?id=no-such-recipe');
  await expect(page).toHaveURL(/\/cooking\?id=no-such-recipe$/);
  await expect(page.getByTestId('cooking-unavailable')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).first().click();
  await expect(page).toHaveURL(/\/recipes$|\/$/);
});

test('the other public addresses still open their screens', async ({ page }) => {
  for (const [path, check] of [
    ['/', () => page.getByRole('tab', { name: 'Выбор', exact: true })],
    ['/recipes', () => page.getByRole('button', { name: 'Добавить рецепт', exact: true })],
    [`/recipe/${recipes[1].id}`, () => page.getByRole('heading', { name: recipes[1].title, exact: true })],
    ['/import-link', () => page.getByRole('textbox', { name: 'Ссылка на рецепт', exact: true })],
    ['/settings', () => page.getByRole('button', { name: 'Резервные копии', exact: true })],
    ['/backup', () => page.getByRole('heading', { name: 'Резервные копии', exact: true })],
    ['/shared-recipe', () => page.getByRole('alert')],
  ] as const) {
    await page.goto(path);
    await expect(check()).toBeVisible();
  }
});
