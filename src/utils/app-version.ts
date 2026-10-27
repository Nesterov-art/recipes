import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Updates from 'expo-updates';

/** The app version from app.json, e.g. "1.0.0". */
export function appVersion() {
  return Constants.expoConfig?.version ?? '—';
}

/**
 * The over-the-air update the app is running, shortened for support requests. None in
 * Expo Go, in development, on web or when the build runs its embedded bundle.
 */
export function appUpdateId() {
  // Expo Go and development report the dev session as an update; it means nothing to support.
  if (__DEV__ || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  return Updates.updateId && !Updates.isEmbeddedLaunch ? Updates.updateId.slice(0, 8) : null;
}
