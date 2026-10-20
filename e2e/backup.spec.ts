/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { test, expect, openHome, recipes, shopping, visualReady } from './fixtures';

const incoming = { id: 'new-salad', title: 'Салат из файла', category: null, time: 5, ingredients: ['Огурец — 1 шт'], steps: ['Нарезать.'] };
const backup = (items = [incoming]) => ({ format: 'recipes-backup', version: 1, exportedAt: '2026-10-20T10:00:00Z', recipes: items, recipeMeta: {
  [items[0]?.id ?? 'unused']: { favorite: true, cookings: [{ id: 'cooked-1', cookedAt: '2026-10-20T09:00:00Z', rating: 'great', note: 'Получилось вкусно' }] },
} });
async function select(page: import('@playwright/test').Page, value: unknown, name = 'recipes.json') {
  await page.getByTestId('recipe-file-input').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });
}
async function settings(page: import('@playwright/test').Page) {
  await openHome(page);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
}

test('downloaded JSON contains the full book and can be imported again without duplicates', async ({ page }, testInfo) => {
  await settings(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Выгрузить в файл', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^recipes-.*\.json$/);
  const file = testInfo.outputPath('backup.json');
  await download.saveAs(file);
  const exported = JSON.parse(await readFile(file, 'utf8'));
  expect(exported).toMatchObject({ format: 'recipes-backup', version: 1, recipes });
  await page.getByTestId('recipe-file-input').setInputFiles(file);
  await expect(page.getByTestId('recipe-import-preview')).toContainText('Новых: 0. Уже есть: 2.');
  await page.getByRole('button', { name: 'Добавить в мою книгу', exact: true }).click();
  await expect(page.getByTestId('recipe-import-preview')).toHaveCount(0);
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!).recipes)).toEqual(recipes);
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
    await reopened.goto('/');
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
    await expect(page.getByRole('alert')).toBeVisible();
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
  await expect(page.getByRole('alert')).toContainText('Данные в книге не изменены');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!).recipes)).toEqual(recipes);
  await page.getByRole('button', { name: 'Добавить в мою книгу', exact: true }).click();
  await expect(page.getByTestId('recipe-import-preview')).toHaveCount(0);
  await page.goto('/');
  for (const title of ['Омлет с сыром', 'Салат из файла']) await expect(page.getByRole('button', { name: `Открыть рецепт ${title}`, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Открыть рецепт Салат из файла', exact: true })).toBeVisible();
});

test.describe('empty book', () => {
  test.use({ seedRecipes: [] });
  test('export is disabled; file picker opens from the button and import restores favourites and history', async ({ page }) => {
    await settings(page);
    await expect(page.getByRole('button', { name: 'Выгрузить в файл', exact: true })).toBeDisabled();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Загрузить из файла', exact: true }).click();
    await (await chooserPromise).setFiles({ name: 'recipes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup())) });
    await page.getByRole('button', { name: 'Добавить в мою книгу', exact: true }).click();
    await expect(page.getByTestId('recipe-import-preview')).toHaveCount(0);
    await page.reload();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Выгрузить в файл', exact: true }).click();
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
  await fresh.goto('/');
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
    await page.getByRole('button', { name: 'Выгрузить в файл', exact: true }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('test-shared-backup') ?? '{}').recipes?.length)).toBe(2);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Загрузить из файла', exact: true })).toBeEnabled();
  });
});
