"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { bumpCartCount } from "@/lib/market-cart-badge";
import { bumpCartItemQuantity, useCartItemQuantity } from "@/lib/market-cart-items";
import { marketErrorCode, marketErrorText } from "./use-market-error";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Показывается вместо кнопки «в корзину», когда товар там уже лежит —
 *  +/- меняют количество без захода в корзину. Рендерится только если в
 *  корзине больше нуля: на нуле карточка возвращается к обычной кнопке. */
export function CartQuantityStepper({
  listingId,
  disabled,
  className,
}: {
  listingId: string;
  /** Запрещает только увеличение — убрать позицию можно всегда. */
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("Market");
  const quantity = useCartItemQuantity(listingId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(delta: number) {
    if (pending) return;
    const next = quantity + delta;
    if (next < 0) return;
    // Значок в шапке — это число позиций в корзине (строк), а не сумма
    // штук: степпер меняет количество внутри уже существующей строки и на
    // него не влияет. Строка пропадает только когда дошли до нуля.
    const removesLine = next === 0;
    setPending(true);
    setError(null);
    bumpCartItemQuantity(listingId, delta);
    if (removesLine) bumpCartCount(-1);
    try {
      const res = removesLine
        ? await apiFetch(`${API_URL}/market/cart/items/${listingId}`, {
            method: "DELETE",
            credentials: "include",
          })
        : await apiFetch(`${API_URL}/market/cart/items/${listingId}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quantity: next }),
          });
      if (!res.ok) {
        // Откат: сервер не разрешил — например, кончился остаток.
        bumpCartItemQuantity(listingId, -delta);
        if (removesLine) bumpCartCount(1);
        const code = await marketErrorCode(res);
        setError(code);
        window.setTimeout(() => setError(null), 3000);
      }
    } catch {
      bumpCartItemQuantity(listingId, -delta);
      if (removesLine) bumpCartCount(1);
      setError("unknown");
      window.setTimeout(() => setError(null), 3000);
    } finally {
      setPending(false);
    }
  }

  if (quantity === 0) return null;

  return (
    <div className={className}>
      <div className="flex h-9 items-center justify-between rounded-xl border border-glass-brd px-1">
        <button
          type="button"
          onClick={() => void change(-1)}
          disabled={pending}
          aria-label={t("cart.decrease")}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-2 transition-colors hover:bg-glass-brd/40 hover:text-text-0 disabled:opacity-50"
        >
          <Minus aria-hidden className="h-3.5 w-3.5" />
        </button>
        <span className="text-sm font-medium tabular-nums text-text-0">
          {quantity}
        </span>
        <button
          type="button"
          onClick={() => void change(1)}
          disabled={pending || disabled}
          aria-label={t("cart.increase")}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-2 transition-colors hover:bg-glass-brd/40 hover:text-text-0 disabled:opacity-50"
        >
          <Plus aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
      {error && (
        <p className="mt-1 text-[11px] text-magenta">{marketErrorText(t, error)}</p>
      )}
    </div>
  );
}
