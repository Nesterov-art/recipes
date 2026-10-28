import { ChunkedStorage, isFence, LEGACY_FENCE, manifestIds, manifestKey, type Pins, type RawStorage, type Staged } from './chunked-storage.ts';
import { validateProfile, type Profile } from './profile-backup.ts';
import { decodeRaw, LAST_BACKUP_KEY, ProfileRestoreError, recoverProfile } from './profile-transaction.ts';
import type { ReadEntry } from './safe-storage.ts';
import {
  assertProfileReady, journalSettled, PROFILE_JOURNAL_KEY, PROFILE_JOURNAL_V2_KEY, reportStorageSpace, requireProfileRecovery, withProfileLock,
} from './storage-coordination.ts';
import { bookConfig, onboardingConfig, settingsConfig, shoppingConfig } from './storage-models.ts';
import { utf8Length } from './utf8.ts';

// Native profile: the same logical keys as the web, served by ChunkedStorage, without the
// legacy mirrors. A restore is recorded in a small journal of manifests, never full values.
export const CORE_KEYS = ['recipe-book-v1', 'shopping-list-v1', 'app-settings-v1', 'app-onboarding-v1'] as const;
type CoreKey = typeof CORE_KEYS[number];
export type CoreRaw = Record<CoreKey, string | null>;
const ONBOARDING = 'app-onboarding-v1';
const MIRRORS = ['recipes', 'recipe-meta-v1'] as const;
type Journal = {
  format: 'profile-restore'; version: 2; id: string;
  status: 'prepared' | 'rollingBack' | 'committed' | 'rolledBack';
  before: Record<CoreKey, string | null>; after: Record<CoreKey, string>;
};

// budget: the database limit where one exists (Android); saves that would not fit are refused.
export function createNativeStorage(raw: RawStorage, budget?: number) {
  let warned = false;
  const onLow = () => { if (!warned) { warned = true; reportStorageSpace('low'); } };
  return new ChunkedStorage(raw, () => journalPins(raw), budget === undefined ? undefined : { budget, onLow });
}
// While a restore is unfinished, both sides of it must survive any cleanup.
async function journalPins(raw: RawStorage): Promise<Pins> {
  try {
    const text = await raw.getItem(PROFILE_JOURNAL_V2_KEY);
    if (journalSettled(text, 2)) return new Set();
    const journal = parseJournal(text!);
    return new Set(CORE_KEYS.flatMap(key => [...manifestIds(journal.before[key]), ...manifestIds(journal.after[key])]));
  } catch { return 'all'; }
}
function parseJournal(raw: string): Journal {
  try {
    const value = JSON.parse(raw);
    if (value?.format === 'profile-restore' && value.version === 2 && typeof value.id === 'string'
      && ['prepared', 'rollingBack', 'committed', 'rolledBack'].includes(value.status)
      && CORE_KEYS.every(key => (value.before?.[key] === null || typeof value.before?.[key] === 'string') && typeof value.after?.[key] === 'string')) {
      CORE_KEYS.forEach(key => { manifestIds(value.before[key]); manifestIds(value.after[key]); });
      return value;
    }
  } catch { /* Reported below as an unknown state. */ }
  throw new ProfileRestoreError('recovery');
}
async function writeJournal(raw: RawStorage, journal: Journal) {
  const text = JSON.stringify(journal);
  await raw.setItem(PROFILE_JOURNAL_V2_KEY, text);
  if (await raw.getItem(PROFILE_JOURNAL_V2_KEY) !== text) throw new ProfileRestoreError('write');
}
async function readCore(storage: ChunkedStorage): Promise<CoreRaw> {
  const raw = {} as CoreRaw;
  for (const key of CORE_KEYS) raw[key] = await storage.getItem(key);
  return raw;
}
export const decodeCore = (raw: CoreRaw) => decodeRaw({ ...raw, recipes: null, 'recipe-meta-v1': null });
function encodeProfile(profile: Profile): Record<CoreKey, string> {
  return {
    'recipe-book-v1': JSON.stringify({ recipes: profile.recipes, recipeMeta: profile.recipeMeta }),
    'shopping-list-v1': JSON.stringify(profile.shoppingItems), 'app-settings-v1': JSON.stringify(profile.settings),
    'app-onboarding-v1': 'completed',
  };
}
const spaceError = (error: unknown) => error instanceof Error && /full|quota|space/i.test(error.message);

// Journal, manifests and small keys written by a restore.
const RESERVE = 64 * 1024;
const coreRow = (key: string) => CORE_KEYS.some(core => key === manifestKey(core) || key.startsWith(`${manifestKey(core)}#`));
async function usageSplit(storage: ChunkedStorage) {
  const others = await storage.usage(key => !coreRow(key));
  return { others, total: others + await storage.usage(coreRow) };
}
// The most a restore and the saves after it hold at once. During the restore: everything
// stored plus the new values. After it, each key keeps its old value as the previous
// generation until its next save, and every save adds one more copy of the value saved.
function restorePeak(usage: { others: number; total: number }, before: CoreRaw, values: Record<CoreKey, string>) {
  const after = CORE_KEYS.map(key => utf8Length(values[key]));
  const staged = after.reduce((sum, size) => sum + size, 0);
  const kept = CORE_KEYS.reduce((sum, key, i) => sum + Math.max(utf8Length(before[key] ?? ''), after[i]) + after[i], 0);
  return Math.max(usage.total + staged, usage.others + kept + Math.max(...after)) + RESERVE;
}

export function captureProfileV2(storage: ChunkedStorage) {
  return withProfileLock(async () => {
    await assertProfileReady(storage);
    const raw = await readCore(storage);
    return { raw, profile: decodeCore(raw) };
  });
}
// budget: the database limit where one exists (Android); checked before anything is written.
export function restoreProfileV2(storage: ChunkedStorage, input: Profile, expected: CoreRaw, budget?: number) {
  const profile = validateProfile(input); // No writes for unknown/malformed input.
  return withProfileLock(async () => {
    await assertProfileReady(storage);
    const before = await readCore(storage);
    if (CORE_KEYS.some(key => before[key] !== expected[key])) throw new ProfileRestoreError('conflict');
    const values = encodeProfile(profile);
    if (budget !== undefined && restorePeak(await usageSplit(storage), before, values) > budget * 0.9) {
      throw new ProfileRestoreError('space');
    }
    const staged: Staged[] = [];
    const discard = async () => { for (const item of staged) await storage.discard(item).catch(() => {}); };
    try {
      for (const key of CORE_KEYS) staged.push(await storage.stage(key, values[key]));
    } catch (error) {
      await discard();
      throw new ProfileRestoreError(spaceError(error) ? 'space' : 'write');
    }
    const journal: Journal = {
      format: 'profile-restore', version: 2, id: `${Date.now()}-${Math.random()}`, status: 'prepared',
      before: Object.fromEntries(staged.map(item => [item.key, item.expected])) as Journal['before'],
      after: Object.fromEntries(staged.map(item => [item.key, item.raw])) as Journal['after'],
    };
    try { await writeJournal(storage.raw, journal); } catch {
      // Unless the prepared journal landed, nothing references the staged parts.
      if (await storage.raw.getItem(PROFILE_JOURNAL_V2_KEY).catch(() => null) !== JSON.stringify(journal)) await discard();
      else {
        try { await rollBack(storage, journal); } catch {
          requireProfileRecovery();
          throw new ProfileRestoreError('recovery');
        }
      }
      throw new ProfileRestoreError('write');
    }
    try {
      for (const item of staged) await storage.switch(item);
      const applied = await readCore(storage);
      if (CORE_KEYS.some(key => applied[key] !== values[key])) throw new ProfileRestoreError('conflict');
      await writeJournal(storage.raw, { ...journal, status: 'committed' });
    } catch {
      try { await rollBack(storage, journal); } catch {
        requireProfileRecovery();
        throw new ProfileRestoreError('recovery');
      }
      throw new ProfileRestoreError('write');
    }
    for (const key of CORE_KEYS) await storage.collect(key).catch(() => {});
  });
}
async function rollBack(storage: ChunkedStorage, journal: Journal) {
  const manifest = (key: CoreKey) => storage.raw.getItem(manifestKey(key));
  // Unknown third values are never replaced by either side of the journal.
  for (const key of CORE_KEYS) {
    const current = await manifest(key);
    if (current !== journal.before[key] && current !== journal.after[key]) throw new ProfileRestoreError('recovery');
  }
  await writeJournal(storage.raw, { ...journal, status: 'rollingBack' });
  for (const key of [...CORE_KEYS].reverse()) await storage.restoreManifest(key, journal.before[key], [journal.after[key]]);
  for (const key of CORE_KEYS) {
    if (await manifest(key) !== journal.before[key]) throw new ProfileRestoreError('recovery');
  }
  await readCore(storage); // Every restored value must assemble and match its checksums.
  await writeJournal(storage.raw, { ...journal, status: 'rolledBack' });
  for (const key of CORE_KEYS) await storage.collect(key).catch(() => {});
}
export function recoverProfileV2(storage: ChunkedStorage) {
  return withProfileLock(async () => {
    const raw = await storage.raw.getItem(PROFILE_JOURNAL_V2_KEY);
    if (journalSettled(raw, 2)) return false;
    await rollBack(storage, parseJournal(raw!));
    return true;
  });
}

// Copies valid legacy values into manifests one key at a time. Every intermediate state
// holds the same data, so an interruption is finished on the next start. Legacy values stay.
export function migrateLegacy(storage: ChunkedStorage) {
  return withProfileLock(async () => {
    if (isFence(await storage.raw.getItem(ONBOARDING)) && await storage.readManifest(ONBOARDING)) return 'done' as const;
    const entries: Record<string, ReadEntry> = {};
    for (const key of [...CORE_KEYS, ...MIRRORS]) {
      try { entries[key] = { raw: await storage.getItem(key) }; } catch { return 'skipped' as const; }
    }
    // Data the stores would reject stays where it is, for their error and recovery screens.
    if ([bookConfig(), shoppingConfig, settingsConfig, onboardingConfig].some(config => config.decode(entries).issue)) return 'skipped' as const;
    for (const key of CORE_KEYS) {
      if (await storage.readManifest(key)) continue;
      const value = entries[key].raw;
      if (value === null && key !== ONBOARDING) continue;
      if (value === null) await storage.removeItem(key); else await storage.setItem(key, value);
      if (await storage.getItem(key) !== value) throw new Error('Migration verification');
    }
    // Older builds read this marker as an unsupported onboarding state and stop before writing.
    await storage.raw.setItem(ONBOARDING, `${LEGACY_FENCE}:${new Date().toISOString()}`);
    return 'migrated' as const;
  });
}

export async function recoverNative(storage: ChunkedStorage) {
  await recoverProfileV2(storage);
  await recoverProfile(storage); // A legacy v1 journal from before the migration.
  try { await migrateLegacy(storage); } catch { /* Legacy keys keep serving reads until the next start. */ }
  await withProfileLock(() => storage.collectAll()).catch(() => {});
}

// Replaces migrated legacy values with a small marker. Not automatic: it runs only after a
// full profile export made after the migration, with no unfinished journal of either kind.
const LEGACY_KEYS = ['recipe-book-v1', 'recipes', 'recipe-meta-v1', 'shopping-list-v1', 'app-settings-v1', PROFILE_JOURNAL_KEY];
export function cleanupLegacy(storage: ChunkedStorage) {
  return withProfileLock(async () => {
    const fence = await storage.raw.getItem(ONBOARDING);
    if (!isFence(fence) || !await storage.readManifest(ONBOARDING)) return { status: 'not-migrated' as const };
    if (!journalSettled(await storage.raw.getItem(PROFILE_JOURNAL_V2_KEY), 2)
      || !journalSettled(await storage.getItem(PROFILE_JOURNAL_KEY), 1)) return { status: 'unsettled' as const };
    const migratedAt = Date.parse(fence!.slice(LEGACY_FENCE.length + 1));
    const backup = await storage.getItem(LAST_BACKUP_KEY);
    if (!backup || !(Date.parse(backup) >= migratedAt)) return { status: 'no-backup' as const };
    for (const key of ['recipe-book-v1', 'shopping-list-v1', 'app-settings-v1'] as const) {
      const legacy = await storage.raw.getItem(key).catch(() => '');
      if (!await storage.readManifest(key) && legacy !== null && !isFence(legacy)) return { status: 'not-migrated' as const };
      await storage.getItem(key); // Each migrated value must still assemble before its source goes.
    }
    const cleaned: string[] = [];
    for (const key of LEGACY_KEYS) {
      const legacy = await storage.raw.getItem(key).catch(() => '');
      if (legacy === null || isFence(legacy)) continue;
      // Mirrors and a settled legacy journal have no logical value on native after this.
      if (key === PROFILE_JOURNAL_KEY || !await storage.readManifest(key)) await storage.removeItem(key);
      await storage.raw.setItem(key, `${LEGACY_FENCE}:cleaned`);
      cleaned.push(key);
    }
    return { status: 'cleaned' as const, keys: cleaned };
  });
}
