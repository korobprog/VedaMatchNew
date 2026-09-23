/**
 * Порядок шлок внутри одного источника (VED-386).
 *
 * Номер стиха хранится строкой так, как его записали: «2.13», «10.8»,
 * «2.62-63», «Мадхья 20.108», «Глава 2, стих 14». Строковая сортировка
 * ставит «10.8» перед «2.13» и «2.14» перед «2.2», поэтому сравниваем «как
 * читает человек»: по числам слева направо.
 *
 * Правило скопировано из `motivation/locator-order.ts` (VED-125): контракт
 * сервисного модуля запрещает импортировать чужой модуль, общие хелперы
 * дублируются внутри своего. Меняешь порядок там — сверь здесь.
 */

/**
 * Части «Чайтанья-чаритамриты» идут в порядке книги, а не алфавита: по
 * алфавиту «Антья» встала бы перед «Мадхьей».
 */
const SECTION_RANKS: ReadonlyArray<[RegExp, number]> = [
  [/(^|[^\p{L}])(ади|adi)(?=[^\p{L}]|$)/iu, 1],
  [/(^|[^\p{L}])(мадхья|мадхйа|madhya)(?=[^\p{L}]|$)/iu, 2],
  [/(^|[^\p{L}])(антья|антйа|antya)(?=[^\p{L}]|$)/iu, 3],
];

export interface VerseKey {
  /** Пустой номер — в конец: без номера стиху нет места в ряду. */
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

export function verseKey(raw: string | null | undefined): VerseKey {
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

function compareKeys(a: VerseKey, b: VerseKey): number {
  if (a.empty !== b.empty) return a.empty ? 1 : -1;
  // Номер без единой цифры («Предисловие») — после пронумерованных.
  const aNumbered = a.numbers.length > 0;
  const bNumbered = b.numbers.length > 0;
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

/** Сравнение двух номеров: отрицательное — `a` читается раньше. */
export function compareVerses(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return compareKeys(verseKey(a), verseKey(b));
}

export interface OrderedShloka {
  id: string;
  verse: string | null;
  /** Равные номера — по времени добавления: раньше добавленная раньше. */
  publishedAt: Date;
}

/**
 * Шлоки источника по порядку стихов. Равные номера — по времени
 * добавления, дальше по `id`: порядок обязан совпадать между запросами,
 * иначе стрелки и список разошлись бы.
 */
export function sortByVerse<T extends OrderedShloka>(items: readonly T[]): T[] {
  const keyed = items.map((item) => ({ item, key: verseKey(item.verse) }));
  keyed.sort(
    (a, b) =>
      compareKeys(a.key, b.key) ||
      a.item.publishedAt.getTime() - b.item.publishedAt.getTime() ||
      (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
  );
  return keyed.map(({ item }) => item);
}

export interface ShlokaNeighbors<T> {
  prev: T | null;
  next: T | null;
  /** Место с единицы; 0 — шлоки в ряду нет. */
  position: number;
  total: number;
}

/** Соседи шлоки в уже упорядоченном ряду — для стрелок окна шлоки. */
export function neighborsOf<T extends { id: string }>(
  ordered: readonly T[],
  id: string,
): ShlokaNeighbors<T> {
  const index = ordered.findIndex((item) => item.id === id);
  if (index < 0)
    return { prev: null, next: null, position: 0, total: ordered.length };
  return {
    prev: index > 0 ? ordered[index - 1] : null,
    next: index < ordered.length - 1 ? ordered[index + 1] : null,
    position: index + 1,
    total: ordered.length,
  };
}
