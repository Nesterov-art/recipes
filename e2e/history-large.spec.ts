import type { Page } from '@playwright/test';
import { test, expect, recipes } from './fixtures';

const [omelet, soup] = recipes;
const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' });
// A device crashed with OutOfMemoryError at this size when every row was created at once.
const LARGE = 20_202;
// Generous for any viewport here, far below the number of entries.
const MOUNTED_LIMIT = 500;

// Cookings 3 hours apart, newest first, split over both recipes. The newest and the
// oldest carry notes, so both ends of the list can be found on screen.
async function seedCookings(page: Page, count: number) {
  await page.goto('/recipes');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('recipe-book-v1'))).not.toBeNull();
  await page.evaluate(({ count, ids }) => {
    const newest = Date.parse('2026-10-14T09:00:00.000Z');
    const meta: Record<string, { favorite: boolean; cookings: { id: string; cookedAt: string; note?: string }[] }> = {};
    for (const id of ids) meta[id] = { favorite: false, cookings: [] };
    for (let i = 0; i < count; i++) {
      const note = i === 0 ? 'Самая новая запись' : i === count - 1 ? 'Самая старая запись' : i === 60 ? 'Шестидесятая запись' : undefined;
      meta[ids[i % 2]].cookings.push({ id: `c${i}`, cookedAt: new Date(newest - i * 3 * 3600_000).toISOString(), ...(note ? { note } : {}) });
    }
    const stored = JSON.parse(localStorage.getItem('recipe-book-v1')!);
    stored.recipeMeta = meta;
    localStorage.setItem('recipe-book-v1', JSON.stringify(stored));
  }, { count, ids: [omelet.id, soup.id] });
  await page.reload();
  await expect(page.getByRole('tab').first()).toBeVisible();
}

const entries = (page: Page) => page.getByTestId('history-entry');

const jumpToEnd = (page: Page) => page.getByTestId('history-list').evaluate(element => { element.scrollTop = element.scrollHeight; });

// Jumps to the end of the list repeatedly, as a fast fling would, until the oldest entry renders.
async function scrollToOldest(page: Page, note: string) {
  await expect.poll(async () => {
    await jumpToEnd(page);
    return page.getByText(note, { exact: true }).count();
  }, { timeout: 25_000, intervals: [50] }).toBe(1);
}

// Without fixed row heights the list grows as it renders, so the end of 20 000 entries is
// reached gradually. Fling far instead: the rows left behind must be released, the screen
// must not stay blank, and the mounted rows must stay bounded. The first batch of rows is
// kept on purpose by FlatList, so a row beyond it is the one that must go.
async function flingFar(page: Page) {
  for (let i = 0; i < 30; i++) {
    await jumpToEnd(page);
    await page.waitForTimeout(100);
  }
  await expect(page.getByText('«Шестидесятая запись»', { exact: true })).toHaveCount(0);
  await expect.poll(() => page.getByTestId('history-list').evaluate(list => {
    const view = list.getBoundingClientRect();
    return [...list.querySelectorAll('[data-testid="history-entry"]')].filter(row => {
      const box = row.getBoundingClientRect();
      return box.bottom > view.top && box.top < view.bottom;
    }).length;
  })).toBeGreaterThan(0);
  expect(await entries(page).count()).toBeLessThanOrEqual(MOUNTED_LIMIT);
}

for (const count of [1, 100, 1000, LARGE]) {
  test(`history with ${count} entries renders only what is near the screen`, async ({ page }) => {
    test.setTimeout(count === LARGE ? 90_000 : 30_000);
    await page.clock.setFixedTime(new Date('2026-10-15T12:00:00+03:00'));
    await seedCookings(page, count);
    await button(page, 'История приготовлений').click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByTestId('history-total')).toContainText(String(count));
    await expect(page.getByText('«Самая новая запись»', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Октябрь 2026', exact: true })).toBeVisible();
    expect(await entries(page).count()).toBeLessThanOrEqual(Math.min(count, MOUNTED_LIMIT));

    if (count === LARGE) await flingFar(page);
    else if (count > 1) {
      await scrollToOldest(page, '«Самая старая запись»');
      expect(await entries(page).count()).toBeLessThanOrEqual(MOUNTED_LIMIT);
    }

    // A row still opens its recipe, and Back returns to the history.
    const row = button(page, new RegExp(`^(${omelet.title}|${soup.title}), `)).last();
    await row.click();
    await expect(page).toHaveURL(/\/recipe\/e2e-(omelet|soup)$/);
    await button(page, 'Назад').click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByTestId('history-total')).toContainText(String(count));

    // Closing and opening the screen again starts from the top.
    await button(page, 'Назад').click();
    await expect(page).toHaveURL(/\/recipes$/);
    await button(page, 'История приготовлений').click();
    await expect(page.getByText('«Самая новая запись»', { exact: true })).toBeVisible();
    expect(await entries(page).count()).toBeLessThanOrEqual(Math.min(count, MOUNTED_LIMIT));
  });
}

test.describe('dark theme, English and large system text', () => {
  test.use({ seedSettings: { theme: 'dark', language: 'en', shoppingCompletedBehavior: 'moveDown' } });
  test('a large history keeps its grouping and stays bounded', async ({ page }) => {
    test.setTimeout(90_000);
    await page.clock.setFixedTime(new Date('2026-10-15T12:00:00+03:00'));
    await seedCookings(page, LARGE);
    await page.goto('/history');
    await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
    // The browser's font preference stands in for the system text size.
    await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
    await expect(page.getByTestId('history-total')).toContainText(`${LARGE} times`);
    await expect(page.getByRole('heading', { name: 'October 2026', exact: true })).toBeVisible();
    expect(await entries(page).count()).toBeLessThanOrEqual(MOUNTED_LIMIT);
    await flingFar(page);
  });
});
