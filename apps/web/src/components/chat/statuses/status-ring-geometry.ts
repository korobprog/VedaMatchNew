/**
 * Кружок вокруг аватарки (VED-129): «если статусов два или больше, кружок
 * делится на соответствующее количество секций». Секции — дуги одной
 * окружности с просветом между ними; непросмотренные — зелёные, остальные
 * гаснут. Первыми идут просмотренные: статусы смотрят по порядку, и зелёный
 * хвост показывает, сколько осталось.
 */
export interface RingArc {
  /** SVG-путь дуги. */
  d: string;
  unseen: boolean;
}

/** Просвет между секциями в градусах — только когда секций больше одной. */
const GAP_DEG = 8;

function point(center: number, radius: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return {
    x: +(center + radius * Math.cos(rad)).toFixed(3),
    y: +(center + radius * Math.sin(rad)).toFixed(3),
  };
}

export function ringArcs(
  total: number,
  unseen: number,
  size: number,
  stroke: number,
): RingArc[] {
  if (total <= 0) return [];
  const center = size / 2;
  const radius = center - stroke / 2;
  const seen = Math.max(0, total - Math.min(unseen, total));
  if (total === 1) {
    // Одна секция — сплошная окружность: дуга в 360° SVG не рисует.
    const top = point(center, radius, 0);
    const bottom = point(center, radius, 180);
    return [
      {
        d: `M ${top.x} ${top.y} A ${radius} ${radius} 0 1 1 ${bottom.x} ${bottom.y} A ${radius} ${radius} 0 1 1 ${top.x} ${top.y}`,
        unseen: seen === 0,
      },
    ];
  }
  const step = 360 / total;
  const arcs: RingArc[] = [];
  for (let at = 0; at < total; at += 1) {
    const from = at * step + GAP_DEG / 2;
    const to = (at + 1) * step - GAP_DEG / 2;
    const a = point(center, radius, from);
    const b = point(center, radius, to);
    const large = to - from > 180 ? 1 : 0;
    arcs.push({
      d: `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`,
      unseen: at >= seen,
    });
  }
  return arcs;
}
