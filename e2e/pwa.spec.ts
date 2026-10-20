import { test, expect, openHome } from './fixtures';

test('export exposes the manifest, iPhone metadata and real PNG assets', async ({ page, request }) => {
  await openHome(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.json');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  const response = await request.get('/manifest.json');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ display: 'standalone', start_url: '/' });
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(appleIcon).toBeTruthy();
  for (const url of [...manifest.icons.map((icon: { src: string }) => icon.src), appleIcon!]) {
    const icon = await request.get(url);
    expect(icon.ok(), url).toBe(true);
    expect(icon.headers()['content-type']).toContain('image/png');
    expect((await icon.body()).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  }
});
