import { Pressable, StyleSheet, Text, View } from 'react-native';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget } from '@/theme/tokens';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  /**
   * Пункт в списке есть, но выбрать его нельзя — как `disabled` у
   * `<option>` на сайте (община на проверке). Почему нельзя, объясняет
   * подпись рядом с набором, а не сам погашенный чип.
   */
  disabled?: boolean;
}

interface Props<T extends string> {
  /** Заголовок группы — читается скринридером как подпись к набору. */
  label: string;
  options: readonly ChipOption<T>[];
  value: T;
  onChange(value: T): void;
  disabled?: boolean;
}

/**
 * Набор взаимоисключающих кнопок-чипов: тип общины, порядок вступления,
 * «Группа / Канал». На сайте это `aria-pressed`-кнопки в форме общины и
 * tablist в форме беседы; на телефоне — радиогруппа: скринридер сразу
 * говорит «выбрано 2 из 8», а не перечисляет восемь отдельных кнопок.
 *
 * Зона нажатия чипа — не меньше `hitTarget`, даже когда подпись короткая.
 */
export function OptionChips<T extends string>({ label, options, value, onChange, disabled = false }: Props<T>) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text1 }]}>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
        {options.map((option) => {
          const selected = option.value === value;
          const off = disabled || option.disabled === true;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected, disabled: off }}
              disabled={off}
              onPress={() => onChange(option.value)}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [
                styles.chip,
                selected
                  ? { borderColor: colors.magenta, backgroundColor: colors.bg2 }
                  : { borderColor: colors.glassBorder, backgroundColor: colors.glass },
                off ? styles.disabled : pressedStyle(pressed),
              ]}
            >
              <Text style={[styles.chipText, { color: selected ? colors.text0 : colors.text1 }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  disabled: { opacity: 0.6 },
});
