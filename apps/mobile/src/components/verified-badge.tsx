import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { VERIFICATION_BADGE_LABELS } from '@/lib/people/verification';
import { useTheme } from '@/theme/theme';
import type { Palette } from '@/theme/tokens';
import { fonts } from '@/theme/tokens';

/**
 * Значки подтверждения — рисованные, а не текстовые плашки (перенос
 * `apps/web/src/components/union/verified-badge.tsx`, те же контуры иконок).
 *
 * `dot` — кружок ~20dp сплошной заливкой акцентом, иконка — `bg0`: акцент и
 * `bg0` — крайние по светлоте токены в обеих темах, у некрупного нетекстового
 * элемента порог WCAG мягче текста (3:1, не 4.5:1) — проверено в
 * `theme/contrast.spec.ts`. `inline` — таблетка с иконкой и словом рядом с
 * именем: текст — `text0` (не акцент: `gold` мелким текстом не проходит
 * 4.5:1 на светлой теме), обводка — акцент, ей достаточно тех же 3:1.
 */
type Variant = 'dot' | 'inline';

interface BadgeProps {
  variant?: Variant;
}

function CheckShieldIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <Path d="m9 12 2 2 4-4" />
    </Svg>
  );
}

function CameraCheckIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h3L9 5h6l1.5 2h3A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5Z" />
      <Path d="m9.5 12.5 2 2 3.5-3.5" />
    </Svg>
  );
}

function Badge({
  variant = 'inline',
  accent,
  label,
  inlineText,
  Icon,
}: BadgeProps & {
  accent: keyof Palette;
  label: string;
  inlineText: string;
  Icon: (props: { color: string; size: number }) => ReactElement;
}) {
  const { colors } = useTheme();
  const accentColor = colors[accent];

  if (variant === 'dot') {
    return (
      <View accessible accessibilityLabel={label} style={[styles.dot, { backgroundColor: accentColor }]}>
        <View importantForAccessibility="no">
          <Icon color={colors.bg0} size={11} />
        </View>
      </View>
    );
  }

  return (
    <View accessible accessibilityLabel={label} style={[styles.inline, { borderColor: accentColor, backgroundColor: colors.bg1 }]}>
      <View importantForAccessibility="no">
        <Icon color={accentColor} size={12} />
      </View>
      <Text style={[styles.inlineText, { color: colors.text0 }]}>{inlineText}</Text>
    </View>
  );
}

/** Значок преданного, чей статус подтвердила администрация. */
export function VerifiedBadge({ variant = 'inline' }: BadgeProps) {
  return <Badge variant={variant} accent="cyan" label={VERIFICATION_BADGE_LABELS.devotee} inlineText="Проверен" Icon={CheckShieldIcon} />;
}

/** Значок: администрация сверила фото с живым человеком. */
export function PhotoVerifiedBadge({ variant = 'inline' }: BadgeProps) {
  return <Badge variant={variant} accent="gold" label={VERIFICATION_BADGE_LABELS.photo} inlineText="Фото" Icon={CameraCheckIcon} />;
}

const styles = StyleSheet.create({
  dot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  inlineText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
});
