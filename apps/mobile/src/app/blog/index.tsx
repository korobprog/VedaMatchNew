import type { BlogPostDto } from '@vedamatch/shared';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { BlogFeedSkeleton, BlogListFooter, BlogLoadFailed, blogHeaderOptions } from '@/components/blog/blog-list-parts';
import { BlogPostCard } from '@/components/blog/blog-post-card';
import { useBlogPostActions } from '@/components/blog/use-blog-post-actions';
import { useSession } from '@/lib/auth/session';
import { createBlogApi } from '@/lib/blog/blog-api';
import { openBlogComposer, openBlogPost } from '@/lib/blog/blog-routes';
import { readBlogHomeVisible, writeBlogHomeVisible } from '@/lib/blog/blog-home-visibility';
import { useBlogPages, type BlogPage } from '@/lib/blog/use-blog-pages';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

const keyOf = (post: BlogPostDto) => post.id;

/**
 * Блог-лента (VED-334) — вся лента с архивом, как `/blog` на сайте
 * (`scope=all`): свежее сверху, закреплённое администратором выше всего,
 * подгрузка порциями по 12 при прокрутке.
 *
 * Сюда ведут три дороги: «Вся лента» с полосы в «Чатах», карточка
 * «Блог-лента» во вкладке «Сервисы» и чип панели быстрого доступа, если
 * человек закрепил сервис (VED-385). Почему не шестая вкладка — в описании
 * PR и у полосы (`components/blog/blog-home-strip.tsx`).
 */
export default function BlogFeedScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api, user } = useSession();
  const blogApi = useMemo(() => createBlogApi(api), [api]);
  const [now] = useState(() => new Date());
  const [stripHidden, setStripHidden] = useState(false);

  const fetchPage = useCallback(
    async (cursor: string | null): Promise<BlogPage<null>> => {
      const page = await blogApi.feed('all', cursor);
      return { posts: page.posts, nextCursor: page.nextCursor, extra: null };
    },
    [blogApi],
  );
  const feed = useBlogPages(fetchPage);
  const actions = useBlogPostActions();

  // Вернуть полосу в «Чаты» можно только отсюда — как на сайте кнопка
  // «Лента» в строке настроек главной. Перечитываем на каждом входе: её
  // могли спрятать только что.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      void readBlogHomeVisible(user.id).then((visible) => setStripHidden(!visible));
    }, [user]),
  );

  const restoreStrip = useCallback(() => {
    if (!user) return;
    setStripHidden(false);
    void writeBlogHomeVisible(user.id, true).catch(() => setStripHidden(true));
  }, [user]);

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

  const header = (
    <View style={styles.header}>
      <Text style={[styles.lead, { color: colors.text1 }]}>
        Что происходит у людей портала. Здесь и все прошлые посты — те, что уже ушли из свежей ленты.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Открывает форму нового поста"
        onPress={openBlogComposer}
        android_ripple={ripple(colors.glassBorder)}
        style={({ pressed }) => [styles.write, { backgroundColor: colors.magenta }, pressedStyle(pressed)]}
      >
        <Text style={[styles.writeText, { color: colors.onAccent }]}>Написать пост</Text>
      </Pressable>
      {stripHidden ? (
        <View style={[styles.restore, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
          <Text style={[styles.restoreText, { color: colors.text1 }]}>Лента убрана из «Чатов».</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Вернуть ленту в «Чаты»"
            onPress={restoreStrip}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [styles.restoreButton, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
          >
            <Text style={[styles.restoreButtonText, { color: colors.text0 }]}>Вернуть</Text>
          </Pressable>
        </View>
      ) : null}
      {feed.loadError && feed.posts ? <InlineError message={feed.loadError} /> : null}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={blogHeaderOptions(colors, 'Блог-лента')} />
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
          ListHeaderComponent={header}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.text1, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
              Здесь пока пусто. Напишите первый пост — его увидят все.
            </Text>
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
          // Карточки высокие (картинка во всю ширину) — меньше окно, меньше памяти.
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
  lead: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  write: { minHeight: hitTarget, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  writeText: { fontFamily: fonts.bodyBold, fontSize: 15 },
  restore: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.sm, paddingLeft: 14, paddingRight: 8, paddingVertical: 8 },
  restoreText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  restoreButton: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, justifyContent: 'center', overflow: 'hidden' },
  restoreButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  separator: { height: 12 },
  empty: {
    marginHorizontal: 16,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 32,
    overflow: 'hidden',
  },
});
