import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { buildRecipeLink, MAX_LINK_LENGTH, parseRecipeLink, RecipeLinkError } from './recipe-link.ts';

const origin = 'https://neyroshi-recipes.expo.app';
const recipe = {
  id: '1793101709913-0.26163256580027383', title: 'Сырники «как у бабушки» & чай #1', category: 'Завтрак', time: 25,
  ingredients: ['Творог 5% — 400 г', 'Яйцо — 1 шт.', 'Мука — 3 ст. л.', 'Сахар — по вкусу 😊'],
  steps: ['Смешать творог, яйцо и сахар.', 'Добавить муку, слепить сырники.', 'Обжарить по 3 минуты с каждой стороны — до золотистого цвета.'],
};
const payloadOf = url => {
  const data = url.split('#')[1].slice(2).replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
};

test('a recipe goes through a link and comes back with every shared field', () => {
  const url = buildRecipeLink(recipe, origin);
  assert.match(url, /^https:\/\/neyroshi-recipes\.expo\.app\/shared-recipe#1\.[A-Za-z0-9_-]+$/);
  const shared = parseRecipeLink(url);
  assert.deepEqual(shared, { title: recipe.title, category: recipe.category, time: recipe.time, ingredients: recipe.ingredients, steps: recipe.steps });
});

test('categories, no category and zero minutes survive the round trip', () => {
  for (const category of ['Завтрак', 'Обед', 'Ужин', null]) {
    assert.equal(parseRecipeLink(buildRecipeLink({ ...recipe, category, time: 0 }, origin)).category, category);
  }
  assert.equal(parseRecipeLink(buildRecipeLink({ ...recipe, time: 0 }, origin)).time, 0);
});

test('the link carries only the recipe: no local id, history, notes, favourites, groceries or settings', () => {
  const withExtras = { ...recipe, recipeMeta: { favorite: true }, cookings: [{ note: 'личная заметка' }] };
  const url = buildRecipeLink(withExtras, origin);
  const payload = payloadOf(url);
  assert.deepEqual(Object.keys(payload).sort(), ['c', 'i', 'm', 's', 't']);
  assert(!url.includes(recipe.id) && !JSON.stringify(payload).includes(recipe.id));
  assert(!JSON.stringify(payload).includes('личная заметка'));
  assert.equal('id' in parseRecipeLink(url), false);
});

test('the link is found in a pasted message and in a link opened from another address', () => {
  const url = buildRecipeLink(recipe, origin);
  assert.deepEqual(parseRecipeLink(`${recipe.title}\n${url}\nПриятного аппетита!`), parseRecipeLink(url));
  assert.deepEqual(parseRecipeLink(url.replace(origin, 'http://127.0.0.1:4173')), parseRecipeLink(url));
  assert.deepEqual(parseRecipeLink(`  ${url}  `), parseRecipeLink(url));
});

test('a long Cyrillic recipe stays within the limit; a longer one is refused before sharing', () => {
  const ingredient = k => `Ингредиент номер ${k} с очень длинным названием — ${k + 1}00 г`;
  const step = k => `${k + 1}. Нарезать лук кольцами, обжарить на сливочном масле до золотистого цвета и томить под крышкой.`;
  const usual = { ...recipe, ingredients: Array.from({ length: 14 }, (_, k) => ingredient(k)), steps: Array.from({ length: 8 }, (_, k) => step(k)) };
  const url = buildRecipeLink(usual, origin);
  assert(url.length <= MAX_LINK_LENGTH, `${url.length} characters`);
  assert.deepEqual(parseRecipeLink(url).ingredients, usual.ingredients);
  const huge = { ...usual, steps: Array.from({ length: 40 }, (_, k) => step(k)) };
  assert.throws(() => buildRecipeLink(huge, origin), error => error instanceof RecipeLinkError && error.code === 'size');
});

test('not a Monorec link, damaged, cut or oversized data and an unknown version are told apart', () => {
  const url = buildRecipeLink(recipe, origin);
  const code = text => { try { parseRecipeLink(text); return 'ok'; } catch (error) { assert(error instanceof RecipeLinkError, String(error)); return error.code; } };
  assert.equal(code(''), 'missing');
  assert.equal(code('https://example.com/recipe/42'), 'missing');
  assert.equal(code(`${origin}/shared-recipe`), 'missing');
  assert.equal(code(url.slice(0, -12)), 'invalid'); // Cut in a messenger.
  assert.equal(code(url.replace(/#1\.(.)/, '#1.$1$1')), 'invalid');
  assert.equal(code(`${origin}/shared-recipe#1.!!!`), 'invalid');
  assert.equal(code(url.replace('#1.', '#2.')), 'version');
  assert.equal(code(`${origin}/shared-recipe#1.${'A'.repeat(MAX_LINK_LENGTH * 2)}`), 'size');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  for (const value of [{ t: '', c: null, m: 5, i: [], s: [] }, { t: 'Суп', c: 'x', m: 5, i: [], s: [] }, { t: 'Суп', c: null, m: -1, i: [], s: [] },
    { t: 'Суп', c: null, m: 5, i: [1], s: [] }, { t: 'Суп', c: null, m: 5, i: [], s: 'шаг' }, [1, 2], 'text']) {
    assert.equal(code(`${origin}/shared-recipe#1.${encode(value)}`), 'invalid', JSON.stringify(value));
  }
});
