import assert from 'node:assert/strict';
import test from 'node:test';
import { BackupError, MAX_BACKUP_BYTES, mergeRecipeBackup, parseRecipeBackup, serializeRecipeBackup } from './recipe-backup.ts';

const recipe = { id: 'a', title: 'Суп', category: null, time: 10, ingredients: ['Вода'], steps: ['Варить'] };
const cooking = { id: 'event', cookedAt: '2026-10-20T10:00:00.000Z', rating: 'great', note: 'Меньше соли' };
const meta = { a: { favorite: true, cookings: [cooking] } };
const backup = (recipes = [recipe], recipeMeta = meta) => parseRecipeBackup(serializeRecipeBackup(recipes, recipeMeta));

test('UTF-8/BOM round trip preserves recipes, favourites and history, excludes orphan metadata', () => {
  const restored = parseRecipeBackup('\uFEFF' + serializeRecipeBackup([recipe], { ...meta, orphan: meta.a }));
  assert.deepEqual(restored.recipes, [recipe]);
  assert.deepEqual(restored.recipeMeta, meta);
});

test('invalid syntax, shape, values and duplicate IDs are rejected as a whole', () => {
  for (const text of ['broken', '[]', '{}', JSON.stringify({ ...backup(), recipes: [recipe, { ...recipe, id: 'a' }] }),
    JSON.stringify({ ...backup(), recipes: [{ ...recipe, time: -1 }] }),
    JSON.stringify({ ...backup(), recipes: [{ ...recipe, title: ' ' }] }),
    JSON.stringify({ ...backup(), recipeMeta: { a: { favorite: true, cookings: [{ ...cooking, cookedAt: 'bad' }] } } }),
    JSON.stringify({ ...backup(), recipes: [{ ...recipe, id: '__proto__' }] })]) {
    assert.throws(() => parseRecipeBackup(text), err => err instanceof BackupError && err.code === 'invalid');
  }
});

test('unsupported versions and oversized files have distinct errors', () => {
  assert.throws(() => parseRecipeBackup(JSON.stringify({ ...backup(), version: 99 })), err => err.code === 'version');
  assert.throws(() => parseRecipeBackup('я'.repeat(MAX_BACKUP_BYTES / 2 + 1)), err => err.code === 'size');
});

test('empty backups are valid and never clear existing recipes', () => {
  const merged = mergeRecipeBackup([recipe], meta, backup([], {}));
  assert.deepEqual(merged.recipes, [recipe]);
  assert.deepEqual(merged.recipeMeta, meta);
  assert.equal(merged.added, 0);
});

test('same ID with different recipe content preserves both and maps metadata to the new ID', () => {
  const original = structuredClone({ recipes: [recipe], meta });
  const incoming = backup([{ ...recipe, title: 'Другой суп' }]);
  const merged = mergeRecipeBackup(original.recipes, original.meta, incoming);
  assert.equal(merged.conflicts, 1);
  assert.equal(merged.added, 1);
  assert.equal(merged.recipes[0].title, 'Суп');
  assert.equal(merged.recipes[1].title, 'Другой суп');
  assert.notEqual(merged.recipes[0].id, merged.recipes[1].id);
  assert.deepEqual(merged.recipeMeta[merged.recipes[1].id], meta.a);
  assert.deepEqual(original, { recipes: [recipe], meta });
  assert.equal(mergeRecipeBackup(merged.recipes, merged.recipeMeta, incoming).added, 0);
});

test('identical content under another ID is deduplicated while favourites/history are merged', () => {
  const localMeta = { a: { favorite: false, cookings: [] } };
  const incoming = backup([{ ...recipe, id: 'b' }], { b: meta.a });
  const merged = mergeRecipeBackup([recipe], localMeta, incoming);
  assert.equal(merged.duplicates, 1);
  assert.equal(merged.added, 0);
  assert.deepEqual(merged.recipeMeta.a, meta.a);
  assert.deepEqual(mergeRecipeBackup(merged.recipes, merged.recipeMeta, incoming), { ...merged, duplicates: 1 });
});

test('conflicting history IDs retain both notes and stay idempotent on repeated import', () => {
  const incoming = backup([recipe], { a: { favorite: false, cookings: [{ ...cooking, note: 'Больше соли' }] } });
  const merged = mergeRecipeBackup([recipe], meta, incoming);
  assert.equal(merged.recipeMeta.a.cookings.length, 2);
  assert.equal(new Set(merged.recipeMeta.a.cookings.map(record => record.id)).size, 2);
  assert.deepEqual(mergeRecipeBackup(merged.recipes, merged.recipeMeta, incoming).recipeMeta, merged.recipeMeta);
});

test('prototype property names cannot supply unintended metadata', () => {
  const incoming = backup([{ ...recipe, id: 'toString' }], {});
  const merged = mergeRecipeBackup([], {}, incoming);
  assert.deepEqual(merged.recipeMeta.toString, { favorite: false, cookings: [] });
});
