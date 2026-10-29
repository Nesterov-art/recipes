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

// The contract: a link buildRecipeLink returns is always read by parseRecipeLink, and gives
// back the recipe as it was. A recipe the format cannot carry is refused when building,
// naming the field, instead of becoming a link the receiver is told is damaged.
const shared = r => ({ title: r.title, category: r.category, time: r.time, ingredients: r.ingredients, steps: r.steps });
const limitOf = r => { try { buildRecipeLink(r, origin); return 'ok'; } catch (error) { assert(error instanceof RecipeLinkError, String(error)); return error.code === 'unsupported' ? error.limit : error.code; } };

test('every link that is built is read back, at the bounds of each field', () => {
  const accepted = [
    recipe,
    { ...recipe, title: 'Т'.repeat(200) },
    { ...recipe, ingredients: Array.from({ length: 100 }, (_, i) => `${i}`) },
    { ...recipe, steps: Array.from({ length: 100 }, (_, i) => `${i}.`) },
    { ...recipe, ingredients: [], steps: [] },
    { ...recipe, ingredients: ['и'.repeat(500)] },
    { ...recipe, steps: ['ш'.repeat(1000)] },
    { ...recipe, time: 10_000 },
    { ...recipe, time: 0 },
    { ...recipe, title: 'Пирог «бабушкин» & чай #1 😊 <b>жирный</b> \\ "кавычки"', ingredients: ['Сахар — по вкусу 😊', '中文 — 1'], steps: ['\u{1F373} Жарить.'] },
  ];
  for (const r of accepted) {
    const url = buildRecipeLink(r, origin);
    assert(url.length <= MAX_LINK_LENGTH);
    assert.deepEqual(parseRecipeLink(url), shared(r), r.title.slice(0, 20));
  }
});

test('a recipe the format cannot carry is refused when building, naming what is outside it', () => {
  for (const [r, limit] of [
    [{ ...recipe, title: 'Т'.repeat(201) }, 'title'],
    [{ ...recipe, title: '   ' }, 'title'],
    [{ ...recipe, ingredients: Array.from({ length: 101 }, (_, i) => `${i}`) }, 'ingredients'],
    [{ ...recipe, ingredients: ['Вода — 1 л', ' '] }, 'ingredients'],
    [{ ...recipe, ingredients: ['и'.repeat(501)] }, 'ingredients'],
    [{ ...recipe, steps: Array.from({ length: 101 }, (_, i) => `${i}.`) }, 'steps'],
    [{ ...recipe, steps: [''] }, 'steps'],
    [{ ...recipe, steps: ['ш'.repeat(2001)] }, 'steps'],
    [{ ...recipe, time: 12_000 }, 'time'],
    [{ ...recipe, time: 1.5 }, 'time'],
    [{ ...recipe, time: -1 }, 'time'],
  ]) assert.equal(limitOf(r), limit, `${limit}: ${JSON.stringify(r).slice(0, 60)}`);
  // Nothing about the recipe is changed by trying.
  const original = { ...recipe, time: 1.5 };
  const copy = structuredClone(original);
  limitOf(original);
  assert.deepEqual(original, copy);
});

test('the 4 000-character limit stays its own error, checked after the fields', () => {
  // Grow one step until the link is as long as allowed, then one character more.
  const fitsWith = k => limitOf({ ...recipe, steps: ['ш'.repeat(k)] }) === 'ok';
  let n = 0;
  while (fitsWith(n + 1) && n < 1999) n++;
  const fits = { ...recipe, steps: ['ш'.repeat(n)] };
  assert(buildRecipeLink(fits, origin).length <= MAX_LINK_LENGTH);
  assert.deepEqual(parseRecipeLink(buildRecipeLink(fits, origin)), shared(fits));
  assert.equal(limitOf({ ...recipe, steps: ['ш'.repeat(n + 1)] }), 'size');
});

test('random recipes: whatever is built is read back unchanged', () => {
  let seed = 11;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  // Mostly valid lines; now and then an empty one or one over the 500-character limit.
  const word = () => next() < 0.03 ? ['', ' ', 'ш'.repeat(501 + Math.floor(next() * 100))][Math.floor(next() * 3)]
    : ['Вода', 'соль 😊', '中', 'a & b', '#1', 'ш'.repeat(Math.floor(next() * 120) + 1)][Math.floor(next() * 6)];
  let built = 0;
  for (let round = 0; round < 400; round++) {
    const r = {
      id: `${round}`, title: next() < 0.1 ? 'Т'.repeat(195 + Math.floor(next() * 10)) : `Рецепт ${round}`,
      category: [null, 'Завтрак', 'Обед', 'Ужин'][Math.floor(next() * 4)],
      time: [0, 15, 45, 10_000, 0, 30, 10_001, 1.5, -2][Math.floor(next() * 9)],
      ingredients: Array.from({ length: next() < 0.05 ? 101 : Math.floor(next() * 12) }, word), steps: Array.from({ length: Math.floor(next() * 6) }, word),
    };
    let url;
    try { url = buildRecipeLink(r, origin); } catch (error) { assert(error instanceof RecipeLinkError && ['unsupported', 'size'].includes(error.code)); continue; }
    built++;
    assert.deepEqual(parseRecipeLink(url), shared(r), `round ${round}`);
  }
  assert(built > 20, `${built} links built`);
});

test('links handed out before this check still open', () => {
  // Built by the version in APK 1.0.0 (4) and on the web: the format is unchanged.
  const issued = 'https://neyroshi-recipes.expo.app/shared-recipe#1.eyJ0Ijoi0KHRi9GA0L3QuNC60LggwqvQutCw0Log0YMg0LHQsNCx0YPRiNC60LjCuyAmINGH0LDQuSAjMSDwn5iKIiwiYyI6ImIiLCJtIjoyNSwiaSI6WyLQotCy0L7RgNC-0LMgNSUg4oCUIDQwMCDQsyIsItCh0LDRhdCw0YAg4oCUINC_0L4g0LLQutGD0YHRgyJdLCJzIjpbItCh0LzQtdGI0LDRgtGMLiIsItCe0LHQttCw0YDQuNGC0Ywg0L_QviAzINC80LjQvdGD0YLRiy4iXX0';
  const recipeOfIt = { id: 'x', title: 'Сырники «как у бабушки» & чай #1 😊', category: 'Завтрак', time: 25, ingredients: ['Творог 5% — 400 г', 'Сахар — по вкусу'], steps: ['Смешать.', 'Обжарить по 3 минуты.'] };
  assert.deepEqual(parseRecipeLink(issued), shared(recipeOfIt));
  assert.equal(buildRecipeLink(recipeOfIt, origin), issued);
});

test('a category outside Breakfast, Lunch and Dinner travels as none (known, format unchanged)', () => {
  const own = { ...recipe, category: 'Десерт' };
  assert.equal(parseRecipeLink(buildRecipeLink(own, origin)).category, null);
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
