import type { Page } from '@playwright/test';
import { test, expect, openHome } from './fixtures';

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

// One "+" in the book's header opens a sheet with the ways to add a recipe.
test('one "+" opens the add menu; each choice opens its existing screen', async ({ page }) => {
  await openHome(page);
  await expect(button(page, 'Добавить по ссылке')).toHaveCount(0);
  await expect(button(page, 'Добавить рецепт')).toHaveCount(1);

  await button(page, 'Добавить рецепт').click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Добавить рецепт', exact: true })).toBeVisible();
  const manual = sheet.getByRole('button', { name: 'Создать вручную', exact: true });
  const byLink = sheet.getByRole('button', { name: 'Добавить по ссылке', exact: true });
  await expect(manual).toContainText('Новый рецепт с нуля');
  await expect(byLink).toContainText('Импорт рецепта из Monorec');
  // Comfortable targets: at least 48 px high.
  for (const item of [manual, byLink]) expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(48);

  await manual.click();
  await expect(page).toHaveURL(/\/form$/);
  await expect(page.getByPlaceholder('Название рецепта', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await openHome(page);
  await button(page, 'Добавить рецепт').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Добавить по ссылке', exact: true }).click();
  await expect(page).toHaveURL(/\/import-link$/);
  await expect(page.getByRole('textbox', { name: 'Ссылка на рецепт', exact: true })).toBeVisible();
});

test('the add menu closes with Escape and outside it, and opens again cleanly', async ({ page }) => {
  await openHome(page);
  for (let round = 0; round < 2; round++) {
    await button(page, 'Добавить рецепт').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // Escape stands in for Android Back here: both close the Modal through onRequestClose.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await button(page, 'Добавить рецепт').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.mouse.click(20, 20); // The dimmed area above the sheet.
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await expect(page).toHaveURL(/\/recipes$/);
  await button(page, 'Добавить рецепт').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Создать вручную', exact: true }).click();
  await expect(page).toHaveURL(/\/form$/);
});

for (const variant of [
  { name: 'Russian, light', settings: { theme: 'light', language: 'ru' }, add: 'Добавить рецепт', manual: 'Создать вручную', link: 'Добавить по ссылке', hint: 'Импорт рецепта из Monorec' },
  { name: 'English, dark', settings: { theme: 'dark', language: 'en' }, add: 'Add recipe', manual: 'Create manually', link: 'Add from link', hint: 'Import a recipe from Monorec' },
] as const) {
  test.describe(`add menu at 320 px with large text: ${variant.name}`, () => {
    test.use({ viewport: { width: 320, height: 568 }, seedSettings: { ...variant.settings, shoppingCompletedBehavior: 'moveDown' } });
    test('the sheet fits, nothing is cut or overlapped', async ({ page }) => {
      await page.goto('/recipes');
      await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
      await button(page, variant.add).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByRole('heading', { name: variant.add, exact: true })).toBeInViewport();
      const items = [sheet.getByRole('button', { name: variant.manual, exact: true }), sheet.getByRole('button', { name: variant.link, exact: true })];
      for (const item of items) await expect(item).toBeInViewport({ ratio: 1 });
      await expect(sheet.getByText(variant.hint, { exact: true })).toBeInViewport({ ratio: 1 });
      const [a, b] = await Promise.all(items.map(item => item.boundingBox()));
      expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y);
      // No label is clipped: every text fits its own box.
      const clipped = await sheet.evaluate(root => [...root.querySelectorAll('div[dir="auto"]')]
        .filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map(el => el.textContent));
      expect(clipped).toEqual([]);
    });
  });
}
