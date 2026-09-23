/**
 * Сравнение двух описаний одного товара: того, что прислал человек, и того,
 * что ИИ нашёл в открытых источниках (VED-384).
 *
 * Сравниваются слова, а не строки целиком: распознавание снимка путает
 * регистр, переносы и знаки препинания, магазин пишет «Состав:» по-своему, и
 * побуквенное сравнение объявляло бы разными один и тот же состав. Цифры и
 * проценты отбрасываются — «сахар 20%» и «сахар» говорят об одном.
 */

/**
 * Слова, которые есть почти в любом составе и ничего не различают. Без них
 * два разных продукта казались бы похожими только потому, что у обоих
 * «может содержать следы».
 */
const STOP_WORDS = new Set([
  'состав',
  'ингредиенты',
  'ingredients',
  'может',
  'содержать',
  'следы',
  'следов',
  'contain',
  'contains',
  'may',
  'traces',
  'the',
  'and',
  'with',
  'для',
  'или',
  'также',
]);

/** Нормализованные слова текста: строчные, «ё» как «е», от трёх букв. */
export function wordTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length >= 3);
}

/** Слова состава без служебных — то, что различает продукты. */
export function compositionTokens(text: string): Set<string> {
  return new Set(wordTokens(text).filter((word) => !STOP_WORDS.has(word)));
}

/**
 * Насколько два состава об одном и том же: коэффициент Дайса по словам,
 * от 0 до 1. Пустой состав с любой стороны — ноль: сравнивать не с чем, и
 * «совпало» здесь было бы враньём.
 */
export function compositionAgreement(a: string, b: string): number {
  const left = compositionTokens(a);
  const right = compositionTokens(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

/**
 * Какая доля слов состава есть на странице. Страница длиннее состава в сотни
 * раз, поэтому здесь не Дайс, а покрытие: важно, что состав на ней напечатан,
 * а не то, что на ней есть ещё.
 */
export function compositionCoverage(
  pageText: string,
  composition: string,
): number {
  const wanted = compositionTokens(composition);
  if (!wanted.size) return 0;
  const page = new Set(wordTokens(pageText));
  let found = 0;
  for (const word of wanted) if (page.has(word)) found += 1;
  return found / wanted.size;
}

function normalizedLine(text: string): string {
  return wordTokens(text).join(' ');
}

/**
 * Одно ли это название. Человек пишет коротко («Нутелла»), источник — с
 * массой и вкусом («Паста ореховая Nutella 350 г»), поэтому достаточно
 * общего значимого слова или вхождения одного в другое. Совсем разные слова —
 * повод подозревать, что штрихкод набран с ошибкой и найден другой товар.
 */
export function sameProductName(a: string, b: string): boolean {
  const left = normalizedLine(a);
  const right = normalizedLine(b);
  if (!left || !right) return false;
  if (left.includes(right) || right.includes(left)) return true;
  const words = new Set(left.split(' '));
  return right.split(' ').some((word) => words.has(word));
}

/** Отличается ли поле по сути, а не регистром и пробелами. */
export function differsMeaningfully(
  before: string | null,
  after: string | null,
): boolean {
  return normalizedLine(before ?? '') !== normalizedLine(after ?? '');
}

/**
 * Отпечаток того, что справочник нашёл в составе: ключи записей с
 * серьёзностью, по порядку. По нему видно, меняет ли уточнённый состав ответ
 * хоть одному человеку — при любых личных ограничениях, а не только при
 * умолчании портала.
 */
export function catalogFingerprint(
  matches: { entry: { key: string }; severity: string }[],
): string[] {
  return [
    ...new Set(matches.map((match) => `${match.entry.key}:${match.severity}`)),
  ].sort();
}

export function sameFingerprint(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
