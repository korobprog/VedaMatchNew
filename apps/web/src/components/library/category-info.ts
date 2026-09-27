import type {
  LibraryCategoryDto,
  LibraryCategoryInfoField,
} from "@vedamatch/shared";
import type { LibraryTextKey } from "./i18n";

/**
 * «Информация» об авторе-рубрике (VED-553): четыре раздела простым текстом.
 * Здесь — чистая логика окна: какие разделы показать, когда видна кнопка и
 * как найти ссылки в тексте. Лимит и порядок разделов API держит у себя.
 */

export const CATEGORY_INFO_MAX_LENGTH = 5000;

export const CATEGORY_INFO_SECTIONS: ReadonlyArray<{
  field: LibraryCategoryInfoField;
  label: LibraryTextKey;
}> = [
  { field: "infoContacts", label: "info.contacts" },
  { field: "infoBio", label: "info.bio" },
  { field: "infoResources", label: "info.resources" },
  { field: "infoSchedule", label: "info.schedule" },
];

export type CategoryInfo = Record<LibraryCategoryInfoField, string>;

/** Разделы рубрики строками: не заполненный — пустая строка. */
export function categoryInfo(
  category: Partial<Record<LibraryCategoryInfoField, string | null>>,
): CategoryInfo {
  return {
    infoContacts: category.infoContacts ?? "",
    infoBio: category.infoBio ?? "",
    infoResources: category.infoResources ?? "",
    infoSchedule: category.infoSchedule ?? "",
  };
}

/** Разделы для читателя: только заполненные, в порядке показа. */
export function visibleInfoSections(info: CategoryInfo): Array<{
  field: LibraryCategoryInfoField;
  label: LibraryTextKey;
  text: string;
}> {
  return CATEGORY_INFO_SECTIONS.flatMap(({ field, label }) => {
    const text = info[field].trim();
    return text ? [{ field, label, text }] : [];
  });
}

/**
 * Разделы окна (VED-553, доработка): всегда все четыре, в порядке показа.
 * Незаполненный — с пустым `text`: окно подписывает его «Пока не
 * заполнено». Раньше читатель видел только заполненные, и у автора с одним
 * разделом окно выглядело так, будто остальных рубрик нет вовсе.
 */
export function infoSectionsForView(info: CategoryInfo): Array<{
  field: LibraryCategoryInfoField;
  label: LibraryTextKey;
  text: string;
}> {
  return CATEGORY_INFO_SECTIONS.map(({ field, label }) => ({
    field,
    label,
    text: info[field].trim(),
  }));
}

/**
 * Кнопку видят все, когда заполнен хотя бы один раздел, а тот, кто может
 * править рубрику, — всегда: иначе заполнить первый раздел было бы негде.
 */
export function showCategoryInfoButton(
  category: Pick<LibraryCategoryDto, "canEdit"> &
    Partial<Record<LibraryCategoryInfoField, string | null>>,
): boolean {
  return (
    category.canEdit || visibleInfoSections(categoryInfo(category)).length > 0
  );
}

/** Какой раздел длиннее лимита — после обрезки краёв, как считает API. */
export function tooLongInfoField(
  info: CategoryInfo,
): LibraryCategoryInfoField | null {
  return (
    CATEGORY_INFO_SECTIONS.find(
      ({ field }) => info[field].trim().length > CATEGORY_INFO_MAX_LENGTH,
    )?.field ?? null
  );
}

export type InfoTextPart =
  | { kind: "text"; value: string }
  | { kind: "link"; value: string; href: string };

const URL_PATTERN = /https?:\/\/[^\s<>"«»]+/gi;
/** Знаки, которыми предложение кончается сразу за ссылкой. */
const TRAILING_PUNCTUATION = /[.,;:!?'”’…]+$/;

/**
 * Текст раздела кусками: обычный текст и ссылки `http(s)://`. Точка или
 * запятая сразу за адресом — конец фразы, а не часть ссылки. Закрывающая
 * скобка отрезается, только если открывающей в адресе нет: «(см.
 * https://x.org)» и «https://ru.wikipedia.org/wiki/Гита_(книга)» оба верны.
 */
export function linkifyInfoText(text: string): InfoTextPart[] {
  const parts: InfoTextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    let url = match[0];
    for (;;) {
      const trimmed = url.replace(TRAILING_PUNCTUATION, "");
      const unbalanced =
        trimmed.endsWith(")") && count(trimmed, "(") < count(trimmed, ")")
          ? trimmed.slice(0, -1)
          : trimmed;
      if (unbalanced === url) break;
      url = unbalanced;
    }
    const start = match.index ?? 0;
    // Один протокол без адреса («https://») ссылкой не считается.
    if (/^https?:\/\/$/i.test(url)) continue;
    if (start > last) {
      parts.push({ kind: "text", value: text.slice(last, start) });
    }
    parts.push({ kind: "link", value: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) });
  return parts;
}

function count(value: string, char: string): number {
  return value.split(char).length - 1;
}
