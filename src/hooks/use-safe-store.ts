import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { SafeStore, type StoreConfig } from '@/utils/safe-storage';
import { registerStore } from '@/utils/storage-coordination';

export function useSafeStore<T>(config: () => StoreConfig<T>) {
  const [store] = useState(() => new SafeStore(AsyncStorage, config()));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    const unregister = registerStore(store);
    void store.load();
    return unregister;
  }, [store]);
  return { store, ...state };
}
