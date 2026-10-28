/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { test, expect, openBackups, openHome, shopping } from './fixtures';

const keys = ['recipe-book-v1', 'recipes', 'recipe-meta-v1', 'shopping-list-v1', 'app-settings-v1', 'app-onboarding-v1'];
const profile = {
  recipes: [{ id: 'backup-recipe', title: 'Из полной копии', category: null, time: 12, ingredients: ['Молоко — 2 л', 'Яйца — 3 шт.'], steps: ['Смешать'] }],
  recipeMeta: { 'backup-recipe': { favorite: true, cookings: [
    { id: 'old', cookedAt: '2026-09-01T09:00:00.000Z', rating: 'good', note: 'Старая заметка' },
    { id: 'new', cookedAt: '2026-10-20T09:00:00.000Z', rating: 'great', note: 'Последняя заметка' },
  ] } },
  shoppingItems: [
    { id: 'backup-milk', name: 'Молоко', text: 'Молоко — 2 л', quantity: 2, unit: 'л', checked: true },
    { id: 'backup-eggs', name: 'Яйца', text: 'Яйца — 3 шт.', quantity: 3, unit: 'шт.', checked: false },
  ], settings: { theme: 'dark', language: 'ru', shoppingCompletedBehavior: 'keep' },
};
const file = () => ({ format: 'recipes-profile-backup', version: 1, exportedAt: '2026-10-21T09:00:00.000Z', profile });
const normalized = () => ({ ...profile, recipeMeta: { 'backup-recipe': { ...profile.recipeMeta['backup-recipe'], cookings: [...profile.recipeMeta['backup-recipe'].cookings].reverse() } } });
const rawProfile = (page: import('@playwright/test').Page) => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), keys);
async function settings(page: import('@playwright/test').Page) {
  await openBackups(page);
}
// One restore action for every file: its format decides the preview.
async function select(page: import('@playwright/test').Page, value: unknown) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Восстановить из файла', exact: true }).click();
  await (await chooser).setFiles({ name: 'profile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
}
async function confirm(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Восстановить данные', exact: true }).click();
}

test.describe('full profile export', () => {
  test.use({ seedShopping: [shopping, { scope: 'test' }] });
  test('download includes all areas, order and preferences; export date persists', async ({ page }, testInfo) => {
    await settings(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Создать резервную копию', exact: true }).click();
    const path = testInfo.outputPath('profile.json'); await (await download).saveAs(path);
    const backup = JSON.parse(await readFile(path, 'utf8'));
    expect(backup).toMatchObject({ format: 'recipes-profile-backup', version: 1 });
    expect(backup.profile.recipes).toHaveLength(2); expect(backup.profile.shoppingItems).toEqual(shopping);
    expect(backup.profile.settings).toEqual({ theme: 'light', language: 'ru', shoppingCompletedBehavior: 'moveDown' });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('profile-backup-last-success-v1'))).not.toBeNull();
    await page.reload(); await expect(page.getByText(/Последняя выгрузка:/)).not.toContainText('ещё не было');
  });
});

test('restore preview/cancel changes nothing; confirmed and repeated restore never sums groceries', async ({ page }) => {
  await settings(page); const before = await rawProfile(page);
  await select(page, file());
  await expect(page.getByTestId('profile-import-preview')).toContainText('Приготовлений: 2');
  await expect(page.getByTestId('profile-import-preview')).toContainText('будут заменены');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  expect(await rawProfile(page)).toEqual(before);
  for (let i = 0; i < 2; i++) {
    await select(page, file()); await confirm(page);
    await expect(page.getByTestId('profile-import-preview')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1')!))).toEqual(profile.shoppingItems);
  }
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!))).toEqual({ recipes: profile.recipes, recipeMeta: normalized().recipeMeta });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('app-settings-v1')!))).toEqual(profile.settings);
  await page.goto('/recipes'); await page.getByRole('button', { name: 'Открыть рецепт Из полной копии', exact: true }).click();
  await expect(page.getByText('Последняя заметка', { exact: true })).toBeVisible();
});

test('a full backup offers only restoring all data or cancelling, never a recipe-only import', async ({ page }) => {
  await settings(page);
  await select(page, file());
  const preview = page.getByTestId('profile-import-preview');
  await expect(preview.getByRole('button')).toHaveText(['Восстановить данные', 'Отмена']);
  await expect(page.getByRole('button', { name: 'Добавить только рецепты', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Добавить в мою книгу', exact: true })).toHaveCount(0);
});

test('an older recipe file is merged twice without duplicates and keeps groceries and preferences', async ({ page }) => {
  await settings(page); const before = await rawProfile(page);
  const recipesFile = { format: 'recipes-backup', version: 1, exportedAt: file().exportedAt, recipes: profile.recipes, recipeMeta: profile.recipeMeta };
  for (let i = 0; i < 2; i++) {
    await select(page, recipesFile);
    await page.getByRole('button', { name: 'Добавить в мою книгу', exact: true }).click();
    await expect(page.getByTestId('recipe-import-preview')).toHaveCount(0);
  }
  const after = await rawProfile(page);
  expect(after['shopping-list-v1']).toBe(before['shopping-list-v1']); expect(after['app-settings-v1']).toBe(before['app-settings-v1']);
  expect(JSON.parse(after['recipe-book-v1']!).recipes).toHaveLength(3);
  expect(JSON.parse(after['recipe-book-v1']!).recipeMeta['backup-recipe'].cookings).toHaveLength(2);
});

test('restored English preferences update the UI and survive restarting the app', async ({ page }) => {
  await settings(page);
  await select(page, { ...file(), profile: { ...profile, settings: { ...profile.settings, language: 'en' } } });
  await confirm(page); await expect(page.getByTestId('profile-import-preview')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create backup', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('button', { name: 'Create backup', exact: true })).toBeVisible();
});

test('unknown profile versions and malformed records cannot replace data', async ({ page }) => {
  await settings(page); const before = await rawProfile(page);
  for (const value of [{ ...file(), version: 99 }, { ...file(), profile: { ...profile, shoppingItems: [{}] } }]) {
    await select(page, value); await expect(page.getByTestId('backup-restore-section').getByRole('alert')).toBeVisible();
    expect(await rawProfile(page)).toEqual(before); await expect(page.getByTestId('profile-import-preview')).toHaveCount(0);
  }
});

test('a recipe-only file says so, never offers to replace app data; cancelling changes nothing', async ({ page }) => {
  await settings(page); const before = await rawProfile(page);
  await select(page, { format: 'recipes-backup', version: 1, exportedAt: file().exportedAt, recipes: profile.recipes, recipeMeta: profile.recipeMeta });
  await expect(page.getByTestId('recipe-import-preview')).toContainText('Новых: 1. Уже есть: 0.');
  await expect(page.getByTestId('recipe-import-preview')).toContainText('Это старая резервная копия. В ней только рецепты, избранное и история приготовления.');
  await expect(page.getByTestId('recipe-import-preview')).toContainText('Список покупок и настройки не изменятся.');
  await expect(page.getByTestId('profile-import-preview')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Восстановить данные', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.getByTestId('recipe-import-preview')).toHaveCount(0);
  expect(await rawProfile(page)).toEqual(before);
});

test('stale preview refuses restore without overwriting a newly added grocery', async ({ page }) => {
  await settings(page); await select(page, file());
  await expect(page.getByTestId('profile-import-preview')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('shopping-list-v1', '[{"id":"new","name":"Хлеб","text":"Хлеб","checked":false}]'));
  const before = await rawProfile(page); await confirm(page);
  await expect(page.getByRole('alert')).toContainText('Данные изменились после предпросмотра');
  expect(await rawProfile(page)).toEqual(before);
});

test('partial write failure rolls back every area; explicit retry succeeds', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem; let rejected = false;
    Storage.prototype.setItem = function (key, value) {
      if (!rejected && key === 'shopping-list-v1' && value.includes('backup-milk')) { rejected = true; throw new Error('synthetic failure'); }
      return original.call(this, key, value);
    };
  });
  await settings(page); const before = await rawProfile(page); await select(page, file()); await confirm(page);
  await expect(page.getByRole('alert')).toContainText('Прежние данные возвращены');
  expect(await rawProfile(page)).toEqual(before);
  await confirm(page); await expect(page.getByTestId('profile-import-preview')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1')!))).toEqual(profile.shoppingItems);
});

test('interrupted rollback is recovered before loading data providers on reload', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem; let restoring = false;
    Storage.prototype.setItem = function (key, value) {
      if (!sessionStorage.getItem('allow-profile-recovery')) {
        if (key === 'shopping-list-v1' && value.includes('backup-milk')) { restoring = true; throw new Error('synthetic target refusal'); }
        if (restoring && key === 'recipe-book-v1' && value.includes('e2e-omelet')) throw new Error('synthetic rollback refusal');
      }
      return original.call(this, key, value);
    };
  });
  await settings(page); const before = await rawProfile(page); await select(page, file()); await confirm(page);
  await expect(page.getByRole('alert')).toHaveText('Нужно восстановить целостность данных');
  await page.evaluate(() => sessionStorage.setItem('allow-profile-recovery', 'yes'));
  await page.reload(); await expect(page.getByRole('button', { name: 'Создать резервную копию', exact: true })).toBeVisible();
  expect(await rawProfile(page)).toEqual(before);
});

test.describe('empty profile', () => {
  test.use({ seedRecipes: [] });
  test('empty profile can be exported and a full profile restores into a clean book', async ({ page }) => {
    await settings(page); await expect(page.getByRole('button', { name: 'Создать резервную копию', exact: true })).toBeEnabled();
    await select(page, file()); await confirm(page); await expect(page.getByTestId('profile-import-preview')).toHaveCount(0);
    await page.reload(); expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!).recipes)).toEqual(profile.recipes);
  });
});
