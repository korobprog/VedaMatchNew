"use client";

import { useEffect, useState } from "react";
import type {
  WellnessProductCard,
  WellnessVerdictResult,
} from "@vedamatch/shared";
import {
  getWellnessProduct,
  reportWellnessProduct,
  WellnessApiError,
} from "@/lib/wellness-api";
import { AddToBasket } from "./add-to-basket";
import { isAbort } from "@/lib/is-abort";
import { OffAttribution } from "./off-attribution";
import { VerdictCard } from "./verdict-card";

/**
 * Карточка продукта. «Не нашли» здесь не ошибка: база копится из того, что
 * приносят люди, и пустой ответ — приглашение снять состав.
 */
export function ProductView({ barcode }: { barcode: string }) {
  const [data, setData] = useState<{
    product: WellnessProductCard;
    result: WellnessVerdictResult;
  } | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complaint, setComplaint] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getWellnessProduct(barcode, controller.signal)
      .then(setData)
      .catch((cause) => {
        if (isAbort(cause)) return;
        if (cause instanceof WellnessApiError && cause.status === 404) {
          setMissing(true);
          return;
        }
        setError("Не удалось загрузить карточку");
      });
    return () => controller.abort();
  }, [barcode]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {error}
      </p>
    );
  }

  if (missing) {
    return (
      <div className="rounded-2xl border border-glass-brd bg-glass p-4">
        <p className="text-sm text-text-0">
          Продукта с кодом <span className="font-mono">{barcode}</span> пока нет
          ни в нашей базе, ни в открытой базе Open Food Facts.
        </p>
        <p className="mt-1 text-sm text-text-1">
          Снимите состав с упаковки — мы прочитаем его и добавим продукт для
          остальных.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <p role="status" className="text-sm text-text-1">
        Загружаем…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-glass-brd bg-glass p-4">
        <h1 className="font-display text-xl font-bold text-text-0">
          {data.product.name}
        </h1>
        {data.product.brand && (
          <p className="text-sm text-text-1">{data.product.brand}</p>
        )}
        <p className="mt-1 font-mono text-xs text-text-2">
          {data.product.barcode}
        </p>
        <p className="mt-3 text-sm text-text-1">
          {data.product.ingredientsRaw}
        </p>
        {data.product.source === "openfoodfacts" && (
          <OffAttribution barcode={data.product.barcode} />
        )}
        <div className="mt-3">
          <AddToBasket productId={data.product.id} />
        </div>
      </div>

      <VerdictCard result={data.result} />

      <form
        className="rounded-2xl border border-glass-brd p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void reportWellnessProduct(data.product.id, complaint)
            .then(() => {
              setSent(true);
              setComplaint("");
            })
            .catch((cause) =>
              setError(
                cause instanceof WellnessApiError
                  ? cause.message
                  : "Не удалось отправить",
              ),
            );
        }}
      >
        <label
          htmlFor="wellness-complaint"
          className="block text-sm font-medium text-text-0"
        >
          Состав неверный?
        </label>
        <p className="mt-1 text-sm text-text-1">
          Напишите, что не так. Мы проверим по упаковке и поправим — ошибка в
          базе отвечает всем, а не только вам.
        </p>
        <textarea
          id="wellness-complaint"
          rows={3}
          value={complaint}
          onChange={(event) => setComplaint(event.target.value)}
          className="mt-2 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={complaint.trim().length < 5}
            className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-0 disabled:opacity-50"
          >
            Отправить
          </button>
          {sent && (
            <span role="status" className="text-sm text-cyan">
              Спасибо, проверим
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
