import type { Page } from '@playwright/test';
import { test, expect, recipes } from './fixtures';

const omelet = recipes[0];
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const cookings = (page: Page, id = omelet.id) => page.evaluate(
  recipeId => (JSON.parse(localStorage.getItem('recipe-book-v1')!).recipeMeta[recipeId]?.cookings ?? []) as { rating?: string; note?: string }[],
  id,
);

async function openRecipe(page: Page, id = omelet.id) {
  await page.goto(`/recipe/${id}`);
  await expect(button(page, 'Начать готовить')).toBeVisible();
  // Let the existing first-run migration of the seeded legacy keys finish.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('recipe-book-v1'))).not.toBeNull();
}

async function startCooking(page: Page, id = omelet.id) {
  await openRecipe(page, id);
  await button(page, 'Начать готовить').click();
  await expect(page).toHaveURL(new RegExp(`/cooking\\?id=${id}$`));
}

async function finish(page: Page) {
  for (let i = 1; i < omelet.steps.length; i++) await button(page, 'Следующий шаг').click();
  await button(page, 'Завершить').click();
  await expect(page.getByTestId('cooking-done')).toBeVisible();
}

test('steps go forward and back one at a time; finishing alone records nothing', async ({ page }) => {
  await startCooking(page);
  await expect(page.getByTestId('cooking-dish')).toHaveText('Омлет с сыром');
  await expect(page.getByText('01 / 02', { exact: true })).toBeVisible();
  await expect(page.getByTestId('cooking-step')).toHaveText(omelet.steps[0]);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  // Back on the first step does not move.
  await expect(button(page, 'Назад')).toBeDisabled();

  await button(page, 'Следующий шаг').click();
  await expect(page.getByText('02 / 02', { exact: true })).toBeVisible();
  await expect(page.getByTestId('cooking-step')).toHaveText(omelet.steps[1]);
  await expect(button(page, 'Следующий шаг')).toHaveCount(0);
  await button(page, 'Назад').click();
  await expect(page.getByTestId('cooking-step')).toHaveText(omelet.steps[0]);

  await button(page, 'Следующий шаг').click();
  await button(page, 'Завершить').click();
  await expect(page.getByRole('heading', { name: 'Отлично получилось!', exact: true })).toBeVisible();
  await expect(page.getByTestId('cooking-done').getByText('10 мин', { exact: true })).toBeVisible();
  await button(page, 'К рецепту').click();
  await expect(page).toHaveURL(new RegExp(`/recipe/${omelet.id}$`));
  expect(await cookings(page)).toHaveLength(0);

  // Opening the mode again after finishing starts over from the first step.
  await button(page, 'Начать готовить').click();
  await expect(page.getByText('01 / 02', { exact: true })).toBeVisible();
  await expect(page.getByTestId('cooking-step')).toHaveText(omelet.steps[0]);
});

test('closing the mode or going back never records a cooking', async ({ page }) => {
  await startCooking(page);
  await button(page, 'Следующий шаг').click();
  await button(page, 'Закрыть готовку').click();
  await expect(page).toHaveURL(new RegExp(`/recipe/${omelet.id}$`));
  await button(page, 'Начать готовить').click();
  await expect(page).toHaveURL(/\/cooking\?/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/recipe/${omelet.id}$`));
  expect(await cookings(page)).toHaveLength(0);
});

test('leaving the finish screen with a written note records nothing', async ({ page }) => {
  await startCooking(page);
  await finish(page);
  await page.getByPlaceholder('Заметка о приготовлении', { exact: true }).fill('Не сохранять');
  await button(page, 'К рецепту').click();
  await expect(page).toHaveURL(new RegExp(`/recipe/${omelet.id}$`));
  await button(page, 'Начать готовить').click();
  await finish(page);
  await button(page, 'Закрыть готовку').click();
  await expect(page).toHaveURL(new RegExp(`/recipe/${omelet.id}$`));
  expect(await cookings(page)).toHaveLength(0);
});

test('saving from the finish screen records exactly one cooking with the note', async ({ page }) => {
  await startCooking(page);
  await finish(page);
  // No rating is asked for any more.
  await expect(page.getByRole('button', { name: /Отлично$/ })).toHaveCount(0);
  await page.getByPlaceholder('Заметка о приготовлении', { exact: true }).fill('Добавить зелень');
  // Repeated presses still save once.
  await button(page, 'Записать в историю').evaluate(element => {
    (element as HTMLElement).click();
    (element as HTMLElement).click();
  });
  await expect(page).toHaveURL(new RegExp(`/recipe/${omelet.id}$`));
  await expect(page.getByText('Приготовление сохранено', { exact: true })).toBeVisible();
  await expect.poll(() => cookings(page)).toHaveLength(1);
  expect((await cookings(page))[0]).toMatchObject({ note: 'Добавить зелень' });
  expect((await cookings(page))[0]).not.toHaveProperty('rating');
  await page.reload();
  await expect(button(page, 'Начать готовить')).toBeVisible();
  expect(await cookings(page)).toHaveLength(1);
});

test('the note stays optional', async ({ page }) => {
  await startCooking(page);
  await finish(page);
  await button(page, 'Записать в историю').click();
  await expect(page).toHaveURL(new RegExp(`/recipe/${omelet.id}$`));
  await expect.poll(() => cookings(page)).toHaveLength(1);
  expect((await cookings(page))[0]).not.toHaveProperty('note');
});

test('a recipe with steps records cookings only through step-by-step cooking', async ({ page }) => {
  await openRecipe(page);
  await expect(button(page, 'Начать готовить')).toBeVisible();
  await expect(button(page, 'Я приготовил')).toHaveCount(0);
  // The former rating screen is gone for good.
  await page.goto(`/cook?id=${omelet.id}`);
  await expect(page.getByPlaceholder('Заметка о приготовлении', { exact: true })).toHaveCount(0);
  expect(await cookings(page)).toHaveLength(0);
});

test.describe('older ratings', () => {
  test.use({ seedRecipes: [[omelet], { scope: 'test' }] });
  test('stay stored but are not shown', async ({ page }) => {
    await openRecipe(page);
    // Give the stored history an older rated entry, as earlier versions wrote it.
    await page.evaluate(id => {
      const book = JSON.parse(localStorage.getItem('recipe-book-v1')!);
      book.recipeMeta[id] = { favorite: false, cookings: [{ id: 'old', cookedAt: '2026-10-01T09:00:00.000Z', rating: 'great', note: 'Старая заметка' }] };
      localStorage.setItem('recipe-book-v1', JSON.stringify(book));
    }, omelet.id);
    await page.reload();
    await expect(page.getByText('«Старая заметка»', { exact: true })).toBeVisible();
    await expect(page.getByText('Последняя оценка', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Открыть историю приготовлений', exact: true }).click();
    await expect(page).toHaveURL(/\/history\?id=/);
    // The recipe stays rendered under the history, so the note appears twice.
    await expect(page.getByText('«Старая заметка»', { exact: true }).last()).toBeVisible();
    await expect(page.getByText(/Отлично/)).toHaveCount(0);
    expect((await cookings(page))[0]).toMatchObject({ rating: 'great' });
  });
});

const longStep = Array.from({ length: 12 }, () => 'Помешивай на среднем огне, пока соус не загустеет и не станет блестящим.').join(' ');
const special = [
  { id: 'one-step', title: 'Тосты', category: null, time: 5, ingredients: [], steps: ['Подсуши хлеб.'] },
  { id: 'many-steps', title: 'Долгое блюдо', category: null, time: 120, ingredients: [],
    steps: [longStep, ...Array.from({ length: 19 }, (_, i) => `Шаг ${i + 2}.`)] },
  { id: 'no-steps', title: 'Без шагов', category: null, time: 10, ingredients: [], steps: ['', '   '] },
];

test.describe('special recipes', () => {
  test.use({ seedRecipes: [special, { scope: 'test' }] });

  test('a single step finishes right away', async ({ page }) => {
    await startCooking(page, 'one-step');
    await expect(page.getByText('01 / 01', { exact: true })).toBeVisible();
    await expect(button(page, 'Назад')).toBeDisabled();
    await button(page, 'Завершить').click();
    await expect(page.getByTestId('cooking-done')).toBeVisible();
    expect(await cookings(page, 'one-step')).toHaveLength(0);
  });

  test('many steps and a long instruction scroll above the fixed actions', async ({ page }) => {
    await startCooking(page, 'many-steps');
    await expect(page.getByText('01 / 20', { exact: true })).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '20');
    const next = button(page, 'Следующий шаг');
    const viewport = page.viewportSize()!;
    const box = (await next.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.height).toBeGreaterThanOrEqual(44);
    // The end of the long text can be scrolled into view above the actions.
    const step = page.getByTestId('cooking-step');
    await step.evaluate(element => element.scrollIntoView({ block: 'end' }));
    await expect.poll(async () => {
      const text = (await step.boundingBox())!; const action = (await next.boundingBox())!;
      return text.y + text.height <= action.y;
    }).toBe(true);
    for (let i = 2; i <= 20; i++) await next.click();
    await expect(button(page, 'Завершить')).toBeVisible();
    await expect(page.getByText('20 / 20', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('a recipe without usable steps offers no cooking mode and a direct link is safe', async ({ page }) => {
    await page.goto('/recipe/no-steps');
    await expect(button(page, 'Удалить рецепт')).toBeVisible();
    await expect(button(page, 'Начать готовить')).toHaveCount(0);
    // Without steps there is no finish screen, so "I cooked this" records one cooking right away.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('recipe-book-v1'))).not.toBeNull();
    await button(page, 'Я приготовил').evaluate(element => {
      (element as HTMLElement).click();
      (element as HTMLElement).click();
    });
    await expect(page.getByText('Готовили: 1 раз', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/recipe\/no-steps$/);
    await expect.poll(() => cookings(page, 'no-steps')).toHaveLength(1);
    expect((await cookings(page, 'no-steps'))[0]).not.toHaveProperty('rating');
    await page.goto('/cooking?id=no-steps');
    await expect(page.getByText('Шагов пока нет', { exact: true })).toBeVisible();
    await button(page, 'К рецепту').click();
    await expect(page).toHaveURL(/\/recipe\/no-steps$/);
    await page.goto('/cooking?id=missing');
    await expect(page.getByText('Рецепт не найден', { exact: true })).toBeVisible();
    await expect(button(page, 'Закрыть')).toBeVisible();
  });
});

test.describe('English, dark theme', () => {
  test.use({ seedSettings: { language: 'en', theme: 'dark', shoppingCompletedBehavior: 'keep' } });
  test('the cooking mode is translated', async ({ page }) => {
    await page.goto(`/cooking?id=${omelet.id}`);
    await expect(page.getByText('Step 1 of 2', { exact: true })).toBeVisible();
    await button(page, 'Next step').click();
    await button(page, 'Finish').click();
    await expect(page.getByRole('heading', { name: 'Well done!', exact: true })).toBeVisible();
    await expect(button(page, 'Save to history')).toBeVisible();
  });
});

test.describe('narrow screen with large text', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test('the step and both actions stay usable', async ({ page }) => {
    await startCooking(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
    const next = button(page, 'Следующий шаг');
    await expect(next).toBeVisible();
    const box = (await next.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(640);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await next.click();
    await expect(page.getByText('02 / 02', { exact: true })).toBeVisible();
  });
});
