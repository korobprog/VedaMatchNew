import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RetryButton } from '@/components/retry-button';
import { stalledCopy, type Connectivity } from '@/lib/startup/startup-decision';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

interface Props {
  connectivity: Connectivity;
  /** Повтор уже запущен — кнопка занята, повторный тап не нужен. */
  retrying: boolean;
  onRetry(): void;
}

/**
 * Экран «Нет соединения» на старте — вместо пустого белого экрана, когда
 * восстановление сессии затянулось дольше `STARTUP_STALL_MS`
 * (`startup-decision.ts`). Кнопка «Повторить» запускает восстановление
 * заново; когда сеть появляется, корневой стек повторяет сам.
 *
 * Без анимаций: при «уменьшить движение» двигаться здесь нечему. Крутилка
 * занятой кнопки — системный индикатор, он сам слушается системной
 * настройки анимаций Android.
 */
export function StartupOfflineScreen({ connectivity, retrying, onRetry }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const copy = stalledCopy(connectivity);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.bg0, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.body}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
          {copy.title}
        </Text>
        <Text accessibilityLiveRegion="polite" style={[styles.text, { color: colors.text1 }]}>
          {copy.body}
        </Text>
        <View style={styles.action}>
          <RetryButton onPress={onRetry} busy={retrying} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  body: { gap: 12, alignItems: 'flex-start' },
  title: { fontFamily: fonts.displayBold, fontSize: 22 },
  text: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  action: { marginTop: 8 },
});
