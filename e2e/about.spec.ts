import type { Page } from '@playwright/test';
import { test, expect, openHome } from './fixtures';

// Settings stays mounted under About in the web stack, so assertions are scoped.
const about = (page: Page) => page.getByTestId('about-screen');

async function openAbout(page: Page) {
  await openHome(page);
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: 'О Monorec', exact: true }).click();
  await expect(about(page).getByRole('heading', { name: 'О Monorec', exact: true })).toBeVisible();
}

test('Settings → About → Settings with the back button and browser history', async ({ page }) => {
  await openAbout(page);
  await expect(page).toHaveURL(/\/about$/);
  await about(page).getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(about(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'О Monorec', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'О Monorec', exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(about(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible();
});

test('About shows the real version, description, developer and feedback without invented links', async ({ page }) => {
  await openAbout(page);
  const screen = about(page);
  await expect(screen.getByText('Monorec', { exact: true })).toBeVisible();
  await expect(screen.getByText('Версия 1.0.0', { exact: true })).toBeVisible();
  await expect(screen.getByText('Ваши рецепты, любимые блюда и список покупок — в одном месте.', { exact: true })).toBeVisible();
  await expect(screen.getByLabel('Neyroshi, Разработчик приложения', { exact: true })).toBeVisible();
  await expect(screen.getByRole('link', { name: 'Обратная связь', exact: true })).toBeVisible();
  // Only the existing feedback channel is linked; no website, social or legal links.
  await expect(screen.getByRole('link')).toHaveCount(1);
  for (const missing of [/политик/i, /лиценз/i]) await expect(screen.getByText(missing)).toHaveCount(0);
  // Storage is described as it is: local only, and sync or automatic backups are ruled out, not promised.
  await expect(screen.getByText('Данные хранятся только на этом устройстве. Облачной синхронизации и автоматических копий нет.', { exact: true })).toBeVisible();
  await expect(screen.getByText(/синхронизац|облак/i)).toHaveCount(1);
});

test('About explains local storage and points to Settings for backups without a second entry', async ({ page }) => {
  await openAbout(page);
  const screen = about(page);
  await expect(screen.getByRole('button', { name: 'Резервные копии', exact: true })).toHaveCount(0);
  await expect(screen.getByRole('heading', { name: 'Данные', exact: true })).toBeVisible();
  await expect(screen.getByText('Чтобы перенести или сохранить данные, создайте резервную копию в разделе «Настройки → Резервные копии».', { exact: true })).toBeVisible();
});

test.describe('English, dark theme', () => {
  test.use({ seedSettings: { theme: 'dark', language: 'en', shoppingCompletedBehavior: 'moveDown' } });
  test('About is translated and uses the dark Monorec palette', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'About Monorec', exact: true }).click();
    const screen = about(page);
    await expect(screen.getByRole('heading', { name: 'About Monorec', exact: true })).toBeVisible();
    await expect(screen.getByText('Version 1.0.0', { exact: true })).toBeVisible();
    await expect(screen.getByText('Your recipes, favourite dishes and shopping list, all in one place.', { exact: true })).toBeVisible();
    const developer = screen.getByLabel('Neyroshi, App developer', { exact: true });
    await expect(developer).toBeVisible();
    await expect(screen.getByRole('link', { name: 'Feedback', exact: true })).toBeVisible();
    await expect.poll(() => developer.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(28, 28, 30)');
    await expect.poll(() => screen.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(11, 11, 12)');
    await screen.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  });
});

test('About follows the light Monorec palette', async ({ page }) => {
  await openAbout(page);
  await expect.poll(() => about(page).evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(245, 244, 240)');
});

test.describe('narrow screen with large text', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test('About fits 320 px with large text and scrolls to the storage note', async ({ page }) => {
    await openAbout(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
    const note = about(page).getByText(/Данные хранятся только на этом устройстве/);
    await note.scrollIntoViewIfNeeded();
    await expect(note).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const back = await about(page).getByRole('button', { name: 'Назад', exact: true }).boundingBox();
    expect(back!.width).toBeGreaterThanOrEqual(44);
  });
});
