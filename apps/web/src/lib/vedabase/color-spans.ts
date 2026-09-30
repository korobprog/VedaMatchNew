import type { VedabaseColor, VedabaseColorSpan } from "@vedamatch/shared";

/**
 * Редактор цветного перевода (VED-683) — чистая часть: покрасить или стереть
 * отрезок в раскраске блока. Раскраска — непересекающиеся отрезки по
 * возрастанию; новый отрезок вырезает под себя место из старых.
 */
export function paintRange(
  spans: readonly VedabaseColorSpan[],
  start: number,
  end: number,
  color: VedabaseColor | null,
): VedabaseColorSpan[] {
  if (end <= start) return [...spans];
  const next: VedabaseColorSpan[] = [];
  for (const span of spans) {
    if (span.end <= start || span.start >= end) {
      next.push(span);
      continue;
    }
    if (span.start < start) next.push({ ...span, end: start });
    if (span.end > end) next.push({ ...span, start: end });
  }
  if (color) next.push({ start, end, color });
  next.sort((left, right) => left.start - right.start);
  // Соседние отрезки одного цвета — один отрезок: меньше обёрток в тексте.
  return next.reduce<VedabaseColorSpan[]>((merged, span) => {
    const last = merged.at(-1);
    if (last && last.end === span.start && last.color === span.color)
      merged[merged.length - 1] = { ...last, end: span.end };
    else merged.push(span);
    return merged;
  }, []);
}

/** Подписи цветов палитры — для кнопок редактора. */
export const COLOR_LABELS: Record<VedabaseColor, string> = {
  red: "Красный",
  orange: "Оранжевый",
  gold: "Золотой",
  green: "Зелёный",
  blue: "Синий",
  violet: "Фиолетовый",
};
