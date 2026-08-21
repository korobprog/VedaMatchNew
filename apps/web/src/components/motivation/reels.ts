import type { MotivationPostDto } from "@vedamatch/shared";

/**
 * Чистая логика ленты-рилсов, вынесенная из компонента: где ставить
 * разделитель «всё новое кончилось», что считать видео, как подписывать
 * счётчик. Компонент только рисует.
 */

/** Индекс первого поста яруса «повтор»: перед ним встаёт разделитель. -1 — повтора нет. */
export function seenDividerIndex(items: readonly MotivationPostDto[]): number {
  return items.findIndex((item) => item.feedTier === "seen");
}

export type ReelMediaKind = "video" | "image";

export function mediaKindOf(post: Pick<MotivationPostDto, "videoUrl">): ReelMediaKind {
  return post.videoUrl ? "video" : "image";
}

/** «1 240» → «1,2 тыс.»: на рельсе справа места под полное число нет. */
export function formatCount(value: number): string {
  if (value < 1000) return String(value);
  const thousands = value / 1000;
  const text = thousands >= 10 ? Math.round(thousands).toString() : thousands.toFixed(1).replace(".0", "");
  return `${text.replace(".", ",")} тыс.`;
}

/** Сколько слайд должен быть на экране, чтобы считаться просмотренным. */
export function viewDelayMs(kind: ReelMediaKind): number {
  return kind === "video" ? 2000 : 1000;
}

/** Когда подгружать следующую страницу: за три слайда до конца. */
export function shouldLoadMore(activeIndex: number, total: number, hasMore: boolean): boolean {
  return hasMore && total > 0 && activeIndex >= total - 3;
}

export function shareUrlFor(slug: string, origin: string): string {
  return new URL(`/m/${slug}`, origin).toString();
}

/** Строка источника под цитатой: «Бхагавад-гита · 2.47». */
export function attributionLine(
  post: Pick<MotivationPostDto, "attributionSpeaker" | "attributionWork" | "attributionLocator">,
): string {
  return [post.attributionSpeaker, post.attributionWork, post.attributionLocator]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" · ");
}
