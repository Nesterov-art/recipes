import { type Locator, type Page } from '@playwright/test';
import { test, expect, shopping, rows, expectOrder, revealShoppingActions } from './fixtures';

test.use({ seedShopping: [shopping, { scope: 'test' }] });

async function center(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Gesture target has no bounding box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function pointerDrag(page: Page, target: Locator, dx: number, dy: number, hold = 0) {
  const start = await center(target);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // This delay exercises the app's 350 ms long-press recognizer, not page readiness.
  if (hold) await page.waitForTimeout(hold);
  for (let step = 1; step <= 20; step++) {
    await page.mouse.move(start.x + dx * step / 20, start.y + dy * step / 20);
    // Give the gesture recognizer and Reanimated one frame per movement.
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

test('pointer swipe exposes delete and removal survives reload', async ({ page }, testInfo) => {
  await page.goto('/shopping');
  await expectOrder(page, shopping.map(item => item.text));
  const row = rows(page).first();
  await pointerDrag(page, row.getByTestId('shopping-drag'), -160, 0);
  await page.screenshot({ path: testInfo.outputPath('mail-style-swipe.png') });
  await page.getByRole('button', { name: 'Удалить', exact: true }).first().click();
  await expectOrder(page, ['хлеб', 'сыр — 50 г']);
  await expect(page.getByRole('textbox')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1') ?? '[]').length)).toBe(2);
  await page.reload();
  await expectOrder(page, ['хлеб', 'сыр — 50 г']);
});

test('shopping edit keeps a non-zooming input size on mobile web', async ({ page }) => {
  await page.goto('/shopping');
  await revealShoppingActions(page, rows(page).first());
  await page.getByRole('button', { name: 'Изменить', exact: true }).first().click();
  const inputs = page.getByRole('textbox');
  await expect(inputs).toHaveCount(2);
  await expect.poll(() => inputs.nth(1).evaluate(element => parseFloat(getComputedStyle(element).fontSize)))
    .toBeGreaterThanOrEqual(16);
  await inputs.nth(1).fill('молоко — 2 л');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expectOrder(page, shopping.map(item => item.text));
});

test('pointer long press reorders the actual list and saved order', async ({ page }) => {
  await page.goto('/shopping');
  await expectOrder(page, shopping.map(item => item.text));
  const first = await center(rows(page).first().getByTestId('shopping-drag'));
  const last = await center(rows(page).last().getByTestId('shopping-drag'));
  await pointerDrag(page, rows(page).first().getByTestId('shopping-drag'), 0, last.y - first.y + 10, 450);
  await expectOrder(page, ['хлеб', 'сыр — 50 г', 'молоко — 1 л']);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1') ?? '[]').map((item: { id: string }) => item.id))).toEqual(['e2e-bread', 'e2e-cheese', 'e2e-milk']);
  await page.reload();
  await expectOrder(page, ['хлеб', 'сыр — 50 г', 'молоко — 1 л']);
});

test('Chromium touch input: swipe opens delete and touch removes the item', async ({ page, context, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || !isMobile, 'Continuous trusted touch input uses Chromium CDP; other projects test pointer gestures.');
  await page.goto('/shopping');
  await expectOrder(page, shopping.map(item => item.text));
  const session = await context.newCDPSession(page);
  async function touchDrag(target: Locator, dx: number, dy: number, hold = 0) {
    const start = await center(target);
    const point = (x: number, y: number) => [{ x, y, id: 0, radiusX: 1, radiusY: 1, force: 1 }];
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(start.x, start.y) });
    if (hold) await page.waitForTimeout(hold);
    for (let step = 1; step <= 20; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(start.x + dx * step / 20, start.y + dy * step / 20) });
      await page.waitForTimeout(16);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const row = rows(page).first();
  const dragStartX = (await row.getByTestId('shopping-drag').boundingBox())!.x;
  await touchDrag(row.getByTestId('shopping-drag'), -160, 0);
  const deleteButton = page.getByRole('button', { name: 'Удалить', exact: true }).first();
  const actionsWidth = (await page.getByTestId('shopping-swipe-actions').first().boundingBox())!.width;
  await expect.poll(async () => Math.round((await row.getByTestId('shopping-drag').boundingBox())!.x))
    .toBe(Math.round(dragStartX - actionsWidth));
  await deleteButton.tap();
  await expectOrder(page, ['хлеб', 'сыр — 50 г']);
  await expect(page.getByRole('textbox')).toHaveCount(1);
  await session.detach();
});

test('Chromium touch input: long press reorder is a known failure', async ({ page, context, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || !isMobile, 'Continuous trusted touch input uses Chromium CDP.');
  await page.goto('/shopping');
  await expectOrder(page, shopping.map(item => item.text));
  const session = await context.newCDPSession(page);
  const start = await center(rows(page).first().getByTestId('shopping-drag'));
  const end = await center(rows(page).last().getByTestId('shopping-drag'));
  const point = (y: number) => [{ x: start.x, y, id: 0, radiusX: 1, radiusY: 1, force: 1 }];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(start.y) });
  await page.waitForTimeout(450);
  for (let step = 1; step <= 20; step++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(start.y + (end.y - start.y + 10) * step / 20) });
    await page.waitForTimeout(16);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  test.fail(true, 'Known RN Web trusted-touch long-press failure; pointer reorder works. Needs a separate app fix and iPhone verification.');
  await expectOrder(page, ['хлеб', 'сыр — 50 г', 'молоко — 1 л']);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1') ?? '[]').map((item: { id: string }) => item.id))).toEqual(['e2e-bread', 'e2e-cheese', 'e2e-milk']);
  await page.reload();
  await expectOrder(page, ['хлеб', 'сыр — 50 г', 'молоко — 1 л']);
  await session.detach();
});
