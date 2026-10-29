import type { Recipe } from '../constants/recipes.ts';
import { findDuplicate } from './import-draft.ts';

// Creating a recipe never replaces one: the id must be free, checked inside the store's own
// update (one queue for every write of the book), so the check and the write cannot be split by
// another save. Editing keeps its own operation (updateRecipe) and its id.

type Book = { recipes: Recipe[] };
type Store<T extends Book> = { update: (updater: (data: T) => T, after?: () => void) => Promise<boolean> };
// created: written and confirmed; idTaken: another recipe has this id, nothing changed;
// duplicate: an exact copy is in the book (asked for with refuseDuplicate), nothing changed;
// notSaved: the store did not write (its guard shows why; a kept write is finished by Retry).
export type CreateResult = 'created' | 'idTaken' | 'duplicate' | 'notSaved';
export type CreateOptions = { refuseDuplicate?: boolean };

export async function createRecipeIn<T extends Book>(store: Store<T>, recipe: Recipe, after?: () => void, options: CreateOptions = {}): Promise<CreateResult> {
  const outcome: { refused: 'idTaken' | 'duplicate' | null } = { refused: null };
  const saved = await store.update(current => {
    const { id: _id, ...fields } = recipe;
    outcome.refused = current.recipes.some(item => item.id === recipe.id) ? 'idTaken'
      : options.refuseDuplicate && findDuplicate(current.recipes, fields) ? 'duplicate' : null;
    // Refused: the book goes back unchanged (nothing is written) and "after" stays silent.
    return outcome.refused ? current : { ...current, recipes: [recipe, ...current.recipes] };
  }, () => { if (!outcome.refused) after?.(); });
  if (outcome.refused) return outcome.refused;
  return saved ? 'created' : 'notSaved';
}

export const newRecipeId = () => `${Date.now()}-${Math.random()}`;

// A new recipe under a fresh id: a taken id is never taken over, another one is tried (three
// times at most). onSaved gets the id that was written.
export async function createWithFreshId(
  create: (recipe: Recipe, after?: () => void, options?: CreateOptions) => Promise<CreateResult>,
  fields: Omit<Recipe, 'id'>, onSaved: (id: string) => void, options: CreateOptions = {}, makeId = newRecipeId,
): Promise<{ result: CreateResult; id: string }> {
  let id = makeId();
  for (let attempt = 1; ; attempt++) {
    const current = id;
    const result = await create({ id: current, ...fields }, () => onSaved(current), options);
    if (result !== 'idTaken' || attempt === 3) return { result, id: current };
    id = makeId();
  }
}
