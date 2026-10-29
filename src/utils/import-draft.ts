import { CATEGORIES, type Recipe } from '../constants/recipes.ts';
import { mergeRecipeBackup } from './recipe-backup.ts';
import type { RecipeDraft } from './recipe-import.ts';

// A recipe found on a cooking site on its way into the book: into the form's fields, or
// straight into a Recipe when nothing is unknown. Nothing here writes or changes the draft.

export type DraftFields = { title: string; category: string | null; time: string; ingredients: string; steps: string };

// The form's fields. An unknown time stays an empty field, never "0".
export function draftFields(draft: RecipeDraft): DraftFields {
  return {
    title: draft.title, category: draft.category, time: draft.time === null ? '' : String(draft.time),
    ingredients: draft.ingredients.join('\n'), steps: draft.steps.join('\n'),
  };
}

const line = (text: string) => text.trim().length > 0 && text === text.trim() && !text.includes('\n');
// The recipe to add without the form: only when the draft is whole and already in the shape the
// form would save (title, a known time, lines as the form keeps them, a known category or none).
export function recipeFromDraft(draft: RecipeDraft, id: string): Recipe | null {
  const known = draft.title.trim().length > 0 && draft.time !== null && Number.isFinite(draft.time) && draft.time >= 0
    && draft.ingredients.length > 0 && draft.steps.length > 0 && draft.ingredients.every(line) && draft.steps.every(line)
    && (draft.category === null || CATEGORIES.some(category => category === draft.category));
  if (!known) return null;
  return { id, title: draft.title.trim(), category: draft.category, time: draft.time!, ingredients: [...draft.ingredients], steps: [...draft.steps] };
}

// The id of a recipe in the book with exactly these fields, by the comparison the backup
// import uses (unchanged): every field equal, nothing looser such as the title alone.
export function findDuplicate(recipes: Recipe[], candidate: Omit<Recipe, 'id'>): string | null {
  const backup = { format: 'recipes-backup' as const, version: 1 as const, exportedAt: '', recipes: [{ id: 'candidate', ...candidate }], recipeMeta: {} };
  if (mergeRecipeBackup(recipes, {}, backup).duplicates === 0) return null;
  return recipes.find(recipe => mergeRecipeBackup([recipe], {}, backup).duplicates > 0)?.id ?? null;
}

// The form's time field. A manual recipe keeps its rule (empty means 0 minutes); a recipe from a
// site whose time was unknown must get one from the person, 0 included.
export function formTime(text: string, { required }: { required: boolean }): { ok: true; minutes: number } | { ok: false; error: 'invalid' | 'required' } {
  if (required && text.trim() === '') return { ok: false, error: 'required' };
  const minutes = Number(text);
  return Number.isFinite(minutes) && minutes >= 0 ? { ok: true, minutes } : { ok: false, error: 'invalid' };
}
