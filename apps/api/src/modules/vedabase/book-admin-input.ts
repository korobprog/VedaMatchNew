import {
  isAudienceStage,
  isLineageId,
  type VedabaseAdminBookPatch,
} from '@vedamatch/shared';

export const BOOK_TITLE_MAX = 200;
export const BOOK_AUTHOR_MAX = 200;

/** Ошибка разбора правки — контроллер отдаёт её как 400. */
export class BookPatchError extends Error {}

function uniqueList<T extends string>(
  value: unknown,
  field: string,
  isValid: (item: unknown) => item is T,
): T[] {
  if (!Array.isArray(value)) throw new BookPatchError(`${field}: нужен список`);
  const items: unknown[] = value;
  const bad = items.find((item) => !isValid(item));
  if (bad !== undefined)
    throw new BookPatchError(
      `${field}: неизвестное значение ${JSON.stringify(bad)}`,
    );
  return [...new Set(items as T[])];
}

/**
 * Правка книги из админки Библиотеки (VED-662): берутся только известные
 * поля, каждое проверяется. Пустая правка — ошибка, чтобы не писать зря.
 */
export function parseBookPatch(body: unknown): VedabaseAdminBookPatch {
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    throw new BookPatchError('Нужен объект правки');
  const input = body as Record<string, unknown>;
  const patch: VedabaseAdminBookPatch = {};

  if (input.title !== undefined) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) throw new BookPatchError('Название не может быть пустым');
    if (title.length > BOOK_TITLE_MAX)
      throw new BookPatchError(`Название длиннее ${BOOK_TITLE_MAX} символов`);
    patch.title = title;
  }
  if (input.author !== undefined) {
    if (input.author !== null && typeof input.author !== 'string')
      throw new BookPatchError('Автор — строка или пусто');
    const author = input.author?.trim() || null;
    if (author && author.length > BOOK_AUTHOR_MAX)
      throw new BookPatchError(`Автор длиннее ${BOOK_AUTHOR_MAX} символов`);
    patch.author = author;
  }
  if (input.audienceStages !== undefined)
    patch.audienceStages = uniqueList(
      input.audienceStages,
      'Для кого',
      isAudienceStage,
    );
  if (input.lineages !== undefined)
    patch.lineages = uniqueList(input.lineages, 'Линии', isLineageId);
  if (input.blocked !== undefined) {
    if (typeof input.blocked !== 'boolean')
      throw new BookPatchError('Блокировка — да или нет');
    patch.blocked = input.blocked;
  }

  if (Object.keys(patch).length === 0)
    throw new BookPatchError('Нечего менять');
  return patch;
}
