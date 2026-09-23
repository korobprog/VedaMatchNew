import { BLOG_HOME_PREVIEW_SIZE, type BlogPostDto } from '@vedamatch/shared';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import { useSession } from '@/lib/auth/session';
import { createBlogApi } from '@/lib/blog/blog-api';
import { applyBlogChange, subscribeBlogChanges } from '@/lib/blog/blog-changes';
import { blogRestLabel, blogTileTitle, shownContent } from '@/lib/blog/blog-feed-state';
import { readBlogHomeVisible, writeBlogHomeVisible } from '@/lib/blog/blog-home-visibility';
import { openBlogComposer, openBlogFeed, openBlogPost } from '@/lib/blog/blog-routes';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/** Ширина плитки: на 360 dp видно две целиком и край третьей — понятно, что листается. */
const TILE_WIDTH = 136;

const keyOf = (post: BlogPostDto) => post.id;

/**
 * Блог-лента на первом экране приложения (VED-334).
 *
 * На сайте лента — первое, что видно на главной (VED-238). Первый экран
 * приложения — «Чаты», поэтому начало ленты стоит здесь, полосой над
 * беседами, а не шестой вкладкой и не вместо чатов:
 *  - в нижнем меню только связь, и пять подписей уже на пределе ширины;
 *    шестая ужала бы их все ради одного раздела;
 *  - заменить «Чаты» лентой значит сделать мессенджер вторым в собственном
 *    приложении;
 *  - спрятать ленту только в «Сервисы» — ровно то, на что жалуется карточка:
 *    человек открывает приложение и не видит, чем живёт портал.
 *
 * Вид — по чек-листу заказчика для главной: «картинка, заголовок. Всё».
 * Нажатие на плитку открывает ЭТОТ пост, «Вся лента» — всю ленту.
 *
 * Полосу можно убрать («Скрыть»), и тогда «Чаты» выглядят как до ленты —
 * ни заголовка, ни пустого места. Вернуть — кнопкой в самой ленте, как на
 * сайте. Сбой сервиса полосу молча убирает: упавшая лента не должна мешать
 * переписке, ради которой открыты «Чаты».
 */
export function BlogHomeStrip() {
  const { colors } = useTheme();
  const { api, user } = useSession();
  const blogApi = useMemo(() => createBlogApi(api), [api]);
  const [visible, setVisible] = useState<boolean | null>(null);
  const [posts, setPosts] = useState<BlogPostDto[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);
  const userId = user?.id ?? null;

  // На каждом возврате на «Чаты»: ленту могли вернуть с её экрана, а посты
  // за это время — опубликовать.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let alive = true;
      void readBlogHomeVisible(userId).then(async (shown) => {
        if (!alive) return;
        setVisible(shown);
        if (!shown) return;
        try {
          const home = await blogApi.home();
          if (!alive) return;
          setPosts(home.posts);
          setTotal(home.total);
          setFailed(false);
        } catch {
          if (alive) setFailed(true);
        }
      });
      return () => {
        alive = false;
      };
    }, [blogApi, userId]),
  );

  useEffect(
    () =>
      subscribeBlogChanges((change) => {
        // Полоса — начало ленты, а не вся: не больше, чем отдаёт `/blog/home`.
        setPosts((current) => (current ? applyBlogChange(current, change).slice(0, BLOG_HOME_PREVIEW_SIZE) : current));
        if (change.kind === 'removed') setTotal((value) => Math.max(0, value - 1));
        else setTotal((value) => value + 1);
      }),
    [],
  );

  const hide = useCallback(() => {
    if (!userId) return;
    setVisible(false);
    void writeBlogHomeVisible(userId, false).catch(() => setVisible(true));
  }, [userId]);

  const renderItem = useCallback<ListRenderItem<BlogPostDto>>(({ item }) => <BlogTile post={item} />, []);

  if (visible !== true || failed) return null;

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
          Блог-лента
        </Text>
        <HeadButton label="Написать" hint="Открывает форму нового поста" onPress={openBlogComposer} />
        <HeadButton label="Скрыть" hint="Убирает ленту из «Чатов». Вернуть её можно на экране ленты" onPress={hide} />
      </View>

      {posts === null ? (
        <View style={styles.tiles} accessible accessibilityRole="progressbar" accessibilityLabel="Загружаем ленту">
          {[0, 1, 2].map((key) => (
            <View key={key} style={[styles.tileSkeleton, { backgroundColor: colors.bg2 }]} />
          ))}
        </View>
      ) : posts.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={openBlogComposer}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.empty, { borderColor: colors.glassBorder, backgroundColor: colors.glass }, pressedStyle(pressed)]}
        >
          {/* Полоса — только текущая лента (`/blog/home`). Пустая она не
              значит «постов нет»: срок в ленте вышел, а архив остаётся за
              «Вся лента» ниже. Живая проверка на A51 поймала первую
              подпись «В ленте пока пусто» при непустом архиве. */}
          <Text style={[styles.emptyText, { color: colors.text1 }]}>
            Свежих постов сейчас нет. Напишите свой — его увидят все.
          </Text>
        </Pressable>
      ) : (
        <FlatList
          horizontal
          data={posts}
          keyExtractor={keyOf}
          renderItem={renderItem}
          showsHorizontalScrollIndicator={false}
          // Плитки уходят под край экрана, а не обрезаются отступом шапки:
          // так видно, что ряд листается.
          style={styles.bleed}
          contentContainerStyle={[styles.tiles, styles.bleedContent]}
        />
      )}

      {posts ? (
        <Pressable
          accessibilityRole="link"
          onPress={openBlogFeed}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.all, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
        >
          <Text style={[styles.allText, { color: colors.text0 }]}>{blogRestLabel(total, posts.length)}</Text>
          <Text style={[styles.allArrow, { color: colors.text1 }]}>›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function BlogTile({ post }: { post: BlogPostDto }) {
  const { colors } = useTheme();
  const shown = shownContent(post);
  const cover = shown.images[0];
  const title = blogTileTitle(post);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}. ${post.author.name}. Открыть пост`}
      onPress={() => openBlogPost(post.id)}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.tile, { borderColor: colors.glassBorder, backgroundColor: colors.glass }, pressedStyle(pressed)]}
    >
      {cover ? (
        <Image
          source={{ uri: cover.url }}
          style={[styles.cover, { backgroundColor: colors.bg2 }]}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={cover.url}
        />
      ) : (
        // Пост без картинки: начало текста на месте обложки — плитки в ряд
        // одной высоты, и видно, что это слова, а не пустая рамка.
        <View style={[styles.cover, styles.textCover, { backgroundColor: colors.bg2 }]}>
          <Text numberOfLines={5} style={[styles.coverText, { color: colors.text0 }]}>
            {shown.text.trim() || title}
          </Text>
        </View>
      )}
      <Text numberOfLines={2} style={[styles.tileTitle, { color: colors.text0 }]}>
        {title}
      </Text>
    </Pressable>
  );
}

function HeadButton({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={hint}
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.headButton, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
    >
      <Text style={[styles.headButtonText, { color: colors.text0 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8, marginTop: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontFamily: fonts.displayMedium, fontSize: 15 },
  headButton: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  tiles: { flexDirection: 'row', gap: 10 },
  // Отступ шапки «Чатов» — 20: столько же забираем и возвращаем внутри ряда.
  bleed: { marginHorizontal: -20 },
  bleedContent: { paddingHorizontal: 20 },
  tile: { width: TILE_WIDTH, borderWidth: 1, borderRadius: radius.sm, overflow: 'hidden' },
  tileSkeleton: { width: TILE_WIDTH, height: TILE_WIDTH + 48, borderRadius: radius.sm },
  cover: { width: '100%', aspectRatio: 1 },
  textCover: { padding: 10, justifyContent: 'center' },
  coverText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  tileTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 18, minHeight: 44, paddingHorizontal: 8, paddingVertical: 4 },
  empty: { borderWidth: 1, borderRadius: radius.sm, padding: 16, minHeight: hitTarget, overflow: 'hidden' },
  emptyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  all: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  allText: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  allArrow: { fontFamily: fonts.bodyBold, fontSize: 20 },
});
