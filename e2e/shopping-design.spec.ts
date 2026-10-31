import { test, expect, rows, addItem, shopping } from './fixtures';

const rowContainers = (page: import('@playwright/test').Page) => page.getByTestId('shopping-swipeable');

async function containerStyle(page: import('@playwright/test').Page, index: number) {
  // The Swipeable container carries the card surface; gesture detectors around it
  // are display: contents wrappers.
  return rowContainers(page).nth(index).evaluate(element => {
    let container = element.firstElementChild!;
    while (getComputedStyle(container).display === 'contents') container = container.firstElementChild!;
    const style = getComputedStyle(container);
    return { top: style.borderTopLeftRadius, bottom: style.borderBottomLeftRadius, background: style.backgroundColor };
  });
}

for (const [theme, page_, card] of [['light', 'rgb(242, 242, 242)', 'rgb(255, 255, 255)'], ['dark', 'rgb(11, 11, 12)', 'rgb(32, 32, 34)']] as const) {
  test.describe(`separate cards, ${theme}`, () => {
    test.use({ seedShopping: [shopping, { scope: 'test' }], seedSettings: { theme, language: 'ru', shoppingCompletedBehavior: 'moveDown' } });
    test('each product is a compact rounded card on the Monorec palette', async ({ page }) => {
      await page.goto('/shopping');
      await expect(rows(page)).toHaveCount(3);
      for (const index of [0, 1, 2]) {
        expect(await containerStyle(page, index)).toEqual({ top: '16px', bottom: '16px', background: card });
        const height = (await rows(page).nth(index).boundingBox())!.height;
        expect(height).toBeGreaterThanOrEqual(60);
        expect(height).toBeLessThanOrEqual(68);
      }
      // Cards are separated by an 8 px gap.
      const first = (await rows(page).nth(0).boundingBox())!;
      const second = (await rows(page).nth(1).boundingBox())!;
      expect(Math.round(second.y - (first.y + first.height))).toBe(8);
      // The first opaque ancestor outside the card is the screen background.
      const screenBackground = await page.evaluate(() => {
        let element = document.querySelector('[data-testid="shopping-swipeable"]')!.parentElement;
        while (element) {
          const color = getComputedStyle(element).backgroundColor;
          if (color !== 'rgba(0, 0, 0, 0)') return color;
          element = element.parentElement;
        }
        return '';
      });
      expect(screenBackground).toBe(page_);
    });
  });
}

test.describe('rows and controls', () => {
  test.use({ seedShopping: [shopping, { scope: 'test' }] });

  test('the amount is shown apart from the name and targets are large enough', async ({ page }) => {
    await page.goto('/shopping');
    const milk = rows(page).first();
    await expect(milk.getByText('молоко', { exact: true })).toBeVisible();
    await expect(milk.getByText('1 л', { exact: true })).toBeVisible();
    await expect(milk.getByRole('checkbox', { name: 'молоко — 1 л', exact: true })).toBeVisible();
    for (const target of [
      milk.getByRole('checkbox'),
      page.getByRole('button', { name: 'Добавить продукт', exact: true }),
      page.getByRole('button', { name: 'Что можно приготовить?', exact: true }),
    ]) {
      const box = (await target.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const name = (await milk.getByText('молоко', { exact: true }).boundingBox())!;
    const checkbox = (await milk.getByRole('checkbox').boundingBox())!;
    expect(name.x).toBeGreaterThanOrEqual(checkbox.x + checkbox.width - 1);
  });

  test('the add button is disabled for an empty or blank entry', async ({ page }) => {
    await page.goto('/shopping');
    const add = page.getByRole('button', { name: 'Добавить продукт', exact: true });
    const input = page.getByPlaceholder('Добавить продукт', { exact: true });
    await expect(add).toBeDisabled();
    await input.fill('   ');
    await expect(add).toBeDisabled();
    await input.press('Enter');
    await expect(rows(page)).toHaveCount(3);
    await input.fill('Кефир');
    await expect(add).toBeEnabled();
    await add.click();
    await expect(input).toHaveValue('');
    await expect(rows(page)).toHaveCount(4);
    await expect(add).toBeDisabled();
  });

  test('all bought shows its state, unticking restores the list, clearing empties it', async ({ page }) => {
    await page.goto('/shopping');
    const allDone = page.getByText('Всё куплено', { exact: true });
    for (const item of shopping) await page.getByRole('checkbox', { name: item.text, exact: true }).click();
    await expect(allDone).toBeVisible();
    await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(3);
    await page.getByRole('checkbox', { name: 'хлеб', exact: true }).click();
    await expect(allDone).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Удалить отмеченные', exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: 'хлеб', exact: true }).click();
    await page.getByRole('button', { name: 'Удалить отмеченные', exact: true }).click();
    await expect(page.getByText('Список покупок пуст', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('shopping-list-v1') ?? '[]').length)).toBe(0);
  });
});

test.describe('narrow screen with large text', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test('long names wrap beside the checkbox without horizontal scroll', async ({ page }) => {
    await page.goto('/shopping');
    await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
    const long = 'Очень длинное название продукта для проверки переноса строк';
    await addItem(page, `${long} — 2 шт`);
    const row = rows(page).first();
    await expect(row.getByText(long, { exact: true })).toBeVisible();
    const name = (await row.getByText(long, { exact: true }).boundingBox())!;
    const amount = (await row.getByText('2 шт.', { exact: true }).boundingBox())!;
    const checkbox = (await row.getByRole('checkbox').boundingBox())!;
    const card = (await row.boundingBox())!;
    expect(name.height).toBeGreaterThan(40);
    expect(name.x).toBeGreaterThanOrEqual(checkbox.x + checkbox.width - 1);
    // Large text moves the amount under the name instead of squeezing it.
    expect(amount.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
    expect(amount.x + amount.width).toBeLessThanOrEqual(card.x + card.width);
    const title = page.getByRole('heading', { name: 'Список покупок', exact: true });
    const titleBox = (await title.boundingBox())!;
    expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('what can I cook', () => {
  test.use({ seedShopping: [[{ id: 'e2e-eggs', name: 'Яйца', text: 'Яйца — 2 шт.', quantity: 2, unit: 'шт.', checked: false }], { scope: 'test' }] });
  test('matches keep their information and green match status on one rounded card', async ({ page }) => {
    await page.goto('/shopping-matches');
    const omelet = page.getByRole('button', { name: 'Открыть рецепт Омлет с сыром', exact: true });
    await expect(omelet).toContainText('Совпало: 1 из 2');
    await expect(omelet).toContainText('50%');
    await expect(omelet).toContainText('Не хватает: Сыр');
    const radius = await omelet.evaluate(element => getComputedStyle(element).borderTopLeftRadius);
    expect(radius).toBe('24px');
    // Light theme success colour #246B45.
    await expect(omelet.getByText('50%', { exact: true })).toHaveCSS('color', 'rgb(36, 107, 69)');
    await omelet.click();
    await expect(page).toHaveURL(/\/recipe\/e2e-omelet$/);
  });
});

test.describe('what can I cook, empty', () => {
  test('explains why nothing matches', async ({ page }) => {
    await page.goto('/shopping-matches');
    await expect(page.getByText('Подходящих рецептов нет', { exact: true })).toBeVisible();
    await expect(page.getByText('Добавь продукты в список покупок, чтобы подобрать рецепты.', { exact: true })).toBeVisible();
  });
});
