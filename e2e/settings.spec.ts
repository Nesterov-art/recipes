import type { Page } from '@playwright/test';
import { test, expect, openHome, settingRow, chooseSetting } from './fixtures';

async function openSettings(page: Page) {
  await openHome(page);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(settingRow(page, 'Оформление')).toBeVisible();
}

const savedSettings = (page: Page) => page.evaluate(() => localStorage.getItem('app-settings-v1'));

test('menu marks the current option and closes without changes on Escape or outside tap', async ({ page, hasTouch }) => {
  await openSettings(page);
  const before = await savedSettings(page);
  const row = settingRow(page, 'Оформление');
  await expect(row).toHaveAccessibleName('Оформление: Светлая');
  const press = () => hasTouch ? row.tap() : row.click();

  await press();
  await expect(page.getByRole('radio')).toHaveCount(3);
  await expect(page.getByRole('radio', { name: 'Светлая', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Как в системе', exact: true })).not.toBeChecked();
  // The menu opens just under its row, right-aligned with the value and chevron.
  const rowBox = (await row.boundingBox())!;
  const menuBox = (await page.getByRole('radiogroup').boundingBox())!;
  expect(Math.abs(menuBox.x + menuBox.width - (rowBox.x + rowBox.width - 8))).toBeLessThanOrEqual(1);
  expect(menuBox.y - (rowBox.y + rowBox.height)).toBeGreaterThanOrEqual(0);
  expect(menuBox.y - (rowBox.y + rowBox.height)).toBeLessThanOrEqual(8);
  expect(menuBox.width).toBeLessThan(rowBox.width);
  for (const option of await page.getByRole('radio').all()) {
    expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
  // A tap must not draw a focus ring on an option.
  await expect(page.getByRole('radio', { name: 'Светлая', exact: true })).not.toBeFocused();
  if (hasTouch) await page.touchscreen.tap(4, 4);
  else await page.mouse.click(4, 4);
  await expect(page.getByRole('radio')).toHaveCount(0);
  // The tap that closed the menu must not reopen it through the row underneath.
  await page.waitForTimeout(500);
  await expect(page.getByRole('radio')).toHaveCount(0);

  await press();
  await expect(page.getByRole('radio')).toHaveCount(3);
  await expect(page.getByRole('radio', { name: 'Светлая', exact: true })).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('radio')).toHaveCount(0);
  expect(await savedSettings(page)).toBe(before);
  await expect(row).toHaveAccessibleName('Оформление: Светлая');
});

test('keyboard opens the menu, focuses the current option and selects another one', async ({ page }) => {
  await openSettings(page);
  const row = settingRow(page, 'Оформление');
  await page.getByRole('button', { name: 'Назад', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(row).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('radio', { name: 'Светлая', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(row).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('radio', { name: 'Светлая', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('radio', { name: 'Тёмная', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(row).toHaveAccessibleName('Оформление: Тёмная');
  await expect(row).toBeFocused();
  await expect.poll(async () => JSON.parse((await savedSettings(page))!).theme).toBe('dark');
});

test('system theme is stored as system and follows the device appearance', async ({ page }) => {
  await openSettings(page);
  await chooseSetting(page, 'Оформление', 'Как в системе');
  await expect.poll(async () => JSON.parse((await savedSettings(page))!).theme).toBe('system');
  const card = settingRow(page, 'Оформление');
  const background = () => card.evaluate(element => getComputedStyle(element).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(background).toBe('rgb(28, 28, 30)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(background).toBe('rgb(255, 255, 255)');
  expect(JSON.parse((await savedSettings(page))!).theme).toBe('system');
});

test('language switches the whole screen and the shopping preference keeps its value', async ({ page }) => {
  await openSettings(page);
  await chooseSetting(page, 'Язык', 'English');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(settingRow(page, 'Checked items')).toHaveAccessibleName('Checked items: Move to bottom');
  await expect(page.getByText('Developer — Neyroshi', { exact: true })).toBeVisible();
  await chooseSetting(page, 'Language', 'Русский');
  await expect(settingRow(page, 'Купленные')).toHaveAccessibleName('Купленные: Переносить вниз');
});

test.describe('empty book', () => {
  test.use({ seedRecipes: [] });
  test('disabled recipe export explains that a recipe is needed first', async ({ page }) => {
    await openSettings(page);
    await expect(page.getByRole('button', { name: 'Выгрузить в файл', exact: true })).toBeDisabled();
    await expect(page.getByText('Выгрузка станет доступна после первого рецепта.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Загрузить из файла', exact: true })).toBeEnabled();
  });
});

test('recipe export explanation disappears once the book has recipes', async ({ page }) => {
  await openSettings(page);
  await expect(page.getByRole('button', { name: 'Выгрузить в файл', exact: true })).toBeEnabled();
  await expect(page.getByText('Выгрузка станет доступна после первого рецепта.', { exact: true })).toHaveCount(0);
});

test.describe('narrow screen with large text', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test('every group scrolls into view without horizontal overflow and menus stay on screen', async ({ page }) => {
    await openSettings(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
    const footer = page.getByText('Разработчик — Neyroshi', { exact: true });
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeInViewport();
    await expect(page.getByText('Monorec', { exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const row = settingRow(page, 'Купленные');
    await row.scrollIntoViewIfNeeded();
    await row.click();
    const menu = await page.getByRole('radiogroup').boundingBox();
    expect(menu).not.toBeNull();
    expect(menu!.x).toBeGreaterThanOrEqual(0);
    expect(menu!.y).toBeGreaterThanOrEqual(0);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(320);
    expect(menu!.y + menu!.height).toBeLessThanOrEqual(640);
    await expect(page.getByRole('radio', { name: 'Оставлять на месте', exact: true })).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('radio')).toHaveCount(0);
  });
});
