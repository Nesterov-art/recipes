import { test, expect, openHome, addItem } from './fixtures';

test('recipe deletion requires consent; cancelling preserves the exact book', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true }).click();
  const original = await page.evaluate(() => localStorage.getItem('recipe-book-v1'));
  let prompts = 0;
  page.on('dialog', async dialog => { prompts++; await dialog.dismiss(); });
  await page.getByRole('button', { name: 'Удалить рецепт', exact: true }).click();
  expect(prompts).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('recipe-book-v1'))).toBe(original);
  await expect(page.getByRole('button', { name: 'Удалить рецепт', exact: true })).toBeVisible();
});

test('confirmed deletion commits only once even with repeated presses and survives reload', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    sessionStorage.setItem('audit-delete-writes', '0');
    Storage.prototype.setItem = function (key, value) {
      if (key === 'recipe-book-v1') sessionStorage.setItem('audit-delete-writes', String(Number(sessionStorage.getItem('audit-delete-writes')) + 1));
      return original.call(this, key, value);
    };
  });
  let prompts = 0;
  page.on('dialog', async dialog => { prompts++; await dialog.accept(); });
  await page.getByRole('button', { name: 'Удалить рецепт', exact: true }).evaluate(element => {
    (element as HTMLElement).click();
    (element as HTMLElement).click();
  });
  await expect(page.getByRole('button', { name: 'Открыть рецепт Томатный суп', exact: true })).toBeVisible();
  expect(prompts).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem('audit-delete-writes'))).toBe('1');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true })).toHaveCount(0);
});

test('failed confirmed deletion retains data and existing Retry commits the original operation', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    let failed = false;
    Storage.prototype.setItem = function (key, value) {
      if (!failed && key === 'recipe-book-v1' && !value.includes('e2e-omelet')) { failed = true; throw new Error('synthetic deletion failure'); }
      return original.call(this, key, value);
    };
  });
  await openHome(page);
  await page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true }).click();
  page.on('dialog', async dialog => { await dialog.accept(); });
  await page.getByRole('button', { name: 'Удалить рецепт', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Не удалось сохранить изменения');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!).recipes.length)).toBe(2);
  await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Открыть рецепт Томатный суп', exact: true })).toBeVisible();
});

for (const language of ['ru', 'en'] as const) {
  test.describe(`inline form errors ${language}`, () => {
    test.use({ seedSettings: { language, theme: 'light', shoppingCompletedBehavior: 'keep' } });
    test('validation explains invalid fields, retains drafts and permits the existing zero-minute rule', async ({ page }) => {
      await page.goto('/form');
      const title = page.getByPlaceholder(language === 'ru' ? 'Название рецепта' : 'Recipe title', { exact: true });
      const time = page.getByPlaceholder(language === 'ru' ? 'Например, 15' : 'e.g. 15', { exact: true });
      const save = page.getByRole('button', { name: language === 'ru' ? 'Сохранить' : 'Save', exact: true });
      await title.fill('   ');
      await time.fill('-1');
      await save.click();
      await expect(page.getByRole('alert').filter({ hasText: language === 'ru' ? 'Впиши, как называется блюдо' : 'Enter a name for the dish' })).toBeVisible();
      await expect(title).toHaveValue('   ');
      await title.fill('Audit draft');
      for (const invalid of ['-1', 'abc', 'Infinity']) {
        await time.fill(invalid);
        await save.click();
        await expect(page.getByRole('alert').filter({ hasText: language === 'ru' ? 'Укажи количество минут числом от нуля' : 'Enter the number of minutes, starting from zero' })).toBeVisible();
        await expect(title).toHaveValue('Audit draft');
        await expect(time).toHaveValue(invalid);
      }
      await time.fill('0');
      await save.click();
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!).recipes.find((r: { title: string }) => r.title === 'Audit draft')?.time)).toBe(0);
    });
  });
}

// The Choice tab picks from the whole book and explains an empty book on its own
// screen; e2e/choice.spec.ts covers both, including that picking never writes.

test.describe('textual ingredient integration', () => {
  test.use({ seedRecipes: [{ id: 'seasoning', title: 'Тест приправ', category: null, time: 10,
    ingredients: ['Соль — по вкусу', 'Масло — для жарки', 'Зелёный лук — 1 шт.'], steps: [] }] });
  test('manual products and recipe explanations merge, persist and match without changing compound names', async ({ page }) => {
    await openHome(page);
    await page.getByRole('tab', { name: 'Покупки', exact: true }).click();
    await addItem(page, 'Соль');
    await addItem(page, 'Масло — 200 г');
    await page.getByRole('tab', { name: 'Рецепты', exact: true }).click();
    await page.getByRole('button', { name: 'Открыть рецепт Тест приправ', exact: true }).click();
    await page.getByRole('button', { name: /Добавить в покупки$/ }).click();
    await page.getByRole('button', { name: /^Добавить 3/ }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1')!).length)).toBe(3);
    // The selection closes itself; a new page load during that navigation is aborted.
    await expect(page).toHaveURL(/\/recipe\/seasoning$/);
    await page.goto('/shopping');
    await expect(page.getByTestId('shopping-row')).toHaveCount(3);
    await expect(page.getByRole('checkbox', { name: 'Соль — по вкусу', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Масло — 200 г (для жарки)', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('shopping-row')).toHaveCount(3);
    await page.getByRole('button', { name: 'Что можно приготовить?', exact: true }).click();
    await expect(page.getByText('Все ингредиенты в списке', { exact: true })).toBeVisible();
  });
});
