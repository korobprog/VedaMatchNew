// Карта транслитерации скопирована из market/shop-slug.ts: контракт
// сервисного модуля запрещает импортировать хелперы другого сервиса.
const TRANSLIT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

/**
 * Слаги, занятые маршрутами сервиса. Исполнитель со слагом `new` перехватил
 * бы страницу создания, а `admin` — очередь модерации.
 */
export const RESERVED_MUSIC_SLUGS = new Set([
  'admin',
  'albums',
  'artists',
  'catalog',
  'categories',
  'favorites',
  'history',
  'me',
  'new',
  'playback',
  'playlists',
  'reports',
  'settings',
  'tracks',
  'uploads',
]);

export function isReservedMusicSlug(slug: string): boolean {
  return RESERVED_MUSIC_SLUGS.has(slug);
}

/**
 * Слаг исполнителя или альбома из его названия.
 *
 * Санскрит в названиях приходит и кириллицей, и латиницей («Джая
 * Радха-Мадхава» и «Jaya Radha-Madhava»), поэтому латиница проходит насквозь,
 * а кириллица транслитерируется по той же карте, что у Рынка и Библиотеки, —
 * иначе один и тот же киртан дал бы два несовместимых адреса.
 */
export function buildMusicSlug(name: string): string {
  const latin = [...name.toLocaleLowerCase('ru-RU')]
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  // Пустой результат бывает у названий из одних иероглифов, деванагари или
  // эмодзи; запасное слово плюс суффикс коллизии даёт рабочий адрес.
  return latin || 'zapis';
}

/**
 * Разводит коллизии и занятые слова. Нумерация та же, что у Рынка: чистый
 * слаг, потом `-2`, `-3`. Занятое маршрутом слово просто сдвигает отсчёт на
 * одну попытку — суффикс ему нужен сразу, но пропускать `-2` незачем.
 */
export function withMusicSlugSuffix(slug: string, attempt: number): string {
  const shifted = isReservedMusicSlug(slug) ? attempt + 1 : attempt;
  return shifted === 0 ? slug : `${slug}-${shifted + 1}`;
}
