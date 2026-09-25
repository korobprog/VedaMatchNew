import type { Gender, UnionIntentionType } from '@vedamatch/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckRow } from '@/components/onboarding/check-row';
import {
  WEIGHT_STEP,
  canChooseFamily,
  evenWeights,
  intentionSum,
  isEvenSplit,
  normalizeWeights,
  oppositeGender,
  seeksGenderAfter,
  selectedTypes,
  stepWeight,
  toggleIntention,
  type IntentionWeights,
} from '@/lib/union/union-profile-form';
import { INTENTION_LABELS, INTENTION_TYPES } from '@/lib/union/union-labels';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { ChoiceChips } from './profile-controls';

const SEEK_LABELS: Record<Gender, string> = { male: 'мужчин', female: 'женщин' };

/**
 * Цели знакомства (`intention-section.tsx` сайта). Галочки — обычный режим,
 * проценты — по желанию. Анкета с ручными весами открывается сразу в
 * процентах: иначе первое же касание галочек стёрло бы настройку, которую
 * человек делал руками. Ползунка нет — шаг ±5 кнопками: на телефоне в
 * ползунок попасть до процента труднее, чем нажать кнопку три раза.
 */
export function IntentionEditor({
  weights,
  onChange,
  viewerAge,
  viewerGender,
  seeksGender,
  onSeeksGenderChange,
}: {
  weights: IntentionWeights;
  onChange(weights: IntentionWeights): void;
  viewerAge: number | null;
  viewerGender: Gender | null;
  seeksGender: Gender | null;
  onSeeksGenderChange(gender: Gender | null): void;
}) {
  const { colors } = useTheme();
  const [fineTuning, setFineTuning] = useState(() => !isEvenSplit(weights));
  const [warned, setWarned] = useState(false);
  const familyEligible = canChooseFamily(viewerAge);
  const sum = intentionSum(weights);

  const change = (next: IntentionWeights) => {
    onChange(next);
    const seeks = seeksGenderAfter(weights, next, seeksGender, viewerGender);
    if (seeks !== undefined) onSeeksGenderChange(seeks);
  };

  const toggleMode = (next: boolean) => {
    setFineTuning(next);
    if (next) return;
    // Выключили проценты — поровну между отмеченными целями.
    const selected = selectedTypes(weights);
    change(evenWeights(selected.length > 0 ? selected : INTENTION_TYPES));
  };

  return (
    <View style={styles.root}>
      <Text style={[styles.legend, { color: colors.text0 }]}>
        {fineTuning ? 'Что вы ищете? Распределите 100% между направлениями' : 'Что вы ищете? Отметьте подходящее'}
      </Text>

      {fineTuning
        ? INTENTION_TYPES.map((type) => (
            <WeightRow
              key={type}
              type={type}
              value={weights[type]}
              disabled={type === 'family' && !familyEligible}
              onStep={(delta) => change(stepWeight(weights, type, delta))}
            />
          ))
        : INTENTION_TYPES.map((type) => (
            <CheckRow
              key={type}
              label={INTENTION_LABELS[type]}
              checked={weights[type] > 0}
              disabled={type === 'family' && !familyEligible}
              onChange={() => {
                const next = toggleIntention(weights, type, viewerAge);
                if (next === null) {
                  setWarned(true);
                  return;
                }
                setWarned(false);
                change(next);
              }}
            />
          ))}

      {!familyEligible ? (
        <Text style={[styles.hint, { color: colors.text1 }]}>
          {viewerAge === null
            ? 'Цель «Создание семьи» откроется, когда вы укажете дату рождения в профиле, — так мы убедимся, что вам есть 18 лет.'
            : 'Цель «Создание семьи» доступна только с 18 лет.'}
        </Text>
      ) : null}
      {warned ? (
        <Text accessibilityRole="alert" style={[styles.hint, { color: colors.text0 }]}>
          Оставьте хотя бы одну цель — без неё анкета не сохранится.
        </Text>
      ) : null}

      {fineTuning ? (
        <View style={styles.sumRow}>
          <Text accessibilityLiveRegion="polite" style={[styles.sum, { color: colors.text0 }]}>
            {sum === 100 ? `Сумма: ${sum}% ✓` : `Сумма: ${sum}% — должна быть 100%`}
          </Text>
          {sum !== 100 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => change(normalizeWeights(weights))}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [styles.align, { borderColor: colors.magenta }, pressedStyle(pressed)]}
            >
              <Text style={[styles.alignText, { color: colors.text0 }]}>Выровнять до 100%</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {weights.family > 0 ? (
        viewerGender ? (
          <View style={[styles.family, { backgroundColor: colors.bg1 }]}>
            <CheckRow
              label={`Искать только ${SEEK_LABELS[oppositeGender(viewerGender)]}`}
              checked={seeksGender === oppositeGender(viewerGender)}
              onChange={(checked) => onSeeksGenderChange(checked ? oppositeGender(viewerGender) : null)}
            />
            <Text style={[styles.hint, { color: colors.text1 }]}>
              Сужает и вашу ленту, и чужие: вы не попадёте к тем, кто ищет другой пол.
            </Text>
          </View>
        ) : (
          <View style={[styles.family, { backgroundColor: colors.bg1 }]}>
            <ChoiceChips<Gender>
              label="Кого искать для создания семьи"
              hint="Пол в вашем аккаунте не указан, поэтому подставить его автоматически мы не можем. Не выбрано — пол не важен."
              options={[
                ['male', 'Только мужчин'],
                ['female', 'Только женщин'],
              ]}
              value={seeksGender}
              onChange={onSeeksGenderChange}
            />
          </View>
        )
      ) : null}

      <CheckRow label="Тонкая настройка: распределить 100% между целями" checked={fineTuning} onChange={toggleMode} />
      <Text style={[styles.hint, { color: colors.text1 }]}>
        При выключении проценты выровняются поровну между отмеченными целями.
      </Text>
    </View>
  );
}

function WeightRow({
  type,
  value,
  disabled,
  onStep,
}: {
  type: UnionIntentionType;
  value: number;
  disabled: boolean;
  onStep(delta: number): void;
}) {
  const { colors } = useTheme();
  const label = INTENTION_LABELS[type];
  const button = (delta: number, text: string, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      disabled={disabled || (delta < 0 ? value <= 0 : value >= 100)}
      onPress={() => onStep(delta)}
      android_ripple={ripple(colors.glassBorder, true)}
      style={({ pressed }) => [styles.step, { borderColor: colors.glassBorder }, disabled ? styles.off : pressedStyle(pressed)]}
    >
      <Text style={[styles.stepText, { color: colors.text0 }]}>{text}</Text>
    </Pressable>
  );
  return (
    <View
      accessible={false}
      style={[styles.weightRow, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }, disabled && styles.off]}
    >
      <Text style={[styles.weightLabel, { color: colors.text0 }]}>{label}</Text>
      {button(-WEIGHT_STEP, '−', `${label}: меньше на ${WEIGHT_STEP}%`)}
      <Text accessibilityLabel={`${label}: ${value}%`} style={[styles.weightValue, { color: colors.text0 }]}>
        {`${value}%`}
      </Text>
      {button(WEIGHT_STEP, '+', `${label}: больше на ${WEIGHT_STEP}%`)}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  legend: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  sumRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sum: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  align: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  alignText: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  family: { borderRadius: radius.sm, padding: 10, gap: 8 },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  weightLabel: { flex: 1, fontFamily: fonts.body, fontSize: 14 },
  weightValue: { minWidth: 48, textAlign: 'center', fontFamily: fonts.monoSemiBold, fontSize: 15 },
  step: {
    width: hitTarget,
    height: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stepText: { fontFamily: fonts.bodyBold, fontSize: 20 },
  off: { opacity: 0.45 },
});
