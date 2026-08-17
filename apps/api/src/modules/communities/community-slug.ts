// Карта транслитерации скопирована из market/shop-slug.ts: общего портального
// хелпера для слагов нет, а тянуть его из сервисного модуля запрещено
// контрактом — см. docs/service-module-contract.md.
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
 * Слаги, занятые маршрутами справочника: община со слагом `new` перехватила бы
 * `/communities/new`.
 */
export const RESERVED_COMMUNITY_SLUGS = new Set([
  'admin',
  'map',
  'me',
  'new',
  'pending',
  'rules',
  'search',
]);

export function isReservedCommunitySlug(slug: string): boolean {
  return RESERVED_COMMUNITY_SLUGS.has(slug);
}

export function buildCommunitySlug(name: string): string {
  const latin = [...name.toLocaleLowerCase('ru-RU')]
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  // Пустой результат бывает у названий из одних иероглифов или эмодзи;
  // «community» плюс суффикс коллизии даёт рабочий адрес вместо пустого.
  return latin || 'community';
}

export function withSlugSuffix(slug: string, attempt: number): string {
  return attempt === 0 ? slug : `${slug}-${attempt + 1}`;
}

/**
 * Слова, которые в названии общины ничего не различают: почти каждая вторая
 * карточка называется «ятра», «община» или «храм». Список нужен только для
 * поиска дублей и на отображение не влияет.
 */
const NOISE_WORDS = new Set([
  'ятра',
  'ятры',
  'община',
  'общины',
  'нама',
  'хатта',
  'намахатта',
  'храм',
  'ашрам',
  'центр',
  'клуб',
  'г',
  'гор',
  'город',
]);

/**
 * Ключ для поиска дублей при заведении общины: название без регистра,
 * пунктуации и шумовых слов, плюс город. «Москва», «Община Москва» и
 * «ятра г. Москва» дают один ключ и ловятся до того, как справочник
 * обзаведётся тремя карточками одной общины.
 *
 * Слова выбираются разбиением на токены, а не регуляркой с `\b`: в JS
 * граница слова определена по ASCII, и вокруг кириллицы не срабатывает
 * вовсе — `\bятра\b` не совпадает ни с чем.
 */
export function duplicateKey(name: string, city: string | null): string {
  const words = normalizeWords(name).filter((word) => !NOISE_WORDS.has(word));
  return `${words.join(' ')}|${normalizeWords(city ?? '').join(' ')}`;
}

function normalizeWords(value: string): string[] {
  return value
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}
