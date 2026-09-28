/**
 * Какой стих Писания стоит за постом — для санскрита в «Читать полностью»
 * (VED-263).
 *
 * Санскрит, транслитерация и пословный перевод лежат в Библиотеке (Vedabase):
 * глава книги — один JSON, стих в нём — единица с `originalHtml`,
 * `transliterationHtml`, `synonymsHtml`. Своей копии у Вдохновения нет и не
 * заводится: она разошлась бы с книгой на первой же правке. Поэтому пост
 * сообщает только адрес — книга, глава, стих, — а текст окно берёт из
 * публичного API Библиотеки.
 *
 * Адрес читается из подписи источника: «Бхагавад-гита» + «2.47». Слаги глав —
 * те, что пишет импорт (`chapterSlug` в
 * packages/gitabase-importer/src/migrate-legacy.ts): у Гиты просто номер главы,
 * у Бхагаватам и Чайтанья-чаритамриты «{песнь|лила}-{глава}».
 */

export type ScriptureBookSlug =
  "bhagavad-gita" | "srimad-bhagavatam" | "chaitanya-charitamrita";

export interface ScriptureVerseRef {
  bookSlug: ScriptureBookSlug;
  chapterSlug: string;
  /** Номер стиха в главе; у диапазона «2.47-48» — первый. */
  verse: number;
}

/** Слово целиком: «БГ» не должно ловиться внутри «обгон». */
const word = (alternatives: string) =>
  new RegExp(`(^|[^\\p{L}])(${alternatives})(?=[^\\p{L}]|$)`, "iu");

const BOOKS: ReadonlyArray<{
  slug: ScriptureBookSlug;
  pattern: RegExp;
  abbr: RegExp;
}> = [
  {
    slug: "srimad-bhagavatam",
    pattern: /бхагаватам|bh[aā]gavatam/iu,
    abbr: word("шб|sb"),
  },
  {
    slug: "chaitanya-charitamrita",
    pattern: /чаритамрит|c(h)?aritam[rṛ]/iu,
    abbr: word("чч|cc"),
  },
  {
    slug: "bhagavad-gita",
    pattern: /бхагавад[-\s]?гит|bhagavad[-\s]?g[iī]t/iu,
    abbr: word("бг|bg"),
  },
];

/** Лилы Чайтанья-чаритамриты — в порядке, в каком их пронумеровал импорт. */
const LILAS: ReadonlyArray<RegExp> = [
  word("ади|adi|ādi"),
  word("мадхья|мадхйа|madhya"),
  word("антья|антйа|antya"),
];

const GITA_CHAPTERS = 18;
const BHAGAVATAM_CANTOS = 12;

function bookOf(text: string): ScriptureBookSlug | null {
  return (
    BOOKS.find(({ pattern }) => pattern.test(text))?.slug ??
    BOOKS.find(({ abbr }) => abbr.test(text))?.slug ??
    null
  );
}

/**
 * Номера из локатора: «2.47» → [2, 47], «Глава 2, текст 47» → [2, 47].
 * Хвост диапазона («-48», «–14») отбрасывается: стих ищется по первому номеру,
 * а единица Библиотеки со «Текстами 16–18» его и так покрывает.
 */
function numbersOf(text: string): number[] {
  const range = /(\d+)\s*[-–—]\s*\d+\s*$/.exec(text);
  const head = range ? text.slice(0, range.index + range[1].length) : text;
  return (head.match(/\d+/g) ?? []).map(Number);
}

const inRange = (value: number | undefined, max: number): value is number =>
  value !== undefined && Number.isInteger(value) && value >= 1 && value <= max;

/**
 * Разбор подписи. `null` — книга не из тех, что Библиотека хранит постишно,
 * или номер неполный («Глава 6» без стиха): угаданный стих был бы чужим.
 */
export function parseScriptureVerse(
  work: string | null | undefined,
  locator: string | null | undefined,
): ScriptureVerseRef | null {
  const text = `${work ?? ""} ${locator ?? ""}`.normalize("NFC").trim();
  if (!text) return null;
  const bookSlug = bookOf(text);
  if (!bookSlug) return null;
  const numbers = numbersOf(text);

  if (bookSlug === "bhagavad-gita") {
    const [chapter, verse] = numbers;
    if (
      numbers.length !== 2 ||
      !inRange(chapter, GITA_CHAPTERS) ||
      !inRange(verse, 999)
    )
      return null;
    return { bookSlug, chapterSlug: String(chapter), verse };
  }

  if (bookSlug === "srimad-bhagavatam") {
    const [canto, chapter, verse] = numbers;
    if (
      numbers.length !== 3 ||
      !inRange(canto, BHAGAVATAM_CANTOS) ||
      !inRange(chapter, 999) ||
      !inRange(verse, 999)
    )
      return null;
    return { bookSlug, chapterSlug: `${canto}-${chapter}`, verse };
  }

  // Чайтанья-чаритамрита: лила словом («Мадхья 20.108») или числом («2.20.108»).
  const lilaByWord = LILAS.findIndex((pattern) => pattern.test(text)) + 1;
  const [lila, chapter, verse] =
    lilaByWord > 0 && numbers.length === 2 ? [lilaByWord, ...numbers] : numbers;
  if (
    (lilaByWord > 0 ? numbers.length !== 2 : numbers.length !== 3) ||
    !inRange(lila, LILAS.length) ||
    !inRange(chapter, 999) ||
    !inRange(verse, 999)
  )
    return null;
  return { bookSlug, chapterSlug: `${lila}-${chapter}`, verse };
}

/** Часть единицы Библиотеки, которую знает окно: остальное ему не нужно. */
export interface ScriptureUnitLike {
  title?: unknown;
  sourceUrl?: unknown;
  originalHtml?: unknown;
  transliterationHtml?: unknown;
  synonymsHtml?: unknown;
}

/**
 * Какие стихи покрывает единица. Надёжнее всего — последний сегмент адреса
 * источника (`…/bhagavad-gita/1/16-18/`); нет его — хвост заголовка
 * («Текст 47», «Тексты 16–18», «БГ 2.47»).
 */
export function verseSpanOf(
  unit: ScriptureUnitLike,
): { from: number; to: number } | null {
  const span = (match: RegExpExecArray | null) => {
    if (!match) return null;
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    return to >= from ? { from, to } : null;
  };
  if (typeof unit.sourceUrl === "string") {
    let segment = "";
    try {
      segment =
        new URL(unit.sourceUrl).pathname.split("/").filter(Boolean).pop() ?? "";
    } catch {
      segment = "";
    }
    const fromUrl = span(/^(\d+)(?:[-–](\d+))?$/.exec(segment));
    if (fromUrl) return fromUrl;
  }
  if (typeof unit.title === "string")
    return span(/(\d+)(?:\s*[-–—]\s*(\d+))?\s*$/.exec(unit.title.trim()));
  return null;
}

/**
 * Единица со стихом из payload главы. Payload пришёл по сети, и его форма
 * проверяется на месте. `null` — стиха в главе нет или у него нет ни одной
 * санскритской части: показывать тогда нечего.
 */
export function findVerseUnit(
  payload: unknown,
  verse: number,
): ScriptureUnitLike | null {
  if (!payload || typeof payload !== "object") return null;
  const units = (payload as { units?: unknown }).units;
  if (!Array.isArray(units)) return null;
  for (const unit of units) {
    if (!unit || typeof unit !== "object") continue;
    const span = verseSpanOf(unit as ScriptureUnitLike);
    if (!span || verse < span.from || verse > span.to) continue;
    const found = unit as ScriptureUnitLike;
    const hasSanskrit = [
      found.originalHtml,
      found.transliterationHtml,
      found.synonymsHtml,
    ].some((part) => typeof part === "string" && part.trim() !== "");
    return hasSanskrit ? found : null;
  }
  return null;
}

/**
 * HTML читалки — в строки текста. Окно показывает стих текстом, а не
 * разметкой: так в него не может попасть ничего, кроме букв, и чистить HTML
 * второй раз не нужно. Строки стиха в источнике разделены `<br>` и абзацами —
 * они и становятся переносами.
 */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n");
  const text =
    typeof DOMParser === "undefined"
      ? withBreaks.replace(/<[^>]*>/g, "")
      : (new DOMParser().parseFromString(withBreaks, "text/html").body
          .textContent ?? "");
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
