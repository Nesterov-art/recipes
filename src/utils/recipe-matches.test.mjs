import assert from 'node:assert/strict';
import test from 'node:test';

import { matchRecipesToShoppingList } from './recipe-matches.ts';
import { createShoppingItem } from './shopping.ts';

function recipe(id, ingredients, title = id) {
  return { id, title, category: null, time: 10, ingredients, steps: [] };
}

function item(value, id = value, checked = false) {
  const created = createShoppingItem(value, id, checked);
  assert.ok(created);
  return created;
}

test('one shopping item can match several recipes regardless of checkbox state', () => {
  const recipes = [
    recipe('omelet', ['Яйца — 3 шт', 'Сыр — 40 г']),
    recipe('pasta', ['Яйцо — 1 шт', 'Спагетти — 200 г']),
  ];

  const matches = matchRecipesToShoppingList(recipes, [item('Яйца — 6 шт', 'eggs', true)]);

  assert.deepEqual(matches.map(({ recipe: matchedRecipe }) => matchedRecipe.id), ['omelet', 'pasta']);
  assert.deepEqual(matches.map(({ matchedCount }) => matchedCount), [1, 1]);
});

test('reports a full name-only match without checking quantities', () => {
  const matches = matchRecipesToShoppingList(
    [recipe('omelet', ['Яйца — 6 шт', 'Молоко — 1 л'])],
    [item('яйцо — 1 шт'), item('молоко — 100 мл')],
  );

  assert.equal(matches[0].matchRatio, 1);
  assert.equal(matches[0].matchedCount, 2);
  assert.deepEqual(matches[0].missingIngredients, []);
});

test('returns original missing ingredient labels for partial matches', () => {
  const matches = matchRecipesToShoppingList(
    [recipe('pasta', ['Спагетти — 200 г', 'Сыр — 50 г', 'Соль'])],
    [item('сыр')],
  );

  assert.equal(matches[0].matchedCount, 1);
  assert.equal(matches[0].totalCount, 3);
  assert.deepEqual(matches[0].missingIngredients, ['Спагетти — 200 г', 'Соль']);
});

test('normalizes case, whitespace and egg forms without merging distinct onions', () => {
  const matches = matchRecipesToShoppingList(
    [
      recipe('eggs', ['ЯЙЦО — 2 шт']),
      recipe('onion', ['Лук']),
      recipe('green-onion', ['Зелёный лук']),
    ],
    [item('  яйца  '), item(' ЗЕЛЁНЫЙ   ЛУК ')],
  );

  assert.deepEqual(matches.map(({ recipe: matchedRecipe }) => matchedRecipe.id), ['eggs', 'green-onion']);
});

test('matches potato and colloquial potato forms by product name', () => {
  const matches = matchRecipesToShoppingList(
    [recipe('potatoes', ['Картофель — 500 г', 'Соль'])],
    [item('КАРТОШКА — 1 кг')],
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].matchedCount, 1);
  assert.deepEqual(matches[0].missingIngredients, ['Соль']);
});

test('sorts by match ratio, then by matched ingredient count', () => {
  const matches = matchRecipesToShoppingList(
    [
      recipe('half-one', ['Яйцо', 'Масло']),
      recipe('full-one', ['Яйцо']),
      recipe('half-two', ['Яйцо', 'Сыр', 'Масло', 'Молоко']),
      recipe('full-two', ['Яйцо', 'Сыр']),
    ],
    [item('яйца'), item('сыр')],
  );

  assert.deepEqual(matches.map(({ recipe: matchedRecipe }) => matchedRecipe.id), [
    'full-two',
    'full-one',
    'half-two',
    'half-one',
  ]);
});

test('handles empty data and no matches', () => {
  const recipes = [recipe('omelet', ['Яйца'])];

  assert.deepEqual(matchRecipesToShoppingList(recipes, []), []);
  assert.deepEqual(matchRecipesToShoppingList([], [item('Яйца')]), []);
  assert.deepEqual(matchRecipesToShoppingList(recipes, [item('Молоко')]), []);
});
