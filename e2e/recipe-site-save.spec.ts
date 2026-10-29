import type { Page } from '@playwright/test';
import { test, expect, openHome, openNewRecipeForm, recipes } from './fixtures';
import { button, find, openImport, preview, recipePage, SITE, sites, storage, syrniki } from './site-stubs';

// Saving a recipe found on a cooking site: as is, or after the form. Sites are stubbed (see
// site-stubs.ts); the book is read back from localStorage.
type Stored = { id: string; title: string; category: string | null; time: number; ingredients: string[]; steps: string[] };
const book = (page: Page) => page.evaluate(() => {
  const raw = localStorage.getItem('recipe-book-v1');
  return (raw ? JSON.parse(raw).recipes : JSON.parse(localStorage.getItem('recipes') ?? '[]')) as Stored[];
});
const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
const lines = { ingredients: ['Творог 5% — 400 г', 'Яйцо — 1 шт.', 'Мука — 3 ст. л.'], steps: ['Смешать творог, яйцо и муку.', 'Обжарить по 3 минуты.'] };
const whole = { title: 'Сырники из творога 😊', category: 'Завтрак', time: 30, ...lines };
// Counts the writes of the book that contain a given title, to tell one save from two (the book
// is also written once when it loads, at a moment that differs between browsers).
const countWrites = (page: Page, title: string) => page.addInitScript(wanted => {
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === 'recipe-book-v1' && value.includes(wanted)) sessionStorage.setItem('book-writes', String(Number(sessionStorage.getItem('book-writes') ?? 0) + 1));
    return original.call(this, key, value);
  };
}, title);
const writes = (page: Page) => page.evaluate(() => Number(sessionStorage.getItem('book-writes') ?? 0));
// "Edit" opens the form over the preview; both have a "Close", so wait until the form is up.
async function edit(page: Page) {
  await button(page, 'Изменить').click();
  await expect(page).toHaveURL(/\/form\?draft=/);
  await expect(page.getByText(/^Рецепт со страницы /)).toBeVisible();
}

test('a whole recipe is added as is: one new recipe, the others untouched, and it stays after a reload', async ({ page }) => {
  await sites(page, () => ({ body: recipePage(syrniki()) }));
  await openImport(page);
  const before = await book(page);
  await find(page, `${SITE}/syrniki`);
  await button(page, 'Добавить в мою книгу').click();
  await expect(page).toHaveURL(/\/recipe\/[^/]+$/);
  await expect(page.getByRole('heading', { name: whole.title, exact: true })).toBeVisible();
  await expect(page.getByText('Рецепт сохранён', { exact: true })).toBeVisible();
  const after = await book(page);
  expect(after).toHaveLength(before.length + 1);
  const added = after.find(recipe => recipe.title === whole.title)!;
  expect(added).toMatchObject(whole);
  expect(decodeURIComponent(new URL(page.url()).pathname)).toBe(`/recipe/${added.id}`);
  // The recipes already there are exactly as they were.
  for (const recipe of before) expect(after.find(r => r.id === recipe.id)).toEqual(recipe);
  await page.reload();
  expect(await book(page)).toEqual(after);

  // The same page again: already in the book, nothing to add, the existing one can be opened.
  await openImport(page);
  await find(page, `${SITE}/syrniki`);
  await expect(preview(page).getByText('Такой рецепт уже есть в книге.', { exact: true })).toBeVisible();
  await expect(button(page, 'Добавить в мою книгу')).toHaveCount(0);
  await button(page, 'Открыть рецепт').click();
  await expect(page).toHaveURL(/\/recipe\/[^/]+$/);
  expect(decodeURIComponent(new URL(page.url()).pathname)).toBe(`/recipe/${added.id}`);
  expect(await book(page)).toEqual(after);
});

test('a whole recipe opens in the usual form, filled in; the edited version is what is saved', async ({ page }) => {
  await sites(page, () => ({ body: recipePage(syrniki()) }));
  await openImport(page);
  const before = await book(page);
  await find(page, `${SITE}/syrniki`);
  await button(page, 'Изменить').click();
  await expect(page).toHaveURL(/\/form\?draft=/);
  // The address carries only a key, not the recipe.
  expect(decodeURIComponent(page.url())).not.toContain('Творог');
  await expect(page.getByText('Рецепт со страницы recipes.example. Проверь его перед сохранением.', { exact: true })).toBeVisible();
  await expect(field(page, 'Название')).toHaveValue(whole.title);
  await expect(field(page, 'Время, мин')).toHaveValue('30');
  await expect(field(page, 'Ингредиенты')).toHaveValue(lines.ingredients.join('\n'));
  await expect(field(page, 'Приготовление')).toHaveValue(lines.steps.join('\n'));
  await expect(button(page, 'Завтрак')).toHaveAttribute('aria-selected', 'true');
  // Nothing is written by opening the form.
  expect(await book(page)).toEqual(before);
  await field(page, 'Название').fill('Сырники бабушкины');
  await field(page, 'Ингредиенты').fill([...lines.ingredients, 'Ваниль — щепотка'].join('\n'));
  await button(page, 'Сохранить').click();
  await expect(page.getByRole('heading', { name: 'Сырники бабушкины', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/recipe\/[^/]+$/);
  const after = await book(page);
  expect(after).toHaveLength(before.length + 1);
  expect(after.find(recipe => recipe.title === 'Сырники бабушкины')).toMatchObject({ ...whole, title: 'Сырники бабушкины', ingredients: [...lines.ingredients, 'Ваниль — щепотка'] });
  expect(after.some(recipe => recipe.title === whole.title)).toBe(false);
});

test('a partial recipe: no direct add; in the form an unknown time must be entered, 0 is accepted when typed', async ({ page }) => {
  await sites(page, () => ({ body: recipePage(syrniki({ totalTime: undefined, recipeCategory: 'Выпечка' })) }));
  await openImport(page);
  const before = await book(page);
  await find(page, `${SITE}/partial`);
  await expect(button(page, 'Добавить в мою книгу')).toHaveCount(0);
  await button(page, 'Изменить').click();
  await expect(field(page, 'Время, мин')).toHaveValue('');
  for (const category of ['Завтрак', 'Обед', 'Ужин']) await expect(button(page, category)).toHaveAttribute('aria-selected', 'false');
  await button(page, 'Сохранить').click();
  await expect(page.getByRole('alert')).toHaveText('На странице не было времени. Впиши его в минутах — или 0, если оно не важно.');
  expect(await book(page)).toEqual(before);
  await field(page, 'Время, мин').fill('0');
  await button(page, 'Сохранить').click();
  await expect(page).toHaveURL(/\/recipe\/[^/]+$/);
  await expect(page.getByRole('heading', { name: whole.title, exact: true })).toBeVisible();
  const added = (await book(page)).find(recipe => recipe.title === whole.title)!;
  // The 0 was typed by the person; the category stays empty, as nothing sure was found.
  expect(added).toMatchObject({ time: 0, category: null, ...lines });
});

test('no title on the page: the form asks for one and saves nothing until it is there', async ({ page }) => {
  await sites(page, () => ({ body: recipePage(syrniki({ name: '' })) }));
  await openImport(page);
  const before = await book(page);
  await find(page, `${SITE}/untitled`);
  await expect(button(page, 'Добавить в мою книгу')).toHaveCount(0);
  await button(page, 'Изменить').click();
  await expect(field(page, 'Название')).toHaveValue('');
  await button(page, 'Сохранить').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Впиши, как называется блюдо' })).toBeVisible();
  expect(await book(page)).toEqual(before);
  await field(page, 'Название').fill('Сырники без названия');
  await button(page, 'Сохранить').click();
  await expect(page.getByRole('heading', { name: 'Сырники без названия', exact: true })).toBeVisible();
  expect(await book(page)).toHaveLength(before.length + 1);
});

test.describe('with an exact copy already in the book', () => {
  test.use({ seedRecipes: [[...recipes, { id: 'e2e-syrniki', ...whole }], { scope: 'test' }] });
  test('found before saving, and again after editing the draft into it; nothing is added', async ({ page }) => {
    await sites(page, url => ({ body: recipePage(url.endsWith('/whole') ? syrniki() : syrniki({ totalTime: undefined })) }));
    await openImport(page);
    const before = await book(page);
    await find(page, `${SITE}/whole`);
    await expect(preview(page).getByText('Такой рецепт уже есть в книге.', { exact: true })).toBeVisible();
    await expect(button(page, 'Добавить в мою книгу')).toHaveCount(0);
    // A partial copy (no time) is not called a duplicate on a guess...
    await find(page, `${SITE}/partial`);
    await expect(preview(page).getByText('Такой рецепт уже есть в книге.', { exact: true })).toHaveCount(0);
    await button(page, 'Изменить').click();
    // ...but once the person makes it the same recipe, saving names the existing one instead.
    await field(page, 'Время, мин').fill('30');
    await button(page, 'Сохранить').click();
    const notice = page.getByTestId('recipe-form-duplicate');
    await expect(notice).toContainText('Такой рецепт уже есть в книге.');
    expect(await book(page)).toEqual(before);
    // Any change makes it a different recipe again; the notice goes.
    await field(page, 'Время, мин').fill('35');
    await expect(notice).toHaveCount(0);
    await field(page, 'Время, мин').fill('30');
    await button(page, 'Сохранить').click();
    await button(page, 'Открыть рецепт').click();
    await expect(page).toHaveURL(/\/recipe\/e2e-syrniki$/);
    expect(await book(page)).toEqual(before);
  });
});

test('two quick presses on "Add to my book" write the recipe once', async ({ page }) => {
  await countWrites(page, whole.title);
  await sites(page, () => ({ body: recipePage(syrniki()) }));
  await openImport(page);
  const before = await book(page);
  await find(page, `${SITE}/syrniki`);
  expect(await writes(page)).toBe(0);
  await button(page, 'Добавить в мою книгу').evaluate(element => { (element as HTMLElement).click(); (element as HTMLElement).click(); });
  await expect(page).toHaveURL(/\/recipe\/[^/]+$/);
  await expect(page.getByRole('heading', { name: whole.title, exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await writes(page)).toBe(1);
  expect((await book(page)).filter(recipe => recipe.title === whole.title)).toHaveLength(1);
  expect(await book(page)).toHaveLength(before.length + 1);
});

test('a failed write reports no success; the existing Retry saves the same recipe once', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    let failed = false;
    Storage.prototype.setItem = function (key, value) {
      if (!failed && key === 'recipe-book-v1' && value.includes('Сырники из творога')) { failed = true; throw new Error('synthetic write failure'); }
      return original.call(this, key, value);
    };
  });
  await sites(page, () => ({ body: recipePage(syrniki()) }));
  await openImport(page);
  const before = await book(page);
  await find(page, `${SITE}/syrniki`);
  await button(page, 'Добавить в мою книгу').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить изменения' })).toBeVisible();
  await expect(page.getByText('Рецепт сохранён', { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/import-link$/);
  expect(await book(page)).toEqual(before);
  await button(page, 'Повторить сохранение').click();
  await expect(page).toHaveURL(/\/recipe\/[^/]+$/);
  await expect(page.getByRole('heading', { name: whole.title, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/recipe\/[^/]+$/);
  const after = await book(page);
  expect(after.filter(recipe => recipe.title === whole.title)).toHaveLength(1);
  expect(after).toHaveLength(before.length + 1);
});

test('leaving the form: unchanged goes straight back to the preview, changed asks first; the book is untouched', async ({ page }) => {
  await sites(page, () => ({ body: recipePage(syrniki()) }));
  await openImport(page);
  const before = await storage(page);
  await find(page, `${SITE}/syrniki`);
  await edit(page);
  await button(page, 'Закрыть').click();
  await expect(page).toHaveURL(/\/import-link$/);
  await expect(preview(page).getByRole('heading', { name: whole.title, exact: true })).toBeVisible();
  // Changed, then closed: "Keep editing" stays, "Discard" goes back.
  await edit(page);
  await field(page, 'Название').fill('Черновик, который не нужен');
  const dialogs: string[] = [];
  page.once('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  await button(page, 'Закрыть').click();
  await expect.poll(() => dialogs).toEqual(['Закрыть без сохранения?\n\nВведённые изменения не сохранятся.']);
  await expect(field(page, 'Название')).toHaveValue('Черновик, который не нужен');
  page.once('dialog', dialog => { dialogs.push(dialog.message()); void dialog.accept(); });
  await button(page, 'Закрыть').click();
  await expect.poll(() => dialogs.length).toBe(2);
  await expect(page).toHaveURL(/\/import-link$/);
  await expect(preview(page).getByRole('heading', { name: whole.title, exact: true })).toBeVisible();
  // The browser's Back (as Android Back) follows the same rule.
  await edit(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/import-link$/);
  await expect(preview(page).getByRole('heading', { name: whole.title, exact: true })).toBeVisible();
  expect(await storage(page)).toEqual(before);
});

test('a reload in the form loses the in-memory draft: back to the import screen, no empty recipe', async ({ page }) => {
  await sites(page, () => ({ body: recipePage(syrniki()) }));
  await openImport(page);
  const before = await book(page);
  await find(page, `${SITE}/syrniki`);
  await button(page, 'Изменить').click();
  await expect(page).toHaveURL(/\/form\?draft=/);
  await page.reload();
  await expect(page).toHaveURL(/\/import-link$/);
  await expect(page.getByText('Рецепт с сайта не сохранился после перезагрузки. Найди его ещё раз.', { exact: true })).toBeVisible();
  expect(await book(page)).toEqual(before);
  // A made-up key is treated the same way.
  await page.goto('/form?draft=nothing-here');
  await expect(page).toHaveURL(/\/import-link$/);
  expect(await book(page)).toEqual(before);
  // After that, import works as usual.
  await find(page, `${SITE}/syrniki`);
  await expect(button(page, 'Добавить в мою книгу')).toBeVisible();
});

test('long ingredients and steps are saved whole, line by line', async ({ page }) => {
  const ingredients = Array.from({ length: 40 }, (_, i) => `Ингредиент ${i + 1} — ${'очень подробное описание количества и подготовки, '.repeat(5).trim()} ${i}`);
  const steps = Array.from({ length: 30 }, (_, i) => `Шаг ${i + 1}: ${'долго и аккуратно перемешивать на медленном огне, не давая пригореть; '.repeat(8).trim()}`);
  await sites(page, () => ({ body: recipePage(syrniki({ recipeIngredient: ingredients, recipeInstructions: steps })) }));
  await openImport(page);
  await find(page, `${SITE}/long`);
  await button(page, 'Изменить').click();
  await button(page, 'Сохранить').click();
  await expect(page).toHaveURL(/\/recipe\/[^/]+$/);
  await expect(page.getByRole('heading', { name: whole.title, exact: true })).toBeVisible();
  const added = (await book(page)).find(recipe => recipe.title === whole.title)!;
  expect(added.ingredients).toEqual(ingredients);
  expect(added.steps).toEqual(steps);
});

test('a manual recipe keeps its rules: an empty time is still 0, and nothing of an earlier draft leaks in', async ({ page }) => {
  await sites(page, () => ({ body: recipePage(syrniki()) }));
  await openImport(page);
  await find(page, `${SITE}/syrniki`);
  await edit(page);
  await button(page, 'Закрыть').click();
  await expect(page).toHaveURL(/\/import-link$/);
  await openHome(page);
  await openNewRecipeForm(page);
  await expect(field(page, 'Название')).toHaveValue('');
  await expect(page.getByText(/Рецепт со страницы/)).toHaveCount(0);
  await field(page, 'Название').fill('Чай');
  await button(page, 'Сохранить').click();
  await expect(page).not.toHaveURL(/\/form/);
  expect((await book(page)).find(recipe => recipe.title === 'Чай')).toMatchObject({ time: 0, ingredients: [], steps: [] });
  // Editing by id is the same as before: the omelet opens with its own values.
  await page.goto(`/form?id=${recipes[0].id}`);
  await expect(field(page, 'Название')).toHaveValue(recipes[0].title);
  await expect(page.getByText(/Рецепт со страницы/)).toHaveCount(0);
});

// New ids come from Date.now() and Math.random(). Right before a save the test can make the next
// ones repeat an existing recipe's id; everything else in the page keeps the real functions.
const NOW = 1_700_000_000_000;
const taken = { id: `${NOW}-0.5`, title: 'Мамин пирог', category: 'Ужин', time: 60, ingredients: ['Мука — 500 г'], steps: ['Испечь.'] };
const stubIds = (page: Page) => page.addInitScript(() => {
  const w = window as unknown as { nextIds?: number; realNow: () => number; realRandom: () => number };
  w.realNow = Date.now.bind(Date); w.realRandom = Math.random.bind(Math);
  // While nextIds > 0, the next Date.now() and Math.random() pair gives "1700000000000-0.5".
  Date.now = () => (w.nextIds ? 1_700_000_000_000 : w.realNow());
  Math.random = () => { if (w.nextIds) { w.nextIds--; return 0.5; } return w.realRandom(); };
});
const collide = (page: Page, times: number) => page.evaluate(n => { (window as unknown as { nextIds: number }).nextIds = n; }, times);

test.describe('a new recipe whose id is already taken', () => {
  test.use({ seedRecipes: [[...recipes, taken], { scope: 'test' }] });

  test('manual creation: the taken recipe is never replaced; a free id is used instead', async ({ page }) => {
    await stubIds(page);
    await openHome(page);
    await openNewRecipeForm(page);
    await field(page, 'Название').fill('Чай');
    await collide(page, 1);
    await button(page, 'Сохранить').click();
    await expect(page).not.toHaveURL(/\/form/);
    const after = await book(page);
    expect(after.find(recipe => recipe.id === taken.id)).toEqual(taken);
    const tea = after.find(recipe => recipe.title === 'Чай')!;
    expect(tea.id).not.toBe(taken.id);
    expect(after).toHaveLength(recipes.length + 2);
  });

  test('manual creation: no free id at all is a controlled error; the book is unchanged', async ({ page }) => {
    await stubIds(page);
    await openHome(page);
    const before = await book(page);
    await openNewRecipeForm(page);
    await field(page, 'Название').fill('Чай');
    await collide(page, 3);
    await button(page, 'Сохранить').click();
    await expect(page.getByRole('alert')).toHaveText('Не удалось создать рецепт: его внутренний номер уже занят. Книга не изменилась — попробуй ещё раз.');
    await expect(page).toHaveURL(/\/form$/);
    await expect(page.getByText('Рецепт сохранён', { exact: true })).toHaveCount(0);
    expect(await book(page)).toEqual(before);
    // Trying again works, under a free id, and the taken recipe is still intact.
    await button(page, 'Сохранить').click();
    await expect(page).not.toHaveURL(/\/form/);
    expect((await book(page)).find(recipe => recipe.id === taken.id)).toEqual(taken);
  });

  test('a recipe from a site, added as is or through the form, never takes over the taken id', async ({ page }) => {
    await stubIds(page);
    await sites(page, url => ({ body: recipePage(url.endsWith('/a') ? syrniki() : syrniki({ name: 'Блины' })) }));
    await openImport(page);
    const before = await book(page);
    await find(page, `${SITE}/a`);
    await collide(page, 3);
    await button(page, 'Добавить в мою книгу').click();
    await expect(preview(page).getByText('Не удалось создать рецепт: его внутренний номер уже занят. Книга не изменилась — попробуй ещё раз.', { exact: true })).toBeVisible();
    expect(await book(page)).toEqual(before);
    await collide(page, 1);
    await button(page, 'Добавить в мою книгу').click();
    // The preview has the same heading: wait for the recipe's own page, i.e. the confirmed save.
    await expect(page).toHaveURL(/\/recipe\/[^/]+$/);
    await expect(page.getByText('Рецепт сохранён', { exact: true })).toBeVisible();
    await openImport(page);
    await find(page, `${SITE}/b`);
    await edit(page);
    await collide(page, 1);
    await button(page, 'Сохранить').click();
    await expect(page.getByRole('heading', { name: 'Блины', exact: true })).toBeVisible();
    const after = await book(page);
    expect(after.find(recipe => recipe.id === taken.id)).toEqual(taken);
    expect(after.filter(recipe => recipe.title === whole.title || recipe.title === 'Блины')).toHaveLength(2);
    expect(new Set(after.map(recipe => recipe.id)).size).toBe(after.length);
    for (const recipe of before) expect(after.find(r => r.id === recipe.id)).toEqual(recipe);
  });
});

test.describe('English, dark theme', () => {
  test.use({ seedSettings: { theme: 'dark', language: 'en', shoppingCompletedBehavior: 'moveDown' } });
  test('add, edit and the time question are in English', async ({ page }) => {
    await sites(page, url => ({ body: recipePage(url.endsWith('/partial') ? syrniki({ name: 'Pancakes', totalTime: undefined }) : syrniki({ name: 'Porridge' })) }));
    await page.goto('/import-link');
    await find(page, `${SITE}/whole`, 'Recipe link', 'Find recipe');
    await expect(preview(page).getByText('The recipe will be added to your book as a new one. Add it now or edit it first.', { exact: true })).toBeVisible();
    await button(page, 'Add to my book').click();
    await expect(page.getByRole('heading', { name: 'Porridge', exact: true })).toBeVisible();
    await page.goto('/import-link');
    await find(page, `${SITE}/partial`, 'Recipe link', 'Find recipe');
    await button(page, 'Edit').click();
    await expect(page.getByText('A recipe from recipes.example. Check it before saving.', { exact: true })).toBeVisible();
    await button(page, 'Save').click();
    await expect(page.getByRole('alert')).toHaveText('The page gave no time. Enter it in minutes — or 0 if it does not matter.');
    await field(page, 'Time, min').fill('20');
    await button(page, 'Save').click();
    await expect(page.getByRole('heading', { name: 'Pancakes', exact: true })).toBeVisible();
  });
});
