import { test, expect, rows } from './fixtures';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test.describe(`capsule motion: ${reducedMotion}`, () => {
    test.use({ reducedMotion, seedSettings: { theme: 'dark', language: 'en', shoppingCompletedBehavior: 'keep' } });
    test('a deep link, rapid taps and resizing keep the capsule aligned and labels readable', async ({ page }) => {
      await page.goto('/settings');
      const capsule = page.getByTestId('tab-active-capsule');
      const selected = () => page.getByRole('tab', { selected: true });
      const aligned = async () => {
        const a = await capsule.boundingBox();
        const b = await selected().boundingBox();
        return a && b ? Math.abs(a.x - b.x) + Math.abs(a.width - b.width) : 999;
      };
      await expect.poll(aligned).toBeLessThan(1);
      for (const name of ['Choose', 'Shopping', 'Recipes', 'Choose', 'Settings']) {
        await page.getByRole('tab', { name, exact: true }).click();
      }
      await expect(selected()).toHaveAccessibleName('Settings');
      await expect.poll(aligned).toBeLessThan(1);
      for (const width of [320, 844, 390]) {
        await page.setViewportSize({ width, height: 640 });
        await expect.poll(aligned).toBeLessThan(1);
        for (const tab of await page.getByRole('tab').all()) {
          expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(48);
          expect(await tab.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        }
      }
    });
  });
}

test.describe('long shopping list above the floating bar', () => {
  test.use({ seedShopping: [Array.from({ length: 40 }, (_, index) => ({
    id: `bar-product-${index}`, name: `Продукт ${index + 1}`, text: `Продукт ${index + 1}`, checked: false,
  })), { scope: 'test' }] });
  test('the complete last card is reachable and its checkbox persists', async ({ page }) => {
    await page.goto('/shopping');
    const last = rows(page).filter({ hasText: 'Продукт 40' });
    const reachEnd = () => expect.poll(async () => {
      await page.evaluate(() => {
        for (const node of document.querySelectorAll<HTMLElement>('div')) {
          if (['auto', 'scroll'].includes(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) {
            node.scrollTop = node.scrollHeight;
          }
        }
      });
      const card = await last.boundingBox();
      const bar = await page.getByTestId('monorec-tab-bar').boundingBox();
      return !!card && !!bar && card.y >= 0 && card.y + card.height <= bar.y;
    }).toBe(true);
    await reachEnd();
    const card = (await last.boundingBox())!;
    const bar = (await page.getByTestId('monorec-tab-bar').boundingBox())!;
    expect(card.y).toBeGreaterThanOrEqual(0);
    expect(card.y + card.height).toBeLessThanOrEqual(bar.y);
    await last.getByRole('checkbox').click();
    await expect(last.getByRole('checkbox')).toBeChecked();
    await page.reload();
    await reachEnd();
    await expect(last.getByRole('checkbox')).toBeChecked();
  });
});
