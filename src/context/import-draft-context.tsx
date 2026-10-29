import { createContext, type PropsWithChildren, useContext, useMemo, useRef } from 'react';

import type { RecipeDraft } from '@/utils/recipe-import';

// A recipe found on a cooking site, handed from the preview to the form. In memory only: never
// stored, never in a backup, never in the address (the form gets a random key). A reload or a
// restart forgets it, and the form then goes back instead of opening empty.
export type ImportedDraft = { draft: RecipeDraft; host: string };
type ImportDraftContextValue = {
  // Keeps one draft at a time (a new one replaces the last) and returns its key.
  offer: (draft: ImportedDraft) => string;
  get: (key: string) => ImportedDraft | null;
  clear: (key: string) => void;
};

const ImportDraftContext = createContext<ImportDraftContextValue | null>(null);

export function useImportDraft() {
  const context = useContext(ImportDraftContext);
  if (!context) throw new Error('useImportDraft must be used inside ImportDraftProvider');
  return context;
}

export function ImportDraftProvider({ children }: PropsWithChildren) {
  const held = useRef<{ key: string; value: ImportedDraft } | null>(null);
  const value = useMemo<ImportDraftContextValue>(() => ({
    offer: draft => {
      const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      held.current = { key, value: draft };
      return key;
    },
    get: key => (held.current?.key === key ? held.current.value : null),
    clear: key => { if (held.current?.key === key) held.current = null; },
  }), []);
  return <ImportDraftContext.Provider value={value}>{children}</ImportDraftContext.Provider>;
}
