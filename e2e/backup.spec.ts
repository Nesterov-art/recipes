/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { test, expect, openBackups, openHome, recipes, shopping, visualReady } from './fixtures';

const incoming = { id: 'new-salad', title: 'Салат из файла', category: null, time: 5, ingredients: ['Огурец — 1 шт'], steps: ['Нарезать.'] };
const backup = (items = [incoming]) => ({ format: 'recipes-backup', version: 1, exportedAt: '2026-10-20T10:00:00Z', recipes: items, recipeMeta: {
  [items[0]?.id ?? 'unused']: { favorite: true, cookings: [{ id: 'cooked-1', cookedAt: '2026-10-20T09:00:00Z', rating: 'great', note: 'Получилось вкусно' }] },
} });
async function select(page: import('@playwright/test').Page, value: unknown, name = 'recipes.json') {
  await page.getByTestId('recipe-file-input').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });
}
async function settings(page: import('@playwright/test').Page) {
  await openBackups(page);
}

const button = (page: import('@playwright/test').Page, name: string) => page.getByRole('button', { name, exact: true });

test('the backup screen offers one full backup and one restore; the old recipe-only rows are gone', async ({ page }) => {
  await settings(page);
  await expect(button(page, 'Создать резервную копию')).toBeEnabled();
  await expect(button(page, 'Восстановить из файла')).toBeEnabled();
  for (const old of ['Выгрузить рецепты', 'Загрузить рецепты', 'Выгрузить весь профиль', 'Восстановить профиль']) await expect(button(page, old)).toHaveCount(0);
  await expect(page.getByText('Книга рецептов', { exact: true })).toHaveCount(0);
});

test('a created backup holds all app data; restoring it needs a confirmation and Cancel changes nothing', async ({ page }, testInfo) => {
  await settings(page);
  const downloadPromise = page.waitForEvent('download');
  await button(page, 'Создать резервную копию').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^recipes-profile-.*\.json$/);
  const file = testInfo.outputPath('backup.json');
  await download.saveAs(file);
  const exported = JSON.parse(await readFile(file, 'utf8'));
  expect(exported).toMatchObject({ format: 'recipes-profile-backup', version: 1, profile: { recipes, shoppingItems: [], settings: { theme: 'light', language: 'ru' } } });
  const stored = () => page.evaluate(() => [localStorage.getItem('recipe-book-v1'), localStorage.getItem('shopping-list-v1'), localStorage.getItem('app-settings-v1')]);
  const before = await stored();
  await page.getByTestId('recipe-file-input').setInputFiles(file);
  const preview = page.getByTestId('profile-import-preview');
  await expect(preview).toContainText('Восстановить данные из копии?');
  await expect(preview).toContainText('будут заменены');
  // A full backup offers only restoring everything or cancelling.
  await expect(preview.getByRole('button')).toHaveText(['Восстановить данные', 'Отмена']);
  await button(page, 'Отмена').click();
  await expect(preview).toHaveCount(0);
  expect(await stored()).toEqual(before);
  await page.getByTestId('recipe-file-input').setInputFiles(file);
  await button(page, 'Восстановить данные').click();
  await expect(preview).toHaveCount(0);
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!).recipes)).toEqual(recipes);
});

// No accounts or separate profiles in Monorec: the backup screen speaks of a backup and app data.
test('the backup screen never says "профиль" in its actions, previews or errors', async ({ page }) => {
  await settings(page);
  const screen = page.getByTestId('backup-screen');
  const noProfileWord = () => expect(screen.getByText(/профил/i)).toHaveCount(0);
  await noProfileWord();
  await select(page, { format: 'recipes-profile-backup', version: 1, exportedAt: '2026-10-21T09:00:00.000Z',
    profile: { recipes, recipeMeta: {}, shoppingItems: [], settings: { theme: 'dark', language: 'ru', shoppingCompletedBehavior: 'keep' } } }, 'copy.json');
  await expect(page.getByTestId('profile-import-preview')).toBeVisible();
  await noProfileWord();
  await select(page, backup(), 'old.json');
  await expect(page.getByTestId('recipe-import-preview')).toBeVisible();
  await noProfileWord();
  await select(page, 'bad json');
  await expect(page.getByTestId('backup-restore-section').getByRole('alert')).toBeVisible();
  await noProfileWord();
});

test.describe('merge and persistence', () => {
  test.use({ seedShopping: [shopping, { scope: 'test' }] });
  test('preview, cancellation, confirmed import and repeated import preserve user data', async ({ page, context }) => {
    await settings(page);
    await select(page, backup());
    await expect(page.getByTestId('recipe-import-preview')).toContainText('Новых: 1. Уже есть: 0.');
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recipes')!).length)).toBe(2);
    await select(page, backup());
    await page.getByRole('button', { name: 'Добавить в мою книгу', exact: true }).click();
    await expect(page.getByTestId('recipe-import-preview')).toHaveCount(0);
    await select(page, backup());
    await expect(page.getByTestId('recipe-import-preview')).toContainText('Новых: 0. Уже есть: 1.');
    await page.getByRole('button', { name: 'Добавить в мою книгу', exact: true }).click();
    await expect(page.getByTestId('recipe-import-preview')).toHaveCount(0);
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto('/recipes');
    await reopened.getByRole('button', { name: 'Любимые', exact: true }).click();
    await expect(reopened.getByRole('button', { name: 'Открыть рецепт Салат из файла', exact: true })).toBeVisible();
    expect(await reopened.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!).recipes)).toHaveLength(3);
    expect(await reopened.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!).recipeMeta['new-salad'].cookings)).toHaveLength(1);
    expect(await reopened.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1')!))).toEqual(shopping);
    expect(await reopened.evaluate(() => JSON.parse(localStorage.getItem('app-settings-v1')!))).toMatchObject({ theme: 'light', language: 'ru' });
  });
});

test('invalid JSON, malformed records, unsupported versions and oversize files do not modify the book', async ({ page }) => {
  await settings(page);
  for (const value of ['bad json', { ...backup(), recipes: [incoming, { title: 'broken' }] }, { ...backup(), version: 99 }, ' '.repeat(5 * 1024 * 1024 + 1)]) {
    await select(page, value);
    // The error is shown with the restore action, not at the end of the screen.
    await expect(page.getByTestId('backup-restore-section').getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('backup-create-section').getByRole('alert')).toHaveCount(0);
    await expect(page.getByTestId('recipe-import-preview')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recipes')!))).toEqual(recipes);
  }
});

test('ID collision keeps both recipes and a failed save can be retried', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    let rejected = false;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'recipe-book-v1' && value.includes('Салат из файла') && !rejected) {
        rejected = true;
        throw new Error('Test quota failure');
      }
      return original.call(this, key, value);
    };
  });
  await settings(page);
  await select(page, backup([{ ...incoming, id: 'e2e-omelet' }]));
  await expect(page.getByTestId('recipe-import-preview')).toContainText('Сохраним оба варианта.');
  await page.getByRole('button', { name: 'Добавить в мою книгу', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось сохранить изменения');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!).recipes)).toEqual(recipes);
  await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await expect(page.getByTestId('recipe-import-preview')).toHaveCount(0);
  await page.goto('/recipes');
  for (const title of ['Омлет с сыром', 'Салат из файла']) await expect(page.getByRole('button', { name: `Открыть рецепт ${title}`, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Открыть рецепт Салат из файла', exact: true })).toBeVisible();
});

test.describe('empty book', () => {
  test.use({ seedRecipes: [] });
  test('a backup can be made; an old recipe file opens the recipe import and restores favourites and history', async ({ page }) => {
    await settings(page);
    await expect(button(page, 'Создать резервную копию')).toBeEnabled();
    const chooserPromise = page.waitForEvent('filechooser');
    await button(page, 'Восстановить из файла').click();
    await (await chooserPromise).setFiles({ name: 'recipes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup())) });
    await expect(page.getByTestId('profile-import-preview')).toHaveCount(0);
    await button(page, 'Добавить в мою книгу').click();
    await expect(page.getByTestId('recipe-import-preview')).toHaveCount(0);
    await page.reload();
    const downloadPromise = page.waitForEvent('download');
    await button(page, 'Создать резервную копию').click();
    expect((await downloadPromise).suggestedFilename()).toMatch(/\.json$/);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!).recipeMeta['new-salad'])).toEqual(backup().recipeMeta['new-salad']);
  });
});

for (const theme of ['light', 'dark'] as const) {
  test.describe(`backup ${theme}`, () => {
    test.use({ seedSettings: { theme, language: 'ru', shoppingCompletedBehavior: 'moveDown' } });
    test('import preview @visual', async ({ page }) => {
      await settings(page);
      await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
      await select(page, backup());
      await page.getByTestId('recipe-import-preview').scrollIntoViewIfNeeded();
      await visualReady(page);
      await expect(page).toHaveScreenshot('import-preview.png');
    });
  });
}

test('canonical snapshot wins over stale mirrors; damaged snapshot falls back to legacy data', async ({ page }) => {
  await page.addInitScript(({ items }) => {
    localStorage.setItem('recipe-book-v1', JSON.stringify({ recipes: items, recipeMeta: {} }));
  }, { items: [incoming] });
  await openHome(page);
  await expect(page.getByRole('button', { name: 'Открыть рецепт Салат из файла', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('recipes') ?? '[]')[0]?.id)).toBe('new-salad');
  await page.evaluate(({ items }) => {
    localStorage.setItem('recipe-book-v1', 'damaged');
    localStorage.setItem('recipes', JSON.stringify(items));
  }, { items: recipes });
  // A different page without the initialization script checks recovery from legacy data.
  const fresh = await page.context().newPage();
  await fresh.goto('/recipes');
  await fresh.getByRole('button', { name: 'Восстановить из предыдущей копии (оригинал сохранится)', exact: true }).click();
  await expect(fresh.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true })).toBeVisible();
});

test.describe('system file sharing', () => {
  test.use({ hasTouch: true });
  test('file sharing receives valid JSON and cancellation leaves the app usable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
        const file = data.files![0];
        localStorage.setItem('test-shared-backup', await file.text());
        throw new DOMException('Cancelled', 'AbortError');
      } });
    });
    await settings(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await button(page, 'Создать резервную копию').click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('test-shared-backup') ?? '{}').profile?.recipes?.length)).toBe(2);
    await expect(page.getByRole('alert')).toHaveCount(0);
    // A cancelled share is not an export: the date stays unset.
    await expect(page.getByText('Последняя выгрузка: ещё не было', { exact: true })).toBeVisible();
    await expect(button(page, 'Восстановить из файла')).toBeEnabled();
  });
});

test.describe('large text on a narrow screen', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test('both actions fit, read their full names and the screen does not scroll sideways', async ({ page }) => {
    await settings(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
    for (const name of ['Создать резервную копию', 'Восстановить из файла']) {
      const action = button(page, name);
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeInViewport();
      expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('English', () => {
  test.use({ seedSettings: { theme: 'dark', language: 'en', shoppingCompletedBehavior: 'moveDown' } });
  test('the actions, the full-backup preview and the older-file note are translated, without "profile"', async ({ page }) => {
    await page.goto('/backup');
    const screen = page.getByTestId('backup-screen');
    await expect(button(page, 'Create backup')).toBeVisible();
    await expect(button(page, 'Restore from file')).toBeVisible();
    await page.getByTestId('recipe-file-input').setInputFiles({ name: 'copy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      format: 'recipes-profile-backup', version: 1, exportedAt: '2026-10-21T09:00:00.000Z',
      profile: { recipes, recipeMeta: {}, shoppingItems: [], settings: { theme: 'dark', language: 'en', shoppingCompletedBehavior: 'keep' } },
    })) });
    await expect(page.getByTestId('profile-import-preview').getByRole('button')).toHaveText(['Restore data', 'Cancel']);
    await expect(screen.getByText(/profile/i)).toHaveCount(0);
    await select(page, backup(), 'old.json');
    await expect(page.getByTestId('recipe-import-preview')).toContainText('This is an older backup. It holds only recipes, favourites and cooking history.');
    await expect(screen.getByText(/profile/i)).toHaveCount(0);
  });
});
