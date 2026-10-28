import { test, expect, openHome, openNewRecipeForm } from './fixtures';

const longRecipe = {
  id: 'long-recipe', title: 'Длинный рецепт', category: null, time: 30,
  ingredients: Array.from({ length: 40 }, (_, i) => `Ингредиент ${i + 1}`),
  steps: Array.from({ length: 20 }, (_, i) => `Шаг ${i + 1}: приготовить и проверить результат.`),
};
const longShopping = Array.from({ length: 45 }, (_, i) => ({ id: `long-${i}`, name: `Продукт ${i + 1}`, text: `Продукт ${i + 1}`, checked: false }));

async function scrollToEnd(page: import('@playwright/test').Page) {
  // Scroll the actual bounded RN Web scroll container, not the locked body.
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>('div')) {
      if (['auto', 'scroll'].includes(getComputedStyle(element).overflowY)
        && element.clientHeight > 0 && element.scrollHeight > element.clientHeight) {
        element.scrollTop = element.scrollHeight;
      }
    }
  });
}

test.describe('long content and fixed actions', () => {
  test.use({ seedRecipes: [[longRecipe, { ...longRecipe, id: 'other', title: 'Другой длинный рецепт' }], { scope: 'test' }] });

  test('a long recipe scrolls fully to its last action inside the viewport', async ({ page }) => {
    // Random picks moved to the Choice tab; the recipe has no fixed "Another option" bar.
    await page.goto('/recipe/long-recipe');
    await expect(page.getByRole('button', { name: 'Другой вариант', exact: true })).toHaveCount(0);
    const finalAction = page.getByRole('button', { name: 'Удалить рецепт', exact: true });
    await expect.poll(async () => {
      await scrollToEnd(page);
      const last = await finalAction.boundingBox();
      return !!last && last.y + last.height <= page.viewportSize()!.height;
    }).toBe(true);
    await expect(page.getByText(longRecipe.steps.at(-1)!, { exact: true })).toBeVisible();
  });

  test('form save remains reachable when web keyboard reduces the viewport', async ({ page }) => {
    await openHome(page);
    await openNewRecipeForm(page);
    await page.getByPlaceholder('Название рецепта', { exact: true }).fill('Проверка клавиатуры');
    const steps = page.getByPlaceholder('Шаги приготовления', { exact: true });
    await steps.fill(Array.from({ length: 18 }, (_, i) => `Длинный шаг ${i + 1}`).join('\n'));
    await steps.focus();
    const original = page.viewportSize()!;
    // Browser model only; native keyboard/IME and iOS pan need device testing.
    await page.setViewportSize({ width: original.width, height: 360 });
    await scrollToEnd(page);
    const save = page.getByRole('button', { name: 'Сохранить', exact: true });
    await expect(save).toBeVisible();
    await expect.poll(async () => {
      await scrollToEnd(page);
      const box = await save.boundingBox();
      return !!box && box.y >= 0 && box.y + box.height <= 360;
    }).toBe(true);
    await save.click();
    await page.setViewportSize(original);
    // The book stays mounted under the form, so the new card alone does not prove the
    // form closed. Reloading before navigation finished would reload /form.
    await expect(page).toHaveURL(/\/recipes$/);
    await expect(page.getByRole('button', { name: 'Открыть рецепт Проверка клавиатуры', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Открыть рецепт Проверка клавиатуры', exact: true })).toBeVisible();
  });
});

test.describe('long shopping list', () => {
  test.use({ seedShopping: [longShopping, { scope: 'test' }] });
  test('last card is fully reachable and navigation preserves the list', async ({ page }) => {
    await openHome(page);
    await page.getByRole('tab', { name: 'Покупки', exact: true }).click();
    await scrollToEnd(page);
    const last = page.getByRole('checkbox', { name: 'Продукт 45', exact: true });
    await expect(last).toBeVisible();
    await expect.poll(async () => {
      await scrollToEnd(page);
      const box = await last.boundingBox();
      return !!box && box.y >= 0 && box.y + box.height <= page.viewportSize()!.height;
    }).toBe(true);
    await page.goBack();
    await expect(page.getByRole('tab', { name: 'Покупки', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Покупки', exact: true }).click();
    await scrollToEnd(page);
    await expect(page.getByRole('checkbox', { name: 'Продукт 45', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1')!).length)).toBe(45);
  });

  test('trusted touch scroll stays natural; held drag autoscrolls and saves the new order', async ({ page, context, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || !isMobile, 'Trusted continuous touch requires mobile Chromium CDP; real iPhone remains a manual check.');
    await page.goto('/shopping');
    const first = page.getByTestId('shopping-drag').first();
    await expect(first).toBeVisible();
    const session = await context.newCDPSession(page);
    const points = (x: number, y: number) => [{ x, y, id: 0, radiusX: 1, radiusY: 1, force: 1 }];
    const box = (await first.boundingBox())!;
    const x = box.x + box.width / 2; const startY = box.y + box.height / 2;
    // Move immediately, without long press: this must scroll, not reorder.
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(x, startY) });
    for (let i = 1; i <= 10; i++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(x, startY - i * 15) });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const scrollOffset = () => page.evaluate(() => Math.max(...Array.from(document.querySelectorAll('div'), el => el.scrollTop)));
    await expect.poll(scrollOffset).toBeGreaterThan(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1')!))).toEqual(longShopping);
    await page.reload();
    await expect(first).toBeVisible();
    const originalBox = (await first.boundingBox())!;
    const y = originalBox.y + originalBox.height / 2;
    const edge = page.viewportSize()!.height - 35;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(x, y) });
    await page.waitForTimeout(450); // Exercises the 350 ms app long press.
    for (let i = 1; i <= 20; i++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(x, y + (edge - y) * i / 20) });
      await page.waitForTimeout(16);
    }
    await expect.poll(scrollOffset).toBeGreaterThan(120);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1')!).findIndex((item: { id: string }) => item.id === 'long-0'))).toBeGreaterThan(1);
    const saved = await page.evaluate(() => localStorage.getItem('shopping-list-v1'));
    await page.reload(); await expect(first).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('shopping-list-v1'))).toBe(saved);
    await session.detach();
  });
});

test('back navigation retains the current search/filter state', async ({ page }) => {
  await openHome(page);
  const search = page.getByRole('textbox', { name: 'Поиск рецептов', exact: true });
  await search.fill('сыр'); await search.blur();
  await page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true }).click();
  // Expo Router 58 commits navigation after the current render, so wait for the
  // recipe to open before going back.
  await expect(page).toHaveURL(/\/recipe\/e2e-omelet$/);
  await page.goBack();
  await expect(search).toHaveValue('сыр');
  await expect(page.getByRole('button', { name: /^Открыть рецепт / })).toHaveCount(1);
});
