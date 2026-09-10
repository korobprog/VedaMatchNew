import {
  TRAVEL_CURRENCY_SIGNS,
  type TravelCurrency,
  type TravelStayPayment,
} from "@vedamatch/shared";

/**
 * Цена из минорных единиц. Целые суммы показываем без копеек: «500 ₽» вместо
 * «500,00 ₽» — в объявлении о ночлеге копейки только шумят.
 */
export function formatPrice(
  minor: number | null,
  currency: TravelCurrency,
): string | null {
  if (minor === null) return null;
  const major = minor / 100;
  const digits = Number.isInteger(major) ? 0 : 2;
  // Неразрывный пробел между разрядами и перед знаком: иначе «1 200 ₽»
  // переносится по строке и читается как два числа.
  const number = major
    .toFixed(digits)
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")
    .replace(".", ",");
  return `${number}\u00a0${TRAVEL_CURRENCY_SIGNS[currency]}`;
}

/**
 * Подпись цены в карточке. Ночлег за служение цены не имеет — и «0 ₽» на его
 * месте читалось бы как «бесплатно», а это другой разговор с хозяином.
 */
export function priceLabel(
  minor: number | null,
  currency: TravelCurrency,
  payment: TravelStayPayment,
): string {
  const price = formatPrice(minor, currency);
  if (payment === "seva") return "За служение";
  if (!price) return "Цену уточняйте";
  if (payment === "both") return `${price} за ночь или за служение`;
  return `${price} за ночь`;
}

/** «3 ночи» с правильным окончанием. */
export function nightsWord(nights: number): string {
  const tail = nights % 100;
  const last = nights % 10;
  if (tail >= 11 && tail <= 14) return `${nights} ночей`;
  if (last === 1) return `${nights} ночь`;
  if (last >= 2 && last <= 4) return `${nights} ночи`;
  return `${nights} ночей`;
}
