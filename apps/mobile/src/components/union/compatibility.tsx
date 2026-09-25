import type { UnionCompatibility, UnionProfileDetails } from '@vedamatch/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { profileDetailRows } from '@/lib/union/union-dictionaries';
import { CRITERION_LABELS } from '@/lib/union/union-labels';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { dark, fonts, hitTarget, radius } from '@/theme/tokens';
import type { UnionTone } from './union-badges';

const RING_RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Процент совместимости кольцом — центр панели решений колоды. По нажатию
 * раскрывается разбор: проценту без объяснения верят ровно один раз.
 * Кольцо лежит на фото, поэтому палитра тёмная при любой теме телефона.
 */
export function CompatibilityRing({
  total,
  size = 60,
  expanded,
  onPress,
}: {
  total: number;
  size?: number;
  expanded: boolean;
  onPress(): void;
}) {
  const filled = (Math.min(100, Math.max(0, total)) / 100) * CIRCUMFERENCE;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Совместимость ${total}%. Показать, из чего она сложилась`}
      accessibilityState={{ expanded }}
      onPress={onPress}
      android_ripple={ripple(dark.glassBorder, true)}
      style={({ pressed }) => [styles.ring, { backgroundColor: dark.scrim, borderColor: dark.sheetBorder }, pressedStyle(pressed)]}
    >
      <Svg width={size} height={size} viewBox="0 0 64 64" style={StyleSheet.absoluteFill}>
        <Circle cx={32} cy={32} r={RING_RADIUS} fill="none" stroke={dark.glassBorder} strokeWidth={4} />
        <Circle
          cx={32}
          cy={32}
          r={RING_RADIUS}
          fill="none"
          stroke={dark.magenta}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
          // От двенадцати часов по часовой: круг, начатый справа, читается
          // как случайный обрезок дуги.
          transform="rotate(-90 32 32)"
        />
      </Svg>
      <Text style={[styles.ringText, { color: dark.text0 }]}>{`${total}%`}</Text>
    </Pressable>
  );
}

/**
 * Разбор процента: вклад каждого критерия полосой. Тон `overlay` — поверх
 * фото в колоде, `plain` — на экране анкеты.
 */
export function CompatibilityBreakdown({ compatibility, tone }: { compatibility: UnionCompatibility; tone: UnionTone }) {
  const { colors } = useTheme();
  const palette = tone === 'overlay' ? dark : colors;
  return (
    <View style={styles.breakdown}>
      {compatibility.breakdown.map((row) => (
        <View
          key={row.criterion}
          accessible
          accessibilityLabel={`${CRITERION_LABELS[row.criterion]}: ${row.score}%, вес критерия ${row.weight}%`}
          style={styles.row}
        >
          <View style={styles.rowHead}>
            <Text style={[styles.rowLabel, { color: palette.text0 }]}>{CRITERION_LABELS[row.criterion]}</Text>
            <Text style={[styles.rowScore, { color: palette.text0 }]}>{`${row.score}%`}</Text>
          </View>
          <View style={[styles.track, { backgroundColor: palette.bg2 }]}>
            <View style={[styles.bar, { width: `${Math.min(100, Math.max(0, row.score))}%`, backgroundColor: palette.magenta }]} />
          </View>
          <Text style={[styles.weight, { color: palette.text1 }]}>{`Вес критерия — ${row.weight}%`}</Text>
        </View>
      ))}
    </View>
  );
}

/** Блок «О человеке»: только заполненные поля, подписью и значением. */
export function ProfileDetails({ details, tone }: { details: UnionProfileDetails; tone: UnionTone }) {
  const { colors } = useTheme();
  const palette = tone === 'overlay' ? dark : colors;
  const rows = profileDetailRows(details);
  if (rows.length === 0) return null;
  return (
    <View style={styles.details}>
      {rows.map((row) => (
        <Text key={row.label} style={[styles.detail, { color: palette.text0 }]}>
          <Text style={[styles.detailLabel, { color: palette.text1 }]}>{row.label}: </Text>
          {row.value}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: 60,
    height: 60,
    minWidth: hitTarget,
    minHeight: hitTarget,
    borderRadius: 30,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ringText: { fontFamily: fonts.monoSemiBold, fontSize: 14 },
  breakdown: { gap: 12 },
  row: { gap: 4 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowLabel: { fontFamily: fonts.body, fontSize: 14 },
  rowScore: { fontFamily: fonts.monoSemiBold, fontSize: 14 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
  weight: { fontFamily: fonts.body, fontSize: 12 },
  details: { gap: 4, borderRadius: radius.sm },
  detail: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  detailLabel: { fontFamily: fonts.bodySemiBold },
});
