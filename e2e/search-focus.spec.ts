import { test, expect, openHome } from './fixtures';

for (const textSize of ['small', 'standard', 'large'] as const) {
  test.describe(`search focus with ${textSize} text`, () => {
    test.use({ seedSettings: {
      theme: 'light', language: 'ru', textSize, shoppingCompletedBehavior: 'moveDown',
    } });
    test('input stays readable and retains query on repeated focus', async ({ page }) => {
      await openHome(page);
      const search = page.getByRole('textbox', { name: 'Поиск рецептов', exact: true });
      // Desktop WebKit cannot reproduce the iPhone keyboard's automatic zoom.
      // Guard the actual CSS font threshold that otherwise triggers it on iOS.
      const fontSize = await search.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      expect(fontSize, 'Web search input must remain at least 16 CSS px, including small text').toBeGreaterThanOrEqual(16);
      const before = await search.boundingBox();
      const scale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
      await search.click();
      await expect(search).toBeFocused();
      await search.fill('сыр');
      await search.click();
      await expect(search).toHaveValue('сыр');
      await expect(page.getByRole('button', { name: /^Открыть рецепт / })).toHaveCount(1);
      await expect.poll(() => search.boundingBox()).toEqual(before);
      expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(scale);
      await page.getByRole('button', { name: 'Все', exact: true }).click();
      await expect(search).not.toBeFocused();
      await search.click();
      await expect(search).toHaveValue('сыр');
      await search.fill('');
      await expect(page.getByRole('button', { name: /^Открыть рецепт / })).toHaveCount(2);
      // Preserve pinch zoom for accessibility instead of disabling page scaling.
      await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute('content', /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:[,\s]|$)/i);
    });
  });
}
