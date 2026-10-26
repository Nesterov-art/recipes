import type { Locator, Page } from '@playwright/test';
import { test, expect, openHome, shopping } from './fixtures';

// React Native Web's keyboardDismissMode="on-drag" blurred the focused field on any
// scroll event, so a scroll that landed just after focus dropped the typed text.
// Scroll the screen's own ScrollView and focus the field in the same task: the
// scroll event then always arrives after focus, which is the failing order.
async function focusWhileScrolling(input: Locator) {
  await input.evaluate(element => {
    let node = element.parentElement;
    while (node && !(node.scrollHeight > node.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(node).overflowY))) {
      node = node.parentElement;
    }
    if (!node) throw new Error('The field is not inside a scrollable container');
    node.scrollTop = node.scrollTop > 0 ? 0 : node.scrollHeight;
    (element as HTMLElement).focus({ preventScroll: true });
  });
}

async function expectTypingSurvivesScroll(page: Page, input: Locator, text: string) {
  await focusWhileScrolling(input);
  await page.keyboard.type(text);
  // Longer than the scroll handlers' deferred work.
  await page.waitForTimeout(400);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(text);
}

test.use({ viewport: { width: 390, height: 480 } });

test('recipe form keeps focus and text after a scroll, and saving stays reachable', async ({ page }) => {
  await page.goto('/form');
  const title = page.getByPlaceholder('Название рецепта', { exact: true });
  await expectTypingSurvivesScroll(page, title, 'Борщ');
  const time = page.getByPlaceholder('15', { exact: true });
  await expectTypingSurvivesScroll(page, time, '45');
  await expect(title).toHaveValue('Борщ');

  const save = page.getByRole('button', { name: 'Сохранить', exact: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await save.click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!).recipes
    .find((recipe: { title: string }) => recipe.title === 'Борщ')?.time)).toBe(45);
});

test('home search keeps focus and query after a scroll', async ({ page }) => {
  await openHome(page);
  const search = page.getByRole('textbox', { name: 'Поиск рецептов', exact: true });
  await expectTypingSurvivesScroll(page, search, 'сыр');
  await expect(page.getByRole('button', { name: /^Открыть рецепт / })).toHaveCount(1);
});

test.describe('long shopping list', () => {
  test.use({ seedShopping: [Array.from({ length: 12 }, (_, index) => ({ ...shopping[1], id: `e2e-item-${index}`, name: `товар ${index}`, text: `товар ${index}` })), { scope: 'test' }] });
  test('shopping input keeps focus and text after a scroll', async ({ page }) => {
    await page.goto('/shopping');
    const input = page.getByPlaceholder('Добавить продукт', { exact: true });
    await expectTypingSurvivesScroll(page, input, 'Яйца — 2 шт.');
  });
});

test('cooking note keeps focus and text after a scroll', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true }).click();
  await page.getByRole('button', { name: 'Начать готовить', exact: true }).click();
  await page.getByRole('button', { name: 'Следующий шаг', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  const note = page.getByPlaceholder('Заметка о приготовлении', { exact: true });
  await expectTypingSurvivesScroll(page, note, 'Меньше соли');
});
