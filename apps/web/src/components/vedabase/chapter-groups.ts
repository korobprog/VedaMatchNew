import type { VedabaseBookManifest } from "@vedamatch/shared";

/**
 * Оглавление Шримад-Бхагаватам и Чайтанья-чаритамриты — по песням и лилам.
 *
 * У этих двух книг главы нумеруются внутри песни (лилы), а не сквозь всю
 * книгу: «глава 14» есть и в первой песни, и в десятой. Плоский список из
 * трёхсот с лишним строк «Глава 1, Глава 2 …» не давал понять ни где ты
 * сейчас, ни куда идти — и одинаковые названия шли по кругу.
 *
 * Номер песни уже лежит в слаге главы: импорт складывает его как
 * `«{песнь}-{глава}»`, а книгам без песней оставляет просто `«{глава}»`
 * (см. `chapterSlug` в `packages/gitabase-importer/src/migrate-legacy.ts`).
 * Отдельного поля в базе нет, и заводить его ради показа значило бы
 * переливать в схему то, что и так однозначно записано.
 */

/** Глава внутри песни: `«1-14»` — четырнадцатая глава первой песни. */
export interface ChapterGroupRef {
  group: number;
  chapter: number;
}

/**
 * Разбор слага. `null` — слаг не про песни: у Бхагавад-гиты и малых книг он
 * просто `«7»`, и группировать там нечего.
 */
export function parseChapterGroup(slug: string): ChapterGroupRef | null {
  const match = /^(\d+)-(\d+)$/.exec(slug);
  if (!match) return null;
  const group = Number(match[1]);
  const chapter = Number(match[2]);
  // Ноль импорт не пишет: `canto > 0` — условие самого префикса.
  if (group <= 0 || chapter <= 0) return null;
  return { group, chapter };
}

/** Три лилы Чайтанья-чаритамриты в том порядке, в каком их пронумеровал импорт. */
const LILAS = ["Ади-лила", "Мадхья-лила", "Антья-лила"];

/**
 * Как назвать группу.
 *
 * У Бхагаватам это песни, у Чайтанья-чаритамриты — лилы, и оба слова
 * привычнее любого общего «раздела»: их произносят вслух, когда называют
 * место в книге. Для всего остального — «Часть N»: в списке пятнадцати книг
 * может появиться шестнадцатая, и упасть на ней незачем.
 */
export function chapterGroupLabel(bookSlug: string, group: number): string {
  if (bookSlug === "chaitanya-charitamrita")
    return LILAS[group - 1] ?? `Лила ${group}`;
  if (bookSlug === "srimad-bhagavatam") return `Песнь ${group}`;
  return `Часть ${group}`;
}

export interface ChapterGroup {
  /** `null` — книга без песней: главы идут одним списком. */
  label: string | null;
  chapters: VedabaseBookManifest["chapters"];
}

/**
 * Главы по группам, в порядке чтения.
 *
 * Книга без песней возвращается одной группой без названия — так у
 * оглавления один способ отрисовки на все пятнадцать книг, а не два.
 *
 * Главы без префикса в книге с песнями (предисловие, вступление) собираются
 * в первую группу без названия и остаются наверху: они и правда идут до
 * первой песни, и прятать их внутрь «Песни 1» значило бы соврать.
 */
export function groupChapters(
  bookSlug: string,
  chapters: VedabaseBookManifest["chapters"],
): ChapterGroup[] {
  const ordered = [...chapters].sort((left, right) => left.order - right.order);
  const groups: ChapterGroup[] = [];
  let loose: VedabaseBookManifest["chapters"] = [];
  const byGroup = new Map<number, VedabaseBookManifest["chapters"]>();

  for (const chapter of ordered) {
    const parsed = parseChapterGroup(chapter.slug);
    if (!parsed) {
      loose = [...loose, chapter];
      continue;
    }
    byGroup.set(parsed.group, [...(byGroup.get(parsed.group) ?? []), chapter]);
  }

  if (byGroup.size === 0) return [{ label: null, chapters: ordered }];
  if (loose.length > 0) groups.push({ label: null, chapters: loose });

  for (const group of [...byGroup.keys()].sort((a, b) => a - b)) {
    groups.push({
      label: chapterGroupLabel(bookSlug, group),
      chapters: byGroup.get(group)!,
    });
  }
  return groups;
}
