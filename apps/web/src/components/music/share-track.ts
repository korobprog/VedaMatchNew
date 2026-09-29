/**
 * «Поделиться» записью (VED-281) — чистая часть: адрес записи, подпись и
 * адрес портального экрана «Поделиться».
 *
 * Системное окно — первым: на телефоне оно и есть «те же направления», что
 * у картинок Вдохновения (мессенджеры, истории, копирование). Где его нет —
 * на компьютере, в части браузеров — портальный `/share` с кнопками
 * Telegram, WhatsApp, Max, ВКонтакте и «Скопировать». Экран портальный
 * (`app/share/page.tsx`), подключение к нему — одна ссылка, компоненты
 * Вдохновения сюда не импортируются.
 */

export type SharedTrack = {
  id: string;
  title: string;
  artist?: { name: string } | null;
};

/**
 * Путь, который открывает получатель (VED-661): публичное радио с этой
 * записью — «чтобы человеку не обязательно было сначала регистрироваться,
 * а он сразу мог послушать трек и дальше другие в режиме Радио».
 */
export function trackSharePath(trackId: string): string {
  return `/radio?track=${encodeURIComponent(trackId)}`;
}

/** «Название — Исполнитель»; без исполнителя — одно название. */
export function trackShareText(track: SharedTrack): string {
  const artist = track.artist?.name?.trim();
  return artist ? `${track.title} — ${artist}` : track.title;
}

/**
 * Адрес экрана выбора. Только `text` и `link`: ключи карточки для чата
 * (`kind`, `title`, `subtitle`, `previewUrl`…) экран пересылает в
 * `/chat/share`, а вида «запись Музыки» там нет — кнопка «В чат» увела бы
 * на список бесед. Без них экран чат просто не предлагает.
 */
export function trackShareScreenHref(track: SharedTrack): string {
  const query = new URLSearchParams({
    text: trackShareText(track),
    link: trackSharePath(track.id),
  });
  return `/share?${query.toString()}`;
}

/**
 * Окно закрыли — это не ошибка и не повод открывать второй экран.
 * Любой другой отказ (`NotAllowedError` вне жеста, неподдержка) — повод.
 */
export function isShareDismissed(error: unknown): boolean {
  // По имени, а не `instanceof Error`: `DOMException` наследует `Error` не
  // во всех средах.
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}
