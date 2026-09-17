/**
 * Заголовок и описание превью ссылки в мессенджерах (VED-201б).
 *
 * Вынесено чистой функцией из `generateMetadata()`: раньше `description`
 * там был полным текстом цитаты — тем же, что уже уходит в тело сообщения
 * через «Поделиться» (`share-targets.ts`, `shareText()`). Мессенджер
 * разворачивает ссылку и показывает цитату второй раз — уже в самой
 * карточке-превью, отсюда дубль в Telegram/Max: текст + тот же текст в
 * превью.
 *
 * Здесь трогается только og:title/og:description (и twitter-аналоги) —
 * то, что видно в развёрнутой карточке ссылки. Портальный `/share` и
 * `share-targets.ts` не меняются: это общая инфраструктура, чужой контракт.
 * `<title>` страницы и видимый на странице текст (`post.title`, `post.text`)
 * тоже не трогаются — их строит сам `generateMetadata()` отдельно от этой
 * функции.
 */

/** Значение `titleFor()` (`motivation-reels.service.ts`) для рилса без
 *  проверенной цитаты и без указанного автора — заголовок, который сам по
 *  себе ничего не говорит о содержимом карточки. */
const GENERIC_REEL_TITLE = 'Свой рилс';
/** Заголовок превью, когда у поста нет ни проверенного источника, ни автора. */
const FALLBACK_TITLE = 'Вдохновение — VedaMatch';
/** Нейтральное описание: не повторяет текст цитаты, который уже есть в
 *  теле сообщения при «Поделиться». */
const BASE_DESCRIPTION = 'Цитата на Портале Саморазвития VedaMatch';

export type ShareMetaPost = {
  /** `post.title` — то же значение, что идёт в `<title>` страницы; здесь
   *  только читается, не меняется. */
  title: string;
  attributionSpeaker: string | null;
  attributionWork: string | null;
  /** Пусто, если справочник не знает категорию (см. `MotivationPostDto`). */
  categoryTitle: string;
};

export type ShareMeta = { title: string; description: string };

/** Автор и источник одной строкой — как на самой странице поста. */
function sourceLine(post: ShareMetaPost): string | null {
  const speaker = post.attributionSpeaker?.trim();
  const work = post.attributionWork?.trim();
  if (!speaker && !work) return null;
  return [speaker, work].filter(Boolean).join(' · ');
}

/**
 * Заголовок и описание превью ссылки.
 *
 * Заголовок: `post.title`, кроме безликого `«Свой рилс»` — вместо него
 * источник/атрибуция поста, если есть, иначе `FALLBACK_TITLE`. Сам
 * `titleFor()` в API не трогаем (это отдельная карточка — влияет на список
 * «Мои», карточки в ленте), правка только здесь, в метаданных превью.
 *
 * Описание: всегда нейтральный текст, с категорией через тире, если она
 * известна — короткая подсказка о содержимом без повтора самой цитаты.
 */
export function buildShareMeta(post: ShareMetaPost): ShareMeta {
  const title =
    post.title === GENERIC_REEL_TITLE
      ? (sourceLine(post) ?? FALLBACK_TITLE)
      : post.title;
  const category = post.categoryTitle.trim();
  const description = category
    ? `${BASE_DESCRIPTION} · ${category}`
    : BASE_DESCRIPTION;
  return { title, description };
}
