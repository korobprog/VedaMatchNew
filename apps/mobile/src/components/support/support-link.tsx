import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { SupportOrigin } from '@/lib/support/device-report';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * «Написать в поддержку» прямо в состоянии ошибки (VED-336).
 *
 * Ставится рядом с «Повторить» там, где экран не смог сделать своё дело:
 * человек жалуется оттуда, где сломалось, а форма уже знает, какой это
 * экран, и подставляет тему — ему остаётся рассказать, что он делал.
 *
 * Вторая, тихая кнопка рядом с «Повторить»: повтор чаще помогает, и главным
 * действием остаётся он.
 */
export function SupportLink({ from }: { from: SupportOrigin }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Откроется форма обращения, экран и версия приложения подставятся сами"
      onPress={() => router.push({ pathname: '/support/new', params: { from } })}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.link, pressedStyle(pressed)]}
    >
      <Text style={[styles.text, { color: colors.text1 }]}>Написать в поддержку</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    minHeight: hitTarget,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  text: { fontFamily: fonts.bodySemiBold, fontSize: 14, textDecorationLine: 'underline' },
});
