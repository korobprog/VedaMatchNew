/**
 * Подсветка найденных слов в выдаче поиска (VED-98).
 *
 * Сервисы ищут каждый по-своему — где полнотекстом со словоформами, где
 * подстрокой, — и точно повторить их на клиенте нельзя. Поэтому подсветка
 * держится простого правила, которое читается глазами так же, как искали:
 *
 * - каждое слово запроса ищется в начале слов текста, без учёта регистра,
 *   «е» и «ё» — одна буква;
 * - у слова длиннее четырёх букв отбрасываются две последние: «киртаны»
 *   подсвечивает и «киртан», «лекцию» — «лекции»;
 * - подсвечивается слово текста целиком, а не обрывок: «кирт|аны» с
 *   полупокрашенным словом читается хуже, чем слово целиком.
 */

export interface HighlightPart {
  text: string;
  hit: boolean;
}

/** Короче этого слово запроса не подсвечиваем: «по», «и» горели бы везде. */
const MIN_WORD = 2;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Основа слова для сравнения: без двух последних букв у длинных слов. */
function stemOf(word: string): string {
  return word.length > 4 ? word.slice(0, -2) : word;
}

/** Шаблон, в котором «е» и «ё» взаимозаменяемы. */
function yoInsensitive(escaped: string): string {
  return escaped.replace(/[её]/gi, (letter) =>
    letter === letter.toUpperCase() ? "[ЕЁ]" : "[её]",
  );
}

export function highlightParts(text: string, query: string): HighlightPart[] {
  if (!text) return [];
  const stems = [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length >= MIN_WORD)
        .map(stemOf),
    ),
  ]
    // Длинные основы вперёд: «киртан» не должен уступить совпадение «ки».
    .sort((a, b) => b.length - a.length)
    .map((stem) => yoInsensitive(escapeRegExp(stem)));
  if (stems.length === 0) return [{ text, hit: false }];

  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${stems.join("|")})[\\p{L}\\p{N}]*`,
    "giu",
  );
  const parts: HighlightPart[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > last) parts.push({ text: text.slice(last, start), hit: false });
    parts.push({ text: match[0], hit: true });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false });
  return parts;
}
