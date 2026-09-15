import { Pressable, StyleSheet, Text } from 'react-native';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Кнопка «Повторить» для состояния ошибки списка/экрана. Была скопирована
 * по месту в трёх экранах «Люди» (раунд оценки 004, дефект 12) — теперь
 * один компонент на всё приложение.
 */
export function RetryButton({ onPress }: { onPress(): void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.retry, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
    >
      <Text style={[styles.retryText, { color: colors.text0 }]}>Повторить</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  retry: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 20, justifyContent: 'center', overflow: 'hidden' },
  retryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
