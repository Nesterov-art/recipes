import { test, expect } from './fixtures';

// Chromium's safe-area override supplies real env() insets to SafeAreaProvider.
// Native keyboard behaviour is verified separately in the standalone Android APK.
test('form scroll viewport remains below the top safe area with large text', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP safe-area override is Chromium-only');
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 44, bottom: 24 } });
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto('/form');
  const title = page.getByRole('textbox', { name: 'Название', exact: true });
  await expect(title).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.fontSize = '20.8px'; });
  const top = await title.evaluate(element => {
    let node = element.parentElement;
    while (node && !/(auto|scroll)/.test(getComputedStyle(node).overflowY)) node = node.parentElement;
    if (!node) throw new Error('Form must remain scrollable');
    node.scrollTop = node.scrollHeight;
    return node.getBoundingClientRect().top;
  });
  expect(top).toBeGreaterThanOrEqual(44);
  const save = page.getByRole('button', { name: 'Сохранить', exact: true });
  await expect(save).toBeInViewport();
});
