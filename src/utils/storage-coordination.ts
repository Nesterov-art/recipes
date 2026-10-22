import type { StorageAdapter } from './safe-storage.ts';

export const PROFILE_JOURNAL_KEY = 'profile-restore-v1';
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
export function subscribeProfileRecovery(listener: () => void) {
  recoveryListeners.add(listener);
  return () => { recoveryListeners.delete(listener); };
}
export async function assertProfileReady(storage: StorageAdapter) {
  const raw = await storage.getItem(PROFILE_JOURNAL_KEY);
  if (raw === null) return;
  try {
    const value = JSON.parse(raw);
    if (value?.format === 'profile-restore' && value.version === 1
      && ['committed', 'rolledBack'].includes(value.status)) return;
  } catch { /* Invalid journals must never be treated as an empty profile. */ }
  requireProfileRecovery();
  throw new ProfileRecoveryRequired('Profile recovery must finish before accessing data');
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
