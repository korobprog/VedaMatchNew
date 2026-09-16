import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

interface Props {
  onPress(): void;
  /**
   * Повтор уже отправлен — крутилка вместо текста, повторный тап
   * заблокирован. По умолчанию `false`: старые вызовы без этого пропа
   * («Общины», «Люди») ведут себя как раньше (раунд оценки 007, дефект 8 у
   * «Сервисов»: нажатие «Повторить» не давало никакого отклика).
   */
  busy?: boolean;
}

/**
 * Кнопка «Повторить» для состояния ошибки списка/экрана. Была скопирована
 * по месту в трёх экранах «Люди» (раунд оценки 004, дефект 12) — теперь
 * один компонент на всё приложение.
 */
export function RetryButton({ onPress, busy = false }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.retry, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
    >
      {busy ? (
        <ActivityIndicator color={colors.text0} />
      ) : (
        <Text style={[styles.retryText, { color: colors.text0 }]}>Повторить</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  retry: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 20, justifyContent: 'center', overflow: 'hidden' },
  retryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
