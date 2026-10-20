import type { Recipe, RecipeMeta, RecipeMetaById } from '../constants/recipes.ts';
import { isRecipe, isRecipeMetaById } from './recipes.ts';

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const BOOK_STORAGE_KEY = 'recipe-book-v1';
export type RecipeBackup = {
  format: 'recipes-backup'; version: 1; exportedAt: string;
  recipes: Recipe[]; recipeMeta: RecipeMetaById;
};
export class BackupError extends Error {
  code: 'invalid' | 'version' | 'size';
  constructor(code: 'invalid' | 'version' | 'size') { super(code); this.code = code; }
}
const safeId = (id: string) => id.trim().length > 0 && !['__proto__', 'constructor', 'prototype'].includes(id);
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function parseRecipeBackup(text: string): RecipeBackup {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new BackupError('size');
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new BackupError('invalid'); }
  if (!plain(value) || value.format !== 'recipes-backup') throw new BackupError('invalid');
  if (value.version !== 1) throw new BackupError('version');
  if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))
    || !Array.isArray(value.recipes) || value.recipes.length > 5000
    || !value.recipes.every((recipe: unknown) => isRecipe(recipe) && safeId(recipe.id)
      && recipe.title.trim().length > 0 && Number.isFinite(recipe.time) && recipe.time >= 0)
    || !isRecipeMetaById(value.recipeMeta)) throw new BackupError('invalid');
  const recipes = value.recipes as Recipe[];
  const ids = new Set(recipes.map(recipe => recipe.id));
  if (ids.size !== recipes.length) throw new BackupError('invalid');
  for (const [id, meta] of Object.entries(value.recipeMeta)) {
    if (!ids.has(id) || !safeId(id) || meta.cookings.length > 5000
      || new Set(meta.cookings.map(record => record.id)).size !== meta.cookings.length
      || meta.cookings.some(record => !safeId(record.id) || !Number.isFinite(Date.parse(record.cookedAt)) )) {
      throw new BackupError('invalid');
    }
  }
  // Only retain supported fields. File contents never become arbitrary object properties.
  return {
    format: 'recipes-backup', version: 1, exportedAt: value.exportedAt,
    recipes: recipes.map(({ id, title, category, time, ingredients, steps }) => ({ id, title, category, time, ingredients, steps })),
    recipeMeta: Object.fromEntries(Object.entries(value.recipeMeta).map(([id, meta]) => [id, {
      favorite: meta.favorite,
      cookings: meta.cookings.map(({ id: recordId, cookedAt, rating, note }) => ({ id: recordId, cookedAt, ...(rating ? { rating } : {}), ...(note !== undefined ? { note } : {}) })),
    }])),
  };
}

export function serializeRecipeBackup(recipes: Recipe[], recipeMeta: RecipeMetaById) {
  const snapshot = {
    format: 'recipes-backup', version: 1, exportedAt: new Date().toISOString(), recipes,
    recipeMeta: Object.fromEntries(recipes.filter(recipe => Object.hasOwn(recipeMeta, recipe.id)).map(recipe => [recipe.id, recipeMeta[recipe.id]])),
  };
  const text = JSON.stringify(snapshot, null, 2);
  parseRecipeBackup(text);
  return text;
}

const signature = ({ title, category, time, ingredients, steps }: Recipe) => JSON.stringify([title, category, time, ingredients, steps]);

function mergeMeta(local: RecipeMeta | undefined, incoming: RecipeMeta | undefined): RecipeMeta {
  if (!local) return incoming ?? { favorite: false, cookings: [] };
  if (!incoming) return local;
  const cookings = [...local.cookings];
  for (const record of incoming.cookings) {
    // Re-importing a backup must not duplicate histories, including ID collisions.
    if (cookings.some(item => item.cookedAt === record.cookedAt && item.rating === record.rating && item.note === record.note)) continue;
    let id = record.id;
    let suffix = 1;
    while (cookings.some(item => item.id === id)) id = `${record.id}-import-${suffix++}`;
    cookings.push({ ...record, id });
  }
  return { favorite: local.favorite || incoming.favorite, cookings };
}

export function mergeRecipeBackup(local: Recipe[], metadata: RecipeMetaById, backup: RecipeBackup) {
  const recipes = [...local];
  const meta = new Map(Object.entries(metadata));
  const ids = new Set(local.map(recipe => recipe.id));
  const content = new Map(local.map(recipe => [signature(recipe), recipe.id]));
  let added = 0;
  let duplicates = 0;
  let conflicts = 0;
  for (const recipe of backup.recipes) {
    const incomingMeta = Object.hasOwn(backup.recipeMeta, recipe.id) ? backup.recipeMeta[recipe.id] : undefined;
    const key = signature(recipe);
    const duplicateId = content.get(key);
    if (duplicateId !== undefined) {
      meta.set(duplicateId, mergeMeta(meta.get(duplicateId), incomingMeta));
      duplicates++;
      continue;
    }
    let id = recipe.id;
    let suffix = 1;
    if (ids.has(id)) conflicts++;
    while (ids.has(id)) id = `${recipe.id}-import-${suffix++}`;
    ids.add(id);
    content.set(key, id);
    recipes.push({ ...recipe, id });
    meta.set(id, mergeMeta(undefined, incomingMeta));
    added++;
  }
  return { recipes, recipeMeta: Object.fromEntries(meta), added, duplicates, conflicts };
}
