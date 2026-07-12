import { BadRequestException } from '@nestjs/common';

export interface MotivationCursor { universal: number; vaishnava: number; accumulator: number }
export const emptyMotivationCursor = (): MotivationCursor => ({ universal: 0, vaishnava: 0, accumulator: 0 });

export function encodeMotivationCursor(cursor: MotivationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeMotivationCursor(value?: string): MotivationCursor {
  if (!value) return emptyMotivationCursor();
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString()) as MotivationCursor;
    if (![parsed.universal, parsed.vaishnava, parsed.accumulator].every(Number.isInteger) || parsed.universal < 0 || parsed.vaishnava < 0 || parsed.accumulator < 0 || parsed.accumulator >= 100) throw new Error();
    return parsed;
  } catch { throw new BadRequestException('Некорректный курсор'); }
}

export function weightedPage<T>(universal: T[], vaishnava: T[], percent: number, cursor: MotivationCursor, limit: number) {
  const items: T[] = [];
  let u = cursor.universal, v = cursor.vaishnava, accumulator = cursor.accumulator;
  const safePercent = Math.max(0, Math.min(100, percent));
  while (items.length < limit && (u < universal.length || v < vaishnava.length)) {
    if (safePercent === 0) { if (u >= universal.length) break; items.push(universal[u++]); continue; }
    if (safePercent === 100) { if (v >= vaishnava.length) break; items.push(vaishnava[v++]); continue; }
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
