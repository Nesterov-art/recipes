import { type PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { StorageGuard } from '@/components/storage-guard';
import { appStorage, PROFILE_STORAGE_KEYS, recoverAppStorage } from '@/utils/app-storage';
import { PROFILE_JOURNAL_KEY, PROFILE_JOURNAL_V2_KEY, refreshStores, subscribeProfileRecovery } from '@/utils/storage-coordination';

export function ProfileStorageGate({ children }: PropsWithChildren) {
  const [loaded, setLoaded] = useState(false);
  const [issue, setIssue] = useState<'profile' | undefined>();
  const [saving, setSaving] = useState(true);
  const raw = useRef<string | null>(null);
  const rawV2 = useRef<string | null>(null);
  const originals = useRef<Record<string, { raw: string | null; error?: boolean }>>({});
  const recovering = useRef(false);
  const captureRecovery = useCallback(async () => {
    try { raw.current = await appStorage.getItem(PROFILE_JOURNAL_KEY); } catch { /* Keep last readable journal. */ }
    try { rawV2.current = await appStorage.getItem(PROFILE_JOURNAL_V2_KEY); } catch { /* Same for the native journal. */ }
    originals.current = Object.fromEntries(await Promise.all(PROFILE_STORAGE_KEYS.map(async key => {
      try { return [key, { raw: await appStorage.getItem(key) }] as const; }
      catch { return [key, { raw: null, error: true }] as const; }
    })));
  }, []);
  const retry = useCallback(async () => {
    if (recovering.current) return false;
    recovering.current = true; setSaving(true);
    try {
      await captureRecovery();
      await recoverAppStorage();
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
    exportRecovery: () => JSON.stringify({
      format: 'recipes-profile-recovery', version: 1, journal: raw.current,
      ...(rawV2.current !== null ? { journalV2: rawV2.current } : {}), entries: originals.current,
    }),
  }}>{children}</StorageGuard>;
}
