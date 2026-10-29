import type { Page } from '@playwright/test';
import { test, expect, openHome, recipes } from './fixtures';

const special = {
  id: 'e2e-special', title: 'Сырники «как у бабушки» & чай #1', category: 'Завтрак', time: 25,
  ingredients: ['Творог 5% — 400 г', 'Сахар — по вкусу 😊'], steps: ['Смешать творог и сахар.', 'Обжарить по 3 минуты — до золотистого цвета.'],
};
// Far beyond what one link can carry (4 000 characters).
const tooLong = {
  id: 'e2e-too-long', title: 'Очень длинный пирог', category: null, time: 90, ingredients: ['Мука — 500 г'],
  steps: Array.from({ length: 20 }, (_, i) => `${i + 1}. Замесить тесто, дать подняться в тёплом месте, обмять и снова дать подняться.`),
};
// Saved by the form or brought by a backup, but outside what a link can carry.
const fractional = { id: 'e2e-fractional', title: 'Яйцо всмятку', category: 'Завтрак', time: 1.5, ingredients: ['Яйцо — 1 шт'], steps: ['Варить.'] };
const manyIngredients = { id: 'e2e-many', title: 'Big salad', category: null, time: 10, ingredients: Array.from({ length: 101 }, (_, i) => `Item ${i}`), steps: ['Mix.'] };
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const book = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!) as {
  recipes: { id: string; title: string; ingredients: string[]; steps: string[] }[]; recipeMeta: Record<string, unknown>;
});

// The browser's share menu and clipboard, replaced so every engine behaves the same and the
// test sees what was handed over. 'copy': no share menu, copying works. 'share': the menu
// opens. 'cancel': the user closes it. 'copyFails': no menu and copying is refused.
// 'slowShare': the menu stays open for a while.
type ShareMode = 'copy' | 'share' | 'cancel' | 'copyFails' | 'slowShare';
async function stubShare(page: Page, mode: ShareMode) {
  await page.addInitScript((mode: ShareMode) => {
    const record = window as unknown as { shared: ShareData[]; copied: string[] };
    record.shared = []; record.copied = [];
    const share = mode === 'copy' || mode === 'copyFails' ? undefined : async (data: ShareData) => {
      record.shared.push(data);
      if (mode === 'cancel') throw new DOMException('Share canceled', 'AbortError');
      if (mode === 'slowShare') await new Promise(resolve => setTimeout(resolve, 1500));
    };
    const clipboard = { writeText: async (text: string) => {
      if (mode === 'copyFails') throw new DOMException('Denied', 'NotAllowedError');
      record.copied.push(text);
    } };
    Object.defineProperty(Navigator.prototype, 'share', { configurable: true, get: () => share });
    Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, get: () => clipboard });
  }, mode);
}
const handedOver = (page: Page) => page.evaluate(() => {
  const record = window as unknown as { shared: ShareData[]; copied: string[] };
  return { shared: record.shared, copied: record.copied };
});
// "Share recipe" on the recipe screen copies the link (no share menu in this browser).
async function linkOf(page: Page, recipeId: string) {
  await page.goto(`/recipe/${recipeId}`);
  await button(page, 'Поделиться рецептом').click();
  await expect(page.getByText('Ссылка скопирована', { exact: true })).toBeVisible();
  const { copied } = await handedOver(page);
  const link = copied.at(-1)!;
  expect(link).toMatch(/\/shared-recipe#1\.[A-Za-z0-9_-]+$/);
  return link;
}
async function openImport(page: Page) {
  await openHome(page);
  await button(page, 'Добавить рецепт').click();
  await button(page, 'Добавить по ссылке').click();
  await expect(page).toHaveURL(/\/import-link$/);
}
// The recipe the link carries, decoded here independently of the app.
function payloadOf(link: string) {
  return JSON.parse(Buffer.from(link.split('#1.')[1], 'base64url').toString('utf8')) as Record<string, unknown>;
}
async function show(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Ссылка на рецепт', exact: true }).fill(text);
  await button(page, 'Найти рецепт').click();
}

test.describe('sharing', () => {
  test.use({ seedRecipes: [[...recipes, special, tooLong, fractional], { scope: 'test' }] });

  test('a recipe outside what a link carries is explained to the sender; nothing is handed over', async ({ page }) => {
    await stubShare(page, 'share');
    await page.goto(`/recipe/${fractional.id}`);
    await button(page, 'Поделиться рецептом').click();
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Этот рецепт нельзя отправить ссылкой: время должно быть целым числом минут от 0 до 10000.');
    expect(await handedOver(page)).toEqual({ shared: [], copied: [] });
    await button(page, 'Готово').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The recipe itself is as it was.
    expect((await book(page)).recipes.find(r => r.id === fractional.id)).toMatchObject({ ingredients: fractional.ingredients, steps: fractional.steps });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recipe-book-v1')!).recipes.find((r: { id: string }) => r.id === 'e2e-fractional').time)).toBe(1.5);
  });

  test('a recipe too long for a link is explained and nothing is handed over', async ({ page }) => {
    await stubShare(page, 'share');
    await page.goto(`/recipe/${tooLong.id}`);
    await button(page, 'Поделиться рецептом').click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Рецепт слишком длинный для ссылки. Сократи шаги или ингредиенты, чтобы поделиться им.', { exact: true })).toBeVisible();
    expect(await handedOver(page)).toEqual({ shared: [], copied: [] });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('"Share recipe" opens the browser share menu at once with the title and the whole link', async ({ page }) => {
    await stubShare(page, 'share');
    await page.goto(`/recipe/${special.id}`);
    // Only the recipe travels: no history, notes or favourite, even when the recipe has them.
    await button(page, 'Добавить в любимое').click();
    await button(page, 'Поделиться рецептом').click();
    await expect.poll(async () => (await handedOver(page)).shared.length).toBe(1);
    const [data] = (await handedOver(page)).shared;
    expect(data.title).toBe(special.title);
    expect(data.url).toMatch(/^http:\/\/127\.0\.0\.1:4173\/shared-recipe#1\.[A-Za-z0-9_-]+$/);
    expect(payloadOf(data.url!)).toEqual({ t: special.title, c: 'b', m: 25, i: special.ingredients, s: special.steps });
    // No screen in between, nothing copied, nothing to dismiss.
    await expect(page).toHaveURL(new RegExp(`/recipe/${special.id}$`));
    expect((await handedOver(page)).copied).toEqual([]);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('closing the share menu is not an error', async ({ page }) => {
    await stubShare(page, 'cancel');
    await page.goto(`/recipe/${special.id}`);
    await button(page, 'Поделиться рецептом').click();
    await expect.poll(async () => (await handedOver(page)).shared.length).toBe(1);
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Ссылка скопирована', { exact: true })).toHaveCount(0);
    expect((await handedOver(page)).copied).toEqual([]);
  });

  test('without a share menu the link is copied and that is confirmed', async ({ page }) => {
    await stubShare(page, 'copy');
    const link = await linkOf(page, special.id);
    expect(payloadOf(link).t).toBe(special.title);
    await expect(page).toHaveURL(new RegExp(`/recipe/${special.id}$`));
  });

  test('when copying is refused the link is shown to select by hand', async ({ page }) => {
    await stubShare(page, 'copyFails');
    await page.goto(`/recipe/${special.id}`);
    await button(page, 'Поделиться рецептом').click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'Ссылка на рецепт', exact: true })).toBeVisible();
    await expect(sheet.getByText('Скопировать ссылку не получилось. Выдели её и скопируй вручную.', { exact: true })).toBeVisible();
    const link = await sheet.getByTestId('recipe-link').innerText();
    expect(payloadOf(link).t).toBe(special.title);
    expect(await sheet.getByTestId('recipe-link').evaluate(element => getComputedStyle(element).userSelect)).not.toBe('none');
    await button(page, 'Готово').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('quick repeated taps open the share menu once', async ({ page }) => {
    await stubShare(page, 'slowShare');
    await page.goto(`/recipe/${special.id}`);
    const share = button(page, 'Поделиться рецептом');
    await share.click();
    await share.click({ force: true });
    await share.click({ force: true });
    await page.waitForTimeout(1800);
    expect((await handedOver(page)).shared).toHaveLength(1);
    await share.click();
    await expect.poll(async () => (await handedOver(page)).shared.length).toBe(2);
  });

  test('the link opens directly in a browser that has no data and never saw the introduction', async ({ page, browser }) => {
    await stubShare(page, 'copy');
    const link = await linkOf(page, special.id);
    // Nothing seeded: no recipes, and the introduction was never completed.
    const stranger = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const view = await stranger.newPage();
    await view.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await expect(view.getByRole('heading', { name: special.title, exact: true })).toBeVisible();
    for (const line of [...special.ingredients, ...special.steps]) await expect(view.getByText(line, { exact: true })).toBeVisible();
    await expect(view.getByText(/Знакомство|Пропустить/)).toHaveCount(0);
    await expect(view.getByRole('tab')).toHaveCount(0);
    // The data stays in the address after the page has loaded; the visitor's storage holds no recipe.
    expect(view.url()).toContain('#1.');
    expect(await view.evaluate(() => localStorage.getItem('recipe-book-v1') ?? '')).not.toContain('Сырники');
    await expect(view.getByText(/Добавить по ссылке/)).toBeVisible();
    await stranger.close();
  });
});

test.describe('text that looks like markup', () => {
  const markup = { id: 'e2e-markup', title: '<img src=x onerror="window.injected=1"> Суп', category: null, time: 5,
    ingredients: ['<b>Соль</b> — 1 г'], steps: ['<script>window.injected=2</script>Варить.'] };
  test.use({ seedRecipes: [[...recipes, markup], { scope: 'test' }] });
  test('is shown as text, runs nothing, and the page asks no other address', async ({ page, browser }) => {
    await stubShare(page, 'copy');
    const link = await linkOf(page, markup.id);
    const stranger = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const view = await stranger.newPage();
    const hosts = new Set<string>();
    view.on('request', request => { hosts.add(new URL(request.url()).host); });
    await view.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await expect(view.getByRole('heading', { name: markup.title, exact: true })).toBeVisible();
    await expect(view.getByText(markup.ingredients[0], { exact: true })).toBeVisible();
    await expect(view.getByText(markup.steps[0], { exact: true })).toBeVisible();
    expect(await view.locator('#root img[src="x"], #root b, #root script').count()).toBe(0);
    expect(await view.evaluate(() => (window as unknown as { injected?: number }).injected)).toBeUndefined();
    // Only the app's own address is asked; the link data never goes anywhere.
    expect([...hosts]).toEqual([new URL(view.url()).host]);
    await stranger.close();
  });
});

test('a link is previewed, cancelling changes nothing, adding saves it once and it survives a restart', async ({ page }) => {
  await stubShare(page, 'copy');
  await page.goto('/recipes');
  const link = await linkOf(page, recipes[0].id);
  // A second book receives the link: a fresh browser with only the soup.
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('recipe-book-v1')!);
    stored.recipes = stored.recipes.filter((recipe: { id: string }) => recipe.id !== 'e2e-omelet');
    localStorage.setItem('recipe-book-v1', JSON.stringify(stored));
    localStorage.setItem('recipes', JSON.stringify(stored.recipes));
  });
  await page.reload();
  const before = await book(page);
  expect(before.recipes.map(recipe => recipe.title)).toEqual(['Томатный суп']);
  await openImport(page);
  await show(page, `Смотри, что я нашёл:\n${link}`);
  const preview = page.getByTestId('recipe-link-preview');
  await expect(preview.getByRole('heading', { name: recipes[0].title, exact: true })).toBeVisible();
  for (const line of recipes[0].ingredients) await expect(preview.getByText(line, { exact: true })).toBeVisible();
  await button(page, 'Отмена').click();
  // The way back must finish before the next navigation, or that one is aborted.
  await expect(page).not.toHaveURL(/\/import-link$/);
  expect(await book(page)).toEqual(before);

  await openImport(page);
  await show(page, link);
  await button(page, 'Добавить в мою книгу').click();
  await expect(page.getByText('Рецепт добавлен в книгу', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: recipes[0].title, exact: true })).toBeVisible();
  const after = await book(page);
  const added = after.recipes.find(recipe => recipe.title === recipes[0].title)!;
  expect(added).toMatchObject({ ingredients: recipes[0].ingredients, steps: recipes[0].steps });
  expect(added.id).not.toBe(recipes[0].id);
  // The regular import gives every added recipe an empty history; nothing came from the sender.
  expect(after.recipeMeta[added.id]).toEqual({ favorite: false, cookings: [] });

  await page.reload();
  expect((await book(page)).recipes).toHaveLength(2);
  // The same link again: already in the book, nothing to add.
  await openImport(page);
  await show(page, link);
  await expect(page.getByTestId('recipe-link-preview')).toContainText('Такой рецепт уже есть в книге.');
  await expect(button(page, 'Добавить в мою книгу')).toHaveCount(0);
  expect((await book(page)).recipes).toHaveLength(2);
});

test('other text, damaged or cut links and a newer version are explained without any change', async ({ page }) => {
  await stubShare(page, 'copy');
  await page.goto('/recipes');
  const link = await linkOf(page, recipes[1].id);
  await openImport(page);
  const before = await book(page);
  for (const [text, message] of [
    // A site's address is now looked up as a recipe page (recipe-site-import.spec.ts); text without one is not a link.
    ['Посмотри рецепт сырников у бабушки', 'Это не ссылка на рецепт Monorec.'],
    [link.slice(0, -10), 'Ссылка повреждена или обрезана. Попроси отправить её ещё раз.'],
    [link.replace('#1.', '#7.'), 'Эта ссылка создана в более новой версии Monorec. Обнови приложение.'],
  ] as const) {
    await show(page, text);
    await expect(page.getByRole('alert')).toHaveText(message);
    await expect(page.getByTestId('recipe-link-preview')).toHaveCount(0);
  }
  expect(await book(page)).toEqual(before);
  await page.goto(link.replace(/^https?:\/\/[^/]+/, '').replace('#1.', '#7.'));
  await expect(page.getByRole('alert')).toHaveText('Эта ссылка создана в более новой версии Monorec. Обнови приложение.');
});

// Long links on a small screen: the field stays short and scrolls inside, the button stays in
// view, and each result (a preview or an error) is brought into view after "Find recipe".
const longRecipe = (n: number, steps: number) => ({
  id: `e2e-long-${n}`, title: `Пирог «как у бабушки» & чай #${n} 😊`, category: 'Ужин', time: 40,
  ingredients: Array.from({ length: 10 }, (_, i) => `Ингредиент ${i} — ${100 * (i + 1)} г`),
  steps: Array.from({ length: steps }, (_, i) => `${i + 1}. Нарезать лук кольцами, обжарить на сливочном масле до золотистого цвета — <b>не</b> пережарить & добавить #соль.`),
});
const long = [longRecipe(1, 6), longRecipe(2, 9)];
for (const variant of [
  { name: 'Russian, light, standard text', settings: { theme: 'light', language: 'ru' }, large: false,
    share: 'Поделиться рецептом', label: 'Ссылка на рецепт', show: 'Найти рецепт', duplicate: 'Такой рецепт уже есть в книге.', invalid: 'Ссылка повреждена или обрезана. Попроси отправить её ещё раз.' },
  { name: 'English, dark, large text', settings: { theme: 'dark', language: 'en' }, large: true,
    share: 'Share recipe', label: 'Recipe link', show: 'Find recipe', duplicate: 'This recipe is already in your book.', invalid: 'The link is damaged or cut off. Ask for it to be sent again.' },
] as const) {
  test.describe(`long links at 320 px: ${variant.name}`, () => {
    test.use({
      viewport: { width: 320, height: 640 },
      seedRecipes: [[...recipes, ...long], { scope: 'test' }],
      seedSettings: { ...variant.settings, shoppingCompletedBehavior: 'moveDown' },
    });
    test('the field stays short, the button and every result come into view', async ({ page }) => {
      await stubShare(page, 'copy');
      const links: string[] = [];
      for (const recipe of long) {
        await page.goto(`/recipe/${recipe.id}`);
        await button(page, variant.share).click();
        // The stub starts a new record on every page load.
        await expect.poll(async () => (await handedOver(page)).copied.length).toBe(1);
        const link = (await handedOver(page)).copied.at(-1)!;
        expect(link.length).toBeGreaterThanOrEqual(2000);
        expect(link.length).toBeLessThanOrEqual(4000);
        links.push(link);
      }
      await page.goto('/import-link');
      if (variant.large) await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
      const field = page.getByRole('textbox', { name: variant.label, exact: true });
      const show = button(page, variant.show);
      await field.fill(links[0]);
      // Nothing is cut: the whole link is in the field, which scrolls inside instead of growing.
      await expect(field).toHaveValue(links[0]);
      expect((await field.boundingBox())!.height).toBeLessThan(640 * 0.4);
      expect(await field.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
      await expect(show).toBeInViewport();

      await show.click();
      const preview = page.getByTestId('recipe-link-preview');
      await expect(preview.getByRole('heading', { name: long[0].title, exact: true })).toBeInViewport();
      await expect(preview.getByText(variant.duplicate, { exact: true })).toBeInViewport();

      // Another recipe: the view follows the new preview again.
      await field.fill(links[1]);
      await show.click();
      await expect(preview.getByRole('heading', { name: long[1].title, exact: true })).toBeInViewport();
      for (const line of [long[1].ingredients[0], long[1].steps[0]]) await expect(preview.getByText(line, { exact: true })).toBeVisible();

      // A damaged link: the error is what comes into view, and no preview stays behind.
      await field.fill(links[1].slice(0, -40));
      await show.click();
      await expect(page.getByRole('alert')).toHaveText(variant.invalid);
      await expect(page.getByRole('alert')).toBeInViewport();
      await expect(preview).toHaveCount(0);
    });
  });
}

test('a long link pasted from the clipboard arrives whole', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permissions are a Chromium feature in Playwright.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // The real clipboard here: no share menu, so "Share recipe" copies the link into it.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'share', { configurable: true, get: () => undefined }));
  await page.goto(`/recipe/${recipes[0].id}`);
  await button(page, 'Поделиться рецептом').click();
  await expect(page.getByText('Ссылка скопирована', { exact: true })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/shared-recipe#1\./);
  const text = `${recipes[0].title}\n${link}`;
  await page.goto('/import-link');
  await page.evaluate(value => navigator.clipboard.writeText(value), text);
  const field = page.getByRole('textbox', { name: 'Ссылка на рецепт', exact: true });
  await field.focus();
  await page.keyboard.press('ControlOrMeta+V');
  await expect(field).toHaveValue(text);
  await button(page, 'Найти рецепт').click();
  await expect(page.getByTestId('recipe-link-preview').getByRole('heading', { name: recipes[0].title, exact: true })).toBeInViewport();
});

test.describe('English, dark theme', () => {
  test.use({ seedSettings: { theme: 'dark', language: 'en', shoppingCompletedBehavior: 'moveDown' }, seedRecipes: [[...recipes, manyIngredients], { scope: 'test' }] });
  test('a recipe outside what a link carries is explained in English', async ({ page }) => {
    await stubShare(page, 'copy');
    await page.goto(`/recipe/${manyIngredients.id}`);
    await button(page, 'Share recipe').click();
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveText("This recipe can't be sent as a link: a link holds up to 100 ingredients, each a non-empty line of up to 500 characters.");
    expect(await handedOver(page)).toEqual({ shared: [], copied: [] });
  });
  test('sharing and adding by link are translated', async ({ page }) => {
    await stubShare(page, 'copyFails');
    await page.goto(`/recipe/${recipes[0].id}`);
    await button(page, 'Share recipe').click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Recipe link', exact: true })).toBeVisible();
    await expect(page.getByText("Couldn't copy the link. Select it and copy it by hand.", { exact: true })).toBeVisible();
    await expect(page.getByText('Cooking history, notes and favourites are not sent.', { exact: false })).toBeVisible();
    await button(page, 'Done').click();
    await page.goto('/recipes');
    await button(page, 'Add recipe').click();
    await button(page, 'Add from link').click();
    await expect(page.getByRole('textbox', { name: 'Recipe link', exact: true })).toBeVisible();
    await button(page, 'Find recipe').click();
    await expect(page.getByRole('alert')).toHaveText('This is not a Monorec recipe link.');
  });
});
