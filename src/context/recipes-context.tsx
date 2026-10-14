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
import { Alert } from 'react-native';

import {
  CATEGORIES,
  INITIAL_RECIPES,
  META_STORAGE_KEY,
  QUICK_TIME,
  type Recipe,
  type CookingRating,
  type RecipeFilter,
  type RecipeMeta,
  type RecipeMetaById,
  STORAGE_KEY,
} from '@/constants/recipes';
import { emptyRecipeMeta, isRecipe, isRecipeMetaById } from '@/utils/recipes';
import { pickSmartRandom } from '@/utils/smart-random';
import { useSettings } from '@/context/settings-context';
import { useToast } from '@/context/toast-context';

export type RecipeSort = 'recent' | 'asc' | 'desc';

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
  recordCooking: (id: string, details?: { rating?: CookingRating; note?: string }) => void;
  addRecipe: (recipe: Recipe) => void;
  updateRecipe: (recipe: Recipe) => void;
  deleteRecipe: (id: string) => void;
  pickRandom: () => Recipe | null;
};

const RecipesContext = createContext<RecipesContextValue | null>(null);

export function useRecipes() {
  const context = useContext(RecipesContext);
  if (!context) throw new Error('useRecipes must be used inside RecipesProvider');
  return context;
}

export function RecipesProvider({ children }: PropsWithChildren) {
  const { language, t } = useSettings();
  const { showToast } = useToast();
  const [recipes, setRecipes] = useState<Recipe[]>(INITIAL_RECIPES);
  const [recipeMeta, setRecipeMeta] = useState<RecipeMetaById>({});
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RecipeFilter>('Все');
  const [sort, setSort] = useState<RecipeSort>('recent');
  const lastRandomId = useRef<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [recipesJson, metaJson] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(META_STORAGE_KEY),
        ]);
        if (recipesJson) {
          const parsed: unknown = JSON.parse(recipesJson);
          if (Array.isArray(parsed) && parsed.every(isRecipe)) setRecipes(parsed);
        }
        if (metaJson) {
          const parsed: unknown = JSON.parse(metaJson);
          if (isRecipeMetaById(parsed)) setRecipeMeta(parsed);
        }
      } catch (error) {
        console.warn('Ошибка загрузки рецептов', error);
      } finally {
        setLoaded(true);
      }
    }
    void load();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recipes)).catch((error) => {
      console.warn('Ошибка сохранения рецептов', error);
    });
  }, [loaded, recipes]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(META_STORAGE_KEY, JSON.stringify(recipeMeta)).catch((error) => {
      console.warn('Ошибка сохранения данных рецептов', error);
    });
  }, [loaded, recipeMeta]);

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
      toggleFavorite: (id) => setRecipeMeta((current) => {
        const meta = current[id] ?? emptyRecipeMeta();
        return { ...current, [id]: { ...meta, favorite: !meta.favorite } };
      }),
      recordCooking: (id, details = {}) => {
        setRecipeMeta((current) => {
          const meta = current[id] ?? emptyRecipeMeta();
          const note = details.note?.trim();
          return {
            ...current,
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
          };
        });
        showToast(t('cookingSaved'));
      },
      addRecipe: (recipe) => {
        setRecipes((current) => [recipe, ...current]);
        showToast(t('recipeCreated'));
      },
      updateRecipe: (updated) => {
        setRecipes((current) => current.map((recipe) => (recipe.id === updated.id ? updated : recipe)));
        showToast(t('recipeUpdated'));
      },
      deleteRecipe: (id) => {
        setRecipes((current) => current.filter((recipe) => recipe.id !== id));
        setRecipeMeta((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        showToast(t('recipeDeleted'));
      },
      pickRandom: () => {
        if (visible.length === 0) {
          Alert.alert(
            t('emptyRandomTitle'),
            recipes.length === 0
              ? t('emptyRandomRecipes')
              : t('emptyRandomFilter'),
          );
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
    [filter, loaded, query, recipeMeta, recipes, showToast, sort, t, visible],
  );

  return <RecipesContext.Provider value={value}>{children}</RecipesContext.Provider>;
}
