import type { Buffer } from 'node:buffer';
import type { Page, Route } from '@playwright/test';
import { expect, openHome } from './fixtures';

// Cooking sites are played by page.route: nothing reaches a real site. Any request that leaves
// the test server and is not a stubbed site is refused and recorded.
export const SITE = 'https://recipes.example';
export type Reply = { status?: number; body?: string | Buffer; type?: string | null; headers?: Record<string, string>; delay?: number; abort?: boolean; hold?: Promise<void> };
export async function sites(page: Page, reply: (url: string) => Reply) {
  const requests: string[] = [], strays: string[] = [];
  await page.route(url => url.hostname !== '127.0.0.1', route => { strays.push(route.request().url()); return route.abort('blockedbyclient'); });
  await page.route('https://*.example/**', async (route: Route) => {
    const url = route.request().url();
    requests.push(url);
    const r = reply(url);
    if (r.hold) await r.hold;
    if (r.delay) await new Promise(resolve => setTimeout(resolve, r.delay));
    try {
      if (r.abort) return await route.abort('failed');
      await route.fulfill({
        status: r.status ?? 200, body: r.body ?? '',
        headers: { ...(r.type === null ? {} : { 'content-type': r.type ?? 'text/html; charset=utf-8' }), 'access-control-allow-origin': '*', ...r.headers },
      });
    } catch { /* The page already gave up on this request (cancel, timeout, left the screen). */ }
  });
  return { requests, strays };
}
// A page with these JSON-LD blocks, and a Recipe as sites write it.
export const recipePage = (...ld: unknown[]) => `<!doctype html><html><head><title>Рецепт</title>${ld.map(x => `<script type="application/ld+json">${typeof x === 'string' ? x : JSON.stringify(x)}</script>`).join('')}</head><body><h1>Рецепт</h1></body></html>`;
export const syrniki = (over: Record<string, unknown> = {}) => ({
  '@context': 'https://schema.org', '@type': 'Recipe', name: 'Сырники из творога 😊', recipeCategory: 'Завтрак', totalTime: 'PT30M',
  recipeIngredient: ['Творог 5% — 400 г', 'Яйцо — 1 шт.', 'Мука — 3 ст. л.'],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Смешать творог, яйцо и муку.' }, { '@type': 'HowToStep', text: 'Обжарить по 3 минуты.' }], ...over,
});
export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
export const storage = (page: Page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
export async function openImport(page: Page) {
  await openHome(page);
  await button(page, 'Добавить рецепт').click();
  await button(page, 'Добавить по ссылке').click();
  await expect(page).toHaveURL(/\/import-link$/);
}
export async function find(page: Page, text: string, label = 'Ссылка на рецепт', action = 'Найти рецепт') {
  await page.getByRole('textbox', { name: label, exact: true }).fill(text);
  await button(page, action).click();
}
export const preview = (page: Page) => page.getByTestId('recipe-site-preview');
