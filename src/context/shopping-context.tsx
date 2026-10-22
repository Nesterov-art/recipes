import { createContext, type PropsWithChildren, useContext, useMemo } from 'react';
import { useSafeStore } from '@/hooks/use-safe-store';
import { StorageGuard } from '@/components/storage-guard';
import { useSettings } from '@/context/settings-context';
import { shoppingConfig } from '@/utils/storage-models';
import { mergeShoppingEntries, reorderShoppingItems, type ShoppingItem, updateShoppingItem } from '@/utils/shopping';

type ShoppingContextValue = {
  items: ShoppingItem[]; loaded: boolean;
  addItem: (text: string, onSaved?: () => void) => Promise<boolean>;
  addIngredients: (ingredients: string[], onSaved?: (count: number) => void) => Promise<number | null>;
  updateItem: (id: string, text: string, onSaved?: () => void) => Promise<boolean>;
  reorderItems: (orderedIds: string[]) => void;
  toggleItem: (id: string) => void;
  removeItem: (id: string) => void;
  clearCompleted: () => void;
};
const ShoppingContext = createContext<ShoppingContextValue | null>(null);
export function useShopping() {
  const context = useContext(ShoppingContext);
  if (!context) throw new Error('useShopping must be used inside ShoppingProvider');
  return context;
}
export function ShoppingProvider({ children }: PropsWithChildren) {
  const { colors, t } = useSettings();
  const storage = useSafeStore(() => shoppingConfig);
  const { store, data: items, loaded } = storage;
  const value = useMemo<ShoppingContextValue>(() => ({
    items, loaded,
    addItem: async (text, onSaved) => {
      let changed = false;
      const saved = await store.update(current => {
        const result = mergeShoppingEntries(current, [text]);
        changed = result.changedCount > 0;
        return result.items;
      }, () => { if (changed) onSaved?.(); });
      return saved && changed;
    },
    addIngredients: async (ingredients, onSaved) => {
      let count = 0;
      const saved = await store.update(current => {
        const result = mergeShoppingEntries(current, ingredients);
        count = result.changedCount;
        return result.items;
      }, () => onSaved?.(count));
      return saved ? count : null;
    },
    updateItem: async (id, text, onSaved) => {
      let valid = false;
      const saved = await store.update(current => current.map(item => {
        if (item.id !== id) return item;
        const updated = updateShoppingItem(item, text);
        valid = updated !== null;
        return updated ?? item;
      }), () => { if (valid) onSaved?.(); });
      return saved && valid;
    },
    reorderItems: ids => { void store.update(current => reorderShoppingItems(current, ids)); },
    toggleItem: id => { void store.update(current => current.map(item => item.id === id ? { ...item, checked: !item.checked } : item)); },
    removeItem: id => { void store.update(current => current.filter(item => item.id !== id)); },
    clearCompleted: () => { void store.update(current => current.filter(item => !item.checked)); },
  }), [items, loaded, store]);
  return <ShoppingContext.Provider value={value}><StorageGuard {...storage} t={t} colors={colors}>{children}</StorageGuard></ShoppingContext.Provider>;
}
