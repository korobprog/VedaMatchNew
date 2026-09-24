import type { ChatStatusRing } from "@vedamatch/shared";
import { ringArcs } from "./status-ring-geometry";

/** Толщина кольца и отступ от аватарки. */
const STROKE = 2.5;
const GAP = 2;

/**
 * Зелёный кружок вокруг аватарки (VED-129): по секции на каждый живой
 * статус, просмотренные гаснут. Рисуется поверх обёртки аватарки, не меняя
 * её размер: строки списка и шапка беседы не сдвигаются, когда у человека
 * появляется статус.
 *
 * Только украшение — о статусах скринридеру говорит подпись там, где их
 * можно открыть (полоса статусов, карточка человека).
 */
export function StatusRing({
  ring,
  size,
}: {
  ring: ChatStatusRing | null | undefined;
  /** Размер аватарки, вокруг которой кольцо. */
  size: number;
}) {
  if (!ring || !(ring.total > 0)) return null;
  const outer = size + (GAP + STROKE) * 2;
  const arcs = ringArcs(ring.total, ring.unseen, outer, STROKE);
  return (
    <svg
      aria-hidden
      width={outer}
      height={outer}
      viewBox={`0 0 ${outer} ${outer}`}
      className="pointer-events-none absolute"
      style={{ left: -(GAP + STROKE), top: -(GAP + STROKE) }}
    >
      {arcs.map((arc, at) => (
        <path
          key={at}
          d={arc.d}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          className={arc.unseen ? "stroke-cyan" : "stroke-text-2/50"}
        />
      ))}
    </svg>
  );
}
