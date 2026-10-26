/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { test, expect, recipes, openHome, chooseSetting, settingRow } from './fixtures';

const bookKey = 'recipe-book-v1';
const rawBook = JSON.stringify({ recipes, recipeMeta: {} });

test('P0: a legacy read failure cannot erase a valid canonical snapshot', async ({ page }) => {
  await page.addInitScript(({ rawBook }) => {
    localStorage.setItem('recipe-book-v1', rawBook);
    localStorage.setItem('app-onboarding-v1', 'completed');
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'recipes') throw new Error('synthetic legacy read failure');
      return original.call(this, key);
    };
  }, { rawBook });
  await openHome(page);
  await expect(page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), bookKey)).toBe(rawBook);
  // Restore access and confirm the original legacy payload was not overwritten.
  const fresh = await page.context().newPage(); await fresh.goto('/recipes');
  expect(await fresh.evaluate(key => localStorage.getItem(key), bookKey)).toBe(rawBook);
  await fresh.close();
});

test('P0: damaged canonical snapshot without fallback survives reload and Retry', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('storage-test-seeded')) return;
    sessionStorage.setItem('storage-test-seeded', 'yes');
    localStorage.setItem('app-onboarding-v1', 'completed');
    localStorage.setItem('recipe-book-v1', '{broken-but-preserve-me');
    localStorage.removeItem('recipes'); localStorage.removeItem('recipe-meta-v1');
  });
  await page.goto('/recipes');
  await expect(page.getByRole('alert')).toHaveText('Не удалось открыть данные');
  await page.getByRole('button', { name: 'Повторить чтение', exact: true }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), bookKey)).toBe('{broken-but-preserve-me');
  await page.reload(); await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), bookKey)).toBe('{broken-but-preserve-me');
});

test('P0: damaged shopping-list-v1 is not migrated into an empty list', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('app-onboarding-v1', 'completed');
    localStorage.setItem('shopping-list-v1', '["Лук", {"broken":true}]');
  });
  await page.goto('/recipes');
  await expect(page.getByRole('alert')).toHaveText('Не удалось открыть данные');
  await page.getByRole('button', { name: 'Повторить чтение', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('shopping-list-v1'))).toBe('["Лук", {"broken":true}]');
  await page.reload(); await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('shopping-list-v1'))).toBe('["Лук", {"broken":true}]');
});

test('explicit legacy recovery preserves damaged original in a recovery archive', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('storage-test-seeded')) return;
    sessionStorage.setItem('storage-test-seeded', 'yes');
    localStorage.setItem('app-onboarding-v1', 'completed');
    localStorage.setItem('recipe-book-v1', 'damaged original');
  });
  await page.goto('/recipes');
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), bookKey)).toBe('damaged original');
  await page.getByRole('button', { name: 'Восстановить из предыдущей копии (оригинал сохранится)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true })).toBeVisible();
  expect(await page.evaluate(() => {
    const archive = Object.keys(localStorage).find(key => key.startsWith('storage-recovery-v1:recipe-book-v1:'));
    return archive ? JSON.parse(localStorage.getItem(archive)!)['recipe-book-v1'].raw : null;
  })).toBe('damaged original');
  await page.reload(); await expect(page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true })).toBeVisible();
});

test('unknown format version cannot be migrated over using legacy data', async ({ page }) => {
  const raw = JSON.stringify({ recipes, recipeMeta: {}, version: 999 });
  await page.addInitScript(raw => {
    localStorage.setItem('app-onboarding-v1', 'completed'); localStorage.setItem('recipe-book-v1', raw);
  }, raw);
  await page.goto('/recipes'); await expect(page.getByRole('alert')).toHaveText('Эта версия данных пока не поддерживается');
  expect(await page.evaluate(key => localStorage.getItem(key), bookKey)).toBe(raw);
});

test('failed shopping write keeps draft; retry saves once and clears it', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    let failed = false;
    Storage.prototype.setItem = function (key, value) {
      if (!failed && key === 'shopping-list-v1' && value.includes('Яйц')) { failed = true; throw new Error('synthetic quota'); }
      return original.call(this, key, value);
    };
  });
  await openHome(page); await page.getByRole('tab', { name: 'Покупки', exact: true }).click();
  await page.getByPlaceholder('Добавить продукт', { exact: true }).fill('Яйца — 2 шт.');
  await page.getByRole('button', { name: 'Добавить продукт', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Не удалось сохранить изменения');
  expect(await page.evaluate(() => localStorage.getItem('shopping-list-v1'))).toBe('[]');
  await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await expect(page.getByPlaceholder('Добавить продукт', { exact: true })).toHaveValue('');
  await expect(page.getByTestId('shopping-row')).toHaveCount(1);
  await page.reload(); await expect(page.getByTestId('shopping-row')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1')!)[0].quantity)).toBe(2);
});

for (const key of ['app-settings-v1', 'app-onboarding-v1']) {
  test(`${key}: failed read preserves data and recovers by explicit reread`, async ({ page }) => {
    await page.addInitScript(key => {
      localStorage.setItem('app-onboarding-v1', 'completed');
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function (name) {
        if (name === key && !sessionStorage.getItem('storage-test-allow-read')) throw new Error('synthetic read failure');
        return original.call(this, name);
      };
    }, key);
    await page.goto('/recipes'); await expect(page.getByRole('alert')).toHaveText('Не удалось открыть данные');
    await page.evaluate(() => sessionStorage.setItem('storage-test-allow-read', 'yes'));
    expect(await page.evaluate(key => localStorage.getItem(key), key)).not.toBeNull();
    await page.getByRole('button', { name: 'Повторить чтение', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Покупки', exact: true })).toBeVisible();
  });
}

test('failed recipe creation keeps the form draft and does not claim success', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem; let failed = false;
    Storage.prototype.setItem = function (key, value) {
      if (!failed && key === 'recipe-book-v1' && value.includes('Рецепт с отказом')) { failed = true; throw new Error('synthetic quota'); }
      return original.call(this, key, value);
    };
  });
  await openHome(page);
  await page.getByRole('button', { name: 'Добавить рецепт', exact: true }).click();
  await page.getByPlaceholder('Название рецепта', { exact: true }).fill('Рецепт с отказом');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Не удалось сохранить изменения');
  await expect(page.getByPlaceholder('Название рецепта', { exact: true })).toHaveValue('Рецепт с отказом');
  await expect(page.getByText('Рецепт сохранён', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).recipes.length, bookKey)).toBe(2);
  await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Открыть рецепт Рецепт с отказом', exact: true })).toBeVisible();
  await page.reload();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).recipes.filter((r: { title: string }) => r.title === 'Рецепт с отказом').length, bookKey)).toBe(1);
});

test('failed cooking write preserves the note; retry appends exactly one event', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem; let failed = false;
    Storage.prototype.setItem = function (key, value) {
      if (!failed && key === 'recipe-book-v1' && value.includes('Меньше соли')) { failed = true; throw new Error('synthetic quota'); }
      return original.call(this, key, value);
    };
  });
  await openHome(page);
  await page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true }).click();
  await page.getByRole('button', { name: 'Начать готовить', exact: true }).click();
  await page.getByRole('button', { name: 'Следующий шаг', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await page.getByPlaceholder('Заметка о приготовлении', { exact: true }).fill('Меньше соли');
  await page.getByRole('button', { name: 'Записать в историю', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Не удалось сохранить изменения');
  await expect(page.getByPlaceholder('Заметка о приготовлении', { exact: true })).toHaveValue('Меньше соли');
  await expect(page.getByText('Приготовление сохранено', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).recipeMeta['e2e-omelet']?.cookings ?? [], bookKey)).toHaveLength(0);
  await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await expect(page.getByText('Готовили: 1 раз', { exact: true })).toBeVisible();
  await page.reload();
  const events = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).recipeMeta['e2e-omelet'].cookings, bookKey);
  expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ note: 'Меньше соли' });
});

test('failed settings write does not change saved preferences and can be retried', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem; let failed = false;
    Storage.prototype.setItem = function (key, value) {
      if (!failed && key === 'app-settings-v1' && value.includes('dark')) { failed = true; throw new Error('synthetic quota'); }
      return original.call(this, key, value);
    };
  });
  await openHome(page); await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await chooseSetting(page, 'Оформление', 'Тёмная');
  await expect(page.getByRole('alert')).toHaveText('Не удалось сохранить изменения');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('app-settings-v1')!).theme)).toBe('light');
  await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await expect(settingRow(page, 'Оформление')).toHaveAccessibleName('Оформление: Тёмная');
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('app-settings-v1')!).theme)).toBe('dark');
});

test('recovery download preserves exact damaged payload without resetting storage', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('app-onboarding-v1', 'completed');
    localStorage.setItem('shopping-list-v1', 'damaged \n original');
  });
  await page.goto('/recipes'); await expect(page.getByRole('alert')).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сохранить исходные данные в файл', exact: true }).click();
  const file = await downloaded; const path = testInfo.outputPath('recovery.json'); await file.saveAs(path);
  const payload = JSON.parse(await readFile(path, 'utf8'));
  expect(payload.format).toBe('recipes-storage-recovery');
  expect(payload.entries['shopping-list-v1'].raw).toBe('damaged \n original');
  expect(await page.evaluate(() => localStorage.getItem('shopping-list-v1'))).toBe('damaged \n original');
});

test('a stale tab cannot overwrite a recipe saved in another tab', async ({ page, context }) => {
  await openHome(page);
  const stale = await context.newPage(); await openHome(stale);
  await page.getByRole('button', { name: 'Добавить рецепт', exact: true }).click();
  await page.getByPlaceholder('Название рецепта', { exact: true }).fill('Рецепт из другой вкладки');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Открыть рецепт Рецепт из другой вкладки', exact: true })).toBeVisible();
  await stale.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true }).click();
  await stale.getByRole('button', { name: 'Добавить в любимое', exact: true }).click();
  await expect(stale.getByRole('alert')).toHaveText('Не удалось открыть данные');
  await expect(stale.getByText('Данные изменились в другом окне. Повтори чтение перед продолжением.', { exact: true })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).recipes.length, bookKey)).toBe(3);
  await stale.getByRole('button', { name: 'Повторить чтение', exact: true }).click();
  await expect(stale.getByRole('alert')).toHaveCount(0);
  await stale.getByRole('button', { name: 'Добавить в любимое', exact: true }).click();
  await expect(stale.getByRole('button', { name: 'Убрать из любимого', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Открыть рецепт Рецепт из другой вкладки', exact: true })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).recipeMeta['e2e-omelet'].favorite, bookKey)).toBe(true);
  await stale.close();
});
