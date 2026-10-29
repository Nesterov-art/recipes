import assert from 'node:assert/strict';
import test from 'node:test';
import { SafeStore } from './safe-storage.ts';
import { bookConfig } from './storage-models.ts';
import { createRecipeIn, createWithFreshId } from './recipe-create.ts';

// The real store and book model over an in-memory storage, as in safe-storage.test.mjs.
const key = 'recipe-book-v1';
const omelet = { id: '1700000000000-0.5', title: 'Омлет', category: 'Завтрак', time: 10, ingredients: ['Яйца — 2 шт'], steps: ['Взбить.'] };
const soup = { id: 'soup', title: 'Суп', category: 'Обед', time: 30, ingredients: ['Вода'], steps: ['Варить.'] };
const meta = { [omelet.id]: { favorite: true, cookings: [{ id: 'c1', cookedAt: '2026-10-10T10:00:00.000Z', rating: 'great', note: 'Вкусно' }] } };
const fresh = { title: 'Сырники', category: 'Завтрак', time: 30, ingredients: ['Творог — 400 г'], steps: ['Смешать.'] };
function storage(seed = {}) {
  const data = new Map(Object.entries(seed));
  const failing = { writes: 0, landThenThrow: 0 };
  const log = [];
  return {
    data, failing, log,
    async getItem(k) { return data.get(k) ?? null; },
    async setItem(k, value) {
      if (k === key && failing.writes > 0) { failing.writes--; throw new Error('synthetic write failure'); }
      data.set(k, value); log.push(k);
      if (k === key && failing.landThenThrow > 0) { failing.landThenThrow--; throw new Error('written, but reported as failed'); }
    },
  };
}
async function open(recipes = [omelet, soup]) {
  const io = storage({ [key]: JSON.stringify({ recipes, recipeMeta: meta }) });
  const store = new SafeStore(io, bookConfig());
  await store.load();
  io.log.length = 0;
  return { io, store, book: () => store.getSnapshot().data, stored: () => JSON.parse(io.data.get(key)) };
}

test('a new id is created at the top of the book; history, favourites and other recipes stay', async () => {
  const { store, book, stored } = await open();
  let saved = 0;
  assert.equal(await createRecipeIn(store, { id: 'new-1', ...fresh }, () => saved++), 'created');
  assert.equal(saved, 1);
  assert.deepEqual(book().recipes, [{ id: 'new-1', ...fresh }, omelet, soup]);
  assert.deepEqual(book().recipeMeta, meta);
  assert.deepEqual(stored().recipes, book().recipes);
});

test('a taken id is refused: no recipe replaced, nothing written, no success reported', async () => {
  const { io, store, book, stored } = await open();
  const before = io.data.get(key);
  let saved = 0;
  assert.equal(await createRecipeIn(store, { id: omelet.id, ...fresh }, () => saved++), 'idTaken');
  assert.equal(saved, 0);
  assert.equal(io.data.get(key), before);
  assert.deepEqual(io.log, []);
  assert.deepEqual(book().recipes, [omelet, soup]);
  assert.deepEqual(stored().recipeMeta, meta);
  // The store stays usable for the next save.
  assert.equal(await createRecipeIn(store, { id: 'new-2', ...fresh }), 'created');
});

test('two creations with the same id at once: one is written, the other is refused, never both', async () => {
  const { store, book } = await open();
  const results = await Promise.all([
    createRecipeIn(store, { id: 'same', ...fresh }),
    createRecipeIn(store, { id: 'same', ...fresh, title: 'Другие сырники' }),
  ]);
  assert.deepEqual(results.sort(), ['created', 'idTaken']);
  assert.equal(book().recipes.filter(recipe => recipe.id === 'same').length, 1);
  assert.equal(book().recipes.find(recipe => recipe.id === 'same').title, 'Сырники');
  assert.equal(book().recipes.length, 3);
});

test('an exact copy is refused when asked (recipes from sites), atomically, even under a new id', async () => {
  const { store, book } = await open();
  const [a, b] = await Promise.all([
    createRecipeIn(store, { id: 'x1', ...fresh }, undefined, { refuseDuplicate: true }),
    createRecipeIn(store, { id: 'x2', ...fresh }, undefined, { refuseDuplicate: true }),
  ]);
  assert.deepEqual([a, b], ['created', 'duplicate']);
  assert.equal(book().recipes.filter(recipe => recipe.title === fresh.title).length, 1);
  // A manual recipe may still repeat one (unchanged rule).
  assert.equal(await createRecipeIn(store, { id: 'x3', ...fresh }), 'created');
});

test('a failed write: not reported as saved; Retry writes the same recipe once and only then reports', async () => {
  const { io, store, book } = await open();
  io.failing.writes = 1;
  let saved = 0;
  assert.equal(await createRecipeIn(store, { id: 'r1', ...fresh }, () => saved++), 'notSaved');
  assert.equal(saved, 0);
  assert.equal(store.getSnapshot().issue, 'write');
  assert.deepEqual(book().recipes, [omelet, soup]);
  // While the write is kept, another creation is not taken in.
  assert.equal(await createRecipeIn(store, { id: 'r2', ...fresh, title: 'Другое' }), 'notSaved');
  assert.equal(await store.retry(), true);
  assert.equal(saved, 1);
  assert.deepEqual(book().recipes.map(recipe => recipe.id), ['r1', omelet.id, soup.id]);
  // Saving it again is refused, not doubled and not taken over: the same id is not proof of "ours".
  assert.equal(await createRecipeIn(store, { id: 'r1', ...fresh }), 'idTaken');
  assert.equal(book().recipes.length, 3);
});

test('a write that landed but reported an error is recognised by the store, not written twice', async () => {
  const { io, store, book } = await open();
  io.failing.landThenThrow = 1;
  let saved = 0;
  assert.equal(await createRecipeIn(store, { id: 'l1', ...fresh }, () => saved++), 'created');
  assert.equal(saved, 1);
  assert.equal(book().recipes.filter(recipe => recipe.id === 'l1').length, 1);
  assert.equal(JSON.parse(io.data.get(key)).recipes.filter(recipe => recipe.id === 'l1').length, 1);
});

test('a fresh id is tried when the first is taken; after three taken ids a controlled refusal', async () => {
  const { store, book } = await open();
  const ids = [omelet.id, soup.id, 'free'];
  const saved = [];
  const created = await createWithFreshId((recipe, after, options) => createRecipeIn(store, recipe, after, options), fresh, id => saved.push(id), {}, () => ids.shift());
  assert.deepEqual(created, { result: 'created', id: 'free' });
  assert.deepEqual(saved, ['free']);
  assert.deepEqual(book().recipes.map(recipe => recipe.id), ['free', omelet.id, soup.id]);
  assert.deepEqual(book().recipes.find(recipe => recipe.id === omelet.id), omelet);
  const stuck = await createWithFreshId((recipe, after, options) => createRecipeIn(store, recipe, after, options), fresh, () => assert.fail('not saved'), {}, () => omelet.id);
  assert.deepEqual(stuck, { result: 'idTaken', id: omelet.id });
  assert.deepEqual(book().recipes.find(recipe => recipe.id === omelet.id), omelet);
  assert.equal(book().recipes.length, 3);
});
