import type { ChatStatusAuthorDto, ChatStatusDto } from "@vedamatch/shared";

/**
 * Показ статусов (VED-129): сколько держать каждый и куда листать.
 *
 * Фото и текст — пять секунд, длинному тексту — больше, чтобы успеть
 * дочитать (не дольше двенадцати). Ролик — сколько длится, но не дольше
 * минуты: он и не бывает длиннее.
 */
export function statusDurationMs(status: ChatStatusDto): number {
  if (status.media?.kind === "video")
    return Math.min(60, Math.max(1, status.media.durationSec ?? 15)) * 1000;
  const extra = Math.max(0, (status.text?.length ?? 0) - 80) * 40;
  return Math.min(12_000, 5_000 + extra);
}

export interface StatusPosition {
  author: number;
  status: number;
}

/**
 * Следующий или предыдущий статус. За последним у автора — первый
 * следующего автора; за последним у последнего — конец (`null`), просмотр
 * закрывается. Назад от первого у автора — последний у предыдущего.
 */
export function stepStatus(
  authors: readonly ChatStatusAuthorDto[],
  at: StatusPosition,
  delta: 1 | -1,
): StatusPosition | null {
  const current = authors[at.author];
  if (!current) return null;
  const next = at.status + delta;
  if (next >= 0 && next < current.statuses.length)
    return { author: at.author, status: next };
  const author = at.author + delta;
  const target = authors[author];
  if (!target || target.statuses.length === 0) return null;
  return {
    author,
    status: delta === 1 ? 0 : target.statuses.length - 1,
  };
}

/** С какого статуса открывать автора: с первого непросмотренного. */
export function firstUnseen(author: ChatStatusAuthorDto): number {
  const at = author.statuses.findIndex((status) => !status.viewed);
  return at === -1 ? 0 : at;
}
