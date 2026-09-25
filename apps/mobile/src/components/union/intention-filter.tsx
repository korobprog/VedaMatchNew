import type { UnionIntentionCounts, UnionIntentionType } from '@vedamatch/shared';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { INTENTION_LABELS, INTENTION_TYPES } from '@/lib/union/union-labels';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget } from '@/theme/tokens';

/**
 * Фильтр по целям — главный фильтр выдачи на сайте (`recommendation-filters.tsx`,
 * пилюли над сеткой). Цели через ИЛИ: анкета проходит, если несёт хотя бы
 * одну выбранную. Рядом с целью — сколько людей нашлось бы с ней при тех же
 * остальных условиях: выбирать вслепую, чтобы получить пустой экран, обидно.
 */
export function IntentionFilter({
  selected,
  counts,
  onChange,
}: {
  selected: readonly UnionIntentionType[];
  counts: UnionIntentionCounts | null;
  onChange(next: UnionIntentionType[]): void;
}) {
  const { colors } = useTheme();
  const chip = (key: string, label: string, active: boolean, count: number | undefined, onPress: () => void) => (
    <Pressable
      key={key}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      accessibilityLabel={count !== undefined ? `${label}, анкет: ${count}` : label}
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [
        styles.chip,
        active
          ? { borderColor: colors.magenta, backgroundColor: colors.bg2 }
          : { borderColor: colors.glassBorder, backgroundColor: colors.glass },
        pressedStyle(pressed),
      ]}
    >
      <Text style={[styles.chipText, { color: active ? colors.text0 : colors.text1 }]}>
        {label}
        {count !== undefined ? ` · ${count}` : ''}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chip('all', 'Все цели', selected.length === 0, counts?.all, () => onChange([]))}
      {INTENTION_TYPES.map((type) =>
        chip(type, INTENTION_LABELS[type], selected.includes(type), counts?.[type], () =>
          onChange(selected.includes(type) ? selected.filter((item) => item !== type) : [...selected, type]),
        ),
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  chip: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
});
