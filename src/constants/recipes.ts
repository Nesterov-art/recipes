export type Recipe = {
  id: string;
  title: string;
  category: string | null;
  time: number;
  ingredients: string[];
  steps: string[];
};

export type CookingRating = 'disliked' | 'good' | 'great';

type CookingRecord = {
  id: string;
  cookedAt: string;
  rating?: CookingRating;
  note?: string;
};

export type RecipeMeta = {
  favorite: boolean;
  cookings: CookingRecord[];
};

export type RecipeMetaById = Record<string, RecipeMeta>;

export const STORAGE_KEY = 'recipes';
export const META_STORAGE_KEY = 'recipe-meta-v1';
export const CATEGORIES = ['Завтрак', 'Обед', 'Ужин'] as const;
export const FILTERS = ['Все', 'Любимые', ...CATEGORIES, 'Быстро'] as const;
export const QUICK_TIME = 15;

export type RecipeFilter = (typeof FILTERS)[number];
