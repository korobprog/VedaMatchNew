import { BadRequestException } from '@nestjs/common';

export interface MotivationCursor {
  universal: number;
  vaishnava: number;
  accumulator: number;
  /**
   * Сессия листания: момент первой страницы и прошлый визит, по которым
   * считаются ярусы. Хранятся в курсоре, а не в базе, чтобы вторая страница
   * видела ровно тот же порядок, что и первая. Пусто — курсор старого
   * формата либо первая страница: сервис подставит текущие значения.
   */
  since?: number;
  seenBefore?: number | null;
}
export const emptyMotivationCursor = (): MotivationCursor => ({
  universal: 0,
  vaishnava: 0,
  accumulator: 0,
});

export function encodeMotivationCursor(cursor: MotivationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeMotivationCursor(value?: string): MotivationCursor {
  if (!value) return emptyMotivationCursor();
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString(),
    ) as MotivationCursor;
    if (
      ![parsed.universal, parsed.vaishnava, parsed.accumulator].every(
        Number.isInteger,
      ) ||
      parsed.universal < 0 ||
      parsed.vaishnava < 0 ||
      parsed.accumulator < 0 ||
      parsed.accumulator >= 100 ||
      (parsed.since !== undefined && !Number.isInteger(parsed.since)) ||
      (parsed.seenBefore !== undefined &&
        parsed.seenBefore !== null &&
        !Number.isInteger(parsed.seenBefore))
    )
      throw new Error();
    return parsed;
  } catch {
    throw new BadRequestException('Некорректный курсор');
  }
}

/**
 * Страница ленты и позиция для следующей.
 *
 * Раньше лента складывалась из двух треков, смешанных по доле вайшнавских
 * публикаций из настроек. Способов отбора получалось два, и они спорили друг
 * с другом: человек отмечал направление галочкой, а ползунок, о котором он
 * давно забыл, эту же ленту обрезал — вплоть до того, что собственный рилс
 * пропадал. Отбор остался один — по отмеченным направлениям.
 *
 * Поля `vaishnava` и `accumulator` в курсоре сохранены: курсоры, выданные до
 * этой правки, живут в открытых вкладках, и падать на них незачем.
 */
export function feedPage<T>(
  posts: T[],
  cursor: MotivationCursor,
  limit: number,
) {
  const from = cursor.universal;
  const items = posts.slice(from, from + limit);
  return {
    items,
    cursor: {
      universal: from + items.length,
      vaishnava: cursor.vaishnava,
      accumulator: cursor.accumulator,
    },
  };
}
