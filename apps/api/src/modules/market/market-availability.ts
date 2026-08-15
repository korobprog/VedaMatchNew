import type { MarketListingStatus, MarketShopStatus } from '@vedamatch/shared';

export interface AvailabilityInput {
  status: MarketListingStatus;
  trackStock: boolean;
  quantity: number | null;
  shopStatus: MarketShopStatus;
}

/**
 * Видно ли объявление постороннему. Черновик и скрытое автором видит только
 * владелец, скрытое жалобами и снятое админом — вообще никто, кроме админа.
 * Закрытый или заблокированный магазин уносит с собой всю витрину.
 */
export function isPubliclyVisible(input: {
  status: MarketListingStatus;
  shopStatus: MarketShopStatus;
}): boolean {
  if (input.shopStatus !== 'active') return false;
  return input.status === 'published' || input.status === 'sold_out';
}

/**
 * Можно ли положить в корзину и заказать. Отличается от видимости: распроданное
 * объявление остаётся на витрине (по нему пишут «а будет ещё?»), но заказать
 * его нельзя.
 */
export function isAvailable(input: AvailabilityInput): boolean {
  if (!isPubliclyVisible(input)) return false;
  if (input.status === 'sold_out') return false;
  // Остаток учитываем только когда продавец сам его включил: иначе `quantity`
  // равен null и это значит «в наличии», а не «ноль штук».
  if (input.trackStock) {
    return (input.quantity ?? 0) > 0;
  }
  return true;
}

export type CartRejection =
  | 'listing_not_found'
  | 'cart_item_unavailable'
  | 'quantity_exceeds_stock';

/**
 * Проверка перед добавлением в корзину и перед оформлением заявки.
 * `null` — можно. Фаза 2 вызывает её дважды: при добавлении и ещё раз внутри
 * транзакции чекаута, потому что между этими моментами остаток мог кончиться.
 */
export function checkCartEligibility(
  input: AvailabilityInput & { requestedQuantity: number },
): CartRejection | null {
  if (!isAvailable(input)) return 'cart_item_unavailable';
  const requested = input.requestedQuantity;
  if (!Number.isInteger(requested) || requested < 1) {
    return 'quantity_exceeds_stock';
  }
  if (input.trackStock && requested > (input.quantity ?? 0)) {
    return 'quantity_exceeds_stock';
  }
  return null;
}
