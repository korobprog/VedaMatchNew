import { useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { playedBarCount, ratioFromTouch } from '@/lib/chat/voice/voice-progress';
import { hitTarget } from '@/theme/tokens';

interface Props {
  levels: number[];
  /** 0..1 — доля пройденного; без неё все столбики рисуются одним цветом (запись, а не воспроизведение). */
  playedRatio?: number;
  colorPlayed: string;
  colorRest: string;
  /** Есть только у плеера: касание/протяжка по дорожке переводят в секунду. */
  onSeek?(ratio: number): void;
  height?: number;
}

/**
 * Столбики дорожки — общие для плеера (с прогрессом и перемоткой) и
 * рекордера (без прогресса, просто уровень на лету). Перемотка через
 * `PanResponder`, а не `react-native-gesture-handler`: единственный жест —
 * «где палец по горизонтали», добавлять зависимость и лишний вес в бандл
 * ради него незачем (веха «Скорость» уже боролась именно за это — см.
 * `apps/mobile/README.md`).
 */
export function VoiceWaveformBars({ levels, playedRatio, colorPlayed, colorRest, onSeek, height = 28 }: Props) {
  const widthRef = useRef(0);
  // `onSeek` обычно новая функция каждый рендер (замыкание на текущий
  // `player`/`duration`) — если положить её в замыкание `PanResponder`
  // напрямую, `useMemo` ниже пересоздавал бы его или, с фиксированными
  // зависимостями, звал бы протухшую версию (тот же класс бага, что
  // `session.tsx` до `session-token-reaction.ts`, только здесь по мелочи).
  // Обновляемый `ref` решает это без пересоздания жеста.
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  const panResponder = useMemo(() => {
    if (!onSeek) return null;
    const seekAt = (x: number) => onSeekRef.current?.(ratioFromTouch(x, widthRef.current));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => seekAt(event.nativeEvent.locationX),
      onPanResponderMove: (event) => seekAt(event.nativeEvent.locationX),
    });
    // Зависимость — только факт «есть перемотка», не сама функция.
  }, [Boolean(onSeek)]);

  const onLayout = (event: LayoutChangeEvent) => {
    widthRef.current = event.nativeEvent.layout.width;
  };

  const played = playedRatio !== undefined ? playedBarCount(levels.length, playedRatio) : -1;
  // Визуальная высота дорожки часто меньше правила «цели ≥ 44dp» (CLAUDE.md)
  // для интерактивных элементов; когда есть перемотка, `hitSlop` достраивает
  // зону касания до 44dp по вертикали, не трогая вид столбиков
  // (feedback-001, п.4) — считается от РЕАЛЬНОЙ высоты, а не одного
  // захардкоженного числа, иначе плеер с `height={24}` (feedback-002, п.3)
  // снова не дотягивал бы (28 + 8 + 8 = 44, но 24 + 8 + 8 = 40 — уже мало).
  // У рекордера `onSeek` нет — там просто индикатор уровня, hitSlop не нужен.
  const verticalHitSlop = onSeek ? Math.max(0, (hitTarget - height) / 2) : 0;

  return (
    <View
      onLayout={onLayout}
      style={[styles.row, { height }]}
      hitSlop={onSeek ? { top: verticalHitSlop, bottom: verticalHitSlop } : undefined}
      {...(panResponder?.panHandlers ?? {})}
      accessible={false}
    >
      {levels.map((level, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            {
              height: `${Math.max(12, Math.min(100, level))}%`,
              backgroundColor: played >= 0 && index < played ? colorPlayed : colorRest,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 },
  bar: { flex: 1, minWidth: 2, borderRadius: 1 },
});
