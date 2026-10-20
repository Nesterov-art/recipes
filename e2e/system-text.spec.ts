import { test, expect, openHome } from './fixtures';

test('browser font preference updates text automatically while old manual sizes are discarded', async ({ page }) => {
  await openHome(page);
  const search = page.getByRole('textbox', { name: 'Поиск рецептов', exact: true });
  const size = () => search.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  await expect.poll(size).toBe(17);
  await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
  await expect.poll(size).toBe(26);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByText('Размер текста', { exact: true })).toHaveCount(0);
  // The only remaining "System" label belongs to the theme selector.
  await expect(page.getByText('Как в системе', { exact: true })).toHaveCount(1);
  for (const name of ['Мелкий', 'Обычный', 'Крупный']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('app-settings-v1') ?? '{}').textSize)).toBeUndefined();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await page.evaluate(() => { document.documentElement.style.fontSize = '8px'; });
  await expect.poll(size).toBe(16);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await expect.poll(size).toBe(17);
});

test.describe('old manual preference', () => {
  test.use({ seedSettings: { theme: 'light', language: 'ru', textSize: 'large', shoppingCompletedBehavior: 'moveDown' } });
  test('stored large text switches to system without affecting other settings or recipes', async ({ page }) => {
    await openHome(page);
    await expect.poll(() => page.getByRole('textbox', { name: 'Поиск рецептов' }).evaluate(element => getComputedStyle(element).fontSize)).toBe('17px');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('app-settings-v1') ?? '{}'))).toEqual({ theme: 'light', language: 'ru', shoppingCompletedBehavior: 'moveDown' });
    await page.reload();
    await expect(page.getByRole('button', { name: /^Открыть рецепт / })).toHaveCount(2);
  });
});
