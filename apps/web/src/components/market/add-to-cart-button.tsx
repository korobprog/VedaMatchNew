"use client";

import { useState } from "react";
import { Check, ShoppingBasket } from "lucide-react";
import { useTranslations } from "next-intl";
import { bumpCartCount } from "@/lib/market-cart-badge";
import { marketErrorCode, marketErrorText } from "./use-market-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function AddToCartButton({
  listingId,
  disabled,
  className,
}: {
  listingId: string;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("Market");
  const [pending, setPending] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (pending || disabled) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/market/cart/items`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, quantity: 1 }),
      });
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      // Значок двигаем сразу: точное число придёт следующим опросом.
      bumpCartCount(1);
      setAdded(true);
      window.setTimeout(() => setAdded(false), 2000);
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void add()}
        disabled={pending || disabled}
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
        {added ? t("cart.added") : t("cart.add")}
      </button>
      {error && (
        <p className="mt-2 text-sm text-magenta">{marketErrorText(t, error)}</p>
      )}
    </div>
  );
}
