import { test as base, expect, type Page } from '@playwright/test';
import type { Recipe } from '../src/constants/recipes';
import type { ShoppingItem } from '../src/utils/shopping';

export const recipes: Recipe[] = [
  { id: 'e2e-omelet', title: 'Омлет с сыром', category: 'Завтрак', time: 10,
    ingredients: ['Яйца — 2 шт', 'Сыр — 50 г'], steps: ['Взбить яйца.', 'Добавить сыр.'] },
  { id: 'e2e-soup', title: 'Томатный суп', category: 'Обед', time: 30,
    ingredients: ['Томаты — 300 г', 'Вода — 500 мл'], steps: ['Нарезать томаты.', 'Варить 20 минут.'] },
];

export const shopping: ShoppingItem[] = [
  { id: 'e2e-milk', name: 'молоко', text: 'молоко — 1 л', quantity: 1, unit: 'л', checked: false },
  { id: 'e2e-bread', name: 'хлеб', text: 'хлеб', checked: false },
  { id: 'e2e-cheese', name: 'сыр', text: 'сыр — 50 г', quantity: 50, unit: 'г', checked: false },
];

type Settings = {
  theme: 'light' | 'dark'; language: 'ru' | 'en';
  textSize?: 'small' | 'standard' | 'large'; shoppingCompletedBehavior: 'keep' | 'moveDown';
};
type Options = { freshProfile: boolean; seedRecipes: Recipe[] | null; seedShopping: ShoppingItem[]; seedSettings: Settings };

export const test = base.extend<Options & { checkPageErrors: void }>({
  freshProfile: [false, { option: true }],
  seedRecipes: [recipes, { option: true }],
  seedShopping: [[], { option: true }],
  seedSettings: [{ theme: 'light', language: 'ru', shoppingCompletedBehavior: 'moveDown' }, { option: true }],
  // Seed once when the context is created. Never reseed on navigation/reload.
  storageState: async ({ baseURL, freshProfile, seedRecipes, seedShopping, seedSettings }, use) => {
    await use({ cookies: [], origins: [{ origin: new URL(baseURL!).origin, localStorage: freshProfile ? [] : [
      ...(seedRecipes === null ? [] : [{ name: 'recipes', value: JSON.stringify(seedRecipes) }]),
      { name: 'shopping-list-v1', value: JSON.stringify(seedShopping) },
      { name: 'app-settings-v1', value: JSON.stringify(seedSettings) },
    ] }] });
  },
  checkPageErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Uncaught browser errors').toEqual([]);
  }, { auto: true }],
});

export { expect };

export async function openHome(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Открыть список покупок', exact: true })).toBeVisible();
}

export async function addItem(page: Page, text: string) {
  await page.getByPlaceholder('Добавить продукт', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Добавить продукт', exact: true }).click();
  await expect(page.getByPlaceholder('Добавить продукт', { exact: true })).toHaveValue('');
}

export function rows(page: Page) {
  return page.getByTestId('shopping-row');
}

export async function expectOrder(page: Page, names: string[]) {
  await expect(rows(page).getByTestId('shopping-drag')).toHaveText(names);
}

export async function visualReady(page: Page) {
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await document.fonts.ready;
  });
  await page.mouse.move(0, 0);
}
