import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  mergeShoppingEntries,
  migrateShoppingItems,
  reorderShoppingItems,
  type ShoppingItem,
  updateShoppingItem,
} from '@/utils/shopping';

const SHOPPING_KEY = 'shopping-list-v1';

type ShoppingContextValue = {
  items: ShoppingItem[];
  loaded: boolean;
  addItem: (text: string) => boolean;
  addIngredients: (ingredients: string[]) => number;
  updateItem: (id: string, text: string) => boolean;
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
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const itemsRef = useRef<ShoppingItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  function updateItems(updater: (current: ShoppingItem[]) => ShoppingItem[]) {
    setItems((current) => {
      const next = updater(current);
      itemsRef.current = next;
      return next;
    });
  }

  useEffect(() => {
    async function load() {
      try {
        const json = await AsyncStorage.getItem(SHOPPING_KEY);
        const parsed: unknown = json ? JSON.parse(json) : [];
        const migrated = migrateShoppingItems(parsed);
        itemsRef.current = migrated;
        setItems(migrated);
      } catch (error) {
        console.warn('Unable to load shopping list', error);
      } finally {
        setLoaded(true);
      }
    }
    void load();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(SHOPPING_KEY, JSON.stringify(items)).catch((error) => {
      console.warn('Unable to save shopping list', error);
    });
  }, [items, loaded]);

  const value = useMemo<ShoppingContextValue>(() => ({
    items,
    loaded,
    addItem: (text) => {
      const result = mergeShoppingEntries(itemsRef.current, [text]);
      if (result.changedCount === 0) return false;
      itemsRef.current = result.items;
      setItems(result.items);
      return true;
    },
    addIngredients: (ingredients) => {
      const result = mergeShoppingEntries(itemsRef.current, ingredients);
      if (result.changedCount > 0) {
        itemsRef.current = result.items;
        setItems(result.items);
      }
      return result.changedCount;
    },
    updateItem: (id, text) => {
      const index = itemsRef.current.findIndex((item) => item.id === id);
      if (index < 0) return false;
      const updated = updateShoppingItem(itemsRef.current[index], text);
      if (!updated) return false;
      const next = [...itemsRef.current];
      next[index] = updated;
      itemsRef.current = next;
      setItems(next);
      return true;
    },
    reorderItems: (orderedIds) => updateItems((current) => reorderShoppingItems(current, orderedIds)),
    toggleItem: (id) => updateItems((current) => current.map((item) => (
      item.id === id ? { ...item, checked: !item.checked } : item
    ))),
    removeItem: (id) => updateItems((current) => current.filter((item) => item.id !== id)),
    clearCompleted: () => updateItems((current) => current.filter((item) => !item.checked)),
  }), [items, loaded]);

  return <ShoppingContext.Provider value={value}>{children}</ShoppingContext.Provider>;
}
