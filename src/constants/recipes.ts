export type Recipe = {
  id: string;
  title: string;
  category: string | null;
  time: number;
  ingredients: string[];
  steps: string[];
};

export type CookingRating = 'disliked' | 'good' | 'great';

export type CookingRecord = {
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

export const INITIAL_RECIPES: Recipe[] = [
  {
    id: '1',
    title: 'Паста карбонара',
    category: 'Ужин',
    time: 20,
    ingredients: [
      'Спагетти — 200 г',
      'Бекон — 100 г',
      'Яйца — 2 шт',
      'Пармезан — 50 г',
      'Чёрный перец',
    ],
    steps: [
      'Отвари спагетти в подсоленной воде.',
      'Обжарь бекон до хруста.',
      'Смешай яйца с тёртым пармезаном и перцем.',
      'Смешай горячую пасту с беконом, сними с огня и влей яичную смесь, быстро перемешай.',
    ],
  },
  {
    id: '2',
    title: 'Омлет с сыром',
    category: null,
    time: 10,
    ingredients: ['Яйца — 3 шт', 'Молоко — 50 мл', 'Сыр — 40 г', 'Соль'],
    steps: [
      'Взбей яйца с молоком и солью.',
      'Вылей на разогретую сковороду с маслом.',
      'Посыпь сыром, накрой крышкой и готовь 3–4 минуты.',
    ],
  },
];
