import type { BlogPostDto } from '@vedamatch/shared';

/**
 * Пост для тестов блог-ленты. Имя автора — уже отображаемое: сервер кладёт
 * в `author.name` результат `resolveDisplayName()` (духовное имя, если оно
 * заполнено), и тесты клиента проверяют, что до экрана доезжает именно оно.
 */
export function blogPost(id: string, overrides: Partial<BlogPostDto> = {}): BlogPostDto {
  return {
    id,
    author: { id: 'u-1', name: 'Маму Тхакур дас', avatarUrl: null },
    title: `Заголовок ${id}`,
    text: `Текст ${id}`,
    images: [],
    createdAt: new Date(2026, 8, 21, 9, 5).toISOString(),
    editedAt: null,
    feedUntil: null,
    inFeed: true,
    pinned: false,
    repostCount: 0,
    repostOf: null,
    canEdit: false,
    canManage: false,
    canModerate: false,
    ...overrides,
  };
}
