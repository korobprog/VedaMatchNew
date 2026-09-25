import type { UnionRecommendationFilters } from '@vedamatch/shared';

/**
 * Подборки — готовые наборы фильтров поверх обычного подбора
 * (`/union/collections` на сайте). Своей логики выдачи у них нет: каждая
 * открывает тот же экран подбора, только с фильтром. На сайте фильтр едет
 * строкой адреса (`?minScore=70`), в приложении — ключом подборки в
 * параметре маршрута, а фильтр берётся отсюда.
 */
export interface UnionCollection {
  key: string;
  title: string;
  description: string;
  filters: UnionRecommendationFilters;
}

export const UNION_COLLECTIONS: readonly UnionCollection[] = [
  { key: 'near', title: 'Рядом', description: 'Те, кто живёт не дальше 50 км от вас', filters: { radiusKm: 50 } },
  { key: 'new', title: 'Новые', description: 'Анкеты, появившиеся недавно', filters: { sort: 'new' } },
  {
    key: 'match',
    title: 'Высокая совместимость',
    description: 'Совпадение по целям и ценностям от 70%',
    filters: { minScore: 70 },
  },
  {
    key: 'verified',
    title: 'Подтверждённые преданные',
    description: 'Статус проверен администрацией',
    filters: { verifiedOnly: true },
  },
  {
    key: 'photo',
    title: 'С проверенными фото',
    description: 'Фото сверены с живым человеком',
    filters: { photoVerifiedOnly: true },
  },
  { key: 'family', title: 'Создание семьи', description: 'Главный приоритет анкеты — семья', filters: { intentions: ['family'] } },
  {
    key: 'service',
    title: 'Совместное служение',
    description: 'Ищут единомышленников в служении',
    filters: { intentions: ['service'] },
  },
  {
    key: 'friendship',
    title: 'Дружба по интересам',
    description: 'Общение и общие увлечения',
    filters: { intentions: ['friendship'] },
  },
  {
    key: 'business',
    title: 'Бизнес и проекты',
    description: 'Партнёрство и совместные дела',
    filters: { intentions: ['business'] },
  },
];

/** Подборка по ключу из маршрута; чужой ключ — обычный подбор без фильтра. */
export function collectionByKey(key: string | string[] | undefined): UnionCollection | null {
  const value = Array.isArray(key) ? key[0] : key;
  return UNION_COLLECTIONS.find((collection) => collection.key === value) ?? null;
}
