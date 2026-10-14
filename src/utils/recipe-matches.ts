import type { Recipe } from '../constants/recipes';
import {
  normalizeProductName,
  parseShoppingEntry,
  type ShoppingItem,
} from './shopping.ts';

export type RecipeShoppingMatch = {
  recipe: Recipe;
  matchedCount: number;
  totalCount: number;
  matchRatio: number;
  missingIngredients: string[];
};

function normalizedIngredientName(ingredient: string) {
  const parsed = parseShoppingEntry(ingredient);
  return normalizeProductName(parsed?.name ?? ingredient);
}

function uniqueRecipeIngredients(ingredients: string[]) {
  const unique = new Map<string, string>();

  ingredients.forEach((ingredient) => {
    const normalized = normalizedIngredientName(ingredient);
    if (normalized && !unique.has(normalized)) unique.set(normalized, ingredient);
  });

  return [...unique.entries()].map(([normalized, original]) => ({ normalized, original }));
}

export function matchRecipesToShoppingList(
  recipes: Recipe[],
  shoppingItems: ShoppingItem[],
): RecipeShoppingMatch[] {
  if (recipes.length === 0 || shoppingItems.length === 0) return [];

  const shoppingNames = new Set(
    shoppingItems
      .map((item) => normalizeProductName(item.name))
      .filter(Boolean),
  );

  return recipes
    .map((recipe, index) => {
      const ingredients = uniqueRecipeIngredients(recipe.ingredients);
      const matchedCount = ingredients.filter(({ normalized }) => shoppingNames.has(normalized)).length;
      const missingIngredients = ingredients
        .filter(({ normalized }) => !shoppingNames.has(normalized))
        .map(({ original }) => original);
      const totalCount = ingredients.length;

      return {
        recipe,
        matchedCount,
        totalCount,
        matchRatio: totalCount > 0 ? matchedCount / totalCount : 0,
        missingIngredients,
        index,
      };
    })
    .filter(({ matchedCount }) => matchedCount > 0)
    .sort((first, second) => (
      second.matchRatio - first.matchRatio
      || second.matchedCount - first.matchedCount
      || first.index - second.index
    ))
    .map(({ index: _index, ...match }) => match);
}
