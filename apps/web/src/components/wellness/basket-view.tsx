"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { WellnessBasketDto } from "@vedamatch/shared";
import {
  getWellnessBasket,
  removeFromWellnessBasket,
} from "@/lib/wellness-api";
import { isAbort } from "./is-abort";
import { basketHeadline, verdictLook } from "./verdict-labels";

/**
 * Корзина покупок. Главное здесь — строка свода наверху: по ней человек
 * решает, идти на кассу или вернуть что-то на полку, не разворачивая список.
 */
const ACCENT: Record<string, string> = {
  magenta: "text-magenta",
  cyan: "text-cyan",
  gold: "text-gold",
  "text-1": "text-text-1",
};

export function BasketView() {
  const [data, setData] = useState<WellnessBasketDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    getWellnessBasket(signal)
      .then(setData)
      .catch((cause) => {
        if (isAbort(cause)) return;
        setError("Не удалось загрузить корзину");
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {error}
      </p>
    );
  }
  if (!data) {
    return (
      <p role="status" className="text-sm text-text-1">
        Загружаем…
      </p>
    );
  }

  if (!data.items.length) {
    return (
      <div className="rounded-2xl border border-glass-brd bg-glass p-4">
        <p className="text-sm text-text-0">Корзина пуста.</p>
        <p className="mt-1 text-sm text-text-1">
          Проверьте продукт и добавьте подходящий — потом посмотрим, что из
          набранного можно приготовить.
        </p>
        <Link
          href="/wellness/scan"
          className="mt-3 inline-block rounded-xl bg-magenta px-4 py-2 text-sm font-medium text-bg-0"
        >
          Проверить продукт
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="font-display text-lg font-bold text-text-0">
        {basketHeadline(data.summary)}
      </p>

      <ul className="space-y-2">
        {data.items.map((item) => {
          const look = verdictLook(item.result.verdict);
          return (
            <li
              key={item.id}
              className="rounded-2xl border border-glass-brd bg-glass p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`font-mono text-lg ${ACCENT[look.accent]}`}
                >
                  {look.glyph}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/wellness/products/${item.product.barcode}`}
                    className="block text-sm font-medium text-text-0 underline"
                  >
                    {item.product.name}
                  </Link>
                  <p className={`mt-0.5 text-xs ${ACCENT[look.accent]}`}>
                    {look.label}
                  </p>
                  {item.result.reasons.length > 0 && (
                    <p className="mt-1 text-xs text-text-2">
                      {item.result.reasons
                        .map((reason) => reason.ingredient.name)
                        .join(", ")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void removeFromWellnessBasket(item.product.id).then(() =>
                      load(),
                    );
                  }}
                  className="shrink-0 text-xs text-text-1 underline"
                >
                  Убрать
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="rounded-xl border border-dashed border-glass-brd px-4 py-3 text-xs text-text-2">
        Дальше здесь появится подбор блюд из набранного — «Ведическая
        кулинария», рецепты Ямуны и калорийность. Пока раздел только собирает
        список.
      </p>
    </div>
  );
}
