import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MediaCover } from '@/components/media/media-cover';
import { chapterWord, MediaListSkeleton, MediaLoadFailed, mediaHeaderOptions } from '@/components/media/media-list-parts';
import { MediaTrackRow } from '@/components/media/media-track-row';
import { MiniPlayer } from '@/components/media/mini-player';
import { useSession } from '@/lib/auth/session';
import { createMediaApi } from '@/lib/media/media-api';
import { describeMediaError } from '@/lib/media/media-errors';
import type { MediaAudiobookPage, MediaTrack } from '@/lib/media/media-parse';
import { useMediaPlayer } from '@/lib/media/media-player-context';
import { playbackOf } from '@/lib/media/player-state';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

/**
 * Аудиокнига в Медиатеке (VED-331): обложка, автор и чтец, главы по
 * порядку. Глава включается нажатием, как запись в общем списке. Переход к
 * следующей главе сам собой и «продолжить с места» — этап 2 (очередь):
 * здесь очередь из одной главы.
 */
export default function MediaAudiobookScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { api } = useSession();
  const mediaApi = useMemo(() => createMediaApi(api), [api]);
  const player = useMediaPlayer();
  const [page, setPage] = useState<MediaAudiobookPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setPage(null);
    mediaApi
      .audiobook(String(slug ?? ''))
      .then((result) => {
        if (result) setPage(result);
        else setError('Книга не найдена — возможно, её сняли с публикации.');
      })
      .catch((reason: unknown) => setError(describeMediaError(reason, 'Не удалось загрузить книгу.')));
  }, [mediaApi, slug]);

  useEffect(() => {
    load();
  }, [load]);

  const onChapter = useCallback((track: MediaTrack) => void player?.playQueue([track], 0), [player]);
  const state = player?.state;
  const chapters = page?.chapters ?? [];
  const renderItem = useCallback<ListRenderItem<MediaTrack>>(
    ({ item, index }) => (
      <MediaTrackRow
        track={item}
        prefix={String(index + 1)}
        playback={state ? playbackOf(state, item.id) : 'none'}
        onPress={onChapter}
      />
    ),
    [onChapter, state],
  );

  const book = page?.book;
  const people = book ? [book.author, book.reader ? `читает ${book.reader}` : null].filter(Boolean).join(' · ') : '';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={mediaHeaderOptions(colors, book?.title ?? 'Аудиокнига')} />
      {!page ? (
        error ? (
          <MediaLoadFailed message={error} onRetry={load} />
        ) : (
          <MediaListSkeleton label="Загружаем книгу" />
        )
      ) : (
        <FlatList
          data={chapters}
          keyExtractor={(track) => track.id}
          renderItem={renderItem}
          extraData={state}
          ListHeaderComponent={
            <View style={styles.header}>
              <MediaCover uri={page.book.coverUrl} size={120} />
              <View style={styles.headerTexts}>
                <Text style={[styles.title, { color: colors.text0 }]} selectable>
                  {page.book.title}
                </Text>
                {people ? <Text style={[styles.meta, { color: colors.text1 }]}>{people}</Text> : null}
                <Text style={[styles.meta, { color: colors.text1 }]}>
                  {chapters.length} {chapterWord(chapters.length)}
                </Text>
              </View>
              {page.book.description ? (
                <Text style={[styles.description, { color: colors.text1 }]} selectable>
                  {page.book.description}
                </Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.text1 }]}>Глав пока нет — их ещё не опубликовали.</Text>
          }
          contentContainerStyle={{ paddingBottom: 16 }}
        />
      )}
      <View style={{ paddingBottom: player?.state.status === 'idle' ? 0 : insets.bottom }}>
        <MiniPlayer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 12, flexDirection: 'row', flexWrap: 'wrap' },
  headerTexts: { flex: 1, minWidth: 160, gap: 4, justifyContent: 'center' },
  title: { fontFamily: fonts.displayMedium, fontSize: 18, lineHeight: 25 },
  meta: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  description: { width: '100%', fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  empty: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center', padding: 24 },
});
