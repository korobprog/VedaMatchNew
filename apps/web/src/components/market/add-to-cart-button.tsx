"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ShoppingBasket, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { bumpCartCount } from "@/lib/market-cart-badge";
import { bumpCartItemQuantity, getCartItemQuantity } from "@/lib/market-cart-items";
import { marketErrorCode, marketErrorText } from "./use-market-error";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function postCartItem(listingId: string) {
  return apiFetch(`${API_URL}/market/cart/items`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId, quantity: 1 }),
  });
}

export function AddToCartButton({
  listingId,
  disabled,
  className,
  /** Карточка в сетке узкая — прячем текст за sr-only и оставляем иконку. */
  compact,
  /** Класс обёртки: без него `flex-1` на кнопке не действует — сама кнопка
   *  не является flex-элементом ряда, им является эта обёртка. */
  containerClassName,
}: {
  listingId: string;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  containerClassName?: string;
}) {
  const t = useTranslations("Market");
  const [pending, setPending] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (pending || disabled) return;
    setPending(true);
    setError(null);
    // Значок в шапке считает строки корзины, а не сумму штук: если позиция
    // уже там, сервер прибавит количество к ней же, новой строки не будет.
    const isNewLine = getCartItemQuantity(listingId) === 0;
    try {
      const res = await postCartItem(listingId);
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      // Значок и количество на карточке двигаем сразу: точное число придёт
      // следующим опросом.
      if (isNewLine) bumpCartCount(1);
      bumpCartItemQuantity(listingId, 1);
      setAdded(true);
      window.setTimeout(() => setAdded(false), 2000);
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  const label = added ? t("cart.added") : t("cart.add");

  return (
    <div className={containerClassName}>
      <button
        type="button"
        onClick={() => void add()}
        disabled={pending || disabled}
        aria-label={compact ? label : undefined}
        title={compact ? label : undefined}
        className={
          className ??
          "inline-flex items-center gap-2 rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
        }
      >
        {added ? (
          <Check aria-hidden className="h-4 w-4" />
        ) : (
          <ShoppingBasket aria-hidden className="h-4 w-4" />
        )}
        {compact ? <span className="sr-only">{label}</span> : label}
      </button>
      {error && (
        <p className="mt-2 text-sm text-magenta">{marketErrorText(t, error)}</p>
      )}
    </div>
  );
}

/** Кладёт товар в корзину и сразу уводит в неё — оформление заявки там же,
 *  отдельного пути мимо корзины в Рынке нет (платежей модуль не проводит). */
export function BuyNowButton({
  listingId,
  disabled,
  className,
  compact,
  containerClassName,
}: {
  listingId: string;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  containerClassName?: string;
}) {
  const t = useTranslations("Market");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buyNow() {
    if (pending || disabled) return;
    setPending(true);
    setError(null);
    const isNewLine = getCartItemQuantity(listingId) === 0;
    try {
      const res = await postCartItem(listingId);
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      if (isNewLine) bumpCartCount(1);
      bumpCartItemQuantity(listingId, 1);
      router.push("/market/cart");
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  const label = t("cart.buyNow");

  return (
    <div className={containerClassName}>
      <button
        type="button"
        onClick={() => void buyNow()}
        disabled={pending || disabled}
        aria-label={label}
        title={label}
        className={
          className ??
          "inline-flex items-center gap-2 rounded-xl border border-magenta/50 bg-magenta/10 px-4 py-2 text-sm font-medium text-text-0 transition-colors hover:bg-magenta/20 disabled:opacity-50"
        }
      >
        <Zap aria-hidden className="h-4 w-4 text-magenta" />
        {compact ? <span className="sr-only">{label}</span> : label}
      </button>
      {error && (
        <p className="mt-2 text-sm text-magenta">{marketErrorText(t, error)}</p>
      )}
    </div>
  );
}
