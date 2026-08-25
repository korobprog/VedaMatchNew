"use client";

import type { MarketListingKind } from "@vedamatch/shared";
import { useCartItemQuantity } from "@/lib/market-cart-items";
import { AddToCartButton } from "./add-to-cart-button";
import { CartQuantityStepper } from "./cart-quantity-stepper";
import { GoToCartButton } from "./go-to-cart-button";

const iconButtonClassName =
  "inline-flex h-9 w-full items-center justify-center rounded-xl border border-glass-brd text-text-2 transition-colors hover:text-text-0 disabled:opacity-50";

/**
 * На карточке решает между кнопкой «в корзину» и степпером количества.
 * Степпер — только для товаров: услугу естественно взять «ещё одну штуку»
 * не получится, там правки количества остаются в самой корзине. Услуга,
 * которая уже в корзине, ведёт сразу туда, а не предлагает добавить ещё.
 */
export function CartControls({
  listingId,
  kind,
  available,
}: {
  listingId: string;
  kind: MarketListingKind;
  available: boolean;
}) {
  const quantity = useCartItemQuantity(listingId);

  if (kind === "product" && quantity > 0) {
    return (
      <CartQuantityStepper listingId={listingId} disabled={!available} className="flex-1" />
    );
  }

  if (kind === "service" && quantity > 0) {
    return (
      <div className="flex-1">
        <GoToCartButton quantity={quantity} className={iconButtonClassName} />
      </div>
    );
  }

  return (
    <AddToCartButton
      listingId={listingId}
      disabled={!available}
      compact
      containerClassName="flex-1"
      className={iconButtonClassName}
    />
  );
}
