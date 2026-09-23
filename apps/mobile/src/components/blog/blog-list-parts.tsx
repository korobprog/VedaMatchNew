import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { InlineError } from '@/components/inline-error';
import { RetryButton } from '@/components/retry-button';
import type { Palette } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';
import { fonts, radius } from '@/theme/tokens';

/**
 * Шапка экрана сервиса в корневом стеке — как у «Уведомлений»: системная
 * стрелка «назад», заголовок полужирным Manrope, без тени.
 */
export function blogHeaderOptions(colors: Palette, title: string) {
  return {
    headerShown: true,
    title,
    headerStyle: { backgroundColor: colors.bg0 },
    headerTintColor: colors.text0,
    headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
    headerShadowVisible: false,
  } as const;
}

/**
 * Подвал ленты: подгрузка, её ошибка с «Повторить» и честный конец списка.
 * Конец подписан словами — иначе остановившаяся лента выглядит зависшей.
 */
export function BlogListFooter({
  hasMore,
  loadingMore,
  moreError,
  onRetry,
  count,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  moreError: string | null;
  onRetry: () => void;
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
        <ActivityIndicator color={colors.magenta} accessibilityLabel="Загружаем ещё посты" />
      </View>
    );
  }
  if (count === 0) return null;
  return (
    <View style={styles.footer}>
      <Text style={[styles.end, { color: colors.text1 }]}>Это все посты.</Text>
    </View>
  );
}

/** Первая загрузка упала: ни одного поста нет — ошибка и «Повторить» по центру. */
export function BlogLoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <Text accessibilityRole="alert" style={[styles.message, { color: colors.text1 }]}>
        {message}
      </Text>
      <RetryButton onPress={onRetry} />
    </View>
  );
}

/** Скелетон ленты: форма карточки — рамка картинки и две строки. */
export function BlogFeedSkeleton() {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Загружаем ленту" style={styles.skeleton}>
      {[0, 1].map((key) => (
        <View key={key} style={[styles.skeletonCard, { borderColor: colors.glassBorder }]}>
          <View style={[styles.skeletonImage, { backgroundColor: colors.bg2 }]} />
          <View style={[styles.skeletonLine, { width: '70%', backgroundColor: colors.bg2 }]} />
          <View style={[styles.skeletonLine, { width: '45%', backgroundColor: colors.bg2 }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { paddingHorizontal: 16, paddingVertical: 20, gap: 10, alignItems: 'center' },
  end: { fontFamily: fonts.body, fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  message: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  skeleton: { gap: 12, paddingTop: 12 },
  skeletonCard: { borderTopWidth: 1, borderBottomWidth: 1, paddingBottom: 16, gap: 10 },
  skeletonImage: { width: '100%', aspectRatio: 1 },
  skeletonLine: { height: 14, borderRadius: radius.sm / 2, marginHorizontal: 16 },
});
