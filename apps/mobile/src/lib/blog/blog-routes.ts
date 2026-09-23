import { router } from 'expo-router';

/**
 * Переходы внутри блог-ленты (VED-334) — одним местом, чтобы полоса в
 * «Чатах», лента и блог автора вели в один и тот же экран поста.
 */
export function openBlogPost(id: string): void {
  router.push({ pathname: '/blog/post/[id]', params: { id } });
}

export function openBlogAuthor(id: string): void {
  router.push({ pathname: '/blog/authors/[id]', params: { id } });
}

export function openBlogFeed(): void {
  router.push('/blog');
}

export function openBlogComposer(): void {
  router.push('/blog/new');
}
