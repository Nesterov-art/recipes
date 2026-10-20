import { test, expect, openHome } from './fixtures';

test('panned iOS keyboard viewport stays filled and restores after closing', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const viewport = window.visualViewport!;
    const nativeHeight = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(viewport), 'height')!.get!.bind(viewport);
    const state = { height: null as number | null, offsetTop: 0 };
    Object.defineProperties(viewport, {
      height: { configurable: true, get: () => state.height ?? nativeHeight() },
      offsetTop: { configurable: true, get: () => state.offsetTop },
    });
    Object.defineProperty(window, '__keyboardViewport', { value: state });
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
  });
  await openHome(page);
  const search = page.getByRole('textbox', { name: 'Поиск рецептов', exact: true });
  const originalHeight = await page.locator('#root').evaluate(element => element.getBoundingClientRect().height);
  await search.click();
  // Simulate Safari keeping the layout viewport tall while the keyboard
  // reduces and pans the visual viewport. This is not a physical iOS test.
  await page.evaluate(() => {
    const state = (window as unknown as { __keyboardViewport: { height: number | null; offsetTop: number } }).__keyboardViewport;
    state.height = 360;
    state.offsetTop = 180;
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect.poll(() => page.locator('#root').evaluate(element => element.getBoundingClientRect().bottom)).toBe(540);
  await expect(page.getByRole('button', { name: 'Добавить рецепт', exact: true })).not.toBeVisible();
  // Panning can happen after resize; a scroll event must also update the root.
  await page.evaluate(() => {
    (window as unknown as { __keyboardViewport: { offsetTop: number } }).__keyboardViewport.offsetTop = 220;
    window.visualViewport!.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(() => page.locator('#root').evaluate(element => element.getBoundingClientRect().bottom)).toBe(580);
  await page.screenshot({ path: testInfo.outputPath('keyboard-viewport.png') });
  await search.fill('сыр');
  await expect(page.getByRole('button', { name: /^Открыть рецепт / })).toHaveCount(1);
  await page.evaluate(() => {
    const state = (window as unknown as { __keyboardViewport: { height: number | null; offsetTop: number } }).__keyboardViewport;
    state.height = null;
    state.offsetTop = 0;
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await search.blur();
  await expect(search).not.toBeFocused();
  await expect.poll(() => page.locator('#root').evaluate(element => element.getBoundingClientRect().height)).toBe(originalHeight);
  await expect(search).toHaveValue('сыр');
  await expect(page.getByRole('button', { name: 'Добавить рецепт', exact: true })).toBeVisible();
});
