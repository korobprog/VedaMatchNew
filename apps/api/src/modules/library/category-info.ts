/** Своя копия типа из `@vedamatch/shared` — модулю хватает четырёх имён. */
type CategoryInfoField =
  'infoContacts' | 'infoBio' | 'infoResources' | 'infoSchedule';

/**
 * «Информация» об авторе-рубрике (VED-553): контакты, биография, ресурсы,
 * расписание. Хранится простым текстом — веб рисует его как текст с
 * переносами строк и сам находит в нём ссылки, разметке взяться неоткуда.
 */

/** Разделы в порядке показа. */
export const CATEGORY_INFO_FIELDS: readonly CategoryInfoField[] = [
  'infoContacts',
  'infoBio',
  'infoResources',
  'infoSchedule',
];

/** Лимит каждого раздела, в символах — после нормализации. */
export const CATEGORY_INFO_MAX_LENGTH = 5000;

/** Теги вида `<b>`, `</a>`, `<br/>`; «a < b» и «<3» тегами не считаются. */
const HTML_TAG = /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>/gi;
/** Управляющие символы, кроме перевода строки и табуляции. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export type CategoryInfoPatch = Partial<
  Record<CategoryInfoField, string | null>
>;

/**
 * Приводит раздел к хранимому виду: переводы строк — `\n`, без тегов и
 * управляющих символов, без пустых краёв. Пустое — `null`: раздел не
 * заполнен, и читателю его не показывают.
 */
export function normalizeCategoryInfo(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/\r\n?/g, '\n')
    .replace(HTML_TAG, '')
    .replace(CONTROL, '')
    // Три и больше пустых строк подряд — одна пустая: абзацы остаются,
    // простыни пустоты из вставки нет.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text ? text : null;
}

export type CategoryInfoRejection = 'info_too_long' | 'info_invalid';

/**
 * Из тела запроса — только переданные разделы, уже нормализованные.
 * Не переданный раздел не трогается; `null` и пустая строка его очищают.
 */
export function pickCategoryInfo(
  body: Record<string, unknown>,
): CategoryInfoPatch | CategoryInfoRejection {
  const patch: CategoryInfoPatch = {};
  for (const field of CATEGORY_INFO_FIELDS) {
    const raw = body[field];
    if (raw === undefined) continue;
    if (raw !== null && typeof raw !== 'string') return 'info_invalid';
    const text = normalizeCategoryInfo(raw);
    if (text && text.length > CATEGORY_INFO_MAX_LENGTH) {
      return 'info_too_long';
    }
    patch[field] = text;
  }
  return patch;
}

export function isCategoryInfoRejection(
  value: CategoryInfoPatch | CategoryInfoRejection,
): value is CategoryInfoRejection {
  return typeof value === 'string';
}
