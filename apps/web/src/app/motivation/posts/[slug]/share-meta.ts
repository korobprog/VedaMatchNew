/**
 * Заголовок и описание превью ссылки в мессенджерах (VED-201).
 *
 * Карточка возвращалась с жалобой на дубляж текста трижды, и каждый раз
 * дубль оказывался в новом месте, поэтому правило теперь одно и жёсткое:
 * **превью не повторяет ничего из того, что уже уехало в тело сообщения**.
 *
 * Что уезжает в тело: `shareText()` из `components/share/share-targets.ts`
 * собирает цитату и подпись источника, а у открытки, где цитата напечатана
 * на самой картинке и поле `text` пустое, подставляется `post.title` — то
 * есть «Картинка из раздела «Философия»» (`shareQuoteOf()` в
 * `components/motivation/reels-feed.tsx`, VED-205: без текста экран
 * «Поделиться» уводит на главную).
 *
 * Отсюда и дубли, которые видел владелец:
 *   — описание превью было полным текстом цитаты — цитата дважды;
 *   — заголовок превью был `post.title`, а у открытки это ровно та же
 *     строка про раздел, что и в теле сообщения, отсюда «опять идёт
 *     дубляж текста что-то там про категорию Философия».
 *
 * Поэтому `post.title` в превью не идёт вовсе. Заголовок — источник, если
 * он известен, иначе одно нейтральное слово; описание — портал и категория.
 * Сама цитата остаётся там, где её и ждут: в тексте сообщения и на картинке.
 *
 * Трогается только `og:title`/`og:description` (и twitter-аналоги).
 * Портальный `/share` и `share-targets.ts` не меняются — это общая
 * инфраструктура, чужой контракт. `<title>` страницы и видимый на ней текст
 * (`post.title`, `post.text`) тоже остаются как были: их строит
 * `generateMetadata()` отдельно от этой функции.
 */

/** Заголовок превью, когда у поста нет ни проверенного источника, ни автора. */
const FALLBACK_TITLE = "Вдохновение";

/**
 * Описание. Без слова «Цитата» в начале: на открытке это не цитата, а
 * картинка, и «Цитата … · Философия» рядом с ней читалось странно.
 */
const BASE_DESCRIPTION = "Портал Саморазвития VedaMatch";

export type ShareMetaPost = {
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
  return [speaker, work].filter(Boolean).join(" · ");
}

/**
 * Заголовок и описание превью ссылки.
 *
 * Заголовок: источник поста («Бхагавад-гита 2.50», «Иван · Личный дневник»),
 * иначе `FALLBACK_TITLE`. `post.title` не используется намеренно — см. про
 * дубли выше.
 *
 * Описание: портал и категория через точку, если категория известна.
 */
export function buildShareMeta(post: ShareMetaPost): ShareMeta {
  const category = post.categoryTitle.trim();
  return {
    title: sourceLine(post) ?? FALLBACK_TITLE,
    description: category
      ? `${BASE_DESCRIPTION} · ${category}`
      : BASE_DESCRIPTION,
  };
}
