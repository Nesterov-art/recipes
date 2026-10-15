import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createShoppingItem,
  mergeShoppingEntries,
  migrateShoppingItems,
  normalizeProductName,
  orderShoppingItems,
  parseShoppingEntry,
  reorderShoppingItems,
  updateShoppingItem,
} from './shopping.ts';

function item(value, id = value) {
  const created = createShoppingItem(value, id);
  assert.ok(created);
  return created;
}

test('separates product name, quantity and unit', () => {
  assert.deepEqual(parseShoppingEntry('  Лук   —  1   шт. '), {
    name: 'Лук',
    quantity: 1,
    unit: 'шт.',
  });
  assert.deepEqual(parseShoppingEntry('Молоко 1,5 л'), {
    name: 'Молоко',
    quantity: 1.5,
    unit: 'л',
  });
});

test('normalizes case, spaces and obvious singular/plural forms only', () => {
  assert.equal(normalizeProductName('  ЯЙЦА  '), normalizeProductName('яйцо'));
  assert.equal(normalizeProductName('Картошка'), normalizeProductName('картофель'));
  assert.equal(normalizeProductName('КАРТОШКУ'), normalizeProductName('картофеля'));
  assert.equal(normalizeProductName(' Красный   лук '), normalizeProductName('красный лук'));
  assert.notEqual(normalizeProductName('Лук'), normalizeProductName('Зелёный лук'));
  assert.notEqual(normalizeProductName('Картошка'), normalizeProductName('картофельное пюре'));
});

test('fills quantity when an existing product has none', () => {
  const result = mergeShoppingEntries([item('Лук', 'onion')], ['лук — 1 шт']);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].quantity, 1);
  assert.equal(result.items[0].unit, 'шт.');
  assert.equal(result.items[0].text, 'Лук — 1 шт.');
});

test('sums compatible quantities and repeated additions', () => {
  const first = mergeShoppingEntries([], ['Яйца — 2 шт'], () => 'eggs');
  const second = mergeShoppingEntries(first.items, ['яйцо — 3 шт']);
  const repeated = mergeShoppingEntries(second.items, [' ЯЙЦА — 1 шт. ']);

  assert.equal(repeated.items.length, 1);
  assert.equal(repeated.items[0].quantity, 6);
  assert.equal(repeated.items[0].text, 'Яйца — 6 шт.');
});

test('converts kilograms to grams and liters to milliliters safely', () => {
  const mass = mergeShoppingEntries([item('Мука — 500 г', 'flour')], ['мука — 1 кг']);
  const volume = mergeShoppingEntries([item('Молоко — 1 л', 'milk')], ['молоко — 500 мл']);

  assert.equal(mass.items[0].quantity, 1500);
  assert.equal(mass.items[0].unit, 'г');
  assert.equal(volume.items[0].quantity, 1.5);
  assert.equal(volume.items[0].unit, 'л');
});

test('keeps incompatible units as separate editable positions', () => {
  const result = mergeShoppingEntries([item('Сыр — 200 г', 'cheese-weight')], ['сыр — 2 шт']);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map(({ quantity, unit }) => ({ quantity, unit })), [
    { quantity: 200, unit: 'г' },
    { quantity: 2, unit: 'шт.' },
  ]);

  const edited = updateShoppingItem(result.items[1], 'Сыр — 3 шт');
  assert.ok(edited);
  assert.equal(edited.id, result.items[1].id);
  assert.equal(edited.quantity, 3);
});

test('does not add duplicates that differ only by case or spaces', () => {
  const result = mergeShoppingEntries([item('  Соль ', 'salt')], ['соль', ' СОЛЬ  ']);
  assert.equal(result.items.length, 1);
  assert.equal(result.changedCount, 0);
});

test('migrates legacy text records without dropping entries', () => {
  const migrated = migrateShoppingItems([
    { id: '1', text: 'Лук', checked: false },
    { id: '2', text: 'Молоко — 500 мл', checked: true },
    'Соль',
  ]);

  assert.equal(migrated.length, 3);
  assert.deepEqual(migrated[0], {
    id: '1',
    name: 'Лук',
    text: 'Лук',
    checked: false,
  });
  assert.equal(migrated[1].name, 'Молоко');
  assert.equal(migrated[1].quantity, 500);
  assert.equal(migrated[1].unit, 'мл');
  assert.equal(migrated[1].checked, true);
  assert.equal(migrated[2].name, 'Соль');
  assert.equal(migrated[2].checked, false);
});

test('reorders a long list and preserves that order after storage reload', () => {
  const original = Array.from({ length: 100 }, (_, index) => item(`Продукт ${index}`, `item-${index}`));
  const orderedIds = original.map(({ id }) => id);
  orderedIds.unshift(orderedIds.pop());

  const reordered = reorderShoppingItems(original, orderedIds);
  const reloaded = migrateShoppingItems(JSON.parse(JSON.stringify(reordered)));

  assert.equal(reloaded.length, 100);
  assert.deepEqual(reloaded.map(({ id }) => id), orderedIds);
  assert.equal(reloaded[0].id, 'item-99');
});

test('rejects an incomplete order instead of dropping shopping items', () => {
  const original = [item('Лук', 'onion'), item('Молоко', 'milk')];
  assert.equal(reorderShoppingItems(original, ['onion']), original);
  assert.equal(reorderShoppingItems(original, ['onion', 'onion']), original);
});

test('moves checked items down without changing order inside either group', () => {
  const first = item('Молоко', 'milk');
  const second = { ...item('Хлеб', 'bread'), checked: true };
  const third = item('Яйца', 'eggs');
  const fourth = { ...item('Соль', 'salt'), checked: true };
  const original = [first, second, third, fourth];

  assert.equal(orderShoppingItems(original, false), original);
  assert.deepEqual(orderShoppingItems(original, true).map(({ id }) => id), [
    'milk',
    'eggs',
    'bread',
    'salt',
  ]);
});
