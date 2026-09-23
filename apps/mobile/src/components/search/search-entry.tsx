import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { SearchGlyph } from './search-icons';

/**
 * Вход в поиск по порталу (VED-337) — поле в шапке «Сервисов».
 *
 * Выглядит полем, а не значком: на сайте поиск был полем на главной, пока не
 * уехал в панель горячих кнопок, и искать его люди привыкли глазами по
 * рамке. Само поле живёт на своём экране (`app/search.tsx`): там клавиатура,
 * выдача на весь экран и «назад», а каталог сервисов не прыгает под пальцем.
 *
 * Почему «Сервисы»: поиск находит в основном то, что лежит за карточками
 * этой вкладки, — материалы Образования, Музыки, Рынка, — плюс людей и
 * общины. «Чаты» ищут по своей переписке и так.
 */
export function SearchEntry() {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel="Поиск по VedaMatch"
      accessibilityHint="Люди, общины, переписка и материалы сервисов"
      onPress={() => router.push('/search')}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [
        styles.field,
        { backgroundColor: colors.bg1, borderColor: colors.glassBorder },
        pressedStyle(pressed),
      ]}
    >
      <SearchGlyph color={colors.text1} />
      <Text numberOfLines={1} style={[styles.text, { color: colors.text1 }]}>
        Поиск по VedaMatch
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  text: { flex: 1, fontFamily: fonts.body, fontSize: 15 },
});
