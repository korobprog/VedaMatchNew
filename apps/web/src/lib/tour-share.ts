/**
 * «Поделиться» главой тура (VED-653). Ссылки собираем руками, а не только
 * через `navigator.share`: на компьютере системного окна нет, а страницу
 * смотрят и гости — портальный экран `/share` им закрыт.
 */

export type TourShareTarget = "telegram" | "whatsapp" | "vk";

/** Адрес главы: якорь открывает её сразу, без листания. */
export function tourChapterUrl(origin: string, chapterId: string): string {
  return `${origin.replace(/\/$/, "")}/tour#${chapterId}`;
}

/** Ссылка «поделиться» в мессенджере или соцсети. Оба параметра кодируются. */
export function tourShareLink(
  target: TourShareTarget,
  url: string,
  text: string,
): string {
  if (target === "telegram") {
    return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  }
  if (target === "vk") {
    return `https://vk.com/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`;
  }
  // WhatsApp принимает одну строку: ссылка в конце, чтобы предпросмотр
  // цеплялся именно за неё.
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

/** Человек закрыл системное окно сам — это не ошибка и не повод для запасного пути. */
export function isTourShareDismissed(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
