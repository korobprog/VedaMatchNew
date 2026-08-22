/**
 * Подготовка запроса к внешнему геокодеру. Логика чистая и вынесена из
 * контроллера: она и есть то, что ломалось на «Маяпуре», а сам контроллер
 * (сеть, очередь, ретраи) тестами не покрывается.
 *
 * OSM хранит индийские населённые пункты только под латинским именем: на
 * «Маяпур» Nominatim отдаёт кафе «Новий Маяпур» под Днепром, а настоящий
 * Маяпур находится лишь по «Mayapur». Русскоязычный участник портала об этом
 * не догадывается и видит пустой список.
 */

/** Есть ли в строке кириллица — по ней решаем, нужна ли транслитерация. */
export function hasCyrillic(value: string): boolean {
  return /[Ѐ-ӿ]/.test(value);
}

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
  х: 'kh',
  ц: 'ts',
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
 * Кириллица → латиница в написании, принятом для географических названий.
 * Регистр первой буквы сохраняется: «Маяпур» → «Mayapur», а не «mayapur».
 */
export function transliterate(value: string): string {
  let out = '';
  for (const char of value) {
    const lower = char.toLocaleLowerCase('ru');
    const mapped = TRANSLIT[lower];
    if (mapped === undefined) {
      out += char;
      continue;
    }
    out += char === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
  }
  return out;
}

/**
 * Места, где машинная транслитерация промахивается мимо имени в OSM. Список
 * держим коротким и осмысленным: святые места вайшнавов и крупные города
 * Индии — именно их называют участники портала, и именно на них
 * транслитерация даёт «Kalkutta» вместо «Kolkata».
 */
export const PLACE_ALIASES: Record<string, string> = {
  // Святые места
  маяпур: 'Mayapur',
  майяпур: 'Mayapur',
  навадвипа: 'Navadwip',
  навадвип: 'Navadwip',
  вриндаван: 'Vrindavan',
  вриндавана: 'Vrindavan',
  говардхан: 'Govardhan',
  говардхана: 'Govardhan',
  гокула: 'Gokul',
  гокул: 'Gokul',
  матхура: 'Mathura',
  'джаганнатха-пури': 'Puri',
  'джаганнатха пури': 'Puri',
  пури: 'Puri',
  дварака: 'Dwarka',
  двараке: 'Dwarka',
  тирупати: 'Tirupati',
  харидвар: 'Haridwar',
  ришикеш: 'Rishikesh',
  варанаси: 'Varanasi',
  праяградж: 'Prayagraj',
  аллахабад: 'Prayagraj',
  // Крупные города, где транслитерация промахивается
  дели: 'Delhi',
  калькутта: 'Kolkata',
  колката: 'Kolkata',
  мумбаи: 'Mumbai',
  бомбей: 'Mumbai',
  ченнаи: 'Chennai',
  бангалор: 'Bengaluru',
  джайпур: 'Jaipur',
  гоа: 'Goa',
  катманду: 'Kathmandu',
};

/**
 * Варианты запроса по убыванию точности. Геокодер зовём по очереди и
 * останавливаемся на первом непустом ответе, поэтому русские города
 * («Москва») находятся с первой попытки и лишнего вызова не стоят.
 */
export function geoQueryVariants(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const variants = [trimmed];
  if (hasCyrillic(trimmed)) {
    const alias = PLACE_ALIASES[trimmed.toLocaleLowerCase('ru')];
    if (alias) variants.push(alias);
    variants.push(transliterate(trimmed));
  }

  return variants.filter(
    (variant, index) =>
      variant.length > 0 && variants.indexOf(variant) === index,
  );
}

/**
 * Значение `accept-language` для геокодера. Без него Nominatim отдаёт
 * названия на языке страны — русскоязычный участник получал «Mayapur, India»
 * и сохранял в профиль латиницу, мимо которой потом промахивался фильтр по
 * городу.
 */
export function acceptLanguage(lang?: string): string {
  const normalized = String(lang ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 2);
  if (normalized === 'en') return 'en';
  if (normalized === 'ru') return 'ru,en';
  return 'ru,en';
}

/**
 * Строка для `LIKE` по алиасам справочника. Собирается здесь, а не в SQL,
 * ровно по трём причинам, каждая из которых уже ломала поиск:
 *
 * - алиасы лежат в нижнем регистре, а человек пишет «Маяпур» с большой;
 * - «ё» и «е» люди путают («Кишинёв» / «Кишинев»), и обе стороны сравнения
 *   приводятся к «е»;
 * - `%` и `_` — подстановочные знаки `LIKE`: без экранирования запрос «%»
 *   вернул бы весь справочник.
 */
export function directoryNeedle(query: string): string {
  const normalized = query
    .trim()
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[\\%_]/g, (char) => `\\${char}`);
  return `${normalized}%`;
}
