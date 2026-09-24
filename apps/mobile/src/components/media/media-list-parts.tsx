import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { InlineError } from '@/components/inline-error';
import { RetryButton } from '@/components/retry-button';
import type { MediaAudiobook } from '@/lib/media/media-parse';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import type { Palette } from '@/theme/tokens';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { MediaCover } from './media-cover';

/** Шапка экранов Медиатеки — как у остальных сервисов корневого стека. */
export function mediaHeaderOptions(colors: Palette, title: string) {
  return {
    headerShown: true,
    title,
    headerStyle: { backgroundColor: colors.bg0 },
    headerTintColor: colors.text0,
    headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
    headerShadowVisible: false,
  } as const;
}

/** Подвал списка: подгрузка, её ошибка с «Повторить» и честный конец. */
export function MediaListFooter({
  hasMore,
  loadingMore,
  moreError,
  onRetry,
  count,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  moreError: string | null;
  onRetry(): void;
  count: number;
}) {
  const { colors } = useTheme();
  if (moreError) {
    return (
      <View style={styles.footer}>
        <InlineError message={moreError} />
        <RetryButton onPress={onRetry} />
      </View>
    );
  }
  if (hasMore || loadingMore) {
    return (
      <View style={styles.footer}>
        <ActivityIndicator color={colors.magenta} accessibilityLabel="Загружаем ещё записи" />
      </View>
    );
  }
  if (count === 0) return null;
  return (
    <View style={styles.footer}>
      <Text style={[styles.end, { color: colors.text1 }]}>Это все записи.</Text>
    </View>
  );
}

/** Первая загрузка упала: ошибка и «Повторить» вместо списка. */
export function MediaLoadFailed({ message, onRetry }: { message: string; onRetry(): void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.failed}>
      <Text accessibilityRole="alert" style={[styles.message, { color: colors.text1 }]}>
        {message}
      </Text>
      <RetryButton onPress={onRetry} />
    </View>
  );
}

/** Скелетон строк списка — та же высота и обложка, что у настоящих строк. */
export function MediaListSkeleton({ label = 'Загружаем записи' }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={styles.skeleton}>
      {[0, 1, 2, 3, 4].map((key) => (
        <View key={key} style={styles.skeletonRow}>
          <View style={[styles.skeletonCover, { backgroundColor: colors.bg2 }]} />
          <View style={styles.skeletonTexts}>
            <View style={[styles.skeletonLine, { width: '70%', backgroundColor: colors.bg2 }]} />
            <View style={[styles.skeletonLine, { width: '40%', backgroundColor: colors.bg2 }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Строка аудиокниги: обложка, название, автор и чтец, число глав. */
export function MediaAudiobookRow({ book, onPress }: { book: MediaAudiobook; onPress(book: MediaAudiobook): void }) {
  const { colors } = useTheme();
  const people = [book.author, book.reader ? `читает ${book.reader}` : null].filter(Boolean).join(' · ');
  const chapters = `${book.chapterCount} ${chapterWord(book.chapterCount)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[book.title, people, chapters].filter(Boolean).join(', ')}
      accessibilityHint="Открывает главы книги"
      onPress={() => onPress(book)}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.bookRow, pressedStyle(pressed)]}
    >
      <MediaCover uri={book.coverUrl} size={56} />
      <View style={styles.bookTexts}>
        <Text numberOfLines={2} style={[styles.bookTitle, { color: colors.text0 }]}>
          {book.title}
        </Text>
        {people ? (
          <Text numberOfLines={1} style={[styles.bookMeta, { color: colors.text1 }]}>
            {people}
          </Text>
        ) : null}
        <Text style={[styles.bookMeta, { color: colors.text1 }]}>{chapters}</Text>
      </View>
    </Pressable>
  );
}

/** «1 глава», «3 главы», «5 глав». */
export function chapterWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'глава';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'главы';
  return 'глав';
}

const styles = StyleSheet.create({
  footer: { paddingHorizontal: 16, paddingVertical: 20, gap: 10, alignItems: 'center' },
  end: { fontFamily: fonts.body, fontSize: 13 },
  failed: { alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 48 },
  message: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  skeleton: { paddingTop: 8 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  skeletonCover: { width: 48, height: 48, borderRadius: radius.sm },
  skeletonTexts: { flex: 1, gap: 8 },
  skeletonLine: { height: 12, borderRadius: 6 },
  bookRow: {
    minHeight: hitTarget + 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  bookTexts: { flex: 1, gap: 2 },
  bookTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 20 },
  bookMeta: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
});
