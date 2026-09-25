import type {
  BlogLinkPostResult,
  LibraryBlogShareRequestedEvent,
} from '@vedamatch/shared';

/**
 * «В Блог-ленту» (VED-490): материал Образования уходит постом в ленту.
 *
 * Своих постов у Образования нет — публикует «Блог-лента», подписчик
 * события. Издатель сообщает факт и прикладывает всё, что нужно для поста:
 * лента не читает наших таблиц. Формулировку (подрезку заголовка и текста)
 * собирает подписчик.
 */
export const LIBRARY_BLOG_SHARE_REQUESTED =
  'library.entry.blog-share-requested';

/** Подпись ссылки в посте. */
export const LIBRARY_BLOG_LINK_LABEL = 'Образование';

export interface LibraryBlogShareSource {
  id: string;
  titleRu: string | null;
  titleEn: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  source: string | null;
  previewUrl: string | null;
}

export function libraryBlogShareEvent(
  entry: LibraryBlogShareSource,
  requester: { id: string; isAdmin: boolean },
): LibraryBlogShareRequestedEvent {
  const text =
    entry.descriptionRu?.trim() ||
    entry.descriptionEn?.trim() ||
    entry.source?.trim() ||
    '';
  return {
    requesterId: requester.id,
    requesterIsAdmin: requester.isAdmin,
    entryId: entry.id,
    title: entry.titleRu?.trim() || entry.titleEn?.trim() || null,
    text,
    url: `/library/entry/${entry.id}`,
    imageUrl: entry.previewUrl,
    label: LIBRARY_BLOG_LINK_LABEL,
  };
}

/**
 * Ответ подписчика из `emitAsync`. Подписчик один — «Блог-лента»; чужие
 * ответы (не той формы) пропускаем. Никто не ответил — ленты нет.
 */
export function pickBlogShareResult(
  answers: readonly unknown[],
): BlogLinkPostResult | null {
  for (const answer of answers) {
    if (!answer || typeof answer !== 'object' || !('ok' in answer)) continue;
    const value = answer as Record<string, unknown>;
    if (value.ok === true && typeof value.postId === 'string') {
      return { ok: true, postId: value.postId };
    }
    if (value.ok === false && typeof value.reason === 'string') {
      return { ok: false, reason: value.reason };
    }
  }
  return null;
}
