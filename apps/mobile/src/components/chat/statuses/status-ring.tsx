import type { ChatStatusRing } from '@vedamatch/shared';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { RING_GAP, RING_STROKE, ringArcs, ringOuterSize } from '@/lib/chat/statuses/status-ring-geometry';
import { useTheme } from '@/theme/theme';

/**
 * Зелёный кружок вокруг аватарки (VED-129): по секции на каждый живой
 * статус, просмотренные гаснут. Рисуется поверх обёртки аватарки, не меняя
 * её размер: строки списка и шапка беседы не сдвигаются, когда у человека
 * появляется статус.
 *
 * Только украшение — о статусах скринридеру говорит подпись там, где их
 * можно открыть (полоса статусов, аватарка-кнопка).
 *
 * Зелёный — `cyan` темы (на сайте тот же `stroke-cyan`), погасшие — `text2`.
 * Кольцо — графика, не текст: порог 3:1, у обоих цветов он есть в обеих
 * темах на `bg0`.
 */
export function StatusRing({ ring, size }: { ring: ChatStatusRing | null | undefined; size: number }) {
  const { colors } = useTheme();
  if (!ring || !(ring.total > 0)) return null;
  const outer = ringOuterSize(size);
  const arcs = ringArcs(ring.total, ring.unseen, outer, RING_STROKE);
  const offset = -(RING_GAP + RING_STROKE);
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ position: 'absolute', left: offset, top: offset, width: outer, height: outer }}
    >
      <Svg width={outer} height={outer} viewBox={`0 0 ${outer} ${outer}`}>
        {arcs.map((arc, at) => (
          <Path
            key={at}
            d={arc.d}
            fill="none"
            stroke={arc.unseen ? colors.cyan : colors.text2}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
          />
        ))}
      </Svg>
    </View>
  );
}
