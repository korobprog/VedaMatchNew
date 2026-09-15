import { StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/theme';
import { fonts, radius } from '@/theme/tokens';

/**
 * Текст ошибки действия рядом с самим действием (не общий баннер на весь
 * экран — раунд оценки 004, дефект 6). Обводка `magenta` даёт зрительный
 * акцент «это ошибка» без риска для контраста текста: рамка — декоративный
 * элемент (порог WCAG для неё — 3:1, не 4.5:1), а сам текст — `text0` на
 * `bg1`, уже проверенная пара в `contrast.spec.ts`.
 */
export function InlineError({ message }: { message: string }) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.text, { color: colors.text0, backgroundColor: colors.bg1, borderColor: colors.magenta }]}
    >
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    overflow: 'hidden',
  },
});
