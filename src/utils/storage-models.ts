import type { Recipe, RecipeMetaById } from '../constants/recipes.ts';
import type { Language } from '../constants/i18n.ts';
import type { ThemeMode } from '../constants/theme.ts';
import { isRecipe, isRecipeMetaById } from './recipes.ts';
import { migrateShoppingItems, type ShoppingItem } from './shopping.ts';
import { parseEntry, record, supported, type StoreConfig, type ReadEntry } from './safe-storage.ts';

type Book = { recipes: Recipe[]; recipeMeta: RecipeMetaById; [key: string]: unknown };
export type Settings = {
  theme: ThemeMode; language: Language; shoppingCompletedBehavior: 'keep' | 'moveDown';
  [key: string]: unknown;
};
const parsed = (entry: ReadEntry) => {
  try { return { value: parseEntry(entry), issue: undefined }; }
  catch { return { value: undefined, issue: entry.error ? 'read' as const : 'invalid' as const }; }
};

// Mirrors serve older PWA clients on the same origin; native builds have no older clients.
export function bookConfig(mirrors = true): StoreConfig<Book> {
  let safeMirrors: string[] = [];
  return {
    key: 'recipe-book-v1', keys: ['recipe-book-v1', 'recipes', 'recipe-meta-v1'],
    empty: { recipes: [], recipeMeta: {} },
    decode(entries) {
      // Independent reads: an unavailable mirror cannot invalidate a valid book.
      const main = parsed(entries['recipe-book-v1']);
      const recipes = parsed(entries.recipes);
      const meta = parsed(entries['recipe-meta-v1']);
      const validRecipes = Array.isArray(recipes.value) && recipes.value.every(isRecipe);
      const validMeta = isRecipeMetaById(meta.value);
      safeMirrors = !mirrors ? [] : [
        ...(!recipes.issue && (recipes.value === undefined || validRecipes) ? ['recipes'] : []),
        ...(!meta.issue && (meta.value === undefined || validMeta) ? ['recipe-meta-v1'] : []),
      ];
      if (main.value !== undefined && !supported(main.value)) return { issue: 'unsupported' };
      if (record(main.value) && Array.isArray(main.value.recipes)
        && main.value.recipes.every(isRecipe) && isRecipeMetaById(main.value.recipeMeta)) {
        return { data: main.value as Book };
      }
      const missingMain = !main.issue && main.value === undefined;
      const legacyOK = !recipes.issue && !meta.issue
        && (recipes.value === undefined || validRecipes) && (meta.value === undefined || validMeta);
      const fallback: Book = {
        recipes: validRecipes ? recipes.value as Recipe[] : [],
        recipeMeta: validMeta ? meta.value as RecipeMetaById : {},
      };
      if (missingMain && legacyOK) return { data: fallback };
      // Never reconstruct over an unreadable primary: it may still contain newer data.
      if (entries['recipe-book-v1'].error) return { issue: 'read' };
      return {
        issue: main.issue ?? recipes.issue ?? meta.issue ?? 'invalid',
        ...(legacyOK && (validRecipes || validMeta) ? { recovery: fallback } : {}),
      };
    },
    encode: data => ({
      'recipe-book-v1': JSON.stringify(data),
      ...(safeMirrors.includes('recipes') ? { recipes: JSON.stringify(data.recipes) } : {}),
      ...(safeMirrors.includes('recipe-meta-v1') ? { 'recipe-meta-v1': JSON.stringify(data.recipeMeta) } : {}),
    }),
  };
}

function validShoppingEntry(value: unknown) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (!record(value) || !supported(value)) return false;
  return (typeof value.name === 'string' && value.name.trim().length > 0
      || value.name === undefined && typeof value.text === 'string' && value.text.trim().length > 0)
    && (value.id === undefined || typeof value.id === 'string' && value.id.length > 0)
    && (value.text === undefined || typeof value.text === 'string')
    && (value.checked === undefined || typeof value.checked === 'boolean')
    && (value.quantity === undefined || typeof value.quantity === 'number' && Number.isFinite(value.quantity) && value.quantity >= 0)
    && (value.unit === undefined || typeof value.unit === 'string');
}
export const shoppingConfig: StoreConfig<ShoppingItem[]> = {
  key: 'shopping-list-v1', keys: ['shopping-list-v1'], empty: [],
  decode(entries) {
    const input = parsed(entries['shopping-list-v1']);
    if (input.issue) return { issue: input.issue };
    if (input.value === undefined) return { data: [] };
    if (!supported(input.value) || Array.isArray(input.value) && input.value.some(item => !supported(item))) return { issue: 'unsupported' };
    if (!Array.isArray(input.value) || !input.value.every(validShoppingEntry)) return { issue: 'invalid' };
    // Validation precedes migration: its historical flatMap must not drop records.
    const migrated = migrateShoppingItems(input.value).map((item, index) => ({
      ...(record((input.value as unknown[])[index]) ? (input.value as Record<string, unknown>[])[index] : {}), ...item,
    }));
    if (migrated.length !== input.value.length || new Set(migrated.map(item => item.id)).size !== migrated.length) return { issue: 'invalid' };
    return { data: migrated };
  },
  encode: data => ({ 'shopping-list-v1': JSON.stringify(data) }),
};

export const settingsConfig: StoreConfig<Settings> = {
  key: 'app-settings-v1', keys: ['app-settings-v1'],
  empty: { theme: 'system', language: 'ru', shoppingCompletedBehavior: 'moveDown' },
  decode(entries) {
    const input = parsed(entries['app-settings-v1']);
    if (input.issue) return { issue: input.issue };
    if (input.value === undefined) return { data: settingsConfig.empty };
    if (!supported(input.value)) return { issue: 'unsupported' };
    const value = input.value;
    if (!record(value)
      || value.theme !== undefined && (typeof value.theme !== 'string' || !['system', 'light', 'dark'].includes(value.theme))
      || value.language !== undefined && (typeof value.language !== 'string' || !['ru', 'en'].includes(value.language))
      || value.shoppingCompletedBehavior !== undefined && (typeof value.shoppingCompletedBehavior !== 'string' || !['keep', 'moveDown'].includes(value.shoppingCompletedBehavior))) return { issue: 'invalid' };
    const data = { ...settingsConfig.empty, ...value } as Settings;
    delete data.textSize; // Known retired preference, not a future schema migration.
    return { data };
  },
  encode: data => ({ 'app-settings-v1': JSON.stringify(data) }),
};

export const onboardingConfig: StoreConfig<boolean> = {
  key: 'app-onboarding-v1',
  keys: ['app-onboarding-v1', 'recipe-book-v1', 'recipes', 'recipe-meta-v1', 'shopping-list-v1', 'app-settings-v1'],
  empty: false,
  decode(entries) {
    const status = entries['app-onboarding-v1'];
    if (status.error) return { issue: 'read' };
    if (status.raw === 'completed' || status.raw === 'pending') return { data: status.raw === 'completed' };
    if (status.raw !== null) return { issue: 'unsupported' };
    const legacy = Object.entries(entries).filter(([key]) => key !== 'app-onboarding-v1').map(([, entry]) => entry);
    if (legacy.some(entry => entry.error)) return { issue: 'read' };
    return { data: legacy.some(entry => entry.raw !== null) };
  },
  encode: completed => ({ 'app-onboarding-v1': completed ? 'completed' : 'pending' }),
};
