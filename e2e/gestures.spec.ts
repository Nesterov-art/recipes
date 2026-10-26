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

// Open actions narrow the card content; closed, it spans the whole card again.
async function contentWidth(row: Locator) {
  return Math.round((await row.getByTestId('shopping-drag').boundingBox())!.width);
}

test('open actions close by swiping back, opening another card, tapping elsewhere or scrolling', async ({ page }) => {
  await page.goto('/shopping');
  const [milk, bread] = [rows(page).nth(0), rows(page).nth(1)];
  const closed = await contentWidth(milk);
  const opened = async (row: Locator) => (await contentWidth(row)) < closed - 60;

  await pointerDrag(page, milk.getByTestId('shopping-drag'), -160, 0);
  await expect.poll(() => opened(milk)).toBe(true);
  // A swipe to the right closes it.
  await pointerDrag(page, milk.getByTestId('shopping-drag'), 160, 0);
  await expect.poll(() => contentWidth(milk)).toBe(closed);

  // Opening another card closes the previous one.
  await pointerDrag(page, milk.getByTestId('shopping-drag'), -160, 0);
  await expect.poll(() => opened(milk)).toBe(true);
  await pointerDrag(page, bread.getByTestId('shopping-drag'), -160, 0);
  await expect.poll(() => opened(bread)).toBe(true);
  await expect.poll(() => contentWidth(milk)).toBe(closed);

  // A tap outside the cards closes it and changes nothing.
  await page.getByRole('heading', { name: 'Список покупок', exact: true }).click();
  await expect.poll(() => contentWidth(bread)).toBe(closed);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1')!))).toEqual(shopping);

  // Tapping the open card itself closes it without toggling the item.
  await pointerDrag(page, milk.getByTestId('shopping-drag'), -160, 0);
  await expect.poll(() => opened(milk)).toBe(true);
  await milk.getByTestId('shopping-drag').click();
  await expect.poll(() => contentWidth(milk)).toBe(closed);
  await expect(milk.getByRole('checkbox')).not.toBeChecked();
});

test('keyboard focus on an action opens its card', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Keyboard navigation is a desktop path; mobile uses the swipe or the screen reader actions.');
  await page.goto('/shopping');
  const milk = rows(page).first();
  const closed = await contentWidth(milk);
  await page.getByRole('button', { name: 'Изменить', exact: true }).first().focus();
  await expect.poll(async () => (await contentWidth(milk)) < closed - 60).toBe(true);
  await page.keyboard.press('Enter');
  await expect(milk.getByRole('textbox')).toBeVisible();
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

test('cancelled swipe leaves data intact and checkbox still saves', async ({ page }) => {
  await page.goto('/shopping');
  await expectOrder(page, shopping.map(item => item.text));
  await pointerDrag(page, rows(page).first().getByTestId('shopping-drag'), -20, 0);
  await expectOrder(page, shopping.map(item => item.text));
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1')!))).toEqual(shopping);
  const checkbox = page.getByRole('checkbox', { name: 'молоко — 1 л', exact: true });
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1')!)[0].checked)).toBe(true);
  await page.reload();
  await expect(checkbox).toBeChecked();
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
  const nameStartX = (await row.getByText('молоко', { exact: true }).boundingBox())!.x;
  await touchDrag(row.getByTestId('shopping-drag'), -160, 0);
  const deleteButton = page.getByRole('button', { name: 'Удалить', exact: true }).first();
  const actions = page.getByTestId('shopping-swipe-actions').first();
  // The card makes room for the actions: the name stays in place and the amount
  // moves to just before the actions instead of sliding out of sight.
  await expect.poll(async () => {
    const amount = (await row.getByText('1 л', { exact: true }).boundingBox())!;
    const actionsBox = (await actions.boundingBox())!;
    return amount.x + amount.width <= actionsBox.x;
  }).toBe(true);
  expect(Math.round((await row.getByText('молоко', { exact: true }).boundingBox())!.x)).toBe(Math.round(nameStartX));
  // Compact actions: two 48 px targets, not a wide empty panel.
  const actionsBox = (await actions.boundingBox())!;
  expect(actionsBox.width).toBeLessThanOrEqual(112);
  for (const name of ['Изменить', 'Удалить']) {
    const box = (await page.getByRole('button', { name, exact: true }).first().boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await deleteButton.tap();
  await expectOrder(page, ['хлеб', 'сыр — 50 г']);
  await expect(page.getByRole('textbox')).toHaveCount(1);
  await session.detach();
});

test.describe('reorder motion', () => {
  const six = [...shopping, ...['яйца', 'масло', 'рис'].map((text, index) => ({
    id: `e2e-extra-${index}`, name: text, text, checked: false,
  }))];
  // Animations on, as on a phone, so the frames show what a person sees.
  test.use({ seedShopping: [six, { scope: 'test' }], reducedMotion: 'no-preference' });

  test('Chromium touch input: cards move without jumps and never flash back to the old order', async ({ page, context, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || !isMobile, 'Continuous trusted touch input uses Chromium CDP.');
    await page.goto('/shopping');
    await expectOrder(page, six.map(item => item.text));
    // Every list cell has the same height, so the drag moves the others evenly.
    const heights = await page.getByTestId('shopping-swipeable').evaluateAll(cards => cards.map(card => Math.round(card.getBoundingClientRect().height)));
    expect(new Set(heights).size).toBe(1);
    // Record where every card is on screen, every frame.
    await page.evaluate(() => {
      const frames: [string, number][][] = [];
      (window as unknown as { cardFrames: typeof frames }).cardFrames = frames;
      const sample = () => {
        frames.push(Array.from(document.querySelectorAll('[data-testid="shopping-drag"]'),
          card => [card.getAttribute('aria-label')!, Math.round(card.getBoundingClientRect().top)]));
        if (frames.length < 500) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const session = await context.newCDPSession(page);
    const start = await center(rows(page).nth(1).getByTestId('shopping-drag'));
    const step = (await rows(page).nth(2).boundingBox())!.y - (await rows(page).nth(1).boundingBox())!.y;
    const point = (y: number) => [{ x: start.x, y, id: 0, radiusX: 1, radiusY: 1, force: 1 }];
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(start.y) });
    await page.waitForTimeout(450);
    // Down past three cards, then back up by one.
    for (let i = 1; i <= 45; i++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(start.y + 3 * step * i / 45) });
      await page.waitForTimeout(16);
    }
    for (let i = 1; i <= 15; i++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(start.y + 3 * step - step * i / 15) });
      await page.waitForTimeout(16);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const released = await page.evaluate(() => (window as unknown as { cardFrames: unknown[] }).cardFrames.length);
    const final = ['молоко — 1 л', 'сыр — 50 г', 'яйца', 'хлеб', 'масло', 'рис'];
    await expectOrder(page, final);
    await page.waitForTimeout(600);
    const frames = await page.evaluate(() => (window as unknown as { cardFrames: [string, number][][] }).cardFrames);
    // No card jumps between two frames: neighbours glide and the dropped card settles.
    const jumps: string[] = [];
    for (let i = 1; i < frames.length; i++) {
      const before = new Map(frames[i - 1]);
      for (const [label, top] of frames[i]) {
        const previous = before.get(label);
        if (previous !== undefined && Math.abs(top - previous) > step / 2) jumps.push(`${label}: ${previous} -> ${top}`);
      }
    }
    expect(jumps).toEqual([]);
    // After the release, once the new order is on screen it stays.
    const order = (frame: [string, number][]) => [...frame].sort((a, b) => a[1] - b[1]).map(([label]) => label).join('|');
    const afterRelease = frames.slice(released);
    const settled = afterRelease.findIndex(frame => order(frame) === final.join('|'));
    expect(settled).toBeGreaterThan(-1);
    expect(afterRelease.slice(settled).map(order).filter(value => value !== final.join('|'))).toEqual([]);
    await session.detach();
  });
});

test('Chromium touch input: long press reorders and persists without cancelling the pointer', async ({ page, context, browserName, isMobile }) => {
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
  await expectOrder(page, ['хлеб', 'сыр — 50 г', 'молоко — 1 л']);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1') ?? '[]').map((item: { id: string }) => item.id))).toEqual(['e2e-bread', 'e2e-cheese', 'e2e-milk']);
  await page.reload();
  await expectOrder(page, ['хлеб', 'сыр — 50 г', 'молоко — 1 л']);
  await session.detach();
});
