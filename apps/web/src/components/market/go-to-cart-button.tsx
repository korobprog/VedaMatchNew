"use client";

import Link from "next/link";
import { ShoppingBasket } from "lucide-react";
import { useTranslations } from "next-intl";

/** Услуга уже в корзине — вместо «добавить ещё» ведём сразу к оформлению,
 *  число заказанного меняют в самой корзине. */
export function GoToCartButton({
  quantity,
  className,
}: {
  quantity: number;
  className?: string;
}) {
  const t = useTranslations("Market");
  const label = t("cart.goToCart");

  return (
    <Link href="/market/cart" aria-label={label} title={label} className={className}>
      <span className="relative inline-flex">
        <ShoppingBasket aria-hidden className="h-4 w-4" />
        <span
          aria-hidden
          className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold leading-none text-bg-0"
        >
          {quantity > 99 ? "99+" : quantity}
        </span>
      </span>
      <span className="sr-only">{label}</span>
    </Link>
  );
}
