import type { BlogPostDto } from '@vedamatch/shared';
import { countRepost, prependBlogPost, removeBlogPost } from './blog-feed-state';

/**
 * Изменения ленты между экранами (VED-334).
 *
 * Публикуют на своём экране (`blog/new`), удаляют — на экране поста, а
 * видеть результат человек должен в ленте, из которой пришёл, и в полосе
 * «Чатов», не дожидаясь перезагрузки: перечитать ленту целиком на возврате
 * значило бы сбросить подгруженные порции и место прокрутки.
 *
 * Живёт, пока жив процесс, без React — тот же приём, что `unread-store.ts`:
 * модуль чистый и проверяется без рендера.
 */
export type BlogChange =
  | { kind: 'created'; post: BlogPostDto }
  | { kind: 'removed'; id: string }
  | { kind: 'reposted'; sourceId: string; post: BlogPostDto };

type Listener = (change: BlogChange) => void;

const listeners = new Set<Listener>();

export function announceBlogChange(change: BlogChange): void {
  for (const listener of [...listeners]) listener(change);
}

export function subscribeBlogChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Применить изменение к списку постов — одно правило для ленты, полосы
 * «Чатов» и блога автора. `authorId` — список это блог одного человека:
 * чужой новый пост в него не попадает.
 */
export function applyBlogChange(
  posts: readonly BlogPostDto[],
  change: BlogChange,
  authorId?: string,
): BlogPostDto[] {
  if (change.kind === 'removed') return removeBlogPost(posts, change.id);
  const counted = change.kind === 'reposted' ? countRepost(posts, change.sourceId) : [...posts];
  if (authorId !== undefined && change.post.author.id !== authorId) return counted;
  return prependBlogPost(counted, change.post);
}

/** Только для тестов. */
export function resetBlogChanges(): void {
  listeners.clear();
}
