import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { RetryButton } from '@/components/retry-button';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import type { Palette } from '@/theme/tokens';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Общие куски экранов Знакомств: шапка, «не загрузилось», «пусто»,
 * скелетон. Свои, а не блога: компоненты чужого сервиса не импортируются,
 * общее дублируется (правило контракта сервисов, CLAUDE.md).
 */

/** Шапка экрана в корневом стеке — как у «Блог-ленты» и «Уведомлений». */
export function unionHeaderOptions(colors: Palette, title: string, shown = true) {
  return {
    headerShown: shown,
    title,
    headerStyle: { backgroundColor: colors.bg0 },
    headerTintColor: colors.text0,
    headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
    headerShadowVisible: false,
  } as const;
}

/** Первая загрузка упала — текст и «Повторить» по центру. */
export function UnionLoadFailed({ message, onRetry, busy = false }: { message: string; onRetry(): void; busy?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <Text accessibilityRole="alert" style={[styles.message, { color: colors.text1 }]}>
        {message}
      </Text>
      <RetryButton onPress={onRetry} busy={busy} />
    </View>
  );
}

/** Крутилка по центру — для экранов, где форма содержимого заранее неизвестна. */
export function UnionLoading({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.magenta} accessibilityLabel={label} />
    </View>
  );
}

/** Пустой список — объяснение на стекле, а не голый экран. */
export function UnionEmpty({ text, children }: { text: string; children?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
      <Text style={[styles.emptyText, { color: colors.text1 }]}>{text}</Text>
      {children}
    </View>
  );
}

/** Скелетон сетки: квадраты плиток, без мерцания — ожидание не должно спорить с «уменьшить движение». */
export function UnionGridSkeleton({ size, columns }: { size: number; columns: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Загружаем анкеты"
      style={[styles.grid, { paddingHorizontal: 16 }]}
    >
      {Array.from({ length: columns * 3 }, (_, index) => (
        <View key={index} style={{ width: size, height: size, borderRadius: 16, backgroundColor: colors.bg2 }} />
      ))}
    </View>
  );
}

/**
 * Кнопка действия Знакомств: `primary` — заливка акцентом (главное действие
 * экрана), `secondary` — обводка. Занятая — крутилка вместо подписи и
 * повторное нажатие заблокировано.
 */
export function UnionButton({
  label,
  onPress,
  kind = 'primary',
  busy = false,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  grow = false,
}: {
  label: string;
  onPress(): void;
  kind?: 'primary' | 'secondary';
  busy?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Растянуться в ряду поровну с соседями. */
  grow?: boolean;
}) {
  const { colors } = useTheme();
  const primary = kind === 'primary';
  const off = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy, disabled: off }}
      disabled={off}
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [
        styles.button,
        grow && styles.grow,
        primary
          ? { backgroundColor: colors.magenta, borderColor: colors.magenta }
          : { backgroundColor: colors.glass, borderColor: colors.glassBorder },
        off ? styles.off : pressedStyle(pressed),
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.onAccent : colors.text0} />
      ) : (
        <Text style={[styles.buttonText, { color: primary ? colors.onAccent : colors.text0 }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  grow: { flex: 1 },
  buttonText: { fontFamily: fonts.bodyBold, fontSize: 14, textAlign: 'center' },
  off: { opacity: 0.6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 32 },
  message: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  empty: { borderWidth: 1, borderRadius: radius.md, padding: 20, gap: 12, marginHorizontal: 16 },
  emptyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
