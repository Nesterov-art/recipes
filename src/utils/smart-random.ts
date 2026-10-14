import type { Recipe, RecipeMetaById } from '@/constants/recipes';

const NEVER_COOKED_WEIGHT = 5;
const RECENTLY_COOKED_WEIGHT = 0.6;
const DAYS_TO_MAXIMUM_WEIGHT = 55;
const MAXIMUM_COOKED_WEIGHT = 4.5;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getRecipeWeight(
  recipeId: string,
  recipeMeta: RecipeMetaById,
  nowMs = Date.now(),
) {
  const cookings = recipeMeta[recipeId]?.cookings ?? [];
  if (cookings.length === 0) return NEVER_COOKED_WEIGHT;

  const latestTime = cookings.reduce((latest, cooking) => {
    const time = new Date(cooking.cookedAt).getTime();
    return Number.isNaN(time) ? latest : Math.max(latest, time);
  }, 0);

  if (latestTime === 0) return NEVER_COOKED_WEIGHT;

  const daysSinceCooking = Math.max(0, (nowMs - latestTime) / DAY_MS);
  const progress = Math.min(daysSinceCooking / DAYS_TO_MAXIMUM_WEIGHT, 1);
  return RECENTLY_COOKED_WEIGHT + progress * (MAXIMUM_COOKED_WEIGHT - RECENTLY_COOKED_WEIGHT);
}

export function pickSmartRandom(
  recipes: Recipe[],
  recipeMeta: RecipeMetaById,
  options: {
    lastRecipeId?: string | null;
    nowMs?: number;
    random?: () => number;
  } = {},
) {
  if (recipes.length === 0) return null;

  const candidates = recipes.length > 1 && options.lastRecipeId
    ? recipes.filter((recipe) => recipe.id !== options.lastRecipeId)
    : recipes;
  const nowMs = options.nowMs ?? Date.now();
  const random = options.random ?? Math.random;
  const weighted = candidates.map((recipe) => ({
    recipe,
    weight: getRecipeWeight(recipe.id, recipeMeta, nowMs),
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  let target = random() * totalWeight;

  for (const item of weighted) {
    target -= item.weight;
    if (target < 0) return item.recipe;
  }

  return weighted[weighted.length - 1]?.recipe ?? null;
}
