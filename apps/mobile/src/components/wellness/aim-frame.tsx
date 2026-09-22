import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';
import { StyleSheet, Text, View } from 'react-native';
import { describeAim, type AimState, type AimTone } from '@/lib/wellness/aim-state';
import { useTheme } from '@/theme/theme';
import { fonts, radius, type Palette } from '@/theme/tokens';

/**
 * Рамка прицеливания и подпись состояния (VED-335).
 *
 * Три состояния: красная — штрихкод не виден, жёлтая — виден и ищем товар,
 * зелёная — распознан. Цвет здесь помощник, а не носитель смысла: то же самое
 * написано словами под рамкой и одной фразой уходит скринридеру. Правила
 * состояний — в `lib/wellness/aim-state.ts`, тут только показ.
 *
 * Почему подпись стоит на непрозрачной плашке, а не прямо на картинке с
 * камеры: контраст текста поверх видоискателя не считается вовсе — там цвета
 * магазинной полки, и обещание «не ниже 4.5:1» было бы враньём. Плашка `bg1`
 * своя пара в `theme/contrast.spec.ts`.
 *
 * Движение: только смена цвета рамки, 180 мс. Рамка не пульсирует и не
 * дышит — она висит перед глазами человека постоянно, а по правилу частоты
 * (`expo-animation`) то, что видно всё время, не анимируют ради красоты.
 * При включённом «уменьшить движение» цвет меняется мгновенно.
 */

const TONE_TOKEN: Record<AimTone, keyof Palette> = {
  danger: 'danger',
  warning: 'warning',
  success: 'success',
};

/** Плавно, но незаметно: 180 мс — верх «почти мгновенно» по правилу частоты. */
const DURATION_MS = 180;
const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

export function AimFrame({ state }: { state: AimState }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const copy = describeAim(state);
  const tone = colors[TONE_TOKEN[copy.tone]];

  return (
    <View style={styles.root} pointerEvents="none">
      <Animated.View
        style={[
          styles.frame,
          { borderColor: tone },
          reduced
            ? null
            : {
                transitionProperty: 'borderColor',
                transitionDuration: DURATION_MS,
                transitionTimingFunction: EASE_OUT,
              },
        ]}
      >
        {/* Уголки внутри рамки: без них прямоугольник на пёстрой полке
            теряется, и непонятно, что код надо положить ВНУТРЬ. Чисто
            декоративные — скринридеру про них знать незачем, всё нужное
            сказано подписью ниже. */}
        {CORNERS.map((corner) => (
          <Animated.View
            key={corner.key}
            style={[
              styles.corner,
              corner.style,
              { borderColor: tone },
              reduced
                ? null
                : {
                    transitionProperty: 'borderColor',
                    transitionDuration: DURATION_MS,
                    transitionTimingFunction: EASE_OUT,
                  },
            ]}
          />
        ))}
      </Animated.View>
      {/* Одна плашка на заголовок и подсказку: скринридер читает её целиком
          и одной фразой, а не двумя обрывками. `polite` — потому что смена
          состояния не должна перебивать человека на полуслове. */}
      <View
        accessible
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        accessibilityLabel={copy.accessibilityLabel}
        style={[styles.chip, { backgroundColor: colors.bg1, borderColor: tone }]}
      >
        <Text style={[styles.title, { color: tone }]}>{copy.title}</Text>
        <Text style={[styles.hint, { color: colors.text1 }]}>{copy.hint}</Text>
      </View>
    </View>
  );
}

const CORNERS = [
  { key: 'tl', style: { top: -2, left: -2, borderTopWidth: 6, borderLeftWidth: 6 } },
  { key: 'tr', style: { top: -2, right: -2, borderTopWidth: 6, borderRightWidth: 6 } },
  { key: 'bl', style: { bottom: -2, left: -2, borderBottomWidth: 6, borderLeftWidth: 6 } },
  { key: 'br', style: { bottom: -2, right: -2, borderBottomWidth: 6, borderRightWidth: 6 } },
] as const;

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  corner: { position: 'absolute', width: 28, height: 28, borderRadius: 4 },
  frame: {
    width: '78%',
    aspectRatio: 1.25,
    maxWidth: 320,
    borderWidth: 4,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  chip: {
    maxWidth: 340,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  title: { fontFamily: fonts.bodyBold, fontSize: 17, textAlign: 'center' },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
