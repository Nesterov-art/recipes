import assert from 'node:assert/strict';
import test from 'node:test';
import { SafeStore } from './safe-storage.ts';
import { bookConfig, shoppingConfig, settingsConfig, onboardingConfig } from './storage-models.ts';
import { mergeShoppingEntries } from './shopping.ts';
import { parseRecipeBackup, serializeRecipeBackup } from './recipe-backup.ts';

const recipe = { id: 'a', title: 'Суп', category: null, time: 10, ingredients: ['Вода'], steps: ['Варить'] };
const book = { recipes: [recipe], recipeMeta: { a: { favorite: true, cookings: [
  { id: 'old-cooking', cookedAt: '2026-10-19T10:00:00.000Z', rating: 'great', note: 'Сохранённая заметка' },
] } } };
const key = 'recipe-book-v1';
function adapter(seed = {}) {
  const data = new Map(Object.entries(seed));
  const reads = new Set(); const writes = new Set(); const log = [];
  return {
    data, reads, writes, log,
    async getItem(key) { if (reads.has(key)) throw new Error('synthetic read failure'); return data.get(key) ?? null; },
    async setItem(key, value) {
      if (writes.has(key) || writes.has('*')) throw new Error('synthetic quota failure');
      log.push(key); data.set(key, value);
    },
  };
}
test('P0: valid canonical book survives an independent legacy read failure', async () => {
  const raw = JSON.stringify(book);
  const io = adapter({ [key]: raw, recipes: 'original legacy' }); io.reads.add('recipes');
  const store = new SafeStore(io, bookConfig()); await store.load();
  assert.equal(store.getSnapshot().loaded, true);
  assert.deepEqual(store.getSnapshot().data, book);
  assert.equal(io.data.get(key), raw); assert.equal(io.data.get('recipes'), 'original legacy');
  assert(!io.log.includes('recipes'));
});
test('P0: damaged primary without valid fallback is never replaced by an empty book', async () => {
  const io = adapter({ [key]: '{broken-but-preserve-me' });
  const store = new SafeStore(io, bookConfig()); await store.load(); await store.load();
  assert.equal(store.getSnapshot().issue, 'invalid'); assert.equal(store.getSnapshot().loaded, false);
  assert.equal(await store.update(() => book), false);
  assert.equal(io.data.get(key), '{broken-but-preserve-me'); assert.deepEqual(io.log, []);
});
test('P0: malformed or partially invalid shopping lists never migrate or lose records', async () => {
  for (const raw of ['broken', '{}', 'null', '["Лук",{}]', '[{"text":"Лук","quantity":-2}]']) {
    const io = adapter({ 'shopping-list-v1': raw }); const store = new SafeStore(io, shoppingConfig);
    await store.load(); await store.load();
    assert.equal(store.getSnapshot().loaded, false); assert.equal(io.data.get('shopping-list-v1'), raw);
    assert.deepEqual(io.log, []);
  }
});
test('empty storage is a successful load, not a read error', async () => {
  const io = adapter(); const store = new SafeStore(io, bookConfig()); await store.load();
  assert.equal(store.getSnapshot().loaded, true); assert.equal(store.getSnapshot().issue, undefined);
  assert.deepEqual(JSON.parse(io.data.get(key)), { recipes: [], recipeMeta: {} });
});
test('primary read failure blocks fallback writes; explicit reread recovers', async () => {
  const io = adapter({ [key]: JSON.stringify(book), recipes: '[]' }); io.reads.add(key);
  const store = new SafeStore(io, bookConfig()); await store.load();
  assert.equal(store.getSnapshot().issue, 'read'); assert.deepEqual(io.log, []);
  io.reads.clear(); await store.load(); assert.deepEqual(store.getSnapshot().data, book);
});
test('invalid legacy metadata cannot trigger a partial migration', async () => {
  const io = adapter({ recipes: JSON.stringify([recipe]), 'recipe-meta-v1': 'broken' });
  const store = new SafeStore(io, bookConfig()); await store.load();
  assert.equal(store.getSnapshot().loaded, false); assert.deepEqual(io.log, []);
});
test('controlled fallback recovery archives exact original bytes before overwriting', async () => {
  const io = adapter({ [key]: 'damaged \n original', recipes: JSON.stringify([recipe]), 'recipe-meta-v1': '{}' });
  const store = new SafeStore(io, bookConfig()); await store.load();
  assert.equal(store.getSnapshot().canRecover, true); assert.deepEqual(io.log, []);
  assert.equal(await store.recover(), true);
  const archiveKey = io.log.find(value => value.startsWith('storage-recovery-v1:'));
  assert.equal(JSON.parse(io.data.get(archiveKey))[key].raw, 'damaged \n original');
  assert(io.log.indexOf(archiveKey) < io.log.indexOf(key));
  assert.equal(JSON.parse(io.data.get(key)).recipes[0].id, 'a');
});
test('failed recovery archive never overwrites primary', async () => {
  const io = adapter({ [key]: 'damaged', recipes: JSON.stringify([recipe]) });
  const store = new SafeStore(io, bookConfig()); await store.load(); io.writes.add('*');
  assert.equal(await store.recover(), false); assert.equal(io.data.get(key), 'damaged');
  assert.equal(store.getSnapshot().issue, 'recovery');
  io.writes.clear(); assert.equal(await store.recover(), true);
});
test('future canonical formats never fall back or overwrite despite valid legacy data', async () => {
  for (const marker of [{ version: 2 }, { schemaVersion: 99 }]) {
    const raw = JSON.stringify({ ...book, ...marker });
    const io = adapter({ [key]: raw, recipes: JSON.stringify([recipe]) });
    const store = new SafeStore(io, bookConfig()); await store.load();
    assert.equal(store.getSnapshot().issue, 'unsupported'); assert.equal(store.getSnapshot().canRecover, false);
    assert.deepEqual(io.log, []); assert.equal(io.data.get(key), raw);
  }
});
test('legacy migration is idempotent and preserves recipe backup v1', async () => {
  const io = adapter({ recipes: JSON.stringify(book.recipes), 'recipe-meta-v1': JSON.stringify(book.recipeMeta) });
  const first = new SafeStore(io, bookConfig()); await first.load(); const raw = io.data.get(key);
  const second = new SafeStore(io, bookConfig()); await second.load();
  assert.equal(io.data.get(key), raw);
  const copy = parseRecipeBackup(serializeRecipeBackup(second.getSnapshot().data.recipes, second.getSnapshot().data.recipeMeta));
  assert.deepEqual(copy.recipes, book.recipes); assert.deepEqual(copy.recipeMeta, book.recipeMeta); assert.equal(copy.version, 1);
});
test('shopping migration repeats without reassigning IDs, changing order or merging duplicates', async () => {
  const io = adapter({ 'shopping-list-v1': JSON.stringify(['Лук', { text: 'Яйца — 2 шт.', checked: true }]) });
  const first = new SafeStore(io, shoppingConfig); await first.load(); const raw = io.data.get('shopping-list-v1');
  const second = new SafeStore(io, shoppingConfig); await second.load();
  assert.equal(io.data.get('shopping-list-v1'), raw); assert.equal(second.getSnapshot().data[1].checked, true);
});

test('loading qualified legacy shopping names preserves the original payload byte-for-byte', async () => {
  const raw = JSON.stringify([
    { id: 'salt', name: 'Соль — по вкусу', text: 'Соль — по вкусу', checked: true },
    { id: 'oil', name: 'Масло — для жарки', text: 'Масло — для жарки', checked: false },
  ]);
  const io = adapter({ 'shopping-list-v1': raw });
  const store = new SafeStore(io, shoppingConfig);
  await store.load();
  assert.equal(io.data.get('shopping-list-v1'), raw);
  assert.deepEqual(io.log, []);
  assert.equal(store.getSnapshot().data.length, 2);
});
test('settings read/parse/unsupported errors do not write defaults', async () => {
  for (const raw of ['broken', 'null', '{"version":99,"language":"en"}', '{"theme":["dark"]}', '{"language":["en"]}']) {
    const io = adapter({ 'app-settings-v1': raw }); const store = new SafeStore(io, settingsConfig);
    await store.load(); assert.equal(store.getSnapshot().loaded, false); assert.deepEqual(io.log, []);
    assert.equal(io.data.get('app-settings-v1'), raw);
  }
  const io = adapter(); io.reads.add('app-settings-v1');
  await new SafeStore(io, settingsConfig).load(); assert.deepEqual(io.log, []);
});

test('unknown shopping versions block the entire list and retain extensions on valid migration', async () => {
  for (const value of [{ version: 99, items: [] }, [{ id: 'x', name: 'Лук', version: 99 }]]) {
    const raw = JSON.stringify(value); const io = adapter({ 'shopping-list-v1': raw });
    const store = new SafeStore(io, shoppingConfig); await store.load();
    assert.equal(store.getSnapshot().issue, 'unsupported'); assert.equal(io.data.get('shopping-list-v1'), raw);
    assert.deepEqual(io.log, []);
  }
  const io = adapter({ 'shopping-list-v1': '[{"id":"x","text":"Лук","checked":true,"custom":"preserved"}]' });
  const store = new SafeStore(io, shoppingConfig); await store.load();
  assert.equal(JSON.parse(io.data.get('shopping-list-v1'))[0].custom, 'preserved');
});
test('onboarding read failure and unknown status do not reset progress', async () => {
  for (const raw of ['completed', 'future-status']) {
    const io = adapter({ 'app-onboarding-v1': raw });
    if (raw === 'completed') io.reads.add('app-onboarding-v1');
    const store = new SafeStore(io, onboardingConfig); await store.load();
    assert.equal(store.getSnapshot().loaded, false); assert.deepEqual(io.log, []);
    assert.equal(io.data.get('app-onboarding-v1'), raw);
  }
});
test('known onboarding status does not depend on unreadable legacy keys', async () => {
  const io = adapter({ 'app-onboarding-v1': 'pending' }); io.reads.add('recipes');
  const store = new SafeStore(io, onboardingConfig); await store.load();
  assert.equal(store.getSnapshot().data, false); assert.equal(store.getSnapshot().issue, undefined);
});
test('failed write retains committed state, emits no success, and retries exact target once', async () => {
  const io = adapter({ 'shopping-list-v1': '[]' }); const store = new SafeStore(io, shoppingConfig); await store.load();
  io.writes.add('shopping-list-v1'); let successes = 0;
  assert.equal(await store.update(items => mergeShoppingEntries(items, ['Яйца — 2 шт.']).items, () => successes++), false);
  assert.equal(store.getSnapshot().issue, 'write'); assert.equal(successes, 0);
  assert.deepEqual(store.getSnapshot().data, []); assert.equal(io.data.get('shopping-list-v1'), '[]');
  assert.equal(await store.update(items => mergeShoppingEntries(items, ['Молоко']).items), false);
  assert.equal(await store.retry(), false); io.writes.clear();
  assert.equal(await store.retry(), true); assert.equal(successes, 1);
  assert.equal(store.getSnapshot().data[0].quantity, 2); assert.equal(await store.retry(), false); assert.equal(successes, 1);
});
test('queued concurrent mutations use the latest committed state', async () => {
  const io = adapter({ 'shopping-list-v1': '[]' }); const store = new SafeStore(io, shoppingConfig); await store.load();
  const add = () => store.update(items => mergeShoppingEntries(items, ['Яйца — 2 шт.']).items);
  assert.deepEqual(await Promise.all([add(), add(), add()]), [true, true, true]);
  assert.equal(store.getSnapshot().data[0].quantity, 6); assert.equal(JSON.parse(io.data.get('shopping-list-v1'))[0].quantity, 6);
});
test('stale writers detect conflicts instead of clobbering another instance', async () => {
  const io = adapter({ 'shopping-list-v1': '[]' });
  const first = new SafeStore(io, shoppingConfig); const stale = new SafeStore(io, shoppingConfig);
  await first.load(); await stale.load();
  await first.update(items => mergeShoppingEntries(items, ['Лук']).items);
  assert.equal(await stale.update(items => mergeShoppingEntries(items, ['Молоко']).items), false);
  assert.equal(stale.getSnapshot().issue, 'conflict'); assert.equal(JSON.parse(io.data.get('shopping-list-v1'))[0].name, 'Лук');
  await stale.reread(); await stale.update(items => mergeShoppingEntries(items, ['Молоко']).items);
  assert.equal(stale.getSnapshot().data.length, 2);
});

test('a write refusal followed by a competing commit preserves both source and pending draft', async () => {
  const io = adapter({ 'shopping-list-v1': '[]' }); const store = new SafeStore(io, shoppingConfig); await store.load();
  io.writes.add('shopping-list-v1'); await store.update(items => mergeShoppingEntries(items, ['Молоко']).items);
  io.writes.clear(); io.data.set('shopping-list-v1', JSON.stringify([{ id: 'other', name: 'Лук', text: 'Лук', checked: false }]));
  assert.equal(await store.retry(), false); assert.equal(store.getSnapshot().issue, 'conflict');
  await store.reread();
  assert.equal(store.getSnapshot().data[0].name, 'Лук');
  const archiveKey = io.log.find(key => key.startsWith('storage-recovery-v1:'));
  assert.equal(JSON.parse(JSON.parse(io.data.get(archiveKey)).pending['shopping-list-v1'])[0].name, 'Молоко');
});
// A write can land and still report an error (a failed check after the commit). `landed`
// makes the next write of a key do that; `stored` replaces what lands (a damaged value);
// `failReads` makes that many next reads of a key fail.
function landing(seed = {}) {
  const io = adapter(seed);
  const { getItem, setItem } = io;
  Object.assign(io, {
    landed: new Set(), stored: new Map(), failReads: new Map(),
    async getItem(k) {
      const left = io.failReads.get(k) ?? 0;
      if (left > 0) { io.failReads.set(k, left - 1); throw new Error('synthetic read failure'); }
      return getItem(k);
    },
    async setItem(k, value) {
      if (!io.landed.delete(k)) return setItem(k, value);
      await setItem(k, io.stored.get(k) ?? value);
      throw new Error('synthetic check failure after the write');
    },
  });
  return io;
}
const cook = id => current => ({ ...current, recipeMeta: { ...current.recipeMeta, a: { ...current.recipeMeta.a, cookings: [{ id, cookedAt: '2026-10-28T10:00:00.000Z' }, ...current.recipeMeta.a.cookings] } } });
const storedCookings = io => JSON.parse(io.data.get(key)).recipeMeta.a.cookings.map(cooking => cooking.id);

test('a write that landed but reported an error is a saved change, once', async () => {
  const io = landing({ [key]: JSON.stringify(book) }); const store = new SafeStore(io, bookConfig(false)); await store.load();
  io.landed.add(key); let successes = 0;
  assert.equal(await store.update(cook('new'), () => successes++), true);
  assert.equal(store.getSnapshot().issue, undefined); assert.equal(successes, 1);
  assert.deepEqual(storedCookings(io), ['new', 'old-cooking']);
  assert.deepEqual(store.getSnapshot().data.recipeMeta.a.cookings.map(cooking => cooking.id), ['new', 'old-cooking']);
});

test('when the check read fails too, Retry finds the saved change instead of a conflict', async () => {
  const io = landing({ [key]: JSON.stringify(book) }); const store = new SafeStore(io, bookConfig(false)); await store.load();
  io.landed.add(key); io.failReads.set(key, 1); let successes = 0;
  assert.equal(await store.update(cook('new'), () => successes++), false);
  assert.equal(store.getSnapshot().issue, 'write'); assert.equal(successes, 0);
  assert.equal(await store.retry(), true);
  assert.equal(store.getSnapshot().issue, undefined); assert.equal(successes, 1);
  assert.deepEqual(storedCookings(io), ['new', 'old-cooking']);
  // A later change builds on the saved one; nothing is lost or written twice.
  assert.equal(await store.update(cook('later')), true);
  assert.deepEqual(storedCookings(io), ['later', 'new', 'old-cooking']);
  assert.equal(await store.retry(), false); assert.equal(successes, 1);
});

test('a third value after an unclear write is still a conflict, and it is kept', async () => {
  const io = landing({ [key]: JSON.stringify(book) }); const store = new SafeStore(io, bookConfig(false)); await store.load();
  io.landed.add(key); io.failReads.set(key, 1);
  assert.equal(await store.update(cook('new')), false);
  const other = JSON.stringify(cook('other device')(book));
  io.data.set(key, other);
  assert.equal(await store.retry(), false); assert.equal(store.getSnapshot().issue, 'conflict');
  assert.equal(io.data.get(key), other);
});

test('a damaged or unreadable result is never taken for a saved change', async () => {
  const damaged = landing({ [key]: JSON.stringify(book) }); const store = new SafeStore(damaged, bookConfig(false)); await store.load();
  damaged.landed.add(key); damaged.stored.set(key, JSON.stringify(cook('new')(book)).slice(0, -2));
  let successes = 0;
  assert.equal(await store.update(cook('new'), () => successes++), false);
  assert.equal(store.getSnapshot().issue, 'write');
  assert.equal(await store.retry(), false); assert.equal(store.getSnapshot().issue, 'conflict'); assert.equal(successes, 0);

  const unreadable = landing({ [key]: JSON.stringify(book) }); const second = new SafeStore(unreadable, bookConfig(false)); await second.load();
  unreadable.landed.add(key); unreadable.failReads.set(key, 3);
  assert.equal(await second.update(cook('new'), () => successes++), false);
  assert.equal(await second.retry(), false);
  assert.equal(second.getSnapshot().issue, 'write'); assert.equal(successes, 0);
});

test('a landed write still updates the mirrors of the web layout', async () => {
  const io = landing({ [key]: JSON.stringify(book), recipes: JSON.stringify(book.recipes), 'recipe-meta-v1': JSON.stringify(book.recipeMeta) });
  const store = new SafeStore(io, bookConfig()); await store.load();
  io.landed.add(key); io.failReads.set(key, 1);
  assert.equal(await store.update(cook('new')), false);
  assert.equal(io.data.get('recipe-meta-v1'), JSON.stringify(book.recipeMeta), 'mirrors wait for a confirmed main key');
  assert.equal(await store.retry(), true);
  assert.equal(store.getSnapshot().issue, undefined);
  assert.deepEqual(JSON.parse(io.data.get('recipe-meta-v1')).a.cookings.map(cooking => cooking.id), ['new', 'old-cooking']);
  assert.equal(io.data.get('recipes'), JSON.stringify(book.recipes));
});

test('mirror write failure retries mirrors without repeating committed cooking/add', async () => {
  const io = adapter({ [key]: JSON.stringify(book), recipes: JSON.stringify(book.recipes), 'recipe-meta-v1': JSON.stringify(book.recipeMeta) });
  const store = new SafeStore(io, bookConfig()); await store.load(); io.writes.add('recipes');
  let successes = 0;
  assert.equal(await store.update(current => ({ ...current, recipes: [...current.recipes, { ...recipe, id: 'b' }] }), () => successes++), true);
  assert.equal(store.getSnapshot().issue, 'mirror'); assert.equal(successes, 1);
  io.writes.clear(); assert.equal(await store.retry(), true);
  assert.equal(store.getSnapshot().data.recipes.length, 2); assert.equal(successes, 1);
});
