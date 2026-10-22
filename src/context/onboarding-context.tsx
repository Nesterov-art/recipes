import { createContext, type PropsWithChildren, useContext } from 'react';
import { StorageGuard } from '@/components/storage-guard';
import { useSafeStore } from '@/hooks/use-safe-store';
import { onboardingConfig } from '@/utils/storage-models';

const Context = createContext<{ completed: boolean; complete: () => Promise<void>; restart: () => Promise<void> } | null>(null);
export function useOnboarding() {
  const value = useContext(Context);
  if (!value) throw new Error('useOnboarding requires OnboardingProvider');
  return value;
}
export function OnboardingProvider({ children }: PropsWithChildren) {
  const storage = useSafeStore(() => onboardingConfig);
  const { store, data: completed } = storage;
  async function change(completed: boolean) {
    if (!await store.update(() => completed)) throw new Error('Onboarding state was not saved');
  }
  // Persist the first pending/completed marker before mounting data providers.
  return <Context.Provider value={{ completed, complete: () => change(true), restart: () => change(false) }}>
    <StorageGuard {...storage}>{storage.initialized && children}</StorageGuard>
  </Context.Provider>;
}
