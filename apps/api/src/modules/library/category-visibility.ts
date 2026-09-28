import type { LineageId } from '@vedamatch/shared';
import { isDescendantOf } from './category-tree';

/**
 * Какие рубрики спрятать от зрителя по его линиям (VED-621): «когда фильтры
 * исключают каких-то авторов, их тоже не должно быть видно — не только
 * материалов, но и их самих».
 *
 * Рубрика с линией (автор: гуру, ачарья, проповедник) скрыта, если её линии
 * нет среди видимых, и вместе с ней — всё её поддерево. Рубрика без линии
 * видна всем, как и материал «для всех линий». `allowed === null` — фильтра
 * по линиям нет, скрытых нет.
 *
 * По ступеням рубрики не прячутся: разметки ступеней у рубрик нет, а прятать
 * автора, у которого после фильтра не осталось материалов, значило бы
 * прятать и тех, кого только что завели и ещё не наполнили.
 */
export function hiddenCategoryIds(
  rows: readonly { id: string; path: string; lineage: string | null }[],
  allowed: readonly LineageId[] | null,
): Set<string> {
  if (!allowed?.length) return new Set();
  const excluded = rows
    .filter(
      (row) =>
        Boolean(row.lineage) &&
        !(allowed as readonly (string | null)[]).includes(row.lineage),
    )
    .map((row) => row.id);
  if (!excluded.length) return new Set();
  return new Set(
    rows
      .filter(
        (row) =>
          excluded.includes(row.id) ||
          excluded.some((id) => isDescendantOf(row, id)),
      )
      .map((row) => row.id),
  );
}
