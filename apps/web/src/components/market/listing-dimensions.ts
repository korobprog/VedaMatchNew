/**
 * Габариты и вес товара в строку для карточки объявления.
 *
 * Продавец заполняет поля не полностью: у книги указан только вес, у коробки —
 * все три размера. Поэтому строка собирается из того, что есть, а не из
 * шаблона «Д × Ш × В» с прочерками на месте пропусков.
 */

export interface Measurements {
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightG: number | null;
}

/**
 * `30 × 20 × 5 см` при полном наборе, `30 × 20 см` — при двух, `30 см` — при
 * одном. Пустой набор даёт null: строку «— см» показывать незачем.
 */
export function formatDimensions(
  measurements: Pick<Measurements, "lengthCm" | "widthCm" | "heightCm">,
  unit: string,
): string | null {
  const parts = [
    measurements.lengthCm,
    measurements.widthCm,
    measurements.heightCm,
  ].filter((value): value is number => value !== null);
  if (parts.length === 0) return null;
  return `${parts.join(" × ")} ${unit}`;
}

/**
 * Граммы до килограмма и килограммы дальше: 450 г понятнее, чем 0,45 кг, а
 * 3200 г — наоборот. Дробная часть у килограммов округляется до сотых и
 * отбрасывается, если она нулевая: «2 кг», а не «2,00 кг».
 */
export function formatWeight(
  weightG: number | null,
  gramsUnit: string,
  kilogramsUnit: string,
  locale: string,
): string | null {
  if (weightG === null) return null;
  if (weightG < 1000) return `${weightG} ${gramsUnit}`;
  const kilograms = Math.round(weightG / 10) / 100;
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(kilograms);
  return `${formatted} ${kilogramsUnit}`;
}
