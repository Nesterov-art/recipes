import AsyncStorage from '@react-native-async-storage/async-storage';
import { type PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { StorageGuard } from '@/components/storage-guard';
import { PROFILE_KEYS, recoverProfile } from '@/utils/profile-transaction';
import { PROFILE_JOURNAL_KEY, refreshStores, subscribeProfileRecovery } from '@/utils/storage-coordination';

export function ProfileStorageGate({ children }: PropsWithChildren) {
  const [loaded, setLoaded] = useState(false);
  const [issue, setIssue] = useState<'profile' | undefined>();
  const [saving, setSaving] = useState(true);
  const raw = useRef<string | null>(null);
  const originals = useRef<Record<string, { raw: string | null; error?: boolean }>>({});
  const recovering = useRef(false);
  const captureRecovery = useCallback(async () => {
    try { raw.current = await AsyncStorage.getItem(PROFILE_JOURNAL_KEY); } catch { /* Keep last readable journal. */ }
    originals.current = Object.fromEntries(await Promise.all(PROFILE_KEYS.map(async key => {
      try { return [key, { raw: await AsyncStorage.getItem(key) }] as const; }
      catch { return [key, { raw: null, error: true }] as const; }
    })));
  }, []);
  const retry = useCallback(async () => {
    if (recovering.current) return false;
    recovering.current = true; setSaving(true);
    try {
      await captureRecovery();
      await recoverProfile(AsyncStorage);
      await refreshStores();
      setLoaded(true); setIssue(undefined);
      return true;
    } catch { setIssue('profile'); return false; }
    finally { setSaving(false); recovering.current = false; }
  }, [captureRecovery]);
  useEffect(() => {
    const unsubscribe = subscribeProfileRecovery(() => {
      setIssue('profile');
      if (!recovering.current) {
        setSaving(true);
        void captureRecovery().finally(() => setSaving(false));
      }
    });
    void Promise.resolve().then(retry);
    return unsubscribe;
  }, [captureRecovery, retry]);
  return <StorageGuard loaded={loaded} issue={issue} saving={saving} canRecover={false} store={{
    retry, reread: async () => { await retry(); }, recover: retry,
    exportRecovery: () => JSON.stringify({ format: 'recipes-profile-recovery', version: 1, journal: raw.current, entries: originals.current }),
  }}>{children}</StorageGuard>;
}
