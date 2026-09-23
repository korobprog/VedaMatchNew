import type { BlogPostDto } from '@vedamatch/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyBlogChange, subscribeBlogChanges } from './blog-changes';
import { describeBlogError } from './blog-error';
import { mergeBlogPages } from './blog-feed-state';

export interface BlogPage<Extra> {
  posts: BlogPostDto[];
  nextCursor: string | null;
  extra: Extra;
}

/**
 * Лента порциями — общая механика экрана ленты и блога автора (VED-334).
 *
 * Четыре состояния по правилу `expo-data-fetching`: первая загрузка
 * (`posts === null`, ошибки нет), ошибка первой загрузки, пусто, содержимое.
 * Ошибка обновления или продолжения содержимое не гасит — она стоит рядом.
 *
 * Несколько загрузок могут перекрыться (вход, «Повторить», потянуть вниз) —
 * засчитывается только самая свежая; продолжение, начатое до перезагрузки,
 * своё не дописывает: прежний курсор указывает уже в другую ленту.
 */
export function useBlogPages<Extra>(
  fetchPage: (cursor: string | null) => Promise<BlogPage<Extra>>,
  options: { authorId?: string } = {},
) {
  const [posts, setPosts] = useState<BlogPostDto[] | null>(null);
  const [extra, setExtra] = useState<Extra | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const request = useRef(0);
  const { authorId } = options;

  const load = useCallback(async () => {
    const id = (request.current += 1);
    try {
      const page = await fetchPage(null);
      if (request.current !== id) return;
      setPosts(page.posts);
      setExtra(page.extra);
      setCursor(page.nextCursor);
      setLoadError(null);
      setMoreError(null);
    } catch (error) {
      if (request.current === id) setLoadError(describeBlogError(error, 'Не удалось загрузить ленту.'));
    } finally {
      if (request.current === id) setRefreshing(false);
    }
  }, [fetchPage]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    const id = request.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await fetchPage(cursor);
      if (request.current !== id) return;
      setPosts((current) => mergeBlogPages(current ?? [], page.posts));
      setCursor(page.nextCursor);
    } catch (error) {
      if (request.current === id) setMoreError(describeBlogError(error, 'Не удалось загрузить продолжение.'));
    } finally {
      if (request.current === id) setLoadingMore(false);
    }
  }, [cursor, fetchPage, loadingMore]);

  useEffect(() => {
    void load();
  }, [load]);

  // Опубликовали, удалили или сделали репост на соседнем экране — лента
  // меняется сразу, без перезагрузки и без потери прокрутки.
  useEffect(
    () =>
      subscribeBlogChanges((change) => {
        setPosts((current) => (current ? applyBlogChange(current, change, authorId) : current));
      }),
    [authorId],
  );

  return { posts, extra, hasMore: cursor !== null, loadError, moreError, refreshing, loadingMore, load, refresh, loadMore };
}
