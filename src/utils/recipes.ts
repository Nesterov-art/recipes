import type { Language, Translate } from '@/constants/i18n';
import type {
  CookingRating,
  Recipe,
  RecipeFilter,
  RecipeMeta,
  RecipeMetaById,
} from '@/constants/recipes';

export function toLines(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function plural(language: Language, n: number, one: string, few: string, many: string) {
  if (language === 'en') return n === 1 ? one : many;
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
  return many;
}

export function todayLabel(language: Language) {
  const value = new Date().toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function cookingDateLabel(isoDate: string, language: Language) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', options);
}

export function cookingHistoryDateLabel(isoDate: string, language: Language) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return date.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US', options);
}

export function ratingEmoji(rating: CookingRating) {
  if (rating === 'disliked') return '😕';
  if (rating === 'good') return '🙂';
  return '🤤';
}

export function ratingLabel(rating: CookingRating, t: Translate) {
  if (rating === 'disliked') return t('ratingDisliked');
  if (rating === 'good') return t('ratingGood');
  return t('ratingGreat');
}

export function filterLabel(filter: RecipeFilter, t: Translate) {
  const labels: Record<RecipeFilter, ReturnType<Translate>> = {
    Все: t('filterAll'),
    Любимые: t('filterFavorites'),
    Завтрак: t('filterBreakfast'),
    Обед: t('filterLunch'),
    Ужин: t('filterDinner'),
    Быстро: t('filterQuick'),
  };
  return labels[filter];
}

export function emptyRecipeMeta(): RecipeMeta {
  return { favorite: false, cookings: [] };
}

function isCookingRating(value: unknown): value is CookingRating {
  return value === 'disliked' || value === 'good' || value === 'great';
}

export function isRecipeMetaById(value: unknown): value is RecipeMetaById {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const meta = entry as Record<string, unknown>;
    if (typeof meta.favorite !== 'boolean' || !Array.isArray(meta.cookings)) return false;
    return meta.cookings.every((item) => {
      if (!item || typeof item !== 'object') return false;
      const cooking = item as Record<string, unknown>;
      return (
        typeof cooking.id === 'string' &&
        typeof cooking.cookedAt === 'string' &&
        (cooking.rating === undefined || isCookingRating(cooking.rating)) &&
        (cooking.note === undefined || typeof cooking.note === 'string')
      );
    });
  });
}

export function categoryLabel(category: string, t: Translate) {
  if (category === 'Завтрак') return t('filterBreakfast');
  if (category === 'Обед') return t('filterLunch');
  if (category === 'Ужин') return t('filterDinner');
  return category;
}

export function isRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== 'object') return false;
  const recipe = value as Record<string, unknown>;
  return (
    typeof recipe.id === 'string' &&
    typeof recipe.title === 'string' &&
    (typeof recipe.category === 'string' || recipe.category === null) &&
    typeof recipe.time === 'number' &&
    Array.isArray(recipe.ingredients) &&
    recipe.ingredients.every((item) => typeof item === 'string') &&
    Array.isArray(recipe.steps) &&
    recipe.steps.every((item) => typeof item === 'string')
  );
}
