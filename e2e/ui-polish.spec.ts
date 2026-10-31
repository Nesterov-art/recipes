import { test, expect, settingRow } from './fixtures';

for (const theme of ['light', 'dark'] as const) {
  test.describe(`approved UI, ${theme}`, () => {
    test.use({ seedSettings: { theme, language: 'ru', shoppingCompletedBehavior: 'moveDown' } });
    test('Choice B has one explanation and no service labels', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByText('Из твоей книги рецептов', { exact: true })).toBeVisible();
      for (const text of ['Monorec / каждый день', 'Вдохновение для кухни', 'Начни с выбора, даже если книга ещё пуста.']) {
        await expect(page.getByText(text, { exact: true })).toHaveCount(0);
      }
      const button = page.getByRole('button', { name: 'Выбрать блюдо', exact: true });
      await button.scrollIntoViewIfNeeded();
      const bar = page.getByTestId('monorec-tab-bar');
      expect((await button.boundingBox())!.y + (await button.boundingBox())!.height).toBeLessThanOrEqual((await bar.boundingBox())!.y);
      await expect(bar).toHaveCSS('height', '72px');
      await button.click();
      await expect(page.getByTestId('choice-result')).toBeVisible();
    });

    test('Settings groups have 28px gaps and no visible section titles', async ({ page }) => {
      await page.goto('/settings');
      await expect(settingRow(page, 'Оформление')).toBeVisible();
      for (const name of ['Предпочтения', 'Покупки', 'Данные', 'Приложение']) {
        const heading = page.getByRole('heading', { name, exact: true });
        await expect(heading).toHaveCount(1);
        expect((await heading.boundingBox())!.height).toBeLessThanOrEqual(1);
      }
      const groups = page.getByTestId('settings-groups');
      await expect(groups).toHaveCSS('gap', '28px');
      await expect(page.getByTestId('settings-screen')).toHaveCSS('background-color', theme === 'dark' ? 'rgb(11, 11, 12)' : 'rgb(242, 242, 242)');
      await expect(page.getByRole('tab', { name: 'Настройки', exact: true })).toHaveAttribute('aria-selected', 'true');
      await page.getByRole('tab', { name: 'Рецепты', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'monorec', exact: true })).toBeVisible();
    });
  });
}

test('rapid tab changes leave the capsule on the selected tab', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Настройки', 'Рецепты', 'Покупки', 'Выбор', 'Настройки']) {
    await page.getByRole('tab', { name, exact: true }).click();
  }
  const selected = page.getByRole('tab', { name: 'Настройки', exact: true });
  await expect(selected).toHaveAttribute('aria-selected', 'true');
  await expect.poll(async () => {
    const cap = await page.getByTestId('tab-active-capsule').boundingBox();
    const tab = await selected.boundingBox();
    return cap && tab ? Math.abs(cap.x - tab.x) : 999;
  }).toBeLessThan(1);
});
