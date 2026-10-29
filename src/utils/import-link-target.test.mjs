import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranslator } from '../constants/i18n.ts';
import { linkTarget, loadMessage, parseMessage, problemMessage } from './import-link-target.ts';
import { buildRecipeLink, SHARE_ORIGIN } from './recipe-link.ts';

const recipe = { id: 'r1', title: 'Сырники', category: 'Завтрак', time: 25, ingredients: ['Творог — 400 г'], steps: ['Смешать.'] };
const link = buildRecipeLink(recipe, SHARE_ORIGIN);
const own = [new URL(SHARE_ORIGIN).hostname];

test('a Monorec link is read locally as before, alone, inside a message or from another address', () => {
  const shared = { title: recipe.title, category: recipe.category, time: recipe.time, ingredients: recipe.ingredients, steps: recipe.steps };
  assert.deepEqual(linkTarget(link, own), { kind: 'monorec', recipe: shared });
  assert.deepEqual(linkTarget(`Смотри, что я нашёл:\n${link}`, own), { kind: 'monorec', recipe: shared });
  assert.deepEqual(linkTarget(link.replace(SHARE_ORIGIN, 'http://127.0.0.1:4173'), own), { kind: 'monorec', recipe: shared });
});

test('a damaged, cut, newer or oversized Monorec link keeps its own error and is never loaded from the network', () => {
  assert.deepEqual(linkTarget(link.slice(0, -10), own), { kind: 'monorecError', code: 'invalid' });
  assert.deepEqual(linkTarget(link.replace('#1.', '#7.'), own), { kind: 'monorecError', code: 'version' });
  assert.deepEqual(linkTarget(`${SHARE_ORIGIN}/shared-recipe#1.${'A'.repeat(5000)}`, own), { kind: 'monorecError', code: 'size' });
  // Even on a cooking site's address, a Monorec link path is not fetched.
  assert.equal(linkTarget('https://eda.ru/shared-recipe#1.broken', own).kind, 'monorecError');
});

test('one https address of another site is a page to load, normalised', () => {
  assert.deepEqual(linkTarget('https://Eda.RU/recepty/1', own), { kind: 'site', url: 'https://eda.ru/recepty/1' });
  assert.deepEqual(linkTarget('  https://eda.ru/recepty/1#comments \n', own), { kind: 'site', url: 'https://eda.ru/recepty/1' });
  // Shared from a browser: a title, then the address.
  assert.deepEqual(linkTarget('Сырники из творога — пошаговый рецепт\nhttps://eda.ru/recepty/1', own), { kind: 'site', url: 'https://eda.ru/recepty/1' });
});

test('names that only look like Monorec are other sites; the Monorec host itself is not loaded', () => {
  for (const address of ['https://neyroshi-recipes.expo.app.evil.example/r', 'https://evil-neyroshi-recipes.expo.app/r', 'https://neyroshi-recipes--abc123.expo.app/r', 'https://expo.app/neyroshi-recipes']) {
    assert.equal(linkTarget(address, own).kind, 'site', address);
  }
  for (const address of [`${SHARE_ORIGIN}/recipes`, 'https://NEYROSHI-RECIPES.EXPO.APP./recipe/1', `${SHARE_ORIGIN}/shared-recipe`]) {
    assert.deepEqual(linkTarget(address, own), { kind: 'ownPage' }, address);
  }
  // On the web the page's own host counts too.
  assert.deepEqual(linkTarget('https://monorec.example/recipes', [...own, 'monorec.example']), { kind: 'ownPage' });
});

test('addresses that cannot be loaded are refused with the reason, before any request', () => {
  assert.deepEqual(linkTarget('eda.ru/recepty/1', own), { kind: 'refused', result: { status: 'invalidUrl' } });
  assert.deepEqual(linkTarget('http://eda.ru/recepty/1', own), { kind: 'refused', result: { status: 'blockedUrl', reason: 'scheme', redirect: false } });
  assert.deepEqual(linkTarget('javascript:alert(1)', own), { kind: 'refused', result: { status: 'blockedUrl', reason: 'scheme', redirect: false } });
  assert.deepEqual(linkTarget('https://192.168.1.1/', own), { kind: 'refused', result: { status: 'blockedUrl', reason: 'ipAddress', redirect: false } });
  assert.deepEqual(linkTarget('https://localhost/', own), { kind: 'refused', result: { status: 'blockedUrl', reason: 'localHost', redirect: false } });
});

test('text without exactly one address is not a link', () => {
  for (const text of ['', '   ', 'Посмотри рецепт сырников', 'Look at this recipe: it is great', 'Привет. Вот рецепт', 'https://eda.ru/1 https://eda.ru/2']) {
    assert.deepEqual(linkTarget(text, own), { kind: 'notLink' }, text);
  }
});

const STATUSES = [
  { status: 'invalidUrl' },
  ...['scheme', 'credentials', 'port', 'localHost', 'ipAddress'].map(reason => ({ status: 'blockedUrl', reason, redirect: false })),
  { status: 'blockedUrl', reason: 'ipAddress', redirect: true },
  { status: 'tooManyRedirects', limit: 5 },
  ...['denied', 'notFound', 'rateLimited', 'server', 'other'].map(kind => ({ status: 'httpError', httpStatus: { denied: 403, notFound: 404, rateLimited: 429, server: 500, other: 418 }[kind], kind })),
  { status: 'unsupportedContentType', contentType: 'application/pdf' },
  { status: 'empty' }, { status: 'tooLarge', limit: 3 * 1024 * 1024 }, { status: 'timeout', limitMs: 15000 }, { status: 'cancelled' },
  ...['request', 'read', 'redirect', 'noStream'].map(stage => ({ status: 'networkError', stage })),
  { status: 'unsupportedEncoding', encoding: 'windows-1251' }, { status: 'invalidEncoding', encoding: 'utf-8' },
];
const PARSED = [
  { status: 'noRecipe', source: { recipes: 0, skippedBlocks: 0 } }, { status: 'invalidData', source: { recipes: 0, skippedBlocks: 1 } },
  { status: 'unsupported', reason: 'pageTooLarge', limit: 6_000_000 }, { status: 'unsupported', reason: 'dataTooLarge', limit: 100 },
  { status: 'unsupported', reason: 'recipeTooLarge', problems: [{ field: 'ingredients', problem: 'tooMany', limit: 500 }] },
];
const PROBLEMS = [
  ...['title', 'time', 'category', 'ingredients', 'steps'].map(field => ({ field, problem: 'missing' })),
  ...['invalid', 'notWholeMinutes', 'zero', 'outOfRange', 'conflicting'].map(problem => ({ field: 'time', problem })),
  { field: 'time', problem: 'mayIncludeWaiting', activeMinutes: 165 }, { field: 'time', problem: 'onlyPart', part: 'prepTime' }, { field: 'time', problem: 'onlyPart', part: 'cookTime' },
  { field: 'category', problem: 'ambiguous' },
];
const words = (message, language) => createTranslator(language)(message.key, message.values);

test('every loading, reading and parsing outcome has a message in Russian and in English, with its values filled in', () => {
  const messages = [...STATUSES.flatMap(s => [loadMessage(s, false), loadMessage(s, true)]), ...PARSED.map(parseMessage), ...PROBLEMS.map(problemMessage)];
  for (const message of messages) {
    for (const language of ['ru', 'en']) {
      const text = words(message, language);
      assert.ok(text && text.length > 10, `${message.key} ${language}`);
      assert.doesNotMatch(text, /\{\w+\}/, `${message.key} ${language}: ${text}`);
    }
    assert.notEqual(words(message, 'ru'), words(message, 'en'), message.key);
  }
  assert.match(words(loadMessage({ status: 'httpError', httpStatus: 500, kind: 'server' }, false), 'ru'), /500/);
  assert.match(words(loadMessage({ status: 'unsupportedEncoding', encoding: 'windows-1251' }, false), 'ru'), /windows-1251/);
  assert.match(words(problemMessage({ field: 'time', problem: 'mayIncludeWaiting', activeMinutes: 165 }), 'ru'), /165/);
});

test('a network failure on the web says the site may limit browser access, without claiming CORS', () => {
  const web = words(loadMessage({ status: 'networkError', stage: 'request' }, true), 'ru');
  const app = words(loadMessage({ status: 'networkError', stage: 'request' }, false), 'ru');
  assert.notEqual(web, app);
  assert.match(web, /Возможно/);
  assert.match(web, /вручную/);
  for (const text of [web, words(loadMessage({ status: 'networkError', stage: 'request' }, true), 'en')]) assert.doesNotMatch(text, /CORS/i);
  // Other outcomes read the same on every platform.
  assert.deepEqual(loadMessage({ status: 'timeout', limitMs: 15000 }, true), loadMessage({ status: 'timeout', limitMs: 15000 }, false));
});

test('no message promises that every site works', () => {
  const all = [...STATUSES.map(s => loadMessage(s, true)), ...PARSED.map(parseMessage)].flatMap(m => [words(m, 'ru'), words(m, 'en')]);
  for (const text of all) assert.doesNotMatch(text, /любо[йг][о]? сайт|any site|all sites|всех сайт/i, text);
});
