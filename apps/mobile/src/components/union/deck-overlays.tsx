import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { burstRays, TOAST_MS } from '@/lib/union/deck-state';
import { pressedStyle, ripple } from '@/theme/press';
import { dark, fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Накладки колоды: подсказки жестов и итог решения. Все лежат поверх фото,
 * поэтому палитра тёмная при любой теме телефона.
 */

/**
 * Жест рисунком, а не словами: рука и стрелки в обе стороны. Рука качается
 * сама — показать движение движением дешевле, чем описать; при «уменьшить
 * движение» рисунок стоит.
 */
function SwipeGesture({ animate }: { animate: boolean }) {
  const x = useSharedValue(0);
  useEffect(() => {
    if (!animate) return;
    x.set(
      withRepeat(
        withSequence(
          withTiming(-30, { duration: 780 }),
          withTiming(0, { duration: 620 }),
          withTiming(30, { duration: 780 }),
          withTiming(0, { duration: 620 }),
          withTiming(0, { duration: 400 }),
        ),
        -1,
      ),
    );
  }, [animate, x]);
  const hand = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View style={styles.gesture} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={220} height={40} viewBox="0 0 220 40" style={styles.arrows}>
        <Path fill={dark.text0} d="M84 24H36v-9L10 28.5 36 42v-9h48z" opacity={0.7} />
        <Path fill={dark.text0} d="M136 24h48v-9l26 13.5L184 42v-9h-48z" opacity={0.7} />
      </Svg>
      <Animated.View style={hand}>
        <Svg width={220} height={150} viewBox="0 0 220 150">
          <Path
            fill={dark.text0}
            d="M110 6c-9.4 0-17 7.6-17 17s7.6 17 17 17 17-7.6 17-17-7.6-17-17-17zm0 8c5 0 9 4 9 9s-4 9-9 9-9-4-9-9 4-9 9-9z"
          />
          <Path
            fill={dark.text0}
            d="M104 34v46l-14-16c-4-4-10-4-14 0-4 4-4 10 0 14l24 32c5 7 13 11 22 11h20c15 0 27-12 27-27V62c0-5-4-9-9-9s-9 4-9 9v-4c0-5-4-9-9-9s-9 4-9 9v-4c0-5-4-9-9-9s-9 4-9 9V34c0-5-4-9-9-9s-9 4-9 9z"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * Подсказка о жесте при первом заходе в колоду — один раз на телефон.
 * Закрывается тапом в любом месте и кнопкой «Понятно».
 */
export function SwipeHint({ reduceMotion, onDismiss }: { reduceMotion: boolean; onDismiss(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Как листать анкеты. Влево — пропустить, вправо — познакомиться, вверх — суперлайк. Нажмите, чтобы закрыть"
      onPress={onDismiss}
      style={[styles.hint, { backgroundColor: dark.bg0 }]}
    >
      <SwipeGesture animate={!reduceMotion} />
      <Text style={[styles.hintTitle, { color: dark.text0 }]}>Листайте анкеты пальцем</Text>
      <Text style={[styles.hintText, { color: dark.text1 }]}>
        Влево — пропустить, вправо — познакомиться, вверх — суперлайк. То же самое делают кнопки внизу.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onDismiss}
        android_ripple={ripple(dark.glassBorder)}
        style={({ pressed }) => [styles.hintButton, { backgroundColor: dark.magenta }, pressedStyle(pressed)]}
      >
        <Text style={[styles.hintButtonText, { color: dark.onAccent }]}>Понятно</Text>
      </Pressable>
    </Pressable>
  );
}

/**
 * «Тапните по краю фото» — тоже один раз. Подсветка половин, а не шевроны:
 * у краёв уже стоят стрелки листания анкет, ещё одна пара читалась бы
 * кнопкой. Касания проходят насквозь — достаточно сделать то, о чём она
 * говорит.
 */
export function PhotoTapHint() {
  return (
    <View pointerEvents="none" style={styles.photoHint} importantForAccessibility="no-hide-descendants">
      <View style={[styles.half, { backgroundColor: dark.glassBorder }]}>
        <Text style={[styles.halfText, { color: dark.text0, backgroundColor: dark.scrim }]}>‹ назад</Text>
      </View>
      <View style={[styles.half, { backgroundColor: dark.glassBorder }]}>
        <Text style={[styles.halfText, { color: dark.text0, backgroundColor: dark.scrim }]}>дальше ›</Text>
      </View>
      <Text style={[styles.photoHintCaption, { color: dark.text0, backgroundColor: dark.bg1 }]}>
        Тапните по краю фото, чтобы листать снимки
      </Text>
    </View>
  );
}

const BURST_COLORS = [dark.magenta, dark.cyan, dark.gold, dark.violet];

function Ray({ dx, dy, delayMs, color }: { dx: number; dy: number; delayMs: number; color: string }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withDelay(delayMs, withTiming(1, { duration: 650 })));
  }, [delayMs, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.get(),
    transform: [{ translateX: dx * progress.get() }, { translateY: dy * progress.get() }],
  }));
  return <Animated.View style={[styles.ray, { backgroundColor: color }, style]} />;
}

/**
 * Итог решения — по центру колоды и поверх всего, ничего не сдвигая.
 * Взаимность идёт с салютом: остальные подсказки сообщают факт, а эта —
 * событие. Касания проходят насквозь, к кнопкам под ней.
 */
export function DeckToast({
  message,
  nonce,
  celebrate,
  reduceMotion,
  onDone,
}: {
  message: string | null;
  nonce: number;
  celebrate: boolean;
  reduceMotion: boolean;
  onDone(): void;
}) {
  const scale = useSharedValue(reduceMotion ? 1 : 0.86);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!message) return;
    opacity.set(0);
    opacity.set(withTiming(1, { duration: 150 }));
    if (!reduceMotion) {
      scale.set(0.86);
      scale.set(withSpring(1, { stiffness: 320, damping: 22 }));
    }
    const timer = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, nonce, onDone, opacity, reduceMotion, scale]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ scale: scale.get() }] }));

  if (!message) return null;
  return (
    <View pointerEvents="none" style={styles.toastWrap}>
      {celebrate && !reduceMotion ? (
        <View key={nonce} style={styles.burst}>
          {burstRays(14, 130).map((ray, index) => (
            <Ray key={index} {...ray} color={BURST_COLORS[index % BURST_COLORS.length]} />
          ))}
        </View>
      ) : null}
      <Animated.View style={style}>
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.toast, { color: dark.text0, backgroundColor: dark.bg1, borderColor: dark.sheetBorder }]}
        >
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  gesture: { alignItems: 'center' },
  arrows: { position: 'absolute', top: 10 },
  hint: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    borderRadius: 24,
    opacity: 0.96,
  },
  hintTitle: { fontFamily: fonts.displayBold, fontSize: 18, textAlign: 'center' },
  hintText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  hintButton: {
    minHeight: hitTarget,
    borderRadius: radius.md,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  hintButtonText: { fontFamily: fonts.bodyBold, fontSize: 15 },
  photoHint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5, flexDirection: 'row' },
  half: { flex: 1, alignItems: 'center', justifyContent: 'center', margin: 4, borderRadius: 20 },
  halfText: { fontFamily: fonts.bodySemiBold, fontSize: 13, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  photoHintCaption: {
    position: 'absolute',
    top: '32%',
    left: 24,
    right: 24,
    textAlign: 'center',
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  toastWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40, alignItems: 'center', justifyContent: 'center' },
  burst: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  ray: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  toast: {
    fontFamily: fonts.displayBold,
    fontSize: 16,
    textAlign: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    paddingVertical: 12,
    overflow: 'hidden',
  },
});
