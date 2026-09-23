/**
 * Порядок шлок внутри одного источника (VED-125).
 *
 * Локатор хранится строкой так, как его записали: «2.13», «10.8», «1.2-3»,
 * «Мадхья 20.108», «Глава 2, стих 14». Строковая сортировка ставит «10.8»
 * перед «2.13», а «2.14» — перед «2.2», и Бхагавад-гита в ленте шла
 * вразнобой. Здесь — сравнение «как читает человек»: по числам слева направо.
 *
 * Отдельным модулем, потому что правило одно на два места: строгий порядок
 * в ленте источника и расстановка стихов одной книги в общей ленте.
 *
 * Слова в локаторе, кроме частей «Чайтанья-чаритамриты», в порядке не
 * участвуют: это «глава», «стих», «текст» и повтор названия книги, которое
 * генерация иногда кладёт в начало. Сравнивать их значило бы отправить «Глава
 * 2, стих 13» в другой конец списка от соседнего «2.14».
 */

import { splitWorkLocator } from './feed-attribution';

/**
 * Части «Чайтанья-чаритамриты» идут в порядке книги, а не алфавита: по
 * алфавиту «Антья» встала бы перед «Мадхьей».
 */
const SECTION_RANKS: ReadonlyArray<[RegExp, number]> = [
  [/(^|[^\p{L}])(ади|adi)(?=[^\p{L}]|$)/iu, 1],
  [/(^|[^\p{L}])(мадхья|мадхйа|madhya)(?=[^\p{L}]|$)/iu, 2],
  [/(^|[^\p{L}])(антья|антйа|antya)(?=[^\p{L}]|$)/iu, 3],
];

export interface LocatorKey {
  /** Пустой локатор — в конец: без номера стиху нет места в ряду. */
  empty: boolean;
  /** Часть книги (1–3 для лил), 0 — части нет. */
  section: number;
  /** Номера до диапазона: «1.2-3» → [1, 2]. */
  numbers: number[];
  /** Конец диапазона: «1.2-3» → 3. Одиночный стих идёт раньше диапазона. */
  rangeEnd: number | null;
  /** Исходник без регистра — последний довод, чтобы порядок был полным. */
  text: string;
}

export function locatorKey(raw: string | null | undefined): LocatorKey {
  const text = (raw ?? '').normalize('NFKC').trim().toLocaleLowerCase('ru');
  if (!text)
    return { empty: true, section: 0, numbers: [], rangeEnd: null, text: '' };
  const section =
    SECTION_RANKS.find(([pattern]) => pattern.test(text))?.[1] ?? 0;
  // Диапазон — число, тире и число в конце номера: «1.2-3», «16.13–14».
  // Дефис внутри слов («Бхагавад-гита») сюда не попадает: вокруг него буквы.
  const range = /(\d+)\s*[-–—]\s*(\d+)\s*$/.exec(text);
  const head = range ? text.slice(0, range.index + range[1].length) : text;
  const numbers = (head.match(/\d+/g) ?? []).map(Number);
  return {
    empty: false,
    section,
    numbers,
    rangeEnd: range ? Number(range[2]) : null,
    text,
  };
}

function compareKeys(a: LocatorKey, b: LocatorKey): number {
  if (a.empty !== b.empty) return a.empty ? 1 : -1;
  // Локатор без единой цифры («Предисловие») — после пронумерованных.
  const aNumbered = a.numbers.length > 0,
    bNumbered = b.numbers.length > 0;
  if (aNumbered !== bNumbered) return aNumbered ? -1 : 1;
  if (a.section !== b.section) return a.section - b.section;
  const length = Math.min(a.numbers.length, b.numbers.length);
  for (let i = 0; i < length; i++)
    if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] - b.numbers[i];
  // «2» — глава целиком — раньше «2.1».
  if (a.numbers.length !== b.numbers.length)
    return a.numbers.length - b.numbers.length;
  if (a.rangeEnd !== b.rangeEnd) {
    if (a.rangeEnd === null) return -1;
    if (b.rangeEnd === null) return 1;
    return a.rangeEnd - b.rangeEnd;
  }
  return a.text < b.text ? -1 : a.text > b.text ? 1 : 0;
}

/** Сравнение двух локаторов: отрицательное — `a` читается раньше. */
export function compareLocators(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return compareKeys(locatorKey(a), locatorKey(b));
}

/** Что нужно от поста, чтобы поставить его в ряд стихов. */
export interface LocatedPost {
  id: string;
  attributionLocator: string | null;
  attributionWork?: string | null;
  /**
   * Заголовок поста. У афоризма участника это и есть «Бхагавад-гита 2.62»,
   * а поле локатора бывает пустым — см. `effectiveLocator`.
   */
  title?: string | null;
}

/**
 * Номер стиха поста: поле локатора; если оно пустое — номер, записанный в
 * конец источника («Бхагавад-гита 2.11»); если и там нет — номер в конце
 * заголовка (VED-389).
 *
 * Заголовок — последний довод, а не первый: его пишет редакция свободно, и
 * «7 привычек» номером стиха не станет только потому, что `splitWorkLocator`
 * берёт лишь номер с точкой в самом конце. Без этого довода стих, у которого
 * номер остался только в заголовке, считался «без номера» и уезжал в хвост:
 * лента Гиты открывалась единственным пронумерованным 2.62, а дальше шло
 * вразнобой — ровно то, что прислали в VED-389.
 */
export function effectiveLocator(
  post: Omit<LocatedPost, 'id'>,
): string | null {
  return (
    post.attributionLocator?.trim() ||
    splitWorkLocator(post.attributionWork).locator ||
    splitWorkLocator(post.title).locator
  );
}

/**
 * Посты одного источника по порядку стихов. Равные локаторы остаются в
 * исходном порядке (сортировка стабильная), дальше решает `id` — порядок
 * обязан совпадать между страницами.
 */
export function sortByLocator<T extends LocatedPost>(posts: readonly T[]): T[] {
  const keyed = posts.map((post) => ({
    post,
    key: locatorKey(effectiveLocator(post)),
  }));
  keyed.sort(
    (a, b) =>
      compareKeys(a.key, b.key) ||
      (a.post.id < b.post.id ? -1 : a.post.id > b.post.id ? 1 : 0),
  );
  return keyed.map(({ post }) => post);
}

/**
 * Стихи одной книги по порядку — не трогая места, которые выбрала лента.
 *
 * Личная лента раскладывает посты по ярусам и перемешивает, и строгий
 * порядок стихов там разрушил бы подбор. Но «2.14 раньше 2.13» читается как
 * ошибка и здесь. Поэтому места остаются прежними, а меняются только посты
 * одного источника между собой: если Гита стояла на 3-м, 7-м и 12-м местах,
 * она там и останется, но на 3-м будет самый ранний стих.
 *
 * Ключ источника даёт вызывающий (обычно нормализованное название): посты
 * без источника не трогаются.
 */
export function orderWithinSlots<T extends LocatedPost>(items: readonly T[], sourceOf: (item: T) => string | null): T[] {
  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const source = sourceOf(item);
    if (!source) return;
    const slots = groups.get(source);
    if (slots) slots.push(index);
    else groups.set(source, [index]);
  });
  const result = [...items];
  for (const slots of groups.values()) {
    if (slots.length < 2) continue;
    const sorted = sortByLocator(slots.map((index) => items[index]));
    slots.forEach((slot, i) => (result[slot] = sorted[i]));
  }
  return result;
}

/**
 * То же для ленты с ярусами: стихи переставляются только внутри своего
 * яруса. Иначе ранний стих, уже виденный человеком, уехал бы вперёд, в
 * «свежее», и подпись яруса на слайде соврала бы.
 */
export function orderTieredWithinSlots<T extends LocatedPost, Tier>(
  items: readonly { post: T; tier?: Tier }[],
  sourceOf: (post: T) => string | null,
): { post: T; tier?: Tier }[] {
  const result: { post: T; tier?: Tier }[] = [];
  let start = 0;
  while (start < items.length) {
    let end = start + 1;
    while (end < items.length && items[end].tier === items[start].tier) end++;
    const block = items.slice(start, end);
    const posts = orderWithinSlots(
      block.map((item) => item.post),
      sourceOf,
    );
    posts.forEach((post, i) => result.push({ ...block[i], post }));
    start = end;
  }
  return result;
}
