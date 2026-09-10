"use client";

import { useState } from "react";
import Link from "next/link";
import { addToWellnessBasket, WellnessApiError } from "@/lib/wellness-api";

/**
 * «В корзину» на карточке продукта и в результате скана.
 *
 * Кнопка не прячется у неподходящих продуктов: человек кладёт в корзину и то,
 * что берёт не себе. Вердикт он уже видел выше — решать ему.
 */
export function AddToBasket({ productId }: { productId: string }) {
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (added) {
    return (
      <p role="status" className="text-sm text-cyan">
        В корзине.{" "}
        <Link href="/wellness/basket" className="underline">
          Открыть
        </Link>
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void addToWellnessBasket(productId)
            .then(() => setAdded(true))
            .catch((cause) =>
              setError(
                cause instanceof WellnessApiError
                  ? cause.message
                  : "Не удалось добавить",
              ),
            )
            .finally(() => setBusy(false));
        }}
        className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-0 disabled:opacity-50"
      >
        В корзину
      </button>
      {error && (
        <span role="alert" className="text-sm text-magenta">
          {error}
        </span>
      )}
    </div>
  );
}
