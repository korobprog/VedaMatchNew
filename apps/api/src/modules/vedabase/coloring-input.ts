import {
  VEDABASE_COLOR_BLOCKS,
  VEDABASE_COLORS,
  type SaveVedabaseColoringRequest,
  type VedabaseColorBlock,
  type VedabaseColorSpan,
} from '@vedamatch/shared';

/** Больше отрезков в одном блоке не бывает: пословный — сотня слов с запасом. */
export const MAX_COLOR_SPANS = 500;
/** Дальше этого смещения текста в блоке стиха нет. */
const MAX_OFFSET = 100_000;

export class ColoringInputError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonBlank(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200)
    throw new ColoringInputError(`${field}: нужна строка`);
  return value.trim();
}

/**
 * Раскраска из админки (VED-683). Отрезки проверяются и упорядочиваются;
 * пересекающиеся — ошибка: редактор их не производит, значит, прислал кто-то
 * другой, и молча склеивать нельзя.
 */
export function parseColoring(body: unknown): SaveVedabaseColoringRequest {
  if (!isRecord(body)) throw new ColoringInputError('Нужен объект раскраски');
  const block = body.block;
  if (!(VEDABASE_COLOR_BLOCKS as readonly unknown[]).includes(block))
    throw new ColoringInputError('Этот блок не раскрашивается');
  if (!Array.isArray(body.spans))
    throw new ColoringInputError('Нужен список отрезков');
  const raw: unknown[] = body.spans;
  if (raw.length > MAX_COLOR_SPANS)
    throw new ColoringInputError(`Больше ${MAX_COLOR_SPANS} отрезков`);

  const spans: VedabaseColorSpan[] = raw.map((item) => {
    if (!isRecord(item)) throw new ColoringInputError('Отрезок — объект');
    const { start, end, color } = item;
    if (
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end <= start ||
      end > MAX_OFFSET
    )
      throw new ColoringInputError('Неверные границы отрезка');
    if (!(VEDABASE_COLORS as readonly unknown[]).includes(color))
      throw new ColoringInputError('Неизвестный цвет');
    return { start, end, color: color as VedabaseColorSpan['color'] };
  });
  spans.sort((left, right) => left.start - right.start);
  for (let i = 1; i < spans.length; i += 1) {
    if (spans[i].start < spans[i - 1].end)
      throw new ColoringInputError('Отрезки пересекаются');
  }

  return {
    chapterSlug: nonBlank(body.chapterSlug, 'Глава'),
    unitId: nonBlank(body.unitId, 'Стих'),
    block: block as VedabaseColorBlock,
    spans,
  };
}
