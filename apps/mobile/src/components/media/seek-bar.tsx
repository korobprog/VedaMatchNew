import { useEffect } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { formatClock, positionFromRatio, progressRatio, spokenClock, SKIP_SECONDS } from '@/lib/media/playback-math';
import { useTheme } from '@/theme/theme';
import { hitTarget } from '@/theme/tokens';

/**
 * Шкала перемотки полноэкранного плеера (VED-331).
 *
 * Палец на шкале — значит всё на потоке интерфейса: пока тянут, ползунок и
 * заливка едут за пальцем без единого рендера React, а перемотка уходит в
 * плеер один раз, когда палец отпустили. Иначе каждое движение было бы
 * `seekTo` в нативный плеер — он дёргал бы звук и тормозил.
 *
 * Касание без движения — перемотка туда, куда ткнули. Скринридеру шкала —
 * «регулируемый» элемент: смахивание вверх и вниз — ±10 секунд, значение
 * читается словами («4 мин 7 с из 12 мин»).
 *
 * Зона касания — во всю высоту `hitTarget`, хотя видимая дорожка — 4 точки.
 */
const TRACK_HEIGHT = 4;
const THUMB = 14;

export function SeekBar({
  positionSec,
  durationSec,
  disabled,
  onSeek,
}: {
  positionSec: number;
  durationSec: number;
  disabled: boolean;
  onSeek(positionSec: number): void;
}) {
  const { colors } = useTheme();
  const width = useSharedValue(0);
  const ratio = useSharedValue(progressRatio(positionSec, durationSec));
  const dragging = useSharedValue(false);

  useEffect(() => {
    // Пока палец на шкале, статус плеера её не перебивает.
    if (!dragging.get()) ratio.set(progressRatio(positionSec, durationSec));
  }, [dragging, durationSec, positionSec, ratio]);

  const commit = (value: number) => onSeek(positionFromRatio(value, durationSec));

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(4)
    .onBegin((event) => {
      dragging.set(true);
      if (width.get() > 0) ratio.set(Math.min(Math.max(event.x / width.get(), 0), 1));
    })
    .onUpdate((event) => {
      if (width.get() > 0) ratio.set(Math.min(Math.max(event.x / width.get(), 0), 1));
    })
    .onEnd(() => {
      scheduleOnRN(commit, ratio.get());
    })
    .onFinalize(() => {
      dragging.set(false);
    });

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onEnd((event) => {
      if (width.get() <= 0) return;
      const value = Math.min(Math.max(event.x / width.get(), 0), 1);
      ratio.set(value);
      scheduleOnRN(commit, value);
    });

  const fillStyle = useAnimatedStyle(() => ({ width: ratio.get() * width.get() }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: ratio.get() * width.get() - THUMB / 2 }],
  }));

  const onLayout = (event: LayoutChangeEvent) => width.set(event.nativeEvent.layout.width);
  const known = durationSec > 0;

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Перемотка"
        accessibilityHint={`Смахните вверх или вниз, чтобы перемотать на ${SKIP_SECONDS} секунд`}
        accessibilityState={{ disabled }}
        accessibilityValue={{
          min: 0,
          max: Math.round(durationSec),
          now: Math.round(positionSec),
          text: known ? `${spokenClock(positionSec)} из ${spokenClock(durationSec)}` : formatClock(positionSec),
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (disabled) return;
          const delta = event.nativeEvent.actionName === 'increment' ? SKIP_SECONDS : -SKIP_SECONDS;
          onSeek(Math.min(Math.max(positionSec + delta, 0), known ? durationSec : positionSec + delta));
        }}
        onLayout={onLayout}
        style={styles.hit}
      >
        <View style={[styles.track, { backgroundColor: colors.bg2 }]}>
          <Animated.View style={[styles.fill, { backgroundColor: colors.magenta }, fillStyle]} />
        </View>
        <Animated.View style={[styles.thumb, { backgroundColor: colors.magenta }, thumbStyle]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hit: { height: hitTarget, justifyContent: 'center' },
  track: { height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, left: 0, bottom: 0 },
  thumb: {
    position: 'absolute',
    left: 0,
    top: (hitTarget - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
  },
});
