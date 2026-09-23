import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Выход с экрана «Здоровья» пальцем, а не только системной кнопкой
 * (VED-335, третий заход).
 *
 * Системная «назад» у экранов сервиса работает, но у человека, который
 * стоит у полки с телефоном в одной руке, до неё ещё надо дотянуться — а на
 * экранах сервиса шапки нет вовсе (`headerShown: false` во всём приложении).
 * Дефект нашёл пользователь на подтверждении отправки карточки: уйти было
 * нечем, экран выглядел тупиком.
 *
 * Компонент, а не копия на каждом экране: выход одинаков везде, и это ровно
 * тот случай, когда вид переезжает в общий (правило дизайн-системы —
 * второй потребитель, а не третья копия).
 */
export function ScreenBack({ label = 'Назад' }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.back()}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [
        styles.back,
        { borderColor: colors.glassBorder },
        pressedStyle(pressed),
      ]}
    >
      <Text style={[styles.text, { color: colors.text0 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: {
    minHeight: hitTarget,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 20,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
