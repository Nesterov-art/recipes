import type { StorageAdapter } from './safe-storage.ts';
import { bookConfig, settingsConfig, shoppingConfig } from './storage-models.ts';
import { validateProfile, type Profile } from './profile-backup.ts';
import { assertProfileReady, PROFILE_JOURNAL_KEY, requireProfileRecovery, withProfileLock } from './storage-coordination.ts';

export const PROFILE_KEYS = ['recipe-book-v1', 'recipes', 'recipe-meta-v1', 'shopping-list-v1', 'app-settings-v1', 'app-onboarding-v1'] as const;
export const LAST_BACKUP_KEY = 'profile-backup-last-success-v1';
type RawProfile = Record<typeof PROFILE_KEYS[number], string | null>;
export type ProfileStorage = StorageAdapter & { removeItem: (key: string) => Promise<void> };
type Journal = {
  format: 'profile-restore'; version: 1; id: string;
  status: 'prepared' | 'rollingBack' | 'committed' | 'rolledBack';
  before: RawProfile; after: RawProfile;
};
export class ProfileRestoreError extends Error {
  code: 'conflict' | 'write' | 'recovery';
  constructor(code: ProfileRestoreError['code']) { super(code); this.code = code; }
}
async function readRaw(storage: StorageAdapter): Promise<RawProfile> {
  return Object.fromEntries(await Promise.all(PROFILE_KEYS.map(async key => [key, await storage.getItem(key)]))) as RawProfile;
}
function decodeRaw(raw: RawProfile): Profile {
  const entries = Object.fromEntries(PROFILE_KEYS.map(key => [key, { raw: raw[key] }]));
  const book = bookConfig().decode(entries);
  const shopping = shoppingConfig.decode(entries);
  const settings = settingsConfig.decode(entries);
  if (book.issue || shopping.issue || settings.issue || !book.data || !shopping.data || !settings.data) throw new Error('Unavailable profile');
  return validateProfile({ ...book.data, shoppingItems: shopping.data, settings: settings.data });
}
export function captureProfile(storage: StorageAdapter) {
  return withProfileLock(async () => {
    await assertProfileReady(storage);
    const raw = await readRaw(storage);
    return { raw, profile: decodeRaw(raw) };
  });
}
function parseJournal(raw: string): Journal {
  const value = JSON.parse(raw);
  if (value?.format !== 'profile-restore' || value.version !== 1 || typeof value.id !== 'string'
    || !['prepared', 'rollingBack', 'committed', 'rolledBack'].includes(value.status)
    || !PROFILE_KEYS.every(key => value.before && (value.before[key] === null || typeof value.before[key] === 'string')
      && value.after && typeof value.after[key] === 'string')) throw new ProfileRestoreError('recovery');
  decodeRaw(value.after);
  return value;
}
async function checkedWrite(storage: StorageAdapter, key: string, raw: string) {
  await storage.setItem(key, raw);
  if (await storage.getItem(key) !== raw) throw new ProfileRestoreError('write');
}
async function writeJournal(storage: StorageAdapter, journal: Journal) {
  await checkedWrite(storage, PROFILE_JOURNAL_KEY, JSON.stringify(journal));
}
async function rollBack(storage: ProfileStorage, journal: Journal) {
  // Unknown third-party changes must not be replaced by either side of a journal.
  const current = await readRaw(storage);
  if (PROFILE_KEYS.some(key => current[key] !== journal.before[key] && current[key] !== journal.after[key])) throw new ProfileRestoreError('recovery');
  await writeJournal(storage, { ...journal, status: 'rollingBack' });
  for (const key of [...PROFILE_KEYS].reverse()) {
    const raw = await storage.getItem(key);
    if (raw === journal.before[key]) continue;
    if (raw !== journal.after[key]) throw new ProfileRestoreError('recovery');
    const before = journal.before[key];
    if (before === null) await storage.removeItem(key); // Only a key absent before this restore.
    else await checkedWrite(storage, key, before);
  }
  const restored = await readRaw(storage);
  if (PROFILE_KEYS.some(key => restored[key] !== journal.before[key])) throw new ProfileRestoreError('recovery');
  await writeJournal(storage, { ...journal, status: 'rolledBack' });
}
export function recoverProfile(storage: ProfileStorage) {
  return withProfileLock(async () => {
    const raw = await storage.getItem(PROFILE_JOURNAL_KEY);
    if (raw === null) return false;
    const journal = parseJournal(raw);
    if (journal.status === 'committed' || journal.status === 'rolledBack') return false;
    await rollBack(storage, journal);
    return true;
  });
}
export function restoreProfile(storage: ProfileStorage, input: Profile, expected: RawProfile) {
  const profile = validateProfile(input); // No writes for unknown/malformed input.
  return withProfileLock(async () => {
    await assertProfileReady(storage);
    const before = await readRaw(storage);
    if (PROFILE_KEYS.some(key => before[key] !== expected[key])) throw new ProfileRestoreError('conflict');
    const journal: Journal = {
      format: 'profile-restore', version: 1, id: `${Date.now()}-${Math.random()}`, status: 'prepared', before,
      after: {
        'recipe-book-v1': JSON.stringify({ recipes: profile.recipes, recipeMeta: profile.recipeMeta }),
        recipes: JSON.stringify(profile.recipes), 'recipe-meta-v1': JSON.stringify(profile.recipeMeta),
        'shopping-list-v1': JSON.stringify(profile.shoppingItems), 'app-settings-v1': JSON.stringify(profile.settings),
        'app-onboarding-v1': 'completed',
      },
    };
    // Keep the previous recovery snapshot when starting a subsequent restore.
    const previous = await storage.getItem(PROFILE_JOURNAL_KEY);
    if (previous !== null) await checkedWrite(storage, `storage-recovery-v1:profile:${journal.id}`, previous);
    try {
      await writeJournal(storage, journal);
      for (const key of PROFILE_KEYS) {
        if (await storage.getItem(key) !== before[key]) throw new ProfileRestoreError('conflict');
        await checkedWrite(storage, key, journal.after[key]!);
      }
      const applied = await readRaw(storage);
      if (PROFILE_KEYS.some(key => applied[key] !== journal.after[key])) throw new ProfileRestoreError('conflict');
      await writeJournal(storage, { ...journal, status: 'committed' });
    } catch {
      try {
        const persisted = await storage.getItem(PROFILE_JOURNAL_KEY);
        if (persisted && parseJournal(persisted).id === journal.id) await rollBack(storage, journal);
      } catch {
        requireProfileRecovery();
        throw new ProfileRestoreError('recovery');
      }
      throw new ProfileRestoreError('write');
    }
  });
}
