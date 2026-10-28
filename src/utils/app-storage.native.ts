import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { CORE_KEYS, captureProfileV2, createNativeStorage, recoverNative, restoreProfileV2, type CoreRaw } from '@/utils/native-profile';
import type { Profile } from '@/utils/profile-backup';

const MiB = 1024 * 1024;
// Android's database limit: plugins/with-async-storage-size.js in builds, the library default
// in Expo Go. iOS keeps values as files without a total limit.
const budget = Platform.OS !== 'android' ? undefined
  : Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? 6 * MiB : 32 * MiB;
// iOS/Android: values are split into parts of at most 256 KiB behind manifests (stage 7.2).
export const appStorage = createNativeStorage(AsyncStorage, budget);
export const LEGACY_MIRRORS = false;
export const PROFILE_STORAGE_KEYS: readonly string[] = CORE_KEYS;
export const captureAppProfile = (): Promise<{ raw: Record<string, string | null>; profile: Profile }> => captureProfileV2(appStorage);
export const restoreAppProfile = (profile: Profile, expected: Record<string, string | null>) => restoreProfileV2(appStorage, profile, expected as CoreRaw, budget);
export const recoverAppStorage = () => recoverNative(appStorage);
