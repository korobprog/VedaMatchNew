import type {
  CreateLibraryEntryRequest,
  LibraryEntryType,
  LibraryLocale,
  LineageId,
} from "@vedamatch/shared";
import { t, type LibraryTextKey } from "./i18n";

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
/** Текст катхи: лекция, беседа, глава — но не книга целиком. См. entry-body.ts в API. */
export const MAX_BODY_LENGTH = 200_000;

/** Адрес принимаем только абсолютный: относительный некуда открыть. */
const URL_PATTERN = /^https?:\/\/\S+$/i;

/** Порядок типов в выпадающем списке — один и тот же в обеих формах. */
export const ENTRY_TYPES: LibraryEntryType[] = [
  "website",
  "article",
  "video",
  "audio",
  "book",
  "katha",
  "course",
  "app",
  "telegram_channel",
  "vk_group",
  "community",
  "other",
];

/**
 * Коды `400` от API — по ним показываем причину, а не «ссылка плохая».
 * Список обязан покрывать все `BadRequestException` из
 * `library-entries.service.ts`: код без строки здесь превращается в
 * бессодержательное «попробуйте позже», по которому нельзя понять, что
 * именно поправить в карточке.
 */
export const ERROR_KEYS: Record<string, LibraryTextKey> = {
  unsupported_url: "add.unsupportedUrl",
  url_too_long: "add.urlTooLong",
  url_or_source_required: "add.urlOrSourceRequired",
  source_too_long: "add.sourceTooLong",
  body_required: "add.bodyRequired",
  body_too_long: "add.bodyTooLong",
  unsupported_type: "add.unsupportedType",
  unsupported_lineage: "add.unsupportedLineage",
  title_required: "add.titleRequired",
  title_too_long: "add.titleTooLong",
  description_too_long: "add.descriptionTooLong",
  category_required: "add.categoryRequired",
  too_many_categories: "add.tooManyCategories",
  category_not_found: "add.categoryNotFound",
};

/** Код ошибки из тела Nest (`message` строкой или массивом). */
async function errorCode(response: Response): Promise<string | null> {
  const payload = (await response.json().catch(() => null)) as {
    message?: unknown;
  } | null;
  const code = Array.isArray(payload?.message)
    ? payload?.message[0]
    : payload?.message;
  return typeof code === "string" && code ? code : null;
}

/**
 * Почему не удалось добавить материал.
 *
 * `detail` — то, что дописывается в скобках, когда причина неизвестна: код
 * ошибки бэкенда или код ответа. Без него экран одинаков для истёкшей
 * сессии, отказа в правах и упавшего сервера: «Не удалось добавить ссылку,
 * попробуйте позже» не говорит ни человеку, что делать, ни поддержке, что
 * чинить.
 *
 * `409` сюда не попадает: у дубля своя ветка со ссылкой на найденную
 * запись, и ей нужно тело ответа целиком.
 */
export interface EntrySubmitFailure {
  key: LibraryTextKey;
  detail?: string;
}

export async function entrySubmitFailure(
  response: Response,
): Promise<EntrySubmitFailure> {
  if (response.status === 400) {
    const code = await errorCode(response);
    const key = code ? ERROR_KEYS[code] : undefined;
    return key ? { key } : { key: "add.failed", detail: code ?? "400" };
  }
  // 401 доходит сюда, только когда refresh уже не помог (см. http-client):
  // сессии действительно нет, и «попробуйте позже» тут вводит в заблуждение.
  if (response.status === 401) return { key: "add.sessionExpired" };
  if (response.status === 403) return { key: "add.forbidden" };
  if (response.status === 429) return { key: "add.rateLimited" };
  if (response.status >= 500) {
    return { key: "add.serverError", detail: String(response.status) };
  }
  return { key: "add.failed", detail: String(response.status) };
}

/** Текст ошибки для экрана: причина, а в скобках — код, если он неизвестен. */
export function failureText(
  locale: LibraryLocale,
  failure: EntrySubmitFailure,
): string {
  const text = t(locale, failure.key);
  return failure.detail ? `${text} (${failure.detail})` : text;
}

export interface LibraryEntryDraft {
  url: string;
  /**
   * Откуда материал, когда ссылки нет: «Бхагавад-гита 9.22». У катхи —
   * необязательная подпись к тексту: где и когда прозвучало.
   */
  source: string;
  /** Текст катхи целиком. */
  body: string;
  /**
   * Что заполняет человек. Не выводится из типа: «книга» бывает и
   * бумажной, и на сайте, «статья» — и в журнале, и в блоге. Тип задаёт
   * лишь начальное положение — см. defaultLocator. Исключение — катха: у неё
   * положение одно, «текст», и переключателя нет вовсе.
   */
  locator: EntryLocator;
  type: LibraryEntryType;
  contentLanguage: string;
  titleRu: string;
  titleEn: string;
  descriptionRu: string;
  descriptionEn: string;
  categoryIds: string[];
  /** От имени какой общины. Пустая строка — от себя лично. */
  communityId: string;
  /** Духовная линия материала. Пустая строка — для всех линий. */
  lineage: string;
}

export type EntryLocator = "url" | "source" | "body";

/** Катхе нужен текст, книге по умолчанию хватает источника, остальным — адрес. */
export function defaultLocator(type: LibraryEntryType): EntryLocator {
  if (type === "katha") return "body";
  return type === "book" ? "source" : "url";
}

/**
 * Положение переключателя после смены типа.
 *
 * Катхе нужен только текст. Уходя с катхи, возвращаемся к положению по
 * типу: «текста» у остальных типов в формах нет. В прочих случаях ручной
 * выбор человека тип не перебивает — иначе «книга, но по ссылке»
 * сбрасывалась бы при каждом возврате на первый шаг.
 */
export function locatorForType(
  type: LibraryEntryType,
  current: EntryLocator,
  touched: boolean,
): EntryLocator {
  if (type === "katha") return "body";
  if (current === "body" || !touched) return defaultLocator(type);
  return current;
}

/**
 * Ошибка в том, на что указывает черновик; `null` — всё на месте.
 *
 * Проверяем то, что человек выбрал: поле от прошлого положения
 * переключателя могло остаться заполненным, и придираться к нему значило бы
 * ругать за то, что всё равно не уедет на сервер.
 */
function locatorError(draft: LibraryEntryDraft): LibraryTextKey | null {
  if (draft.locator === "url") {
    const url = draft.url.trim();
    if (url.length > MAX_URL_LENGTH) return "add.urlTooLong";
    if (!URL_PATTERN.test(url)) return "add.unsupportedUrl";
    return null;
  }

  const source = draft.source.trim();
  if (draft.locator === "source") {
    if (!source) return "add.sourceRequired";
    if (source.length > MAX_SOURCE_LENGTH) return "add.sourceTooLong";
    return null;
  }

  const body = draft.body.trim();
  if (!body) return "add.bodyRequired";
  if (body.length > MAX_BODY_LENGTH) return "add.bodyTooLong";
  // Источник у катхи необязателен, но и безразмерным не бывает.
  if (source.length > MAX_SOURCE_LENGTH) return "add.sourceTooLong";
  return null;
}

/** Ошибка черновика ключом словаря; `null` — можно отправлять. */
export function validateEntryDraft(
  draft: LibraryEntryDraft,
): LibraryTextKey | null {
  const locator = locatorError(draft);
  if (locator) return locator;

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
    // У катхи источник — необязательная подпись к тексту, поэтому пустой
    // уезжает как `null`, а не как пустая строка.
    source: draft.locator === "url" ? null : draft.source.trim() || null,
    body: draft.locator === "body" ? draft.body.trim() : null,
    type: draft.type,
    contentLanguage: draft.contentLanguage,
    titleRu: draft.titleRu.trim() || null,
    titleEn: draft.titleEn.trim() || null,
    descriptionRu: draft.descriptionRu.trim() || null,
    descriptionEn: draft.descriptionEn.trim() || null,
    categoryIds: draft.categoryIds,
    communityId: draft.communityId || null,
    lineage: draft.lineage ? (draft.lineage as LineageId) : null,
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

  // Шаг 2 — где найти (или сам текст) и как называется.
  if (step === 2) {
    const hasTitle = Boolean(draft.titleRu.trim() || draft.titleEn.trim());
    const titleTooLong =
      draft.titleRu.trim().length > MAX_TITLE_LENGTH ||
      draft.titleEn.trim().length > MAX_TITLE_LENGTH;

    return locatorError(draft) === null && hasTitle && !titleTooLong;
  }

  if (step === 3)
    return (
      draft.categoryIds.length > 0 &&
      draft.categoryIds.length <= MAX_CATEGORIES
    );

  if (step === WIZARD_STEPS) return validateEntryDraft(draft) === null;

  return false;
}
