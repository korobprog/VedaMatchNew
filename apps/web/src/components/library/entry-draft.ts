import type {
  CreateLibraryEntryRequest,
  LibraryEntryType,
} from "@vedamatch/shared";
import type { LibraryTextKey } from "./i18n";

/**
 * Черновик карточки и проверки над ним.
 *
 * Отдельным модулем, потому что форм теперь две — пошаговый мастер и полная
 * форма «профи». Обе обязаны принимать ровно одно и то же: иначе ссылка,
 * прошедшая проверку в одной, отваливается ошибкой бэкенда в другой.
 */

/** Ограничения повторяют library-entries.service.ts на стороне API. */
export const MAX_URL_LENGTH = 2000;
export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_CATEGORIES = 5;
export const MAX_SOURCE_LENGTH = 300;

/** Адрес принимаем только абсолютный: относительный некуда открыть. */
const URL_PATTERN = /^https?:\/\/\S+$/i;

/** Порядок типов в выпадающем списке — один и тот же в обеих формах. */
export const ENTRY_TYPES: LibraryEntryType[] = [
  "website",
  "article",
  "video",
  "audio",
  "book",
  "course",
  "app",
  "telegram_channel",
  "vk_group",
  "community",
  "other",
];

/** Коды `400` от API — по ним показываем причину, а не «ссылка плохая». */
export const ERROR_KEYS: Record<string, LibraryTextKey> = {
  unsupported_url: "add.unsupportedUrl",
  url_too_long: "add.urlTooLong",
  unsupported_type: "add.unsupportedType",
  title_required: "add.titleRequired",
  title_too_long: "add.titleTooLong",
  description_too_long: "add.descriptionTooLong",
  category_required: "add.categoryRequired",
  too_many_categories: "add.tooManyCategories",
  category_not_found: "add.categoryNotFound",
};

export async function badRequestKey(
  response: Response,
): Promise<LibraryTextKey> {
  const payload = (await response.json().catch(() => null)) as {
    message?: unknown;
  } | null;
  const code = Array.isArray(payload?.message)
    ? payload?.message[0]
    : payload?.message;
  return (typeof code === "string" && ERROR_KEYS[code]) || "add.failed";
}

export interface LibraryEntryDraft {
  url: string;
  /** Откуда материал, когда ссылки нет: «Бхагавад-гита 9.22». */
  source: string;
  /**
   * Что из двух заполняет человек. Не выводится из типа: «книга» бывает и
   * бумажной, и на сайте, «статья» — и в журнале, и в блоге. Тип задаёт
   * лишь начальное положение — см. defaultLocator.
   */
  locator: EntryLocator;
  type: LibraryEntryType;
  contentLanguage: string;
  titleRu: string;
  titleEn: string;
  descriptionRu: string;
  descriptionEn: string;
  categoryIds: string[];
}

export type EntryLocator = "url" | "source";

/** Только у книги по умолчанию нет адреса; исключения закрывает переключатель. */
export function defaultLocator(type: LibraryEntryType): EntryLocator {
  return type === "book" ? "source" : "url";
}

/** Ошибка черновика ключом словаря; `null` — можно отправлять. */
export function validateEntryDraft(
  draft: LibraryEntryDraft,
): LibraryTextKey | null {
  // Проверяем то из двух, что человек выбрал: второе поле могло остаться
  // заполненным с прошлого положения переключателя, и придираться к нему
  // значило бы ругать за то, что всё равно не уедет на сервер.
  if (draft.locator === "url") {
    const url = draft.url.trim();
    if (url.length > MAX_URL_LENGTH) return "add.urlTooLong";
    if (!URL_PATTERN.test(url)) return "add.unsupportedUrl";
  } else {
    const source = draft.source.trim();
    if (!source) return "add.sourceRequired";
    if (source.length > MAX_SOURCE_LENGTH) return "add.sourceTooLong";
  }

  if (!draft.titleRu.trim() && !draft.titleEn.trim())
    return "add.titleRequired";
  if (
    draft.titleRu.trim().length > MAX_TITLE_LENGTH ||
    draft.titleEn.trim().length > MAX_TITLE_LENGTH
  )
    return "add.titleTooLong";

  if (
    draft.descriptionRu.trim().length > MAX_DESCRIPTION_LENGTH ||
    draft.descriptionEn.trim().length > MAX_DESCRIPTION_LENGTH
  )
    return "add.descriptionTooLong";

  if (draft.categoryIds.length === 0) return "add.categoryRequired";
  if (draft.categoryIds.length > MAX_CATEGORIES)
    return "add.tooManyCategories";

  return null;
}

/** Пустые строки уезжают как `null`: пустая строка — не «нет значения». */
export function buildCreateEntryBody(
  draft: LibraryEntryDraft,
): CreateLibraryEntryRequest {
  return {
    // Уезжает только выбранное: иначе поле, заполненное до переключения,
    // молча попало бы в запись вместе с тем, что человек выбрал в итоге.
    url: draft.locator === "url" ? draft.url.trim() : null,
    source: draft.locator === "source" ? draft.source.trim() : null,
    type: draft.type,
    contentLanguage: draft.contentLanguage,
    titleRu: draft.titleRu.trim() || null,
    titleEn: draft.titleEn.trim() || null,
    descriptionRu: draft.descriptionRu.trim() || null,
    descriptionEn: draft.descriptionEn.trim() || null,
    categoryIds: draft.categoryIds,
  };
}

/** Сколько шагов в простом режиме — ими же считается полоса прогресса. */
export const WIZARD_STEPS = 4;

/**
 * Готов ли шаг мастера.
 *
 * «Далее» гаснет, пока шаг не заполнен: иначе человек уходит вперёд и
 * упирается в ошибку на последнем экране, где уже не помнит, какой именно
 * шаг был не тот. Проверка шага — подмножество validateEntryDraft, а не
 * своя копия правил: расходиться им нельзя.
 */
export function isWizardStepReady(
  step: number,
  draft: LibraryEntryDraft,
): boolean {
  // Шаг 1 — тип и язык: у обоих всегда есть значение, спрашивать нечего.
  if (step === 1) return true;

  // Шаг 2 — где найти и как называется.
  if (step === 2) {
    const locatorReady =
      draft.locator === "url"
        ? URL_PATTERN.test(draft.url.trim()) &&
          draft.url.trim().length <= MAX_URL_LENGTH
        : draft.source.trim().length > 0 &&
          draft.source.trim().length <= MAX_SOURCE_LENGTH;

    const hasTitle = Boolean(draft.titleRu.trim() || draft.titleEn.trim());
    const titleTooLong =
      draft.titleRu.trim().length > MAX_TITLE_LENGTH ||
      draft.titleEn.trim().length > MAX_TITLE_LENGTH;

    return locatorReady && hasTitle && !titleTooLong;
  }

  if (step === 3)
    return (
      draft.categoryIds.length > 0 &&
      draft.categoryIds.length <= MAX_CATEGORIES
    );

  if (step === WIZARD_STEPS) return validateEntryDraft(draft) === null;

  return false;
}
