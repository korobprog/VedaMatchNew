import type { MarketCurrency, MarketPriceMode } from '@vedamatch/shared';

/** Знаков после запятой в валюте. Все четыре валюты Рынка двухзначные,
 *  но константа именована, чтобы добавление JPY не искали по коду. */
export const MINOR_UNITS = 100;

/** Потолок цены. `priceMinor` — 32-битный Int, максимум ≈ 21,4 млн в мажорных
 *  единицах. Ограничиваем заметно ниже и падаем понятной ошибкой, а не
 *  переполнением в Postgres. */
export const MAX_PRICE_MINOR = 2_000_000_000;

/** Режимы, у которых цены нет по определению. */
const PRICELESS_MODES: MarketPriceMode[] = ['negotiable', 'free'];

export function isPricelessMode(mode: MarketPriceMode): boolean {
  return PRICELESS_MODES.includes(mode);
}

/**
 * Мажорные единицы → минорные. Принимает и число, и строку из формы:
 * «1 299,50», «1299.5», «1 299» — разделители разряда и запятая как
 * десятичная точка встречаются в русской раскладке постоянно.
 * `null` — значение не распознано; вызывающий отдаёт `price_invalid`.
 */
export function parsePriceMajor(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;

  let numeric: number;
  if (typeof value === 'number') {
    numeric = value;
  } else if (typeof value === 'string') {
    const cleaned = value
      // \s в JS покрывает обычный пробел, неразрывный (U+00A0) и узкий
      // неразрывный (U+202F) — всё, чем браузеры и Word разделяют разряды.
      .replace(/\s/g, '')
      .replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
    numeric = Number(cleaned);
  } else {
    return null;
  }

  if (!Number.isFinite(numeric) || numeric < 0) return null;

  // Округление до целых минорных единиц: 0.1 + 0.2 в двоичной плавающей точке
  // даёт 0.30000000000000004, поэтому округляем, а не усекаем.
  const minor = Math.round(numeric * MINOR_UNITS);
  if (minor > MAX_PRICE_MINOR) return null;
  return minor;
}

/** Неразрывный пробел: «1 299 ₽» не должно разрываться переносом строки.
 *  Записан escape-последовательностью намеренно — невидимый символ в исходнике
 *  ломает сравнение в тестах и не виден при ревью. */
const NBSP = '\u00a0';

const CURRENCY_SYMBOL: Record<MarketCurrency, string> = {
  rub: '₽',
  usd: '$',
  eur: '€',
  inr: '₹',
};

/** Отображение цены. Дробную часть скрываем, когда она нулевая: «1 299 ₽»
 *  читается лучше, чем «1 299,00 ₽», а копейки на Рынке редкость. */
export function formatPriceMinor(
  minor: number,
  currency: MarketCurrency,
): string {
  const major = Math.trunc(minor / MINOR_UNITS);
  const fraction = minor % MINOR_UNITS;
  const groupedMajor = String(major).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const body =
    fraction === 0
      ? groupedMajor
      : `${groupedMajor},${String(fraction).padStart(2, '0')}`;
  return `${body}${NBSP}${CURRENCY_SYMBOL[currency]}`;
}

export type PriceValidationError =
  | 'price_required'
  | 'price_invalid'
  | 'price_too_large';

/**
 * Согласованность режима цены и самих чисел.
 * - `negotiable` и `free` обязаны прийти без цены: «договорная за 500 ₽» —
 *   это противоречие, которое потом невозможно отфильтровать.
 * - `fixed` и `from` обязаны прийти с ценой.
 * - Верх вилки имеет смысл только у `from` и должен быть больше низа.
 */
export function validatePrice(input: {
  mode: MarketPriceMode;
  minor: number | null;
  maxMinor: number | null;
}): PriceValidationError | null {
  const { mode, minor, maxMinor } = input;

  if (isPricelessMode(mode)) {
    if (minor !== null || maxMinor !== null) return 'price_invalid';
    return null;
  }

  if (minor === null) return 'price_required';
  if (!Number.isInteger(minor) || minor < 0) return 'price_invalid';
  if (minor > MAX_PRICE_MINOR) return 'price_too_large';

  if (maxMinor !== null) {
    if (mode !== 'from') return 'price_invalid';
    if (!Number.isInteger(maxMinor) || maxMinor <= minor) return 'price_invalid';
    if (maxMinor > MAX_PRICE_MINOR) return 'price_too_large';
  }

  return null;
}
