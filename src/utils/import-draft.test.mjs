import assert from 'node:assert/strict';
import test from 'node:test';
import { draftFields, findDuplicate, formTime, recipeFromDraft } from './import-draft.ts';

const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
const draft = (over = {}) => deepFreeze({
  title: 'Сырники из творога 😊', category: 'Завтрак', time: 30,
  ingredients: ['Творог 5% — 400 г', 'Яйцо — 1 шт.'], steps: ['Смешать.', 'Обжарить.'], ...over,
});
const book = [
  { id: 'a', title: 'Омлет', category: 'Завтрак', time: 10, ingredients: ['Яйца — 2 шт'], steps: ['Взбить.'] },
  { id: 'b', title: 'Сырники из творога 😊', category: 'Завтрак', time: 30, ingredients: ['Творог 5% — 400 г', 'Яйцо — 1 шт.'], steps: ['Смешать.', 'Обжарить.'] },
];

test('form fields from a draft: lines joined, an unknown time left empty, never "0"', () => {
  assert.deepEqual(draftFields(draft()), { title: 'Сырники из творога 😊', category: 'Завтрак', time: '30', ingredients: 'Творог 5% — 400 г\nЯйцо — 1 шт.', steps: 'Смешать.\nОбжарить.' });
  assert.equal(draftFields(draft({ time: null })).time, '');
  assert.equal(draftFields(draft({ time: 0 })).time, '0');
  assert.deepEqual(draftFields(draft({ title: '', category: null, ingredients: [], steps: [] })), { title: '', category: null, time: '30', ingredients: '', steps: '' });
});

test('a recipe straight from the preview only when nothing is unknown or missing', () => {
  assert.deepEqual(recipeFromDraft(draft(), 'id-1'), { id: 'id-1', title: 'Сырники из творога 😊', category: 'Завтрак', time: 30, ingredients: ['Творог 5% — 400 г', 'Яйцо — 1 шт.'], steps: ['Смешать.', 'Обжарить.'] });
  // Without a category the recipe is still whole (the form allows it).
  assert.equal(recipeFromDraft(draft({ category: null }), 'id-1').category, null);
  for (const over of [{ title: '' }, { title: '   ' }, { time: null }, { time: -1 }, { time: Number.NaN }, { ingredients: [] }, { steps: [] }, { ingredients: ['  '] }, { steps: ['a\nb'] }, { category: 'Десерт' }]) {
    assert.equal(recipeFromDraft(draft(over), 'id-1'), null, JSON.stringify(over));
  }
  // An explicit 0 is a time like any other.
  assert.equal(recipeFromDraft(draft({ time: 0 }), 'id-1').time, 0);
});

test('preparing a recipe never changes the draft and shares no arrays with it', () => {
  const source = draft();
  const recipe = recipeFromDraft(source, 'id-1');
  assert.notEqual(recipe.ingredients, source.ingredients);
  assert.notEqual(recipe.steps, source.steps);
  recipe.ingredients.push('x');
  assert.equal(source.ingredients.length, 2);
  assert.doesNotThrow(() => draftFields(source));
});

test('a duplicate is an exact match of every field, found with the existing backup comparison', () => {
  const { id: _, ...same } = book[1];
  assert.equal(findDuplicate(book, same), 'b');
  for (const over of [{ title: 'Сырники из творога' }, { time: 31 }, { category: null }, { ingredients: ['Творог 5% — 400 г'] }, { steps: ['Смешать.', 'Обжарить!'] }]) {
    assert.equal(findDuplicate(book, { ...same, ...over }), null, JSON.stringify(over));
  }
  assert.equal(findDuplicate([], same), null);
  // Only the title matching is not a duplicate.
  assert.equal(findDuplicate(book, { title: 'Омлет', category: null, time: 5, ingredients: ['Яйца'], steps: ['Пожарить.'] }), null);
  // A large book: still exact, still the right id.
  const many = Array.from({ length: 3000 }, (_, i) => ({ id: `r${i}`, title: `Рецепт ${i}`, category: null, time: i, ingredients: [`П ${i}`], steps: [`Ш ${i}`] }));
  assert.equal(findDuplicate([...many, book[1]], same), 'b');
  assert.deepEqual(book[1].ingredients, ['Творог 5% — 400 г', 'Яйцо — 1 шт.']);
});

test('time in the form: an imported draft must have one, a manual recipe keeps its existing rule', () => {
  // Manual recipe: unchanged, an empty field still means 0 minutes.
  assert.deepEqual(formTime('', { required: false }), { ok: true, minutes: 0 });
  assert.deepEqual(formTime('  ', { required: false }), { ok: true, minutes: 0 });
  assert.deepEqual(formTime('15', { required: false }), { ok: true, minutes: 15 });
  assert.deepEqual(formTime('1.5', { required: false }), { ok: true, minutes: 1.5 });
  assert.deepEqual(formTime('-1', { required: false }), { ok: false, error: 'invalid' });
  assert.deepEqual(formTime('abc', { required: false }), { ok: false, error: 'invalid' });
  // Imported draft: an empty field is a question to answer, not 0.
  assert.deepEqual(formTime('', { required: true }), { ok: false, error: 'required' });
  assert.deepEqual(formTime('   ', { required: true }), { ok: false, error: 'required' });
  assert.deepEqual(formTime('0', { required: true }), { ok: true, minutes: 0 });
  assert.deepEqual(formTime('45', { required: true }), { ok: true, minutes: 45 });
  assert.deepEqual(formTime('-5', { required: true }), { ok: false, error: 'invalid' });
});
