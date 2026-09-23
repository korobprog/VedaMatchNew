import type { MotivationPostDto } from "@vedamatch/shared";
import { splitQuoteAndExplanation } from "./quote-text";
import { attributionLine } from "./reels";

/**
 * Адрес портального экрана «Поделиться» для афоризма — один на ленту и
 * редакцию.
 *
 * Раньше адрес собирался прямо в кнопке ряда ленты. Когда «Поделиться»
 * понадобилось карточке редакции (VED-343: «Кнопку читать замени на кнопку
 * поделиться»), копия адреса во второй кнопке разошлась бы с первой при
 * следующей правке — как уже расходились подпись и превью ссылки (VED-357).
 * Поэтому адрес здесь, а обе кнопки только ставят ссылку.
 */

type SharedPost = Pick<
  MotivationPostDto,
  | "slug"
  | "title"
  | "text"
  | "imageUrl"
  | "storyImageUrl"
  | "attributionSpeaker"
  | "attributionWork"
  | "attributionLocator"
>;

/**
 * Текст для «Поделиться»: цитата без пояснения. У открытки текст на самой
 * картинке, и поле `text` часто пустое — а экран `/share` без текста уводит
 * на главную (VED-205). Заголовок у поста заполнен всегда, им и подменяем.
 */
export function shareQuoteOf(post: Pick<MotivationPostDto, "text" | "title">): string {
  return splitQuoteAndExplanation(post.text).quote || post.title;
}

export function postShareHref(post: SharedPost): {
  pathname: "/share";
  query: Record<string, string>;
} {
  const quote = shareQuoteOf(post);
  const slug = encodeURIComponent(post.slug);
  return {
    pathname: "/share",
    query: {
      kind: "story",
      title: quote.slice(0, 200),
      text: quote,
      subtitle: attributionLine(post),
      /* Источник уже стоит заголовком превью ссылки `/m/<slug>` — его
         собирает `buildShareMeta()` в `posts/[slug]/share-meta.ts`. Поэтому
         в тело сообщения он не дописывается: иначе «Бхагавад-гита 2.63»
         стоит и в тексте, и над картинкой превью (VED-357, «Исключи любой
         дубляж текста»). В карточке для чата и на самом экране
         «Поделиться» строка остаётся — там превью нет. */
      subtitleInPreview: "1",
      link: `/m/${slug}`,
      file: `/m/${slug}/story`,
      /* `/m/<slug>/story` понимает `?q=light|standard|max` — экран покажет
         три качества «Сохранить картинку» (VED-156). */
      fileQualities: "1",
      previewUrl: post.storyImageUrl || post.imageUrl,
      sourceService: "motivation",
      sourceId: post.slug,
    },
  };
}
