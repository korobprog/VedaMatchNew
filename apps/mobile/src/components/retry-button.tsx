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
  /**
   * Надпись вместо «Повторить» для того же второстепенного действия
   * («Отмена», «Проверить ещё раз» в секции самообновления, VED-176) — чтобы
   * не копировать кнопку по месту ради другого текста.
   */
  label?: string;
}

/**
 * Кнопка «Повторить» для состояния ошибки списка/экрана. Была скопирована
 * по месту в трёх экранах «Люди» (раунд оценки 004, дефект 12) — теперь
 * один компонент на всё приложение.
 */
export function RetryButton({ onPress, busy = false, label = 'Повторить' }: Props) {
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
        <Text style={[styles.retryText, { color: colors.text0 }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  retry: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 20, justifyContent: 'center', overflow: 'hidden' },
  retryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
