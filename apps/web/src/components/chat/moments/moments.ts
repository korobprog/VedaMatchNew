import type { ChatMomentDto, ChatMomentRing } from "@vedamatch/shared";

/**
 * Чистая логика полосы моментов и просмотрщика, вынесенная из компонентов:
 * порядок колец, сколько держать слайд, сколько моменту осталось жить.
 * Компоненты только рисуют.
 */

/** Своё кольцо первым, дальше непросмотренные по свежести, затем остальные. */
export function sortRings(rings: readonly ChatMomentRing[]): ChatMomentRing[] {
  return [...rings].sort((a, b) => {
    if (a.mine !== b.mine) return a.mine ? -1 : 1;
    const aUnseen = a.unseen > 0;
    const bUnseen = b.unseen > 0;
    if (aUnseen !== bUnseen) return aUnseen ? -1 : 1;
    return b.lastPublishedAt.localeCompare(a.lastPublishedAt);
  });
}

/** Кольцо в полосе заменяется целиком: у автора всегда одна строка. */
export function upsertRing(
  rings: readonly ChatMomentRing[],
  ring: ChatMomentRing,
): ChatMomentRing[] {
  const others = rings.filter((item) => item.author.id !== ring.author.id);
  return sortRings([...others, ring]);
}

export function removeAuthor(
  rings: readonly ChatMomentRing[],
  authorId: string,
): ChatMomentRing[] {
  return rings.filter((ring) => ring.author.id !== authorId);
}

/** С какого момента открывать ленту: с первого непросмотренного. */
export function firstUnseenIndex(moments: readonly ChatMomentDto[]): number {
  const index = moments.findIndex((moment) => !moment.viewedByMe);
  return index === -1 ? 0 : index;
}

/**
 * Сколько держать слайд.
 *
 * У ролика — ровно столько, сколько он длится: полоска прогресса обещает
 * зрителю конец, и обрывать на нём ролик значит нарушить обещание. Длину
 * замерил сервер; если её нет, ведём себя как с фотографией.
 *
 * У записки — по длине текста: короткую успевают прочесть за три секунды,
 * длинную нет, и одинаковый срок для обеих означает, что половину моментов
 * дочитывают на паузе.
 */
export function slideMs(moment: ChatMomentDto): number {
  if (moment.kind === "video")
    return moment.durationSec ? moment.durationSec * 1000 : 5000;
  if (moment.kind === "photo") return 5000;
  const reading = Math.ceil(moment.caption.length / 12) * 1000;
  return Math.min(15000, Math.max(4000, reading));
}

/** «Осталось 3 ч» под именем автора: момент живёт сутки, и это видно. */
export function remainingLabel(expiresAt: string, now: Date = new Date()): string {
  const left = new Date(expiresAt).getTime() - now.getTime();
  if (left <= 0) return "истёк";
  const hours = Math.floor(left / 3_600_000);
  if (hours >= 1) return `${hours} ч`;
  const minutes = Math.max(1, Math.round(left / 60_000));
  return `${minutes} мин`;
}
