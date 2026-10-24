import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBackupFile, recipesFromBackup, serializeProfileBackup, utf8Length } from './profile-backup.ts';
import { mergeRecipeBackup, parseRecipeBackup } from './recipe-backup.ts';
import { captureProfile, PROFILE_KEYS, recoverProfile, restoreProfile } from './profile-transaction.ts';
import { PROFILE_JOURNAL_KEY } from './storage-coordination.ts';
import { SafeStore } from './safe-storage.ts';
import { shoppingConfig } from './storage-models.ts';

const recipe = { id: 'a', title: 'Суп', category: null, time: 15, ingredients: ['Вода — 1 л'], steps: ['Варить'] };
const cooking = { id: 'event', cookedAt: '2026-10-20T10:00:00Z', rating: 'great', note: 'Меньше соли' };
const profile = {
  recipes: [recipe], recipeMeta: { a: { favorite: true, cookings: [cooking] } },
  shoppingItems: [
    { id: 'milk', name: 'Молоко', text: 'Молоко — 1 л', checked: true, quantity: 1, unit: 'л' },
    { id: 'eggs', name: 'Яйца', text: 'Яйца — 3 шт.', checked: false, quantity: 3, unit: 'шт.' },
  ], settings: { theme: 'dark', language: 'en', shoppingCompletedBehavior: 'keep' },
};
const oldProfile = { ...profile, recipes: [{ ...recipe, id: 'old', title: 'Старый рецепт' }], recipeMeta: {}, shoppingItems: [], settings: { theme: 'light', language: 'ru', shoppingCompletedBehavior: 'moveDown' } };
const encoded = p => ({
  'recipe-book-v1': JSON.stringify({ recipes: p.recipes, recipeMeta: p.recipeMeta }),
  recipes: JSON.stringify(p.recipes), 'recipe-meta-v1': JSON.stringify(p.recipeMeta),
  'shopping-list-v1': JSON.stringify(p.shoppingItems), 'app-settings-v1': JSON.stringify(p.settings), 'app-onboarding-v1': 'completed',
});
function adapter(p = oldProfile) {
  const data = new Map(Object.entries(encoded(p))); const log = [];
  const io = {
    data, log, fail: () => false,
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, raw) { if (io.fail(key, raw)) throw new Error('synthetic failure'); data.set(key, raw); log.push(key); },
    async removeItem(key) { data.delete(key); log.push(key); },
  };
  return io;
}
const currentRaw = io => Object.fromEntries(PROFILE_KEYS.map(key => [key, io.data.get(key) ?? null]));
test('full profile round trip retains every meaningful field and exact grocery order/amounts', () => {
  const restored = parseBackupFile('\uFEFF' + serializeProfileBackup(profile));
  assert.equal(restored.format, 'recipes-profile-backup'); assert.equal(restored.version, 1);
  assert.deepEqual(restored.profile, profile);
  assert(!serializeProfileBackup(profile).includes('app-onboarding'));
});

test('existing full-profile format preserves shopping explanations without extra storage fields', () => {
  const input = { ...profile, shoppingItems: [
    { id: 'salt', name: 'Соль', text: 'Соль — по вкусу', checked: true },
    { id: 'oil', name: 'Масло', text: 'Масло — 300 г (для жарки)', quantity: 300, unit: 'г', checked: false },
  ] };
  assert.deepEqual(parseBackupFile(serializeProfileBackup(input)).profile.shoppingItems, input.shoppingItems);
});
test('recipe v1 remains supported; full profile can add only recipes without touching other areas', () => {
  const v1 = { format: 'recipes-backup', version: 1, exportedAt: cooking.cookedAt, recipes: [recipe], recipeMeta: profile.recipeMeta };
  assert.deepEqual(parseBackupFile(JSON.stringify(v1)), parseRecipeBackup(JSON.stringify(v1)));
  const incoming = recipesFromBackup(parseBackupFile(serializeProfileBackup(profile)));
  const once = mergeRecipeBackup([], {}, incoming); const twice = mergeRecipeBackup(once.recipes, once.recipeMeta, incoming);
  assert.equal(twice.recipes.length, 1); assert.deepEqual(twice.recipeMeta, once.recipeMeta);
});
test('invalid formats, versions, records and duplicate IDs are rejected as a whole', () => {
  const file = JSON.parse(serializeProfileBackup(profile));
  for (const value of [null, { ...file, version: 2 }, { ...file, format: 'unknown' },
    { ...file, profile: { ...profile, shoppingItems: [profile.shoppingItems[0], profile.shoppingItems[0]] } },
    { ...file, profile: { ...profile, settings: { ...profile.settings, language: ['en'] } } },
    { ...file, profile: { ...profile, shoppingItems: [{ ...profile.shoppingItems[0], quantity: -1 }] } },
    { ...file, profile: { ...profile, recipeMeta: { a: { favorite: true, cookings: [{ ...cooking, cookedAt: 'bad' }] } } } }]) {
    assert.throws(() => parseBackupFile(JSON.stringify(value)));
  }
});
test('full profile supports long histories beyond old v1 count limits, without truncation', () => {
  const big = { ...profile, recipeMeta: { a: { favorite: false, cookings: Array.from({ length: 5001 }, (_, i) => ({ ...cooking, id: `e${i}` })) } } };
  assert.equal(parseBackupFile(serializeProfileBackup(big)).profile.recipeMeta.a.cookings.length, 5001);
  assert.equal(utf8Length('Привет 🤤 \ud800'), new TextEncoder().encode('Привет 🤤 \ud800').length);
});
test('history merging sorts latest first and retains distinct event IDs with identical content', () => {
  const incoming = recipesFromBackup(parseBackupFile(serializeProfileBackup({ ...profile, recipeMeta: { a: { favorite: false, cookings: [
    { ...cooking, id: 'different' }, { ...cooking, id: 'newest', cookedAt: '2026-10-21T11:00:00Z', note: 'Новейшая заметка' },
  ] } } })));
  const result = mergeRecipeBackup([recipe], profile.recipeMeta, incoming);
  assert.equal(result.recipeMeta.a.cookings.length, 3);
  assert.equal(result.recipeMeta.a.cookings[0].id, 'newest');
  assert.deepEqual(mergeRecipeBackup(result.recipes, result.recipeMeta, incoming).recipeMeta, result.recipeMeta);
});
test('an arbitrary ID sharing the import prefix is still a distinct cooking event', () => {
  const local = { a: { favorite: false, cookings: [{ ...cooking, id: 'event-import-handwritten' }] } };
  const incoming = recipesFromBackup(parseBackupFile(serializeProfileBackup(profile)));
  assert.equal(mergeRecipeBackup([recipe], local, incoming).recipeMeta.a.cookings.length, 2);
});
test('capture reads committed data and restoration replaces, rather than sums, groceries', async () => {
  const io = adapter(); const before = (await captureProfile(io)).raw;
  await restoreProfile(io, profile, before);
  assert.deepEqual((await captureProfile(io)).profile, profile);
  await restoreProfile(io, profile, (await captureProfile(io)).raw);
  assert.deepEqual((await captureProfile(io)).profile, profile);
  assert.equal(JSON.parse(io.data.get(PROFILE_JOURNAL_KEY)).status, 'committed');
  assert([...io.data.keys()].some(key => key.startsWith('storage-recovery-v1:profile:')));
});
test('stale preview refuses restore without changing any area or creating a journal', async () => {
  const io = adapter(); const before = (await captureProfile(io)).raw;
  io.data.set('shopping-list-v1', JSON.stringify(profile.shoppingItems));
  const unchanged = currentRaw(io);
  await assert.rejects(restoreProfile(io, profile, before), err => err.code === 'conflict');
  assert.deepEqual(currentRaw(io), unchanged); assert(!io.data.has(PROFILE_JOURNAL_KEY));
});
for (const failKey of [...PROFILE_KEYS, 'commit-marker']) {
  test(`failure at ${failKey} rolls back all areas to exact original strings`, async () => {
    const io = adapter(); const before = (await captureProfile(io)).raw;
    let rejected = false;
    io.fail = (key, raw) => !rejected && (failKey === 'commit-marker'
      ? key === PROFILE_JOURNAL_KEY && JSON.parse(raw).status === 'committed' : key === failKey)
      ? (rejected = true) : false;
    await assert.rejects(restoreProfile(io, profile, before));
    assert.deepEqual(currentRaw(io), before);
    assert.equal(JSON.parse(io.data.get(PROFILE_JOURNAL_KEY)).status, 'rolledBack');
  });
}
test('failure to stage the journal cannot change user data', async () => {
  const io = adapter(); const before = (await captureProfile(io)).raw;
  io.fail = key => key === PROFILE_JOURNAL_KEY;
  await assert.rejects(restoreProfile(io, profile, before));
  assert.deepEqual(currentRaw(io), before);
});
test('rollback removes only keys created by this operation and restores originally absent keys', async () => {
  const io = adapter(); io.data.clear();
  io.data.set('app-settings-v1', JSON.stringify(oldProfile.settings));
  const before = (await captureProfile(io)).raw;
  let rejected = false;
  io.fail = key => key === 'shopping-list-v1' && !rejected ? (rejected = true) : false;
  await assert.rejects(restoreProfile(io, profile, before));
  assert.deepEqual(currentRaw(io), before);
  assert.equal(io.data.get('app-settings-v1'), JSON.stringify(oldProfile.settings));
});
test('interrupted rollback blocks ordinary writes; a fresh startup recovery restores exact originals', async () => {
  const io = adapter(); const before = (await captureProfile(io)).raw;
  io.fail = (key, raw) => key === 'shopping-list-v1' || key === 'recipe-book-v1' && raw === before['recipe-book-v1'];
  await assert.rejects(restoreProfile(io, profile, before), err => err.code === 'recovery');
  const store = new SafeStore(io, shoppingConfig); await store.load();
  assert.equal(store.getSnapshot().issue, 'profile'); assert.equal(await store.update(() => []), false);
  io.fail = () => false;
  assert.equal(await recoverProfile(io), true); assert.deepEqual(currentRaw(io), before);
  assert.equal(await recoverProfile(io), false);
});
test('a conflicting old client write during recovery is preserved and requires manual resolution', async () => {
  const io = adapter(); const before = (await captureProfile(io)).raw;
  io.fail = (key, raw) => key === 'shopping-list-v1' || key === 'recipe-book-v1' && raw === before['recipe-book-v1'];
  await assert.rejects(restoreProfile(io, profile, before)); io.fail = () => false;
  io.data.set('shopping-list-v1', '["new third-party data"]');
  await assert.rejects(recoverProfile(io)); assert.equal(io.data.get('shopping-list-v1'), '["new third-party data"]');
});
test('committed journal must never replay its old target over subsequent user edits', async () => {
  const io = adapter(); await restoreProfile(io, profile, (await captureProfile(io)).raw);
  io.data.set('shopping-list-v1', '[]'); await recoverProfile(io);
  assert.equal(io.data.get('shopping-list-v1'), '[]');
});
test('unknown/corrupted recovery journals are never reset or applied', async () => {
  for (const raw of ['broken', '{"version":99,"status":"prepared"}']) {
    const io = adapter(); const before = currentRaw(io); io.data.set(PROFILE_JOURNAL_KEY, raw);
    await assert.rejects(recoverProfile(io)); assert.deepEqual(currentRaw(io), before); assert.equal(io.data.get(PROFILE_JOURNAL_KEY), raw);
  }
});
