// Карта транслитерации скопирована из library/category-slug.ts: контракт
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
 * Слаги, которые нельзя отдать магазину: они уже заняты маршрутами Рынка.
 * Без этого списка магазин со слагом `cart` перехватил бы `/market/cart`.
 */
export const RESERVED_SHOP_SLUGS = new Set([
  'admin',
  'cart',
  'categories',
  'chats',
  'favorites',
  'listing',
  'listings',
  'me',
  'new',
  'orders',
  'reports',
  'rules',
  'sections',
  'sell',
  'shops',
  'subscriptions',
]);

export function isReservedShopSlug(slug: string): boolean {
  return RESERVED_SHOP_SLUGS.has(slug);
}

export function buildShopSlug(name: string): string {
  const latin = [...name.toLocaleLowerCase('ru-RU')]
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  // Пустой результат бывает у названий из одних иероглифов или эмодзи;
  // «shop» плюс суффикс коллизии даёт рабочий адрес вместо пустого.
  return latin || 'shop';
}

export function withSlugSuffix(slug: string, attempt: number): string {
  return attempt === 0 ? slug : `${slug}-${attempt + 1}`;
}
