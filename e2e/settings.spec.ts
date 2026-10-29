import type { Page } from '@playwright/test';
import { test, expect, openBackups, openHome, settingRow, chooseSetting } from './fixtures';

async function openSettings(page: Page) {
  await openHome(page);
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
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
  // Settings is a tab without a Back button: reach the row with Tab alone.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let step = 0; step < 10 && !(await row.evaluate(element => element === document.activeElement)); step++) {
    await page.keyboard.press('Tab');
  }
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

// The tab bar takes the Settings surface on that tab only; other tabs keep theirs.
// The first painted ancestor of a tab button is the bar itself.
const barColor = (page: Page) => page.getByRole('tab', { name: /^(Настройки|Settings)$/ }).evaluate(element => {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color;
  }
  return null;
});
for (const [theme, settings, others] of [['light', 'rgb(242, 242, 242)', 'rgb(245, 244, 240)'], ['dark', 'rgb(25, 25, 25)', 'rgb(11, 11, 12)']] as const) {
  test.describe(`tab bar, ${theme}`, () => {
    test.use({ seedSettings: { theme, language: 'ru', shoppingCompletedBehavior: 'moveDown' } });
    test('matches the Settings screen only while Settings is open', async ({ page }) => {
      await openHome(page);
      await expect.poll(() => barColor(page)).toBe(others);
      await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
      await expect(settingRow(page, 'Оформление')).toBeVisible();
      await expect.poll(() => barColor(page)).toBe(settings);
      await expect(page.getByTestId('settings-screen')).toHaveCSS('background-color', settings);
      for (const tab of ['Покупки', 'Выбор', 'Рецепты']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true');
        await expect.poll(() => barColor(page)).toBe(others);
      }
    });
  });
}

test('system theme is stored as system and follows the device appearance', async ({ page }) => {
  await openSettings(page);
  await chooseSetting(page, 'Оформление', 'Как в системе');
  await expect.poll(async () => JSON.parse((await savedSettings(page))!).theme).toBe('system');
  const card = settingRow(page, 'Оформление');
  const background = () => card.evaluate(element => getComputedStyle(element).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  // Settings cards: #272727 dark, #FFFFFF light (SETTINGS_THEMES).
  await expect.poll(background).toBe('rgb(39, 39, 39)');
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
  test('a full backup can be made and restored even before the first recipe', async ({ page }) => {
    await openBackups(page);
    await expect(page.getByRole('button', { name: 'Создать резервную копию', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Восстановить из файла', exact: true })).toBeEnabled();
    await expect(page.getByText('Выгрузка станет доступна после первого рецепта.', { exact: true })).toHaveCount(0);
  });
});

test.describe('narrow screen with large text', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test('every group scrolls into view without horizontal overflow and menus stay on screen', async ({ page }) => {
    await openSettings(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
    const footer = page.getByText('Разработчик — Neyroshi', { exact: true });
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeInViewport();
    // The home heading "Monorec" stays mounted under Settings; check the footer name.
    await expect(page.getByText('Monorec', { exact: true }).and(page.locator(':not([role="heading"])'))).toBeInViewport();
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

test('sections follow the design and Backups opens one tap from Settings', async ({ page }) => {
  await openSettings(page);
  await expect(page.getByText('Monorec / Приложение', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading').filter({ hasText: /^(Предпочтения|Покупки|Данные|Приложение)$/ }))
    .toHaveText(['Предпочтения', 'Покупки', 'Данные', 'Приложение']);
  for (const name of ['Знакомство', 'О Monorec', 'Резервные копии']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Резервные копии', exact: true }).click();
  await expect(page).toHaveURL(/\/backup$/);
  await expect(page.getByRole('tab', { name: 'Настройки', exact: true })).toBeHidden();
  for (const name of ['Создать резервную копию', 'Восстановить из файла']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  // One action per section and only the short notes; the folder/share menu is gone.
  const screen = page.getByTestId('backup-screen');
  for (const text of ['Копии хранятся локально и не синхронизируются автоматически.', 'Последняя выгрузка: ещё не было',
    'Файл не зашифрован. Храни его в безопасном месте.', 'Полная резервная копия заменит текущие данные только после подтверждения.']) {
    await expect(screen.getByText(text, { exact: true })).toBeVisible();
  }
  for (const gone of ['Поделиться', 'Сохранить в папку']) await expect(screen.getByRole('button', { name: gone, exact: true })).toHaveCount(0);
  await expect(screen.locator('[aria-expanded]')).toHaveCount(0);
  for (const gone of ['Перед восстановлением', /для переноса на другое устройство/, /Большой файл/, /Подходит полная резервная копия/]) {
    await expect(screen.getByText(gone)).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('tab', { name: 'Настройки', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('theme and language changes touch only the settings, never the data', async ({ page }) => {
  await openSettings(page);
  const dataKeys = ['recipe-book-v1', 'recipes', 'recipe-meta-v1', 'shopping-list-v1', 'app-onboarding-v1'];
  const data = () => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), dataKeys);
  await expect.poll(async () => (await data())['recipe-book-v1']).not.toBeNull();
  const before = await data();
  for (const theme of ['Тёмная', 'Как в системе', 'Светлая']) await chooseSetting(page, 'Оформление', theme);
  await chooseSetting(page, 'Язык', 'English');
  await chooseSetting(page, 'Checked items', 'Keep in place');
  await chooseSetting(page, 'Language', 'Русский');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('app-settings-v1') ?? '{}')))
    .toMatchObject({ theme: 'light', language: 'ru', shoppingCompletedBehavior: 'keep' });
  expect(await data()).toEqual(before);
});