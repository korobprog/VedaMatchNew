import type { ReactNode } from 'react';
import type { UnionActivityLevel, UnionSwipeDecision } from '@vedamatch/shared';
import { StyleSheet, Text, View } from 'react-native';
import { lastSeenLabel } from '@/lib/union/last-seen';
import { DECISION_LABELS } from '@/lib/union/union-labels';
import { useTheme } from '@/theme/theme';
import { dark, fonts } from '@/theme/tokens';
import { CheckIcon } from './union-icons';

/**
 * Мелкие пометки анкеты. Два тона: `overlay` — поверх фотографии, всегда
 * тёмной палитрой (под текстом произвольный снимок, а не фон темы), и
 * `plain` — на фоне экрана, токенами текущей темы.
 */
export type UnionTone = 'overlay' | 'plain';

/** Факт об анкете отдельной пилюлей: город, рост, этап, интерес. */
export function FactPill({ icon, children }: { icon?: ReactNode; children: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: dark.scrim }]}>
      {icon}
      <Text numberOfLines={1} style={[styles.pillText, { color: dark.text0 }]}>
        {children}
      </Text>
    </View>
  );
}

/**
 * Активность: «В сети», «Был(а) 12 минут назад». Точка — голубая у тех, кто
 * сейчас здесь; остальным серая. Давно не заходивших не клеймим — строки нет.
 */
export function ActivityLine({
  activity,
  lastSeenAt,
  tone,
  now,
}: {
  activity: UnionActivityLevel | null;
  lastSeenAt: string | null;
  tone: UnionTone;
  now?: Date;
}) {
  const { colors } = useTheme();
  const label = lastSeenLabel(activity, lastSeenAt, now);
  if (!label) return null;
  const palette = tone === 'overlay' ? dark : colors;
  const fresh = activity === 'online';
  return (
    <View style={[styles.activity, tone === 'overlay' && { backgroundColor: dark.scrim }]}>
      <View style={[styles.dot, { backgroundColor: fresh ? palette.cyan : palette.text2 }]} />
      <Text style={[styles.pillText, { color: tone === 'overlay' ? dark.text0 : colors.text1 }]}>{label}</Text>
    </View>
  );
}

/**
 * «Решение по анкете уже принято» — в режиме «показать всех» отсмотренные
 * лежат вперемешку с новыми, и без пометки человек решает второй раз вслепую.
 */
export function DecisionPill({ decision, tone }: { decision: UnionSwipeDecision | null; tone: UnionTone }) {
  const { colors } = useTheme();
  if (!decision) return null;
  const label = DECISION_LABELS[decision];
  const overlay = tone === 'overlay';
  const text = overlay ? dark.text0 : colors.text1;
  return (
    <View
      style={[
        styles.pill,
        overlay
          ? { backgroundColor: dark.scrim }
          : { backgroundColor: colors.bg2, borderColor: colors.glassBorder, borderWidth: 1 },
      ]}
    >
      <CheckIcon color={text} />
      <Text style={[styles.pillText, { color: text }]}>{overlay ? label.full : label.short}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  activity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
