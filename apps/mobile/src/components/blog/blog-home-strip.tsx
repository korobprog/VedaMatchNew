import { BLOG_HOME_PREVIEW_SIZE, type BlogPostDto } from '@vedamatch/shared';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSession } from '@/lib/auth/session';
import { createBlogApi } from '@/lib/blog/blog-api';
import { applyBlogChange, subscribeBlogChanges } from '@/lib/blog/blog-changes';
import { blogRestLabel } from '@/lib/blog/blog-feed-state';
import { blogHomeTile, blogHomeTileLabel } from '@/lib/blog/blog-home-tile';
import { openBlogComposer, openBlogFeed, openBlogPost } from '@/lib/blog/blog-routes';
import { homeSectionsStore } from '@/lib/home/home-sections-store';
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
 * Показывать ли полосу, решает не она, а галочка «Блог-лента» в
 * «Настройках» (`lib/home/home-sections.ts`): по умолчанию выключена, и
 * «Чаты» выглядят как до ленты — ни заголовка, ни пустого места. Кнопка
 * «Скрыть» здесь снимает ту же галочку, «Вернуть» на экране ленты — ставит;
 * отдельного флага у полосы нет. Сбой сервиса полосу молча убирает: упавшая
 * лента не должна мешать переписке, ради которой открыты «Чаты».
 */
export function BlogHomeStrip() {
  const { colors } = useTheme();
  const { api, user } = useSession();
  const blogApi = useMemo(() => createBlogApi(api), [api]);
  const [posts, setPosts] = useState<BlogPostDto[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);
  const userId = user?.id ?? null;

  // На каждом возврате на «Чаты»: посты за это время могли опубликовать.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let alive = true;
      void blogApi
        .home()
        .then((home) => {
          if (!alive) return;
          setPosts(home.posts);
          setTotal(home.total);
          setFailed(false);
        })
        .catch(() => {
          if (alive) setFailed(true);
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

  // Та же галочка, что в «Настройках»: полоса исчезает, как только она снята.
  const hide = useCallback(() => void homeSectionsStore.set('blog', false), []);

  const renderItem = useCallback<ListRenderItem<BlogPostDto>>(({ item }) => <BlogTile post={item} />, []);

  if (failed) return null;

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
          Блог-лента
        </Text>
        <HeadButton label="Написать" hint="Открывает форму нового поста" onPress={openBlogComposer} />
        <HeadButton label="Скрыть" hint="Убирает ленту из «Чатов». Вернуть её можно в «Настройках» во вкладке «Сервисы» или на экране ленты" onPress={hide} />
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
  // Обложка и подпись — по правилам виджета главной сайта (`blog-home-tile.ts`):
  // у ролика — его обложка, у материала из Образования — обложка материала.
  const tile = blogHomeTile(post);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={blogHomeTileLabel(tile, post.author.name)}
      onPress={() => openBlogPost(post.id)}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.tile, { borderColor: colors.glassBorder, backgroundColor: colors.glass }, pressedStyle(pressed)]}
    >
      {tile.coverUrl ? (
        <View>
          <Image
            source={{ uri: tile.coverUrl }}
            style={[styles.cover, { backgroundColor: colors.bg2 }]}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={tile.coverUrl}
          />
          {tile.isVideo ? <VideoMark /> : null}
        </View>
      ) : (
        // Пост без картинки: слова на месте обложки — плитки в ряд одной
        // высоты, и видно, что это слова, а не пустая рамка.
        <View style={[styles.cover, styles.textCover, { backgroundColor: colors.bg2 }]}>
          <Text numberOfLines={5} style={[styles.coverText, { color: colors.text0 }]}>
            {tile.frameText}
          </Text>
        </View>
      )}
      {tile.title ? (
        <Text numberOfLines={2} style={[styles.tileTitle, { color: colors.text0 }]}>
          {tile.title}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Отметка ролика поверх обложки — кружок с треугольником, как `VideoMark`
 * на сайте. Декоративная: слово «ролик» уже в подписи плитки для скринридера.
 */
function VideoMark() {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.videoMarkLayer}
    >
      <View style={[styles.videoMark, { backgroundColor: colors.bg0 }]}>
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill={colors.text0} />
        </Svg>
      </View>
    </View>
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
  videoMarkLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  // Подложка — непрозрачный фон темы (у сайта `bg-bg-0/85`): значок цвета
  // текста на ней читается на любой обложке, светлой или тёмной.
  videoMark: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
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
