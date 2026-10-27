import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '@/utils/profile-backup';
import { captureProfile, PROFILE_KEYS, recoverProfile, restoreProfile, type ProfileStorage, type RawProfile } from '@/utils/profile-transaction';

// Web/PWA keeps its original layout: one localStorage value per key plus the legacy mirrors
// read by older clients. Native builds use app-storage.native.ts.
export const appStorage: ProfileStorage = AsyncStorage;
export const LEGACY_MIRRORS = true;
export const PROFILE_STORAGE_KEYS: readonly string[] = PROFILE_KEYS;
export const captureAppProfile = (): Promise<{ raw: Record<string, string | null>; profile: Profile }> => captureProfile(appStorage);
export const restoreAppProfile = (profile: Profile, expected: Record<string, string | null>) => restoreProfile(appStorage, profile, expected as RawProfile);
export async function recoverAppStorage() { await recoverProfile(appStorage); }
