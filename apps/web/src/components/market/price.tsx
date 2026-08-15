import type { MarketCurrency, MarketPriceDto } from "@vedamatch/shared";

const CURRENCY_SYMBOL: Record<MarketCurrency, string> = {
  rub: "₽",
  usd: "$",
  eur: "€",
  inr: "₹",
};

/** Неразрывный пробел: «1 299 ₽» не должно разрываться переносом строки.
 *  Записан escape-последовательностью намеренно — невидимый символ в исходнике
 *  не виден при ревью и ломает сравнение в тестах. */
const NBSP = "\u00a0";

/**
 * Цена в минорных единицах → строка. Зеркалит formatPriceMinor на бэкенде;
 * контракт изоляции не даёт импортировать его оттуда, а в @vedamatch/shared
 * лежат только типы, без рантайма.
 */
export function formatPriceMinor(minor: number, currency: MarketCurrency): string {
  const major = Math.trunc(minor / 100);
  const fraction = minor % 100;
  const grouped = String(major).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const body =
    fraction === 0 ? grouped : `${grouped},${String(fraction).padStart(2, "0")}`;
  return `${body}${NBSP}${CURRENCY_SYMBOL[currency]}`;
}

export interface PriceLabels {
  negotiable: string;
  free: string;
  /** Шаблон с плейсхолдером `{price}`. */
  from: string;
  /** Шаблон с плейсхолдерами `{from}` и `{to}`. */
  range: string;
}

/**
 * Текст цены с учётом режима. `negotiable` и `free` цены не имеют — у них
 * разные подписи, и подменять одну другой нельзя: «даром» и «договорная» это
 * совершенно разные предложения.
 */
export function priceText(price: MarketPriceDto, labels: PriceLabels): string {
  if (price.mode === "free") return labels.free;
  if (price.mode === "negotiable" || price.minor === null) {
    return labels.negotiable;
  }
  const value = formatPriceMinor(price.minor, price.currency);
  if (price.mode === "from") {
    if (price.maxMinor !== null) {
      return labels.range
        .replace("{from}", value)
        .replace("{to}", formatPriceMinor(price.maxMinor, price.currency));
    }
    return labels.from.replace("{price}", value);
  }
  return value;
}

export function Price({
  price,
  labels,
  className,
}: {
  price: MarketPriceDto;
  labels: PriceLabels;
  className?: string;
}) {
  const muted = price.mode === "negotiable" || price.minor === null;
  return (
    <span
      className={
        className ??
        `font-display font-semibold ${muted ? "text-text-1" : "text-text-0"}`
      }
    >
      {priceText(price, labels)}
    </span>
  );
}
