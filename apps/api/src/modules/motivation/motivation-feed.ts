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

export function weightedPage<T>(
  universal: T[],
  vaishnava: T[],
  percent: number,
  cursor: MotivationCursor,
  limit: number,
) {
  const items: T[] = [];
  let u = cursor.universal,
    v = cursor.vaishnava,
    accumulator = cursor.accumulator;
  const safePercent = Math.max(0, Math.min(100, percent));
  while (
    items.length < limit &&
    (u < universal.length || v < vaishnava.length)
  ) {
    if (safePercent === 0) {
      if (u >= universal.length) break;
      items.push(universal[u++]);
      continue;
    }
    if (safePercent === 100) {
      if (v >= vaishnava.length) break;
      items.push(vaishnava[v++]);
      continue;
    }
    accumulator += safePercent;
    const chooseV = accumulator >= 100;
    if (chooseV) accumulator -= 100;
    if (chooseV && v < vaishnava.length) items.push(vaishnava[v++]);
    else if (!chooseV && u < universal.length) items.push(universal[u++]);
    else if (u < universal.length) items.push(universal[u++]);
    else if (v < vaishnava.length) items.push(vaishnava[v++]);
  }
  return { items, cursor: { universal: u, vaishnava: v, accumulator } };
}
