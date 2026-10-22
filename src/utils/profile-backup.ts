import type { Recipe, RecipeMetaById } from '../constants/recipes.ts';
import { BackupError, parseRecipeBackup, type RecipeBackup } from './recipe-backup.ts';
import { isRecipe, isRecipeMetaById } from './recipes.ts';
import { record } from './safe-storage.ts';
import type { ShoppingItem } from './shopping.ts';
import type { Settings } from './storage-models.ts';
export { utf8Length } from './utf8.ts';

export type Profile = {
  recipes: Recipe[]; recipeMeta: RecipeMetaById; shoppingItems: ShoppingItem[];
  settings: Pick<Settings, 'theme' | 'language' | 'shoppingCompletedBehavior'>;
};
export type ProfileBackup = { format: 'recipes-profile-backup'; version: 1; exportedAt: string; profile: Profile };
export const LARGE_PROFILE_BYTES = 5 * 1024 * 1024; // Warning, not a truncation/import limit.
const safeId = (id: string) => !!id.trim() && !['__proto__', 'constructor', 'prototype'].includes(id);
export function validateProfile(value: unknown): Profile {
  if (!record(value) || !Array.isArray(value.recipes) || !value.recipes.every(item => isRecipe(item)
    && safeId(item.id) && !!item.title.trim() && Number.isFinite(item.time) && item.time >= 0)
    || !isRecipeMetaById(value.recipeMeta) || !Array.isArray(value.shoppingItems) || !record(value.settings)) throw new BackupError('invalid');
  const recipes = value.recipes as Recipe[];
  if (new Set(recipes.map(item => item.id)).size !== recipes.length) throw new BackupError('invalid');
  const recipeMeta = value.recipeMeta;
  for (const [id, meta] of Object.entries(recipeMeta)) {
    if (!safeId(id) || new Set(meta.cookings.map(item => item.id)).size !== meta.cookings.length
      || meta.cookings.some(item => !safeId(item.id) || !Number.isFinite(Date.parse(item.cookedAt)))) throw new BackupError('invalid');
  }
  const items = value.shoppingItems;
  if (!items.every(item => record(item) && typeof item.id === 'string' && safeId(item.id)
    && typeof item.name === 'string' && !!item.name.trim() && typeof item.text === 'string'
    && typeof item.checked === 'boolean'
    && (item.quantity === undefined || typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity >= 0)
    && (item.unit === undefined || typeof item.unit === 'string'))
    || new Set(items.map(item => item.id)).size !== items.length) throw new BackupError('invalid');
  const settings = value.settings;
  if (!['system', 'light', 'dark'].includes(settings.theme as string) || !['ru', 'en'].includes(settings.language as string)
    || !['keep', 'moveDown'].includes(settings.shoppingCompletedBehavior as string)) throw new BackupError('invalid');
  return {
    recipes: recipes.map(({ id, title, category, time, ingredients, steps }) => ({ id, title, category, time, ingredients: [...ingredients], steps: [...steps] })),
    recipeMeta: Object.fromEntries(Object.entries(recipeMeta).map(([id, meta]) => [id, {
      favorite: meta.favorite,
      cookings: meta.cookings.map(({ id, cookedAt, rating, note }) => ({ id, cookedAt, ...(rating ? { rating } : {}), ...(note !== undefined ? { note } : {}) }))
        .sort((a, b) => Date.parse(b.cookedAt) - Date.parse(a.cookedAt) || a.id.localeCompare(b.id)),
    }])),
    shoppingItems: (items as ShoppingItem[]).map(({ id, name, text, checked, quantity, unit }) => ({
      id, name, text, checked, ...(quantity !== undefined ? { quantity } : {}), ...(unit !== undefined ? { unit } : {}),
    })),
    settings: { theme: settings.theme as Profile['settings']['theme'], language: settings.language as Profile['settings']['language'], shoppingCompletedBehavior: settings.shoppingCompletedBehavior as Profile['settings']['shoppingCompletedBehavior'] },
  };
}
export function parseBackupFile(text: string): RecipeBackup | ProfileBackup {
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new BackupError('invalid'); }
  if (!record(value)) throw new BackupError('invalid');
  if (value.format === 'recipes-backup') return parseRecipeBackup(text);
  if (value.format !== 'recipes-profile-backup') throw new BackupError('invalid');
  if (value.version !== 1) throw new BackupError('version');
  if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) throw new BackupError('invalid');
  return { format: 'recipes-profile-backup', version: 1, exportedAt: value.exportedAt, profile: validateProfile(value.profile) };
}
export function serializeProfileBackup(profile: Profile) {
  return JSON.stringify({ format: 'recipes-profile-backup', version: 1, exportedAt: new Date().toISOString(), profile: validateProfile(profile) }, null, 2);
}
export function recipesFromBackup(backup: RecipeBackup | ProfileBackup): RecipeBackup {
  return backup.format === 'recipes-backup' ? backup : {
    format: 'recipes-backup', version: 1, exportedAt: backup.exportedAt,
    recipes: backup.profile.recipes, recipeMeta: backup.profile.recipeMeta,
  };
}
