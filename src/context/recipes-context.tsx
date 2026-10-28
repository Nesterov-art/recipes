import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';

import {
  CATEGORIES,
  QUICK_TIME,
  type Recipe,
  type CookingRating,
  type RecipeFilter,
  type RecipeMeta,
  type RecipeMetaById,
} from '@/constants/recipes';
import { emptyRecipeMeta } from '@/utils/recipes';
import { mergeRecipeBackup, type RecipeBackup } from '@/utils/recipe-backup';
import { LEGACY_MIRRORS } from '@/utils/app-storage';
import { bookConfig } from '@/utils/storage-models';
import { useSafeStore } from '@/hooks/use-safe-store';
import { StorageGuard } from '@/components/storage-guard';
import { pickSmartRandom } from '@/utils/smart-random';
import { useSettings } from '@/context/settings-context';
import { useToast } from '@/context/toast-context';
import { subscribeStorageSpace } from '@/utils/storage-coordination';

type RecipeSort = 'recent' | 'asc' | 'desc';

type RecipesContextValue = {
  recipes: Recipe[];
  loaded: boolean;
  query: string;
  setQuery: (value: string) => void;
  filter: RecipeFilter;
  setFilter: (value: RecipeFilter) => void;
  sort: RecipeSort;
  setSort: (value: RecipeSort) => void;
  visible: Recipe[];
  recipeMeta: RecipeMetaById;
  getRecipeMeta: (id: string) => RecipeMeta;
  toggleFavorite: (id: string) => void;
  recordCooking: (id: string, details?: { rating?: CookingRating; note?: string }, onSaved?: () => void) => Promise<boolean>;
  importRecipes: (backup: RecipeBackup, onSaved?: (result: ReturnType<typeof mergeRecipeBackup>) => void) => Promise<ReturnType<typeof mergeRecipeBackup>>;
  addRecipe: (recipe: Recipe, onSaved?: () => void) => Promise<boolean>;
  updateRecipe: (recipe: Recipe, onSaved?: () => void) => Promise<boolean>;
  deleteRecipe: (id: string, onSaved?: () => void) => Promise<boolean>;
  pickRandom: () => Recipe | null;
};

const RecipesContext = createContext<RecipesContextValue | null>(null);

export function useRecipes() {
  const context = useContext(RecipesContext);
  if (!context) throw new Error('useRecipes must be used inside RecipesProvider');
  return context;
}

export function RecipesProvider({ children }: PropsWithChildren) {
  const { language, t, colors } = useSettings();
  const { showToast } = useToast();
  const storage = useSafeStore(() => bookConfig(LEGACY_MIRRORS));
  const { store, loaded, data: { recipes, recipeMeta } } = storage;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RecipeFilter>('Все');
  const [sort, setSort] = useState<RecipeSort>('recent');
  const lastRandomId = useRef<string | null>(null);

  // Android only: a refused save is a dialog (it needs reading), the early warning a toast.
  useEffect(() => subscribeStorageSpace(level => {
    if (level === 'full') Alert.alert(t('storageSpaceTitle'), t('storageSpaceFull'));
    else showToast(t('storageSpaceLow'));
  }), [showToast, t]);

  const visible = useMemo(() => {
    const terms = query.toLowerCase().split(/[,\s]+/).filter(Boolean);
    const filtered = recipes.filter((recipe) => {
      if (filter === 'Любимые' && !recipeMeta[recipe.id]?.favorite) return false;
      if (filter === 'Быстро' && !(recipe.time > 0 && recipe.time <= QUICK_TIME)) return false;
      if (CATEGORIES.some((category) => category === filter) && recipe.category !== filter) {
        return false;
      }
      const text = `${recipe.title} ${recipe.ingredients.join(' ')}`.toLowerCase();
      return terms.every((term) => text.includes(term));
    });
    if (sort === 'recent') return filtered;
    const direction = sort === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => (
      a.title.localeCompare(b.title, language === 'ru' ? 'ru' : 'en', { sensitivity: 'base' }) * direction
    ));
  }, [filter, language, query, recipeMeta, recipes, sort]);

  const value = useMemo<RecipesContextValue>(
    () => ({
      recipes,
      loaded,
      query,
      setQuery,
      filter,
      setFilter,
      sort,
      setSort,
      visible,
      recipeMeta,
      getRecipeMeta: (id) => recipeMeta[id] ?? emptyRecipeMeta(),
      toggleFavorite: (id) => {
        void store.update(current => {
          const meta = current.recipeMeta[id] ?? emptyRecipeMeta();
          return { ...current, recipeMeta: { ...current.recipeMeta, [id]: { ...meta, favorite: !meta.favorite } } };
        });
      },
      recordCooking: (id, details = {}, onSaved) => store.update(current => {
        const meta = current.recipeMeta[id] ?? emptyRecipeMeta();
        const note = details.note?.trim();
        return {
          ...current,
          recipeMeta: {
            ...current.recipeMeta,
            [id]: {
              ...meta,
              cookings: [
                {
                  id: `${Date.now()}-${Math.random()}`,
                  cookedAt: new Date().toISOString(),
                  ...(details.rating ? { rating: details.rating } : {}),
                  ...(note ? { note } : {}),
                },
                ...meta.cookings,
              ],
            },
          },
        };
      }, () => { showToast(t('cookingSaved')); onSaved?.(); }),
      importRecipes: async (backup, onSaved) => {
        let result: ReturnType<typeof mergeRecipeBackup> | undefined;
        const saved = await store.update(current => {
          result = mergeRecipeBackup(current.recipes, current.recipeMeta, backup);
          return { ...current, recipes: result.recipes, recipeMeta: result.recipeMeta };
        }, () => { if (result) onSaved?.(result); });
        if (!saved || !result) throw new Error('Recipe import was not committed');
        return result;
      },
      addRecipe: (recipe, onSaved) => store.update(current => ({
        ...current, recipes: [recipe, ...current.recipes.filter(item => item.id !== recipe.id)],
      }), () => { showToast(t('recipeCreated')); onSaved?.(); }),
      updateRecipe: (updated, onSaved) => store.update(current => ({
        ...current, recipes: current.recipes.map(recipe => recipe.id === updated.id ? updated : recipe),
      }), () => { showToast(t('recipeUpdated')); onSaved?.(); }),
      deleteRecipe: (id, onSaved) => store.update(current => {
        const next = { ...current.recipeMeta };
        delete next[id];
        return { ...current, recipes: current.recipes.filter(recipe => recipe.id !== id), recipeMeta: next };
      }, () => { showToast(t('recipeDeleted')); onSaved?.(); }),
      pickRandom: () => {
        if (visible.length === 0) {
          showToast(`${t('emptyRandomTitle')}. ${recipes.length === 0
              ? t('emptyRandomRecipes')
              : t('emptyRandomFilter')}`);
          return null;
        }
        const recipe = pickSmartRandom(visible, recipeMeta, {
          lastRecipeId: lastRandomId.current,
        });
        if (!recipe) return null;
        lastRandomId.current = recipe.id;
        return recipe;
      },
    }),
    [filter, loaded, store, query, recipeMeta, recipes, showToast, sort, t, visible],
  );

  return <RecipesContext.Provider value={value}><StorageGuard {...storage} t={t} colors={colors}>{children}</StorageGuard></RecipesContext.Provider>;
}
