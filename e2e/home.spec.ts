import type { Page } from '@playwright/test';
import type { Recipe } from '../src/constants/recipes';
import { test, expect, openHome, recipes } from './fixtures';

const cards = (page: Page) => page.getByRole('button', { name: /^Открыть рецепт / });
const longTitle = 'Очень длинное название домашнего рецепта, которое не помещается в одну строку на узком экране телефона';
const manyRecipes: Recipe[] = [
  ...recipes,
  { id: 'e2e-long', title: longTitle, category: 'Ужин', time: 95, ingredients: ['Мука — 200 г', 'Вода — 100 мл', 'Соль'], steps: ['Смешать.'] },
  { id: 'e2e-quick', title: 'Бутерброд', category: null, time: 5, ingredients: ['Хлеб'], steps: [] },
];

test.describe('empty collection', () => {
  test.use({ seedRecipes: [] });
  test('explains the empty book and offers the existing add-recipe flow', async ({ page }) => {
    await openHome(page);
    await expect(page.getByRole('heading', { name: 'Monorec', exact: true })).toBeVisible();
    await expect(page.getByText('Пока нет рецептов', { exact: true })).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Добавить первый рецепт', exact: true }).click();
    await expect(page.getByPlaceholder('Название рецепта', { exact: true })).toBeVisible();
  });
});

test.describe('single recipe', () => {
  test.use({ seedRecipes: [[recipes[0]], { scope: 'test' }] });
  test('shows one card with category, ingredient count and time', async ({ page }) => {
    await openHome(page);
    await expect(cards(page)).toHaveCount(1);
    const card = cards(page).first();
    await expect(card).toContainText('Омлет с сыром');
    await expect(card).toContainText('Завтрак · 2 ингредиента');
    await expect(card).toContainText('10 мин');
    await expect(page.getByRole('heading', { name: 'Все рецепты', exact: true })).toBeVisible();
  });
});

test.describe('several recipes with a long title', () => {
  test.use({ seedRecipes: [manyRecipes, { scope: 'test' }] });
  test('lists every recipe, wraps long titles to two lines and keeps sorting', async ({ page }) => {
    await openHome(page);
    await expect(cards(page)).toHaveCount(4);
    const title = page.getByText(longTitle, { exact: true });
    const lineHeight = await title.evaluate(element => parseFloat(getComputedStyle(element).lineHeight));
    const height = (await title.boundingBox())!.height;
    // Phones wrap the title; no width shows more than two lines.
    if (page.viewportSize()!.width < 600) expect(height).toBeGreaterThan(lineHeight * 1.5);
    expect(height).toBeLessThanOrEqual(lineHeight * 2 + 1);
    await expect(cards(page).filter({ hasText: 'Бутерброд' })).toContainText('1 ингредиент');

    const sort = page.getByRole('button', { name: 'Изменить сортировку', exact: true });
    await expect(sort).toContainText('Сначала новые');
    await sort.click();
    await expect(sort).toContainText('А–Я');
    await expect(cards(page).first()).toHaveAccessibleName('Открыть рецепт Бутерброд');
    await sort.click();
    await expect(sort).toContainText('Я–А');
    await expect(cards(page).first()).toHaveAccessibleName('Открыть рецепт Томатный суп');
    await sort.click();
    await expect(sort).toContainText('Сначала новые');
  });
});

test('favourites show a heart and the empty favourites filter offers to show all', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: 'Любимые', exact: true }).click();
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByText('Нет рецептов в этом фильтре', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Показать все', exact: true }).click();
  await expect(cards(page)).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Все', exact: true })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить в любимое', exact: true }).click();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await page.getByRole('button', { name: 'Любимые', exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Найдено: 1', exact: true })).toBeVisible();
});

test('search keeps its algorithm, can be cleared and explains an empty result', async ({ page }) => {
  await openHome(page);
  const search = page.getByRole('textbox', { name: 'Поиск рецептов', exact: true });
  await search.fill('томаты');
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Найдено: 1', exact: true })).toBeVisible();
  await search.fill('сыр томаты');
  await expect(page.getByText('Ничего не нашлось', { exact: true })).toBeVisible();
  // Two exits: the clear button in the field and the empty-state action.
  await page.getByRole('button', { name: 'Очистить поиск', exact: true }).first().click();
  await expect(search).toHaveValue('');
  await expect(cards(page)).toHaveCount(2);
  await search.fill('нет такого');
  await page.getByText('Ничего не нашлось', { exact: true }).locator('..').getByRole('button', { name: 'Очистить поиск', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Все рецепты', exact: true })).toBeVisible();
});

test.describe('English, dark theme', () => {
  test.use({ seedSettings: { theme: 'dark', language: 'en', shoppingCompletedBehavior: 'moveDown' } });
  test('home is translated and uses the dark Monorec palette', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Monorec', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'All recipes', exact: true })).toBeVisible();
    const card = page.getByRole('button', { name: 'Open recipe Омлет с сыром', exact: true });
    await expect(card).toContainText('2 ingredients');
    await expect.poll(() => card.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(28, 28, 30)');
    await page.getByRole('button', { name: 'Favorites', exact: true }).click();
    await expect(page.getByText('No recipes in this filter', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show all', exact: true })).toBeVisible();
  });
});

const thirtyRecipes: Recipe[] = Array.from({ length: 30 }, (_, index) => ({
  id: `e2e-many-${index}`, title: `Рецепт номер ${index + 1}`, category: 'Обед', time: 10 + index, ingredients: ['Вода'], steps: [],
}));

for (const large of [false, true]) {
  test.describe(`long list, ${large ? 'large' : 'standard'} text`, () => {
    test.use({ viewport: { width: 320, height: 640 }, seedRecipes: [thirtyRecipes, { scope: 'test' }] });
    test('the last recipe ends fully above the fixed bar and can be tapped', async ({ page }) => {
      await openHome(page);
      if (large) await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
      const last = page.getByRole('button', { name: 'Открыть рецепт Рецепт номер 30', exact: true });
      // FlatList renders more rows while scrolling; scroll until the end is stable.
      await expect.poll(async () => {
        await page.evaluate(() => {
          for (const element of document.querySelectorAll<HTMLElement>('div')) {
            if (['auto', 'scroll'].includes(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) {
              element.scrollTop = element.scrollHeight;
            }
          }
        });
        const box = await last.boundingBox();
        const bar = await page.getByRole('button', { name: 'Что приготовить?', exact: true }).boundingBox();
        return !!box && !!bar && box.y >= 0 && box.y + box.height <= bar.y;
      }).toBe(true);
      await last.click();
      await expect(page).toHaveURL(/\/recipe\/e2e-many-29$/);
    });
  });
}

test.describe('long list with the search keyboard open', () => {
  test.use({ viewport: { width: 320, height: 640 }, seedRecipes: [thirtyRecipes, { scope: 'test' }] });
  test('the last recipe still scrolls fully into the reduced viewport', async ({ page }) => {
    await openHome(page);
    await page.getByRole('textbox', { name: 'Поиск рецептов', exact: true }).focus();
    // Browser model of the keyboard only; the native keyboard inset needs a device check.
    await page.setViewportSize({ width: 320, height: 360 });
    await expect(page.getByRole('button', { name: 'Что приготовить?', exact: true })).toBeHidden();
    const last = page.getByRole('button', { name: 'Открыть рецепт Рецепт номер 30', exact: true });
    await expect.poll(async () => {
      await page.evaluate(() => {
        for (const element of document.querySelectorAll<HTMLElement>('div')) {
          if (['auto', 'scroll'].includes(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) {
            element.scrollTop = element.scrollHeight;
          }
        }
      });
      const box = await last.boundingBox();
      return !!box && box.y >= 0 && box.y + box.height <= 360;
    }).toBe(true);
  });
});

test.describe('narrow screen with large text', () => {
  test.use({ viewport: { width: 320, height: 640 }, seedRecipes: [manyRecipes, { scope: 'test' }] });
  test('home fits 320 px, moves time into metadata and keeps actions reachable', async ({ page }) => {
    await openHome(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
    const card = page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true });
    await expect(card).toContainText('Завтрак · 2 ингредиента · 10 мин');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // The app name never breaks inside the word.
    const heading = page.getByRole('heading', { name: 'Monorec', exact: true });
    const headingLine = await heading.evaluate(element => parseFloat(getComputedStyle(element).lineHeight));
    expect((await heading.boundingBox())!.height).toBeLessThanOrEqual(headingLine + 1);
    // The main action grows with its text instead of letting it overflow.
    const random = page.getByRole('button', { name: 'Что приготовить?', exact: true });
    const label = await random.getByText('Что приготовить?', { exact: true }).boundingBox();
    const button = await random.boundingBox();
    expect(label!.y).toBeGreaterThanOrEqual(button!.y);
    expect(label!.y + label!.height).toBeLessThanOrEqual(button!.y + button!.height);
    for (const name of ['Открыть список покупок', 'Настройки', 'Изменить сортировку', 'Что приготовить?', 'Добавить рецепт']) {
      const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      expect(box.height).toBeGreaterThanOrEqual(36);
    }
    const last = page.getByRole('button', { name: 'Открыть рецепт Бутерброд', exact: true });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });
});
