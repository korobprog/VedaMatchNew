import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Keyboard, Pressable, RefreshControl, StyleSheet, Text, TextInput, View, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatKeyboardAvoidingView } from '@/components/keyboard-controller-web';
import { MediaChips, type MediaChip } from '@/components/media/media-chips';
import {
  MediaAudiobookRow,
  MediaListFooter,
  MediaListSkeleton,
  MediaLoadFailed,
  mediaHeaderOptions,
} from '@/components/media/media-list-parts';
import { MediaTrackRow } from '@/components/media/media-track-row';
import { MiniPlayer } from '@/components/media/mini-player';
import { ClearGlyph, SearchGlyph } from '@/components/search/search-icons';
import { useSession } from '@/lib/auth/session';
import { createMediaApi } from '@/lib/media/media-api';
import { describeMediaError } from '@/lib/media/media-errors';
import type { MediaAudiobook, MediaCategory, MediaTrack } from '@/lib/media/media-parse';
import { useMediaPlayer } from '@/lib/media/media-player-context';
import { DEFAULT_MEDIA_FILTER, MEDIA_SEARCH_MAX_LENGTH, MEDIA_SORTS, type MediaSort } from '@/lib/media/media-query';
import { filterBooks, mediaSections, rootSlugOf, styleChips, type MediaSectionKey } from '@/lib/media/media-sections';
import { playbackOf } from '@/lib/media/player-state';
import { useMediaTracks } from '@/lib/media/use-media-tracks';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/** Пауза после последней буквы, прежде чем искать: не запрос на каждую букву. */
const SEARCH_DEBOUNCE_MS = 350;
const ALL_STYLES = '__all__';

/**
 * Медиатека в приложении (VED-331, этап 1): музыка, киртаны, лекции и
 * аудиокниги — те же записи и те же разделы, что на сайте (`/music`):
 * вкладки «Всё / Традиционное / Современное / Аудиокниги», ряд стилей,
 * порядок и поиск по названию и исполнителю.
 *
 * Запись играет в приложении, а не в браузере: в фоне, с погашенным
 * экраном, с экрана блокировки и кнопок наушников. Нажатие на строку
 * включает запись, мини-плеер снизу раскрывает полноэкранный плеер.
 * Очередь и плейлисты — этап 2, скачивание — этап 3.
 */
export default function MediaLibraryScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const mediaApi = useMemo(() => createMediaApi(api), [api]);
  const player = useMediaPlayer();

  const [section, setSection] = useState<MediaSectionKey>('all');
  const [style, setStyle] = useState<string>(ALL_STYLES);
  const [sort, setSort] = useState<MediaSort>(DEFAULT_MEDIA_FILTER.sort);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<MediaCategory[]>([]);
  const [books, setBooks] = useState<MediaAudiobook[] | null>(null);
  const [booksError, setBooksError] = useState<string | null>(null);

  const root = rootSlugOf(section);
  const audiobooksMode = section === 'audiobooks';

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  // Разделы и стили — из витрины. Под корневой вкладкой счётчики стилей
  // обещают ровно то, что откроется (сервер считает их в срезе вкладки).
  useEffect(() => {
    let alive = true;
    mediaApi
      .catalog(root)
      .then((catalog) => {
        if (alive) setCategories(catalog.categories);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [mediaApi, root]);

  const loadBooks = useCallback(() => {
    setBooksError(null);
    mediaApi
      .audiobooks()
      .then(setBooks)
      .catch((error: unknown) => {
        setBooks((current) => current ?? []);
        setBooksError(describeMediaError(error, 'Не удалось загрузить аудиокниги.'));
      });
  }, [mediaApi]);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const filter = useMemo(
    () => ({ root, category: style === ALL_STYLES ? null : style, query, sort }),
    [query, root, sort, style],
  );
  const list = useMediaTracks(mediaApi, filter, !audiobooksMode);

  // Книг немного (редакционный раздел), поэтому ищем по ним на телефоне —
  // по названию, автору и чтецу; записи ищет сервер.
  const visibleBooks = filterBooks(books ?? [], query);
  const sections = mediaSections(categories, (books?.length ?? 0) > 0);
  const styleList = styleChips(categories);
  const styleOptions: MediaChip<string>[] = [
    { value: ALL_STYLES, label: 'Все стили' },
    ...styleList.map((category) => ({ value: category.slug, label: category.title, count: category.trackCount })),
  ];

  const onSection = (next: MediaSectionKey) => {
    setSection(next);
    // Стиль из другой вкладки там может быть пуст — сбрасываем.
    setStyle(ALL_STYLES);
  };

  const onTrack = useCallback(
    (track: MediaTrack) => {
      Keyboard.dismiss();
      // Этап 1: очередь из одной записи. Этап 2 передаст сюда весь список.
      void player?.playQueue([track], 0);
    },
    [player],
  );

  const state = player?.state;
  const renderTrack = useCallback<ListRenderItem<MediaTrack>>(
    ({ item }) => (
      <MediaTrackRow track={item} playback={state ? playbackOf(state, item.id) : 'none'} onPress={onTrack} />
    ),
    [onTrack, state],
  );
  const renderBook = useCallback<ListRenderItem<MediaAudiobook>>(
    ({ item }) => (
      <MediaAudiobookRow
        book={item}
        onPress={(book) => router.push({ pathname: '/music/audiobooks/[slug]', params: { slug: book.slug } })}
      />
    ),
    [],
  );

  const typed = input.trim().length > 0;
  const header = (
    <View style={styles.header}>
      <View style={[styles.field, { backgroundColor: colors.bg1, borderColor: typed ? colors.magenta : colors.glassBorder }]}>
        <SearchGlyph color={colors.text1} />
        <TextInput
          value={input}
          onChangeText={setInput}
          autoCorrect={false}
          maxLength={MEDIA_SEARCH_MAX_LENGTH}
          returnKeyType="search"
          onSubmitEditing={() => {
            setQuery(input);
            Keyboard.dismiss();
          }}
          placeholder="Название или исполнитель"
          placeholderTextColor={colors.text1}
          accessibilityLabel="Поиск по Медиатеке"
          style={[styles.input, { color: colors.text0 }]}
        />
        {typed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Очистить поиск"
            onPress={() => {
              setInput('');
              setQuery('');
            }}
            android_ripple={ripple(colors.glassBorder, true)}
            style={({ pressed }) => [styles.clear, pressedStyle(pressed)]}
          >
            <ClearGlyph color={colors.text1} />
          </Pressable>
        ) : null}
      </View>
      <MediaChips<MediaSectionKey>
        label="Раздел"
        chips={sections.map((item) => ({ value: item.key, label: item.label, count: item.count }))}
        value={section}
        onChange={onSection}
      />
      {!audiobooksMode && styleList.length > 0 ? (
        <MediaChips label="Стиль" chips={styleOptions} value={style} onChange={setStyle} />
      ) : null}
      {!audiobooksMode ? (
        <MediaChips<MediaSort>
          label="Порядок"
          chips={MEDIA_SORTS.map((item) => ({ value: item.value, label: item.label }))}
          value={sort}
          onChange={setSort}
        />
      ) : null}
    </View>
  );

  const bottomPad = { paddingBottom: (player?.state.status === 'idle' ? insets.bottom : 0) + 16 };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={mediaHeaderOptions(colors, 'Медиатека')} />
      <ChatKeyboardAvoidingView behavior="padding" style={styles.root}>
        {audiobooksMode ? (
          <FlatList
            data={visibleBooks}
            keyExtractor={(book) => book.id}
            renderItem={renderBook}
            ListHeaderComponent={header}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={
              books === null ? (
                <MediaListSkeleton label="Загружаем аудиокниги" />
              ) : booksError ? (
                <MediaLoadFailed message={booksError} onRetry={loadBooks} />
              ) : (
                <Text style={[styles.empty, { color: colors.text1 }]}>
                  {query.trim() ? `Книги «${query.trim()}» не нашлось.` : 'Аудиокниг пока нет.'}
                </Text>
              )
            }
            contentContainerStyle={bottomPad}
          />
        ) : (
          <FlatList
            data={list.tracks ?? []}
            keyExtractor={(track) => track.id}
            renderItem={renderTrack}
            extraData={state}
            ListHeaderComponent={header}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={
              list.tracks === null ? (
                list.loadError ? (
                  <MediaLoadFailed message={list.loadError} onRetry={list.retry} />
                ) : (
                  <MediaListSkeleton />
                )
              ) : (
                <View style={styles.emptyBox}>
                  <Text style={[styles.empty, { color: colors.text1 }]}>
                    {query.trim() ? `По запросу «${query.trim()}» ничего не нашлось.` : 'В этом разделе пока нет записей.'}
                  </Text>
                  {query.trim() || style !== ALL_STYLES ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setInput('');
                        setQuery('');
                        setStyle(ALL_STYLES);
                      }}
                      android_ripple={ripple(colors.glassBorder)}
                      style={({ pressed }) => [styles.reset, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
                    >
                      <Text style={[styles.resetText, { color: colors.text0 }]}>Сбросить поиск и стиль</Text>
                    </Pressable>
                  ) : null}
                </View>
              )
            }
            ListFooterComponent={
              list.tracks ? (
                <MediaListFooter
                  hasMore={list.hasMore}
                  loadingMore={list.loadingMore}
                  moreError={list.moreError}
                  onRetry={() => void list.loadMore()}
                  count={list.tracks.length}
                />
              ) : null
            }
            onEndReached={() => void list.loadMore()}
            onEndReachedThreshold={0.6}
            refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} colors={[colors.magenta]} />}
            contentContainerStyle={bottomPad}
          />
        )}
        <View style={{ paddingBottom: player?.state.status === 'idle' ? 0 : insets.bottom }}>
          <MiniPlayer />
        </View>
      </ChatKeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingTop: 8, paddingBottom: 8, gap: 10 },
  field: {
    marginHorizontal: 16,
    minHeight: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingLeft: 12,
  },
  input: { flex: 1, minHeight: hitTarget, fontFamily: fonts.body, fontSize: 15, paddingVertical: 8 },
  clear: { width: hitTarget, height: hitTarget, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  emptyBox: { alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 40 },
  empty: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center', paddingHorizontal: 24, paddingVertical: 8 },
  reset: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  resetText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
