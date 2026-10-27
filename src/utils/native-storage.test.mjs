import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { checksum, LEGACY_FENCE, manifestKey, PART_BYTES, splitUtf8, StorageIntegrityError } from './chunked-storage.ts';
import { captureEmergency, emergencyComplete, emergencyDiagnostic } from './emergency-export.ts';
import { captureProfileV2, cleanupLegacy, CORE_KEYS, createNativeStorage, migrateLegacy, recoverNative, restoreProfileV2 } from './native-profile.ts';
import { serializeProfileBackup, parseBackupFile, validateProfile } from './profile-backup.ts';
import { LAST_BACKUP_KEY, ProfileRestoreError } from './profile-transaction.ts';
import { SafeStore } from './safe-storage.ts';
import { assertProfileReady, PROFILE_JOURNAL_KEY, PROFILE_JOURNAL_V2_KEY } from './storage-coordination.ts';
import { bookConfig, onboardingConfig } from './storage-models.ts';

const KiB = 1024, MiB = 1024 * KiB;
const bytes = text => Buffer.byteLength(text, 'utf8');
const fmt = n => n >= MiB ? `${(n / MiB).toFixed(2)} MiB` : `${(n / KiB).toFixed(0)} KiB`;
class Crash extends Error {}

// Android model: one row is read through a 2 MiB CursorWindow, the database has a total
// limit, and every single write is atomic but nothing groups several writes. crashAt kills
// the "process" at that write: it and everything after it fail until restart().
function device({ rowLimit = 2 * MiB, dbLimit = 32 * MiB, seed = {} } = {}) {
  const data = new Map(Object.entries(seed));
  const io = {
    data, writes: 0, crashAt: Infinity, dead: false, fail: () => false, peak: 0, maxValue: 0,
    total: () => [...data].reduce((sum, [key, value]) => sum + bytes(key) + bytes(value), 0),
    check() { if (io.dead) throw new Crash('process is gone'); },
    async getItem(key) {
      io.check();
      const value = data.get(key) ?? null;
      if (value !== null && bytes(key) + bytes(value) > rowLimit) throw new Error('Row too big to fit into CursorWindow');
      return value;
    },
    async setItem(key, value) {
      io.check();
      if (++io.writes >= io.crashAt) { io.dead = true; throw new Crash('killed'); }
      if (io.fail(key, value)) throw new Error('synthetic write failure');
      const next = io.total() - (data.has(key) ? bytes(key) + bytes(data.get(key)) : 0) + bytes(key) + bytes(value);
      if (next > dbLimit) throw new Error('database or disk is full (code 13 SQLITE_FULL)');
      data.set(key, value);
      io.peak = Math.max(io.peak, next); io.maxValue = Math.max(io.maxValue, bytes(value));
    },
    async removeItem(key) {
      io.check();
      if (++io.writes >= io.crashAt) { io.dead = true; throw new Crash('killed'); }
      data.delete(key);
    },
    async getAllKeys() { io.check(); return [...data.keys()]; },
  };
  return io;
}
function restart(io) { io.dead = false; io.crashAt = Infinity; io.fail = () => false; return createNativeStorage(io); }

const step = 'Нарезать лук кольцами, обжарить на сливочном масле до золотистого цвета, добавить чеснок и томить под крышкой. ';
// Long recipes and a large cooking history, Cyrillic text (2 bytes per letter in UTF-8).
function makeProfile(count, seed = 'a', cookings = 10) {
  const recipes = [], recipeMeta = {};
  for (let i = 0; i < count; i++) {
    const id = `${seed}-${i}-${(i * 2654435761 >>> 0).toString(36)}`;
    recipes.push({
      id, title: `Рецепт ${seed} ${i}`, category: ['Завтрак', 'Обед', 'Ужин', null][i % 4], time: 5 + i % 90,
      ingredients: Array.from({ length: 8 + i % 7 }, (_, k) => `Ингредиент ${k} — ${k + 1}00 г`),
      steps: Array.from({ length: 6 }, (_, k) => `${k + 1}. ${step}`),
    });
    recipeMeta[id] = { favorite: i % 5 === 0, cookings: Array.from({ length: cookings }, (_, k) => ({
      id: `c-${i}-${k}`, cookedAt: new Date(Date.UTC(2026, 0, 1 + k, 12)).toISOString(),
      ...(k % 2 ? { rating: 'great', note: 'Получилось вкусно, в следующий раз меньше соли и больше зелени' } : {}),
    })) };
  }
  const shoppingItems = Array.from({ length: 60 }, (_, k) => ({
    id: `s-${seed}-${k}`, name: `Продукт ${k}`, checked: k % 3 === 0,
    ...(k % 4 ? { text: `Продукт ${k} — ${k + 1} шт.`, quantity: k + 1, unit: 'шт.' } : { text: `Продукт ${k}` }),
  }));
  return validateProfile({ recipes, recipeMeta, shoppingItems, settings: { theme: seed === 'a' ? 'dark' : 'light', language: seed === 'a' ? 'ru' : 'en', shoppingCompletedBehavior: 'keep' } });
}
const legacy = p => ({
  'recipe-book-v1': JSON.stringify({ recipes: p.recipes, recipeMeta: p.recipeMeta }),
  recipes: JSON.stringify(p.recipes), 'recipe-meta-v1': JSON.stringify(p.recipeMeta),
  'shopping-list-v1': JSON.stringify(p.shoppingItems), 'app-settings-v1': JSON.stringify(p.settings), 'app-onboarding-v1': 'completed',
});
const profileOf = async storage => (await captureProfileV2(storage)).profile;
async function restore(storage, profile, budget) {
  const { raw } = await captureProfileV2(storage);
  await restoreProfileV2(storage, profile, raw, budget);
}
// Every stored part must belong to a manifest, so cleanup left nothing behind.
function orphans(io) {
  const ids = new Set();
  for (const [key, value] of io.data) {
    if (!key.startsWith('mr2:') || key.includes('#')) continue;
    const manifest = JSON.parse(value);
    for (const gen of [manifest.current, manifest.prev]) if (gen) ids.add(`${key}#${gen.id}`);
  }
  return [...io.data.keys()].filter(key => key.startsWith('mr2:') && key.includes('#') && !ids.has(key.slice(0, key.lastIndexOf('.'))));
}

test('parts never exceed 256 KiB of UTF-8, keep surrogate pairs whole and join back exactly', () => {
  const text = `${'ё'.repeat(200_000)}😀${'a'.repeat(300_000)}😀`;
  const parts = splitUtf8(text);
  assert.equal(parts.join(''), text);
  assert(parts.every(part => bytes(part) <= PART_BYTES));
  assert(parts.every(part => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(part)));
  assert.notEqual(checksum(text), checksum(text.slice(0, -1) + 'b'));
});

test('a large value is committed by its manifest; the previous generation stays, older ones go', async () => {
  const io = device({ seed: { 'storage-recovery-v1:keep': 'x', unrelated: 'y' } });
  const storage = createNativeStorage(io);
  const values = ['А'.repeat(600_000), 'Б'.repeat(700_000), 'В'.repeat(500_000)];
  for (const value of values) { await storage.setItem('recipe-book-v1', value); assert.equal(await storage.getItem('recipe-book-v1'), value); }
  const manifest = JSON.parse(io.data.get(manifestKey('recipe-book-v1')));
  assert.equal(await storage.assemble('recipe-book-v1', manifest.prev), values[1]);
  assert.deepEqual(orphans(io), []);
  assert(io.maxValue <= PART_BYTES);
  assert.equal(io.data.get('storage-recovery-v1:keep'), 'x'); assert.equal(io.data.get('unrelated'), 'y');
});

test('killed at any write of a large value: after restart it is exactly the old or the new value', async () => {
  const before = 'с'.repeat(400_000), after = 'н'.repeat(650_000);
  const clean = device(); const probe = createNativeStorage(clean);
  await probe.setItem('k', before); const start = clean.writes; await probe.setItem('k', after);
  for (let crashAt = start + 1; crashAt <= clean.writes; crashAt++) {
    const io = device(); const storage = createNativeStorage(io);
    await storage.setItem('k', before);
    io.crashAt = crashAt;
    await assert.rejects(storage.setItem('k', after));
    const again = restart(io); await again.collectAll();
    assert([before, after].includes(await again.getItem('k')), `crash at write ${crashAt}`);
    assert.deepEqual(orphans(io), []);
  }
});

test('a damaged part, checksum or manifest is a read error, never an empty or partial book', async () => {
  const p = makeProfile(300);
  for (const damage of [
    io => { const key = [...io.data.keys()].find(k => k.startsWith('mr2:recipe-book-v1#')); io.data.set(key, io.data.get(key).slice(1)); },
    io => { const key = [...io.data.keys()].find(k => k.startsWith('mr2:recipe-book-v1#')); io.data.delete(key); },
    io => { const m = JSON.parse(io.data.get(manifestKey('recipe-book-v1'))); m.current.sum = '0'.repeat(16); io.data.set(manifestKey('recipe-book-v1'), JSON.stringify(m)); },
    io => { io.data.set(manifestKey('recipe-book-v1'), '{"format":"monorec-value","version":3}'); },
  ]) {
    const io = device({ seed: legacy(p) }); const storage = createNativeStorage(io);
    await recoverNative(storage); damage(io);
    const snapshot = new Map(io.data);
    await assert.rejects(storage.getItem('recipe-book-v1'), StorageIntegrityError);
    const store = new SafeStore(storage, bookConfig(false)); await store.load();
    assert.equal(store.getSnapshot().issue, 'read'); assert.equal(store.getSnapshot().loaded, false);
    assert.equal(await store.update(() => ({ recipes: [], recipeMeta: {} })), false);
    assert.deepEqual(io.data, snapshot);
  }
});

test('sizes: 50, 300, 1000 and 2000 recipes, five restores each, no value above 256 KiB', { timeout: 300_000 }, async t => {
  const rows = [];
  for (const count of [50, 300, 1000, 2000]) {
    const io = device(); const storage = createNativeStorage(io);
    await recoverNative(storage);
    const a = makeProfile(count, 'a'), b = makeProfile(count, 'b');
    const fileBytes = bytes(serializeProfileBackup(a));
    const totals = [];
    for (let round = 0; round < 6; round++) {
      const next = round % 2 ? b : a;
      await restore(storage, next, 32 * MiB);
      assert.deepEqual(await profileOf(storage), next);
      totals.push(io.total());
    }
    // Normal edits keep the same bounds: the current and one previous generation.
    const store = new SafeStore(storage, bookConfig(false)); await store.load();
    assert(await store.update(book => ({ ...book, recipeMeta: { ...book.recipeMeta, [book.recipes[0].id]: { favorite: true, cookings: [] } } })));
    assert(io.maxValue <= PART_BYTES);
    assert.deepEqual(orphans(io), []);
    // From the second restore on: the current and one previous profile, no growth.
    assert(totals.slice(2).every(total => Math.abs(total - totals[1]) < 64 * KiB), `stable after restores: ${totals.map(fmt)}`);
    rows.push(`${count} recipes: file ${fmt(fileBytes)}, book ${fmt(bytes(legacy(a)['recipe-book-v1']))}, steady ${fmt(totals[5])}, peak ${fmt(io.peak)}, largest value ${fmt(io.maxValue)}`);
  }
  for (const row of rows) t.diagnostic(row);
});

test('importing the same file twice gives the same profile without duplicates', async () => {
  const storage = createNativeStorage(device()); await recoverNative(storage);
  const file = parseBackupFile(serializeProfileBackup(makeProfile(120))).profile;
  await restore(storage, file); const once = await profileOf(storage);
  await restore(storage, file); assert.deepEqual(await profileOf(storage), once);
  assert.deepEqual(once, file);
});

test('restore killed at every write: after restart the profile is entirely old or entirely new', { timeout: 300_000 }, async () => {
  const a = makeProfile(300, 'a'), b = makeProfile(300, 'b');
  const clean = device({ seed: legacy(a) }); const probe = createNativeStorage(clean);
  await recoverNative(probe); const start = clean.writes; await restore(probe, b);
  assert(clean.writes - start > 5);
  for (let crashAt = start + 1; crashAt <= clean.writes; crashAt++) {
    const io = device({ seed: legacy(a) }); const storage = createNativeStorage(io);
    await recoverNative(storage);
    io.crashAt = crashAt;
    await assert.rejects(restore(storage, b));
    const again = restart(io);
    await recoverNative(again);
    await assertProfileReady(again);
    const result = await profileOf(again);
    assert(JSON.stringify(result) === JSON.stringify(a) || JSON.stringify(result) === JSON.stringify(b), `crash at write ${crashAt}`);
    assert.deepEqual(orphans(io), []);
    // Legacy values were never touched by the restore.
    assert.equal(io.data.get('recipe-book-v1'), legacy(a)['recipe-book-v1']);
  }
});

test('a failure of any single write rolls the restore back to the previous profile', async () => {
  const a = makeProfile(300, 'a'), b = makeProfile(300, 'b');
  const clean = device({ seed: legacy(a) }); const probe = createNativeStorage(clean);
  await recoverNative(probe); const start = clean.writes; await restore(probe, b);
  for (let failAt = start + 1; failAt <= clean.writes; failAt++) {
    const io = device({ seed: legacy(a) }); const storage = createNativeStorage(io);
    await recoverNative(storage);
    io.fail = () => io.writes === failAt;
    const outcome = await restore(storage, b).then(() => 'ok', error => error);
    io.fail = () => false;
    const result = await profileOf(storage).catch(error => error);
    if (outcome === 'ok') assert.deepEqual(result, b, `write ${failAt}`);
    else {
      assert(outcome instanceof ProfileRestoreError, `write ${failAt}: ${outcome}`);
      if (outcome.code === 'recovery') { await recoverNative(storage); assert.deepEqual(await profileOf(storage), a); }
      else assert.deepEqual(result, a, `write ${failAt}`);
    }
  }
});

test('damaged journal: writes stay blocked, nothing is changed, the readable book can be exported', async () => {
  const a = makeProfile(300);
  const io = device({ seed: legacy(a) }); const storage = createNativeStorage(io);
  await recoverNative(storage);
  io.data.set(PROFILE_JOURNAL_V2_KEY, '{"format":"profile-restore","version":2,"status":"prep');
  const snapshot = new Map(io.data);
  await assert.rejects(recoverNative(storage), ProfileRestoreError);
  await assert.rejects(assertProfileReady(storage));
  await storage.collectAll(); // An unknown journal pins every part.
  assert.deepEqual(io.data, snapshot);
  const capture = await captureEmergency(storage, CORE_KEYS);
  assert.equal(capture.settled, false); assert.equal(capture.profile, undefined);
  assert.deepEqual(capture.book.recipes, a.recipes);
  assert.equal(emergencyComplete(capture), false);
  assert.deepEqual(io.data, snapshot);
});

test('database limit: the restore is refused before writing; an unexpected overflow changes nothing', async () => {
  const a = makeProfile(300, 'a'), b = makeProfile(1000, 'b');
  const io = device({ dbLimit: 5 * MiB, seed: legacy(a) }); const storage = createNativeStorage(io);
  await recoverNative(storage);
  const snapshot = new Map(io.data);
  await assert.rejects(restore(storage, b, 5 * MiB), error => error.code === 'space');
  assert.deepEqual(io.data, snapshot);
  await assert.rejects(restore(storage, b), error => error.code === 'space'); // No budget: the database itself fails.
  assert.deepEqual(await profileOf(storage), a);
  assert.deepEqual(orphans(io), []);
  assert.deepEqual(io.data, snapshot);
});

test('migration copies valid legacy data, fences out older builds and keeps legacy values', async () => {
  const a = makeProfile(300);
  const seed = { ...legacy(a), 'storage-recovery-v1:recipe-book-v1:1:0.5': 'archive' };
  const io = device({ seed }); const storage = createNativeStorage(io);
  await recoverNative(storage);
  assert.deepEqual(await profileOf(storage), a);
  for (const key of CORE_KEYS) assert(io.data.has(manifestKey(key)), key);
  for (const key of Object.keys(seed)) if (key !== 'app-onboarding-v1') assert.equal(io.data.get(key), seed[key], key);
  assert(io.data.get('app-onboarding-v1').startsWith(LEGACY_FENCE));
  // An older build reads the marker as unsupported and stops before writing anything.
  const physical = Object.fromEntries([...onboardingConfig.keys].map(key => [key, { raw: io.data.get(key) ?? null }]));
  assert.equal(onboardingConfig.decode(physical).issue, 'unsupported');
  assert.equal(await migrateLegacy(storage), 'done');
});

test('unreadable legacy book (over 2 MiB): no migration, no writes, an honest incomplete diagnostic', async () => {
  const a = makeProfile(1000);
  const io = device({ seed: legacy(a) }); const storage = createNativeStorage(io);
  const snapshot = new Map(io.data);
  await recoverNative(storage);
  assert.deepEqual(io.data, snapshot);
  const store = new SafeStore(storage, bookConfig(false)); await store.load();
  assert.equal(store.getSnapshot().issue, 'read');
  const capture = await captureEmergency(storage, CORE_KEYS);
  assert.equal(capture.profile, undefined); assert.equal(capture.book, undefined);
  const diagnostic = JSON.parse(emergencyDiagnostic(capture));
  assert.equal(diagnostic.complete, false); assert.deepEqual(diagnostic.unreadable, ['recipe-book-v1']);
  assert.equal(diagnostic.entries['shopping-list-v1'].raw, legacy(a)['shopping-list-v1']);
  assert.deepEqual(io.data, snapshot);
});

test('an interrupted migration finishes on the next start with the same data', async () => {
  const a = makeProfile(300);
  for (let failAt = 1; failAt <= 12; failAt++) {
    const io = device({ seed: legacy(a) }); const storage = createNativeStorage(io);
    io.crashAt = failAt;
    await recoverNative(storage).catch(() => {});
    const again = restart(io);
    await recoverNative(again);
    assert.deepEqual(await profileOf(again), a, `crash at write ${failAt}`);
    assert(io.data.get('app-onboarding-v1').startsWith(LEGACY_FENCE));
    assert.equal(io.data.get('recipe-book-v1'), legacy(a)['recipe-book-v1']);
    assert.deepEqual(orphans(io), []);
  }
});

test('legacy v1 journal: an unreadable one blocks without changes; a readable unfinished one rolls back', async () => {
  const a = makeProfile(300, 'a'), b = makeProfile(300, 'b');
  const huge = JSON.stringify({ format: 'profile-restore', version: 1, id: 'x', status: 'prepared', before: legacy(a), after: legacy(b), pad: 'x'.repeat(2 * MiB) });
  const io = device({ seed: { ...legacy(a), [PROFILE_JOURNAL_KEY]: huge } }); const storage = createNativeStorage(io);
  const snapshot = new Map(io.data);
  await assert.rejects(recoverNative(storage));
  assert.deepEqual(io.data, snapshot);
  const capture = await captureEmergency(storage, CORE_KEYS);
  assert.equal(capture.profile, undefined); assert.deepEqual(capture.book.recipes, a.recipes);
  assert.deepEqual(Object.keys(capture.errors), [PROFILE_JOURNAL_KEY]);

  const small = makeProfile(50, 'a'), other = makeProfile(50, 'b');
  const mixed = { ...legacy(small), 'recipe-book-v1': legacy(other)['recipe-book-v1'] };
  const journal = JSON.stringify({ format: 'profile-restore', version: 1, id: 'y', status: 'prepared', before: legacy(small), after: legacy(other) });
  const io2 = device({ seed: { ...mixed, [PROFILE_JOURNAL_KEY]: journal } }); const storage2 = createNativeStorage(io2);
  await recoverNative(storage2);
  assert.deepEqual(await profileOf(storage2), small);
});

test('legacy cleanup needs a later full backup, then replaces only migrated legacy values with markers', async () => {
  const a = makeProfile(300);
  const seed = { ...legacy(a), 'storage-recovery-v1:profile:1': 'old archive', unknown: 'z' };
  const io = device({ seed }); const storage = createNativeStorage(io);
  await recoverNative(storage);
  assert.equal((await cleanupLegacy(storage)).status, 'no-backup');
  await storage.setItem(LAST_BACKUP_KEY, '2000-01-01T00:00:00.000Z');
  assert.equal((await cleanupLegacy(storage)).status, 'no-backup');
  const before = io.total();
  await storage.setItem(LAST_BACKUP_KEY, new Date(Date.now() + 1000).toISOString());
  const result = await cleanupLegacy(storage);
  assert.equal(result.status, 'cleaned');
  assert.deepEqual(result.keys, ['recipe-book-v1', 'recipes', 'recipe-meta-v1', 'shopping-list-v1', 'app-settings-v1']);
  assert.deepEqual(await profileOf(storage), a);
  assert(io.total() < before / 2);
  assert.equal(io.data.get('storage-recovery-v1:profile:1'), 'old archive'); assert.equal(io.data.get('unknown'), 'z');
  // Older code now sees an unreadable book instead of stale recipes.
  const physical = Object.fromEntries(['recipe-book-v1', 'recipes', 'recipe-meta-v1'].map(key => [key, { raw: io.data.get(key) }]));
  assert.equal(bookConfig().decode(physical).data, undefined);
  // New code never reads a marker as data.
  io.data.delete(manifestKey('recipe-book-v1'));
  await assert.rejects(storage.getItem('recipe-book-v1'), StorageIntegrityError);
});

test('cleanup of parts never touches unknown keys or parts pinned by an unfinished restore', async () => {
  const a = makeProfile(300, 'a'), b = makeProfile(300, 'b');
  const io = device({ seed: { ...legacy(a), 'mr2:recipe-book-v1#NOT-OURS': 'x', 'mr2:recipe-book-v1#abc.x': 'y', 'mr2:z': 'not json' } });
  const storage = createNativeStorage(io);
  await recoverNative(storage);
  io.crashAt = io.writes + 9; // Inside the switch: the journal is prepared.
  await assert.rejects(restore(storage, b));
  restart(io);
  const unfinished = createNativeStorage(io);
  const pinned = [...io.data.keys()].filter(key => key.includes('#'));
  await unfinished.collectAll();
  assert.deepEqual([...io.data.keys()].filter(key => key.includes('#')), pinned);
  await recoverNative(unfinished);
  assert.deepEqual(await profileOf(unfinished), a);
  for (const key of ['mr2:recipe-book-v1#NOT-OURS', 'mr2:recipe-book-v1#abc.x', 'mr2:z']) assert(io.data.has(key), key);
});

test('migration keeps the onboarding status: completed, pending, or derived from existing data', async () => {
  const p = makeProfile(50);
  for (const [status, expected] of [['completed', true], ['pending', false], [undefined, true]]) {
    const seed = legacy(p);
    if (status) seed['app-onboarding-v1'] = status; else delete seed['app-onboarding-v1'];
    const io = device({ seed }); const storage = createNativeStorage(io);
    await recoverNative(storage);
    assert.equal(await storage.getItem('app-onboarding-v1'), status ?? null);
    const store = new SafeStore(storage, onboardingConfig); await store.load();
    assert.equal(store.getSnapshot().data, expected, String(status));
    assert.equal(store.getSnapshot().issue, undefined);
  }
});

test('a full database fails the normal save visibly and keeps the saved book', async () => {
  const a = makeProfile(300);
  const io = device({ dbLimit: 4 * MiB, seed: legacy(a) }); const storage = createNativeStorage(io);
  await recoverNative(storage);
  const store = new SafeStore(storage, bookConfig(false)); await store.load();
  const saved = await storage.getItem('recipe-book-v1');
  const grown = book => ({ ...book, recipes: [...book.recipes, ...makeProfile(600, 'x').recipes] });
  assert.equal(await store.update(grown), false);
  assert.equal(store.getSnapshot().issue, 'write');
  assert.equal(await storage.getItem('recipe-book-v1'), saved);
  assert.deepEqual(orphans(io), []);
});

test('generations are released only after the journal is committed, never while it is prepared', async () => {
  const a = makeProfile(300, 'a'), b = makeProfile(300, 'b'), c = makeProfile(300, 'c');
  const io = device({ seed: legacy(a) }); const storage = createNativeStorage(io);
  await recoverNative(storage);
  await restore(storage, b); // Now the book has current (b) and prev (a).
  const log = [];
  const { setItem, removeItem } = io;
  io.setItem = async (key, value) => { log.push(['set', key, value]); return setItem(key, value); };
  io.removeItem = async key => { log.push(['remove', key]); return removeItem(key); };
  const before = JSON.parse(io.data.get(manifestKey('recipe-book-v1')));
  await restore(storage, c);
  const committed = log.findIndex(([op, key, value]) => op === 'set' && key === PROFILE_JOURNAL_V2_KEY && JSON.parse(value).status === 'committed');
  const prepared = log.findIndex(([op, key, value]) => op === 'set' && key === PROFILE_JOURNAL_V2_KEY && JSON.parse(value).status === 'prepared');
  const released = log.findIndex(([op, key]) => op === 'remove' && key.includes(`#${before.prev.id}.`));
  assert(prepared >= 0 && committed > prepared);
  assert(released > committed, `prev generation released at ${released}, committed at ${committed}`);
  // The generation that was current before the restore is kept as the new previous one.
  assert(!log.some(([op, key]) => op === 'remove' && key.includes(`#${before.current.id}.`)));
  const after = JSON.parse(io.data.get(manifestKey('recipe-book-v1')));
  assert.equal(after.prev.id, before.current.id);
  assert.deepEqual(await profileOf(storage), c);
});

test('opening the restore preview and cancelling writes nothing', async () => {
  const io = device({ seed: legacy(makeProfile(50)) }); const storage = createNativeStorage(io);
  await recoverNative(storage);
  const writes = io.writes;
  await captureProfileV2(storage);
  assert.equal(io.writes, writes);
});

test('the web layout is unchanged: the book still writes its mirrors there', async () => {
  const store = new SafeStore({ data: new Map(), async getItem(k) { return this.data.get(k) ?? null; }, async setItem(k, v) { this.data.set(k, v); } }, bookConfig());
  await store.load();
  assert(await store.update(() => ({ recipes: [], recipeMeta: { x: { favorite: true, cookings: [] } } })));
  assert.equal(JSON.parse(await store.storage.getItem('recipe-meta-v1')).x.favorite, true);
});
