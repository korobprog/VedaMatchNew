import type { ChatMomentRing } from '@vedamatch/shared';

/**
 * Порядок колец в полосе над списком бесед.
 *
 * Своё кольцо всегда первое — это одновременно и кнопка «опубликовать».
 * Дальше непросмотренные по свежести, а за ними просмотренные: полоса
 * отвечает на вопрос «что нового», и человек, чей момент уже открыли,
 * не должен занимать место у того, чей не открывали.
 */
export function sortRings(rings: readonly ChatMomentRing[]): ChatMomentRing[] {
  return [...rings].sort((a, b) => {
    if (a.mine !== b.mine) return a.mine ? -1 : 1;
    const aUnseen = a.unseen > 0;
    const bUnseen = b.unseen > 0;
    if (aUnseen !== bUnseen) return aUnseen ? -1 : 1;
    return b.lastPublishedAt.localeCompare(a.lastPublishedAt);
  });
}

/** Есть ли на что смотреть: своё кольцо-кнопка сюда не считается. */
export function hasUnseen(rings: readonly ChatMomentRing[]): boolean {
  return rings.some((ring) => !ring.mine && ring.unseen > 0);
}

/**
 * С какого момента открывать ленту автора: с первого непросмотренного, а
 * если просмотрено всё — с начала. Возврат к началу, а не к концу: человек,
 * открывший уже виденное кольцо, чаще пересматривает, чем доглядывает.
 */
export function firstUnseenIndex(
  viewed: readonly boolean[],
): number {
  const index = viewed.findIndex((seen) => !seen);
  return index === -1 ? 0 : index;
}
