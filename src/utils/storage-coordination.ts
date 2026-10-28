import type { StorageAdapter } from './safe-storage.ts';

export const PROFILE_JOURNAL_KEY = 'profile-restore-v1';
export const PROFILE_JOURNAL_V2_KEY = 'profile-restore-v2';
let tail: Promise<unknown> = Promise.resolve();
const recoveryListeners = new Set<() => void>();
export class ProfileRecoveryRequired extends Error {}

export function withProfileLock<T>(task: () => Promise<T>): Promise<T> {
  const next = tail.catch(() => {}).then(() => (
    typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('recipes-storage:profile', task)
      : task()
  ));
  tail = next;
  return next;
}
export function requireProfileRecovery() { recoveryListeners.forEach(listener => listener()); }

// 'low': the next large save is close to the database limit; 'full': a save was refused.
export type StorageSpace = 'low' | 'full';
const spaceListeners = new Set<(level: StorageSpace) => void>();
export function reportStorageSpace(level: StorageSpace) { spaceListeners.forEach(listener => listener(level)); }
export function subscribeStorageSpace(listener: (level: StorageSpace) => void) {
  spaceListeners.add(listener);
  return () => { spaceListeners.delete(listener); };
}
export function subscribeProfileRecovery(listener: () => void) {
  recoveryListeners.add(listener);
  return () => { recoveryListeners.delete(listener); };
}
export function journalSettled(raw: string | null, version: 1 | 2) {
  if (raw === null) return true;
  try {
    const value = JSON.parse(raw);
    return value?.format === 'profile-restore' && value.version === version && ['committed', 'rolledBack'].includes(value.status);
  } catch { return false; } // Invalid journals must never be treated as an empty profile.
}
export async function assertProfileReady(storage: StorageAdapter) {
  // v1 is the web journal and a legacy one on native; v2 is written only by native restores.
  for (const [key, version] of [[PROFILE_JOURNAL_KEY, 1], [PROFILE_JOURNAL_V2_KEY, 2]] as const) {
    if (journalSettled(await storage.getItem(key), version)) continue;
    requireProfileRecovery();
    throw new ProfileRecoveryRequired('Profile recovery must finish before accessing data');
  }
}

type RegisteredStore = { load: () => Promise<unknown>; whenIdle: () => Promise<unknown>; healthy: () => boolean };
const stores = new Set<RegisteredStore>();
export function registerStore(store: RegisteredStore) {
  stores.add(store);
  return () => { stores.delete(store); };
}
export async function settleStores() {
  await Promise.all([...stores].map(store => store.whenIdle()));
  if ([...stores].some(store => !store.healthy())) throw new Error('Unsaved or unavailable profile data');
}
export async function refreshStores() { await Promise.all([...stores].map(store => store.load())); }
