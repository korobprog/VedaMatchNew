import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget } from '@/theme/tokens';

export interface MediaChip<T extends string> {
  value: T;
  label: string;
  /** Число рядом с подписью — «Традиционное 124», как на сайте. */
  count?: number | null;
}

/**
 * Горизонтальный ряд взаимоисключающих чипов Медиатеки (VED-331): разделы,
 * стили, порядок. Прокручивается, а не переносится: вкладки сайта тоже
 * едут вбок, а три ряда переносов съели бы полэкрана над списком.
 * Для скринридера — радиогруппа с подписью, выбранный чип — `selected`.
 */
export function MediaChips<T extends string>({
  label,
  chips,
  value,
  onChange,
}: {
  label: string;
  chips: readonly MediaChip<T>[];
  value: T;
  onChange(value: T): void;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {chips.map((chip) => {
        const selected = chip.value === value;
        return (
          <Pressable
            key={chip.value}
            accessibilityRole="radio"
            accessibilityLabel={chip.count ? `${chip.label}, ${chip.count}` : chip.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(chip.value)}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.chip,
              selected
                ? { borderColor: colors.magenta, backgroundColor: colors.bg2 }
                : { borderColor: colors.glassBorder, backgroundColor: colors.glass },
              pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.text, { color: selected ? colors.text0 : colors.text1 }]}>
              {chip.label}
              {chip.count ? <Text style={[styles.count, { color: colors.text1 }]}>{`  ${chip.count}`}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16 },
  chip: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  count: { fontFamily: fonts.mono, fontSize: 12 },
});
