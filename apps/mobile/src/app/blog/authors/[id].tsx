import type { BlogAuthorDto, BlogPostDto } from '@vedamatch/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlogFeedSkeleton, BlogListFooter, BlogLoadFailed, blogHeaderOptions } from '@/components/blog/blog-list-parts';
import { BlogPostCard } from '@/components/blog/blog-post-card';
import { useBlogPostActions } from '@/components/blog/use-blog-post-actions';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { InlineError } from '@/components/inline-error';
import { useSession } from '@/lib/auth/session';
import { createBlogApi } from '@/lib/blog/blog-api';
import { blogAuthorCount } from '@/lib/blog/blog-feed-state';
import { openBlogPost } from '@/lib/blog/blog-routes';
import { useBlogPages, type BlogPage } from '@/lib/blog/use-blog-pages';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

interface AuthorExtra {
  author: BlogAuthorDto;
  total: number;
}

const keyOf = (post: BlogPostDto) => post.id;

/**
 * Личный блог участника (VED-116): все его посты, включая ушедшие из общей
 * ленты по сроку, — как `/blog/authors/[userId]` на сайте. Вход — имя автора
 * в развороте поста.
 */
export default function BlogAuthorScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSession();
  const blogApi = useMemo(() => createBlogApi(api), [api]);
  const [now] = useState(() => new Date());

  const fetchPage = useCallback(
    async (cursor: string | null): Promise<BlogPage<AuthorExtra>> => {
      const page = await blogApi.author(id ?? '', cursor);
      return { posts: page.posts, nextCursor: page.nextCursor, extra: { author: page.author, total: page.total } };
    },
    [blogApi, id],
  );
  const feed = useBlogPages(fetchPage, { authorId: id });
  const actions = useBlogPostActions();

  const renderItem = useCallback<ListRenderItem<BlogPostDto>>(
    ({ item }) => (
      <BlogPostCard
        post={item}
        now={now}
        variant="feed"
        onOpenPost={openBlogPost}
        onRepost={actions.repost}
        onCopy={actions.copy}
        onDelete={actions.askDelete}
      />
    ),
    [actions.askDelete, actions.copy, actions.repost, now],
  );

  const author = feed.extra?.author ?? null;
  const title = author ? author.name : 'Блог';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={blogHeaderOptions(colors, title)} />
      {!feed.posts ? (
        feed.loadError ? (
          <BlogLoadFailed message={feed.loadError} onRetry={() => void feed.load()} />
        ) : (
          <BlogFeedSkeleton />
        )
      ) : (
        <FlatList
          data={feed.posts}
          keyExtractor={keyOf}
          renderItem={renderItem}
          ListHeaderComponent={
            <View style={styles.header}>
              {author ? (
                <View style={styles.authorRow}>
                  <ChatAvatar id={author.id} name={author.name} uri={author.avatarUrl} size={56} />
                  <View style={styles.authorText}>
                    <Text accessibilityRole="header" style={[styles.name, { color: colors.text0 }]}>
                      {author.name}
                    </Text>
                    <Text style={[styles.count, { color: colors.text1 }]}>{blogAuthorCount(feed.extra?.total ?? 0)}</Text>
                  </View>
                </View>
              ) : null}
              {feed.loadError ? <InlineError message={feed.loadError} /> : null}
            </View>
          }
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.text1 }]}>У этого участника пока нет постов.</Text>
          }
          ListFooterComponent={
            <BlogListFooter
              hasMore={feed.hasMore}
              loadingMore={feed.loadingMore}
              moreError={feed.moreError}
              onRetry={() => void feed.loadMore()}
              count={feed.posts.length}
            />
          }
          onEndReached={() => void feed.loadMore()}
          onEndReachedThreshold={0.6}
          refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.refresh} colors={[colors.magenta]} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          windowSize={7}
          initialNumToRender={3}
        />
      )}
      {actions.dialog}
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 12 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  authorText: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontFamily: fonts.displayMedium, fontSize: 18, lineHeight: 24 },
  count: { fontFamily: fonts.body, fontSize: 14 },
  separator: { height: 12 },
  empty: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center', paddingHorizontal: 24, paddingVertical: 32 },
});
