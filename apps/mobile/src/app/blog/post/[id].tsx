import type { BlogPostDto } from '@vedamatch/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlogFeedSkeleton, BlogLoadFailed, blogHeaderOptions } from '@/components/blog/blog-list-parts';
import { BlogPostCard } from '@/components/blog/blog-post-card';
import { useBlogPostActions } from '@/components/blog/use-blog-post-actions';
import { InlineError } from '@/components/inline-error';
import { RetryButton } from '@/components/retry-button';
import { useSession } from '@/lib/auth/session';
import { createBlogApi } from '@/lib/blog/blog-api';
import { countRepost } from '@/lib/blog/blog-feed-state';
import { subscribeBlogChanges } from '@/lib/blog/blog-changes';
import { describeBlogError, isBlogPostGone } from '@/lib/blog/blog-error';
import { openBlogAuthor, openBlogFeed } from '@/lib/blog/blog-routes';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

/**
 * Пост целиком (VED-334): шапка с автором и аватаром, все фотографии, текст
 * без свёртки. Сюда ведёт нажатие на картинку или заголовок — в ленте и в
 * полосе «Чатов» — и открывается ИМЕННО этот пост, а не лента вокруг него
 * (VED-238, чек-лист: «не должно открывать историю — другие посты»).
 *
 * Пост берётся с сервера заново, а не из ленты: его могли поправить на
 * сайте, а экран должен показать то, что сейчас видят все.
 */
export default function BlogPostScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id, notice } = useLocalSearchParams<{ id: string; notice?: string }>();
  const { api } = useSession();
  const blogApi = useMemo(() => createBlogApi(api), [api]);
  const [post, setPost] = useState<BlogPostDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now] = useState(() => new Date());

  const actions = useBlogPostActions({
    // Удалили — здесь больше нечего показывать, возвращаемся туда, откуда пришли.
    onRemoved: () => (router.canGoBack() ? router.back() : openBlogFeed()),
  });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setPost(await blogApi.post(id));
      setError(null);
      setGone(false);
    } catch (cause) {
      if (isBlogPostGone(cause)) setGone(true);
      else setError(describeBlogError(cause, 'Не удалось загрузить пост.'));
    } finally {
      setRefreshing(false);
    }
  }, [blogApi, id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Репост этого поста с этого же экрана: счётчик растёт сразу.
  useEffect(
    () =>
      subscribeBlogChanges((change) => {
        if (change.kind !== 'reposted') return;
        setPost((current) => (current ? (countRepost([current], change.sourceId)[0] ?? current) : current));
      }),
    [],
  );

  const header = <Stack.Screen options={blogHeaderOptions(colors, 'Пост')} />;

  if (gone) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.bg0 }]}>
        {header}
        <Text accessibilityRole="alert" style={[styles.message, { color: colors.text1 }]}>
          Пост не найден — возможно, автор его удалил.
        </Text>
        <RetryButton onPress={openBlogFeed} label="К ленте" />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
        {header}
        {error ? <BlogLoadFailed message={error} onRetry={() => void load()} /> : <BlogFeedSkeleton />}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      {header}
      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            colors={[colors.magenta]}
          />
        }
      >
        {notice ? (
          <View style={styles.notice}>
            <InlineError message={notice} />
          </View>
        ) : null}
        <BlogPostCard
          post={post}
          now={now}
          variant="full"
          onOpenAuthor={openBlogAuthor}
          onRepost={actions.repost}
          onCopy={actions.copy}
          onDelete={actions.askDelete}
        />
      </ScrollView>
      {actions.dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  notice: { paddingHorizontal: 16, paddingBottom: 12 },
  message: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
